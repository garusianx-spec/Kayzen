import { z } from 'zod';

/**
 * Runtime environment contract.
 *
 * Server variables are parsed lazily (`serverEnv()`) so an Edge bundle that only
 * touches client config never fails on a missing gateway credential. Client
 * variables are read through explicit `process.env.NEXT_PUBLIC_*` member
 * expressions so that the Next.js compiler can inline them at build time.
 */

const nonEmpty = (name: string) => z.string().min(1, `${name} is required`);

export const SMS_PROVIDERS = ['console', 'kavenegar', 'farazsms', 'twilio'] as const;
export type SmsProviderId = (typeof SMS_PROVIDERS)[number];

const serverSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // Optional only outside production, where an absent value selects the
    // in-memory database — see `usesMemoryDatabase`. The superRefine below
    // makes it required again for a real deployment.
    DATABASE_URL: nonEmpty('DATABASE_URL').url().optional(),
    DIRECT_URL: z.string().url().optional(),
    DEV_DATABASE: z.enum(['memory', 'postgres']).optional(),

    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_STORAGE_BUCKET: z.string().default('kayzen-attachments'),

    AUTH_JWT_SECRET: z.string().min(32, 'AUTH_JWT_SECRET must carry at least 32 characters'),
    AUTH_JWT_ISSUER: z.string().default('kayzen'),
    AUTH_JWT_AUDIENCE: z.string().default('kayzen-app'),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    AUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),

    // OTP codes are HMAC'd with their own key so that rotating it burns
    // in-flight codes without signing every session out.
    AUTH_OTP_PEPPER: z.string().min(32, 'AUTH_OTP_PEPPER must carry at least 32 characters'),
    AUTH_OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
    AUTH_OTP_TTL_SECONDS: z.coerce.number().int().min(30).max(900).default(120),
    AUTH_OTP_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
    AUTH_OTP_LOCK_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
    AUTH_OTP_RESEND_SECONDS: z.coerce.number().int().min(30).max(600).default(120),
    AUTH_OTP_DAILY_SEND_LIMIT: z.coerce.number().int().min(1).max(50).default(5),

    // Local development only: makes `issueOtpChallenge` mint this code instead
    // of a random one, so signing in does not mean reading the server log. It
    // changes nothing else — the code is still hashed, still bound to the
    // phone, still single-use, and still expires — so the verification path
    // under test is the real one. Refused outright in production below.
    AUTH_DEV_OTP_CODE: z
      .string()
      .regex(/^[0-9]+$/, 'AUTH_DEV_OTP_CODE must be digits only')
      .optional(),

    SMS_PROVIDER: z.enum(SMS_PROVIDERS).default('console'),
    KAVENEGAR_API_KEY: z.string().optional(),
    KAVENEGAR_TEMPLATE: z.string().default('kayzen-otp'),
    KAVENEGAR_SENDER: z.string().optional(),
    FARAZSMS_API_KEY: z.string().optional(),
    FARAZSMS_PATTERN_CODE: z.string().optional(),
    FARAZSMS_ORIGINATOR: z.string().optional(),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM_NUMBER: z.string().optional(),

    // Optional by construction: `src/lib/ratelimit.ts` falls back to an
    // in-process limiter when these are absent, and refuses to do so in
    // production, where one process is not the whole deployment.
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

    VAPID_SUBJECT: z.string().default('mailto:ops@kayzen.app'),
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),

    CRON_SECRET: z.string().optional(),

    ANDROID_PACKAGE_NAME: z.string().default('app.kayzen.twa'),
    ANDROID_SHA256_CERT_FINGERPRINTS: z.string().default(''),

    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production' && env.DEV_DATABASE === 'postgres' && !env.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required when DEV_DATABASE=postgres',
      });
    }

    // A code that does not match the length the client asks for can never be
    // typed in, so it would look like "the fixed code does not work" rather
    // than like a misconfiguration. Checked in every environment.
    if (env.AUTH_DEV_OTP_CODE && env.AUTH_DEV_OTP_CODE.length !== env.AUTH_OTP_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_DEV_OTP_CODE'],
        message: `AUTH_DEV_OTP_CODE must be exactly AUTH_OTP_LENGTH (${env.AUTH_OTP_LENGTH}) digits`,
      });
    }

    if (env.NODE_ENV !== 'production') return;

    if (!env.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required in production',
      });
    }

    // The in-memory database holds one process's worth of rows and forgets them
    // on restart. There is no version of that which is a production database.
    if (env.DEV_DATABASE === 'memory') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DEV_DATABASE'],
        message: 'DEV_DATABASE=memory must not be used in production',
      });
    }

    // A production deployment with a fixed code has no authentication at all.
    if (env.AUTH_DEV_OTP_CODE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_DEV_OTP_CODE'],
        message: 'AUTH_DEV_OTP_CODE must not be set in production',
      });
    }

    // A production deployment that "sends" OTP codes to stdout would hand every
    // account to anyone who can read a log line.
    if (env.SMS_PROVIDER === 'console') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMS_PROVIDER'],
        message: 'the console SMS provider must not be used in production',
      });
    }

    for (const name of missingSmsCredentials(env)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [name],
        message: `${name} is required when SMS_PROVIDER=${env.SMS_PROVIDER}`,
      });
    }
  });

