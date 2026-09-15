import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

import { isProduction, serverEnv } from './env';
import { logger } from './logger';

/**
 * Sliding-window rate limiting.
 *
 * Upstash Redis backs the limiter in every deployed environment. When the
 * credentials are absent — local development, unit tests — an in-process
 * fallback takes over so that limit-dependent code paths stay exercised. The
 * fallback is explicitly *not* safe across instances, and production refuses to
 * start on it.
 */

export type RateLimitScope =
  /** One SMS per IP per cooldown window. */
  | 'otp-send-ip'
  /** One SMS per phone number per cooldown window. */
  | 'otp-send-phone'
  /** Daily ceiling per phone number, on top of the cooldown. */
  | 'otp-send-daily'
  /** Code submissions, keyed by phone; the per-challenge budget is separate. */
  | 'otp-verify'
  /** Refresh-token exchange and sign-out. */
  | 'auth'
  | 'mutation'
  | 'read'
  | 'cron';

interface WindowSpec {
  limit: number;
  windowSeconds: number;
}

/**
 * Window definitions.
 *
 * The OTP windows are read from the environment rather than hard-coded: the
 * same numbers drive the client's resend countdown and the server's refusal, and
 * two copies of "120" in two files is how those drift apart.
 */
function windowFor(scope: RateLimitScope): WindowSpec {
  switch (scope) {
    case 'otp-send-ip':
    case 'otp-send-phone':
      // Deliberately 1: an SMS costs money, and a second code inside the
      // cooldown is either impatience or abuse.
      return { limit: 1, windowSeconds: serverEnv().AUTH_OTP_RESEND_SECONDS };
    case 'otp-send-daily':
      return { limit: serverEnv().AUTH_OTP_DAILY_SEND_LIMIT, windowSeconds: 86_400 };
    case 'otp-verify':
      // Per phone rather than per challenge, so cycling challenges does not
      // reset the guessing budget.
      return { limit: serverEnv().AUTH_OTP_MAX_ATTEMPTS * 3, windowSeconds: 900 };
    case 'auth':
      return { limit: 20, windowSeconds: 60 };
    case 'mutation':
      return { limit: 30, windowSeconds: 60 };
    case 'read':
      return { limit: 120, windowSeconds: 60 };
    case 'cron':
      return { limit: 4, windowSeconds: 60 };
  }
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Unix milliseconds at which the window resets. */
  reset: number;
  retryAfterSeconds: number;
}

let redis: Redis | null = null;
const limiters = new Map<RateLimitScope, Ratelimit>();

function redisClient(): Redis | null {
  if (redis) return redis;

  const env = serverEnv();
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    if (isProduction) {
      throw new Error(
        'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production: ' +
          'the in-memory rate limiter does not hold across serverless instances.',
      );
    }
    return null;
  }

  redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });

  return redis;
}

function limiterFor(scope: RateLimitScope): Ratelimit | null {
  const cached = limiters.get(scope);
  if (cached) return cached;

  const client = redisClient();
  if (!client) return null;

  const spec = windowFor(scope);
  const limiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(spec.limit, `${spec.windowSeconds} s`),
    analytics: true,
    prefix: `kayzen:rl:${scope}`,
  });

  limiters.set(scope, limiter);
  return limiter;
}

/** Per-process fallback window store. Bounded so a flood cannot exhaust memory. */
const memoryWindows = new Map<string, number[]>();
const MEMORY_KEY_CEILING = 10_000;

function memoryLimit(scope: RateLimitScope, identifier: string): RateLimitResult {
  const spec = windowFor(scope);
  const key = `${scope}:${identifier}`;
  const now = Date.now();
  const windowStart = now - spec.windowSeconds * 1000;

  if (memoryWindows.size > MEMORY_KEY_CEILING) memoryWindows.clear();

  const hits = (memoryWindows.get(key) ?? []).filter((timestamp) => timestamp > windowStart);
  const success = hits.length < spec.limit;

  if (success) hits.push(now);
  memoryWindows.set(key, hits);

  const oldest = hits[0] ?? now;
  const reset = oldest + spec.windowSeconds * 1000;

  return {
    success,
    limit: spec.limit,
    remaining: Math.max(0, spec.limit - hits.length),
    reset,
    retryAfterSeconds: Math.max(1, Math.ceil((reset - now) / 1000)),
  };
}

/**
 * Consumes one token for `identifier` in `scope`.
 *
 * Redis outages fail *open* on purpose: a rate limiter that takes the whole
 * application down with it trades a throttling problem for an availability
 * incident. The event is logged at warn level for alerting.
 */
export async function checkRateLimit(
  scope: RateLimitScope,
  identifier: string,
): Promise<RateLimitResult> {
  const limiter = limiterFor(scope);
  if (!limiter) return memoryLimit(scope, identifier);

  try {
    const result = await limiter.limit(identifier);

    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
      retryAfterSeconds: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
    };
  } catch (error) {
    logger.warn({ err: error, scope }, 'rate limiter unavailable; allowing request');

    const spec = windowFor(scope);
    return {
      success: true,
      limit: spec.limit,
      remaining: spec.limit,
      reset: Date.now() + spec.windowSeconds * 1000,
      retryAfterSeconds: 0,
    };
  }
}

/**
 * Rate-limit key for a request.
 *
 * Authenticated traffic is keyed by user id so one noisy client cannot exhaust
 * a shared NAT's budget. Anonymous traffic falls back to the client IP taken
 * from the proxy headers Vercel sets.
 */
export function rateLimitIdentifier(request: Request, userId?: string): string {
  if (userId) return `user:${userId}`;
  return `ip:${clientIp(request) ?? 'unknown'}`;
}

/**
 * Reads a window without consuming a token.
 *
 * The send endpoint answers "how long until I may ask again?" on the response,
 * and doing that by consuming a token would make every poll of the countdown
 * extend the cooldown it is reporting.
 */
export async function peekRateLimit(
  scope: RateLimitScope,
  identifier: string,
): Promise<{ remaining: number; retryAfterSeconds: number }> {
  const spec = windowFor(scope);
  const client = redisClient();

  if (!client) {
    const hits = memoryWindows.get(`${scope}:${identifier}`) ?? [];
    const windowStart = Date.now() - spec.windowSeconds * 1000;
    const live = hits.filter((timestamp) => timestamp > windowStart);
    const oldest = live[0];

    return {
      remaining: Math.max(0, spec.limit - live.length),
      retryAfterSeconds: oldest
        ? Math.max(0, Math.ceil((oldest + spec.windowSeconds * 1000 - Date.now()) / 1000))
        : 0,
    };
  }

  try {
    const limiter = limiterFor(scope);
    if (!limiter) return { remaining: spec.limit, retryAfterSeconds: 0 };

    const state = await limiter.getRemaining(identifier);
    return {
      remaining: state.remaining,
      retryAfterSeconds: Math.max(0, Math.ceil((state.reset - Date.now()) / 1000)),
    };
  } catch (error) {
    logger.warn({ err: error, scope }, 'rate limiter peek failed; reporting a clear window');
    return { remaining: spec.limit, retryAfterSeconds: 0 };
  }
}

/** Client IP from the proxy headers Vercel sets, or `null` behind none. */
export function clientIp(request: Request): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for');

  return (
    forwardedFor?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    null
  );
}
