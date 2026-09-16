import type { OtpPurpose } from '@prisma/client';

import { constantTimeEqual, hmacSha256Hex, randomDigits, randomToken, sha256Hex } from '../crypto';
import { prisma } from '../db/prisma';
import { serverEnv, type ServerEnv } from '../env';

/**
 * SMS one-time-password engine.
 *
 * Threat model, and what answers each part of it:
 *
 *  - **Database disclosure.** Only `HMAC-SHA256(pepper, phone:code)` is stored.
 *    Binding the phone into the message stops a stolen digest from being
 *    replayed against a different number, and the pepper lives in the
 *    environment rather than the database, so a dump alone is not enough to
 *    build a rainbow table over a 10^6 keyspace.
 *  - **Online guessing.** Five attempts, then a 15-minute lock on that
 *    challenge, on top of the per-IP and per-phone send limits in the route.
 *  - **Timing side channels.** The digest comparison is constant-time, and a
 *    verification against a number with no live challenge still performs a dummy
 *    HMAC so that "no such challenge" and "wrong code" take the same time.
 *  - **Replay.** A challenge is single-use: `consumed_at` is stamped inside the
 *    same transaction that reports success.
 */

export type OtpFailureReason =
  | 'not-found'
  | 'expired'
  | 'locked'
  | 'already-used'
  | 'invalid-code'
  | 'phone-mismatch';

export type OtpVerification =
  | { ok: true; phone: string; purpose: OtpPurpose }
  | { ok: false; reason: OtpFailureReason; attemptsRemaining: number; retryAfterSeconds: number };

export interface IssuedChallenge {
  challengeId: string;
  /** Plaintext code. Handed to the SMS gateway and then dropped. */
  code: string;
  expiresAt: Date;
  /** Seconds the client must wait before a resend is accepted. */
  resendAfterSeconds: number;
}

/**
 * The fixed code local development may pin, or `null` for a random one.
 *
 * This is the whole of the development shortcut, and it deliberately sits at the
 * point where the code is *minted* rather than where it is checked. Verification
 * keeps no bypass branch at all: the fixed code is hashed, stored, bound to the
 * phone, counted against the attempt limit, expired and consumed exactly like
 * any other, so what a developer exercises locally is the real path.
 *
 * `serverEnv()` already refuses `AUTH_DEV_OTP_CODE` in production, which means
 * a production deployment cannot start with one set. The second check here is
 * belt and braces: it makes the guarantee local to the function that would
 * otherwise hand out a known code.
 */
export function fixedDevOtpCode(env: ServerEnv): string | null {
  if (env.NODE_ENV === 'production') return null;
  return env.AUTH_DEV_OTP_CODE ?? null;
}

/** `HMAC-SHA256(AUTH_OTP_PEPPER, "<phone>:<code>")`, hex encoded. */
export async function hashOtpCode(phone: string, code: string): Promise<string> {
  return hmacSha256Hex(serverEnv().AUTH_OTP_PEPPER, `${phone}:${code}`);
}

/**
 * Seconds remaining on the resend cooldown for `phone`, or 0 when a new code may
 * be sent.
 *
 * Duplicates the Redis sliding window on purpose: Redis fails open (an outage
 * must not take sign-in down), so the database keeps a second, slower copy of
 * the same rule and an attacker cannot turn a cache outage into an SMS flood.
 */