/** Variables the configured gateway needs. Empty for `console`, which needs none. */
const SMS_CREDENTIALS: Record<Exclude<SmsProviderId, 'console'>, readonly string[]> = {
  kavenegar: ['KAVENEGAR_API_KEY'],
  farazsms: ['FARAZSMS_API_KEY', 'FARAZSMS_PATTERN_CODE', 'FARAZSMS_ORIGINATOR'],
  twilio: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'],
};

/**
 * Credentials the selected SMS gateway is missing.
 *
 * One list, read twice: the schema turns it into a startup failure in
 * production, and `smsProvider()` turns it into a fall back to the console sink
 * everywhere else — so a developer who names a gateway without holding an
 * account for it still gets a working sign-in instead of a delivery error.
 */
export function missingSmsCredentials(
  env: Pick<ServerEnv, 'SMS_PROVIDER'> & Record<string, unknown>,
): string[] {
  if (env.SMS_PROVIDER === 'console') return [];
  return SMS_CREDENTIALS[env.SMS_PROVIDER].filter((name) => !env[name]);
}

export type ServerEnv = z.infer<typeof serverSchema>;

/**
 * A server that cannot read its own configuration.
 *
 * Typed rather than a bare `Error` so `withRoute()` can tell "this deployment is
 * missing a variable" apart from "this request hit a bug" — the first is a 503
 * that names what is missing, the second is an opaque 500. Before this existed,
 * a missing `AUTH_OTP_PEPPER` reached the browser as
 * `{"code":"INTERNAL","message":"خطای غیرمنتظره‌ای رخ داد."}` from
 * `POST /api/v1/auth/otp/send`, with the actual cause visible only to whoever
 * was reading the server's stdout.
 */
export class EnvConfigError extends Error {
  /** Variable names, without values — these go into logs and dev responses. */
  readonly variables: string[];
  readonly issues: Array<{ variable: string; message: string }>;

  constructor(issues: Array<{ variable: string; message: string }>) {
    const detail = issues.map((issue) => `  - ${issue.variable}: ${issue.message}`).join('\n');
    super(`Invalid server environment:\n${detail}`);

    this.name = 'EnvConfigError';
    this.issues = issues;
    this.variables = issues.map((issue) => issue.variable);
  }
}

/**
 * Stand-in secrets for `next dev`, so a fresh clone can sign in.
 *
 * Both are long enough to satisfy the schema and are worded so that anything
 * signed with them is obviously worthless. They apply only when `NODE_ENV` is
 * exactly `development` — not when it is unset, and not under `next build`,
 * which sets it to `production` — and every parse that uses one says so on
 * stdout.
 *
 * `DATABASE_URL` is deliberately absent from this table. A challenge has to be
 * stored somewhere and the account has to be created somewhere; a fallback that
 * pretended otherwise would be a second, untested copy of the sign-in path
 * rather than a shortcut through the real one.
 */
/** `process.env` as zod sees it, before Next.js's `NODE_ENV`-is-always-set augmentation. */
type RawEnv = Record<string, string | undefined>;

const DEVELOPMENT_FALLBACKS: Record<string, string> = {
  AUTH_JWT_SECRET: 'kayzen-development-insecure-jwt-secret-not-for-deployment',
  AUTH_OTP_PEPPER: 'kayzen-development-insecure-otp-pepper-not-for-deployment',
};

/**
 * Drops variables that are present but empty.
 *
 * `.env` files, CI settings pages and container orchestrators all express "I am
 * not using this" as `NAME=`, which arrives as an empty string rather than as
 * `undefined`. To zod that is a value, so `z.string().url().optional()` rejects
 * it — which is how copying `.env.example` verbatim used to fail with
 * `UPSTASH_REDIS_REST_URL: Invalid url` and take every route down with a 503,
 * for a variable that is optional and that the app has a fallback for.
 */
function withoutBlanks(source: RawEnv): RawEnv {
  const values: RawEnv = {};

  for (const [name, value] of Object.entries(source)) {
    if (value !== undefined && value.trim() !== '') values[name] = value;
  }

  return values;
}

function withDevelopmentFallbacks(source: RawEnv): {
  values: RawEnv;
  applied: string[];
} {
  const present = withoutBlanks(source);
  if (present.NODE_ENV !== 'development') return { values: present, applied: [] };

  const applied = Object.keys(DEVELOPMENT_FALLBACKS).filter((name) => !present[name]);
  if (applied.length === 0) return { values: present, applied };

  const values: RawEnv = { ...present };
  for (const name of applied) values[name] = DEVELOPMENT_FALLBACKS[name];

  return { values, applied };
}

let cachedServerEnv: ServerEnv | null = null;

/**
 * Parses and caches the server environment.
 *
 * @throws {EnvConfigError} listing every failing variable, on the first call
 * made by a misconfigured deployment — loudly, at request time, rather than
 * degrading silently later.
 */
export function serverEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;

  const { values, applied } = withDevelopmentFallbacks(process.env);
  const parsed = serverSchema.safeParse(values);

  if (!parsed.success) {
    throw new EnvConfigError(
      parsed.error.issues.map((issue) => ({
        variable: issue.path.join('.') || 'env',
        message: issue.message,
      })),
    );
  }

  // `console` rather than the logger: this runs at first use, the logger reads
  // this module, and a developer needs to see it in the terminal regardless of
  // LOG_LEVEL.
  if (applied.length > 0) {
    console.warn(
      `[kayzen:env] development fallbacks in use for ${applied.join(', ')} — ` +
        'throwaway values, set your own in .env.local before deploying anything.',
    );
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

/** Test-only escape hatch; re-parses on the next `serverEnv()` call. */
export function resetServerEnvCache(): void {
  cachedServerEnv = null;
}

/**
 * Android identity, parsed independently of the rest of the environment.
 *
 * Digital Asset Links decides whether the installed app shows a URL bar, so the
 * endpoint that serves it must not be able to fail for an unrelated reason — a
 * mistyped SMS credential taking `serverEnv()` down would silently un-verify
 * the Trusted Web Activity for every Android user. Reading these two variables
 * through explicit member expressions also keeps the route usable on the Edge
 * runtime, where only literal `process.env.X` accesses are guaranteed.
 */
export function androidEnv(): { packageName: string; fingerprints: string[] } {
  const packageName = process.env.ANDROID_PACKAGE_NAME ?? 'app.kayzen.twa';
  const raw = process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? '';

  return {
    packageName,
    fingerprints: raw
      .split(',')
      .map((fingerprint) => fingerprint.trim().toUpperCase())
      // Anything that is not 32 colon-separated hex pairs would make the whole
      // statement invalid to Chrome's verifier, so it is dropped rather than
      // published.
      .filter((fingerprint) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(fingerprint)),
  };
}

/**
 * Whether this process should use the in-memory database instead of Postgres.
 *
 * Read from raw values rather than from `serverEnv()` so that the decision is
 * available before — and independently of — a successful parse: `prisma.ts`
 * runs at import time, and an import that can throw on a misconfigured
 * environment takes the whole build down rather than one request.
 *
 * The rule, in order:
 *
 *   1. Never in production.
 *   2. `DEV_DATABASE` decides, when set.
 *   3. Otherwise: no `DATABASE_URL` means no Postgres to connect to, so the
 *      in-memory store takes over. Deleting the line is the whole setup.
 */
export function usesMemoryDatabase(
  source: { NODE_ENV?: string; DEV_DATABASE?: string; DATABASE_URL?: string } = process.env,
): boolean {
  if (source.NODE_ENV === 'production') return false;
  if (source.DEV_DATABASE === 'memory') return true;
  if (source.DEV_DATABASE === 'postgres') return false;

  return !source.DATABASE_URL?.trim();
}

/** SHA-256 certificate fingerprints permitted to open the TWA without chrome. */
export function androidCertFingerprints(): string[] {
  return androidEnv().fingerprints;
}

export const clientEnv = {
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'Kayzen',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? '',
} as const;

export const isProduction = process.env.NODE_ENV === 'production';
export const isTest = process.env.NODE_ENV === 'test';