export async function secondsUntilResendAllowed(phone: string): Promise<number> {
  const env = serverEnv();

  const latest = await prisma.otpSession.findFirst({
    where: { phone },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  if (!latest) return 0;

  const elapsedSeconds = Math.floor((Date.now() - latest.createdAt.getTime()) / 1000);
  return Math.max(0, env.AUTH_OTP_RESEND_SECONDS - elapsedSeconds);
}

/** SMS sent to this number in the trailing 24 hours. Backs the daily cap. */
export async function dailySendCount(phone: string): Promise<number> {
  return prisma.otpSession.count({
    where: { phone, createdAt: { gt: new Date(Date.now() - 86_400_000) } },
  });
}

/**
 * Creates a challenge and returns the plaintext code for delivery.
 *
 * Any live challenge for the same number is consumed first: a user who asks for
 * a second code expects the first to stop working, and the partial unique index
 * `otp_sessions_one_live_per_phone` enforces it at the storage layer too.
 *
 * Outside production the code may be pinned by `AUTH_DEV_OTP_CODE` — see
 * `fixedDevOtpCode`. Everything after this line is identical either way.
 */
export async function issueOtpChallenge(options: {
  phone: string;
  purpose?: OtpPurpose;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<IssuedChallenge> {
  const env = serverEnv();
  const { phone, purpose = 'SIGN_IN' } = options;

  const code = fixedDevOtpCode(env) ?? randomDigits(env.AUTH_OTP_LENGTH);
  const codeHash = await hashOtpCode(phone, code);
  const challengeId = randomToken(24);
  const expiresAt = new Date(Date.now() + env.AUTH_OTP_TTL_SECONDS * 1000);
  const ipHash = options.ip ? await sha256Hex(options.ip) : null;

  await prisma.$transaction([
    prisma.otpSession.updateMany({
      where: { phone, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.otpSession.create({
      data: {
        phone,
        purpose,
        codeHash,
        challengeId,
        expiresAt,
        ipHash,
        userAgent: options.userAgent?.slice(0, 300) ?? null,
      },
    }),
  ]);

  return { challengeId, code, expiresAt, resendAfterSeconds: env.AUTH_OTP_RESEND_SECONDS };
}

/**
 * Constant-time dummy work for the paths that have no digest to compare.
 *
 * Without it, "this challenge does not exist" returns measurably faster than
 * "wrong code", which hands an attacker a free oracle for enumerating which
 * numbers have a code in flight.
 */
async function burnComparisonBudget(code: string): Promise<void> {
  const decoy = await hashOtpCode('+980000000000', code);
  await constantTimeEqual(decoy, decoy.slice(0, -1) + (decoy.endsWith('0') ? '1' : '0'));
}

export async function verifyOtpChallenge(options: {
  challengeId: string;
  phone: string;
  code: string;
}): Promise<OtpVerification> {
  const env = serverEnv();
  const now = new Date();

  const challenge = await prisma.otpSession.findUnique({
    where: { challengeId: options.challengeId },
  });

  if (!challenge) {
    await burnComparisonBudget(options.code);
    return { ok: false, reason: 'not-found', attemptsRemaining: 0, retryAfterSeconds: 0 };
  }

  // The client sends the number back with the code; a mismatch means the form
  // state and the challenge have diverged (or someone is probing).
  if (challenge.phone !== options.phone) {
    await burnComparisonBudget(options.code);
    return { ok: false, reason: 'phone-mismatch', attemptsRemaining: 0, retryAfterSeconds: 0 };
  }

  if (challenge.lockedUntil && challenge.lockedUntil > now) {
    await burnComparisonBudget(options.code);
    return {
      ok: false,
      reason: 'locked',
      attemptsRemaining: 0,
      retryAfterSeconds: Math.ceil((challenge.lockedUntil.getTime() - now.getTime()) / 1000),
    };
  }

  if (challenge.consumedAt) {
    await burnComparisonBudget(options.code);
    return { ok: false, reason: 'already-used', attemptsRemaining: 0, retryAfterSeconds: 0 };
  }

  if (challenge.expiresAt <= now) {
    await burnComparisonBudget(options.code);
    return { ok: false, reason: 'expired', attemptsRemaining: 0, retryAfterSeconds: 0 };
  }

  const candidateHash = await hashOtpCode(options.phone, options.code);
  const matches = await constantTimeEqual(candidateHash, challenge.codeHash);

  if (!matches) {
    const attempts = challenge.attempts + 1;
    const exhausted = attempts >= env.AUTH_OTP_MAX_ATTEMPTS;
    const lockedUntil = exhausted
      ? new Date(now.getTime() + env.AUTH_OTP_LOCK_SECONDS * 1000)
      : null;

    await prisma.otpSession.update({
      where: { id: challenge.id },
      data: {
        attempts,
        lockedUntil,
        // A locked challenge is dead: consuming it frees the number's live slot
        // so a legitimate user can request a fresh code once the lock lifts.
        ...(exhausted ? { consumedAt: now } : {}),
      },
    });

    return {
      ok: false,
      reason: exhausted ? 'locked' : 'invalid-code',
      attemptsRemaining: Math.max(0, env.AUTH_OTP_MAX_ATTEMPTS - attempts),
      retryAfterSeconds: exhausted ? env.AUTH_OTP_LOCK_SECONDS : 0,
    };
  }

  // `updateMany` with the `consumedAt: null` guard makes consumption atomic:
  // two requests racing with the same valid code produce exactly one winner.
  const consumed = await prisma.otpSession.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: now, attempts: challenge.attempts + 1 },
  });

  if (consumed.count === 0) {
    return { ok: false, reason: 'already-used', attemptsRemaining: 0, retryAfterSeconds: 0 };
  }

  return { ok: true, phone: challenge.phone, purpose: challenge.purpose };
}

/** Persian copy for each failure, shown under the code input. */
export const OTP_FAILURE_MESSAGES: Record<OtpFailureReason, string> = {
  'not-found': 'این درخواست معتبر نیست؛ دوباره کد بگیرید.',
  expired: 'مهلت این کد تمام شده است؛ کد تازه بگیرید.',
  locked: 'به دلیل تلاش‌های ناموفق، ورود موقتاً بسته شد.',
  'already-used': 'این کد قبلاً استفاده شده است.',
  'invalid-code': 'کد واردشده درست نیست.',
  'phone-mismatch': 'شمارهٔ واردشده با این درخواست همخوانی ندارد.',
};
