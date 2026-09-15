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

    DATABASE_URL: nonEmpty('DATABASE_URL').url(),
    DIRECT_URL: z.string().url().optional(),

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
    if (env.NODE_ENV !== 'production') return;

    // A production deployment that "sends" OTP codes to stdout would hand every
    // account to anyone who can read a log line.
    if (env.SMS_PROVIDER === 'console') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMS_PROVIDER'],
        message: 'the console SMS provider must not be used in production',
      });
    }

    const credentials: Record<Exclude<SmsProviderId, 'console'>, Array<[string, unknown]>> = {
      kavenegar: [['KAVENEGAR_API_KEY', env.KAVENEGAR_API_KEY]],
      farazsms: [
        ['FARAZSMS_API_KEY', env.FARAZSMS_API_KEY],
        ['FARAZSMS_PATTERN_CODE', env.FARAZSMS_PATTERN_CODE],
        ['FARAZSMS_ORIGINATOR', env.FARAZSMS_ORIGINATOR],
      ],
      twilio: [
        ['TWILIO_ACCOUNT_SID', env.TWILIO_ACCOUNT_SID],
        ['TWILIO_AUTH_TOKEN', env.TWILIO_AUTH_TOKEN],
        ['TWILIO_FROM_NUMBER', env.TWILIO_FROM_NUMBER],
      ],
    };

    if (env.SMS_PROVIDER !== 'console') {
      for (const [name, value] of credentials[env.SMS_PROVIDER]) {
        if (!value) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [name],
            message: `${name} is required when SMS_PROVIDER=${env.SMS_PROVIDER}`,
          });
        }
      }
    }
  });

export type ServerEnv = z.infer<typeof serverSchema>;

let cachedServerEnv: ServerEnv | null = null;

/**
 * Parses and caches the server environment.
 *
 * @throws {Error} listing every failing variable, on the first call made by a
 * misconfigured deployment — loudly, at request time, rather than degrading
 * silently later.
 */
export function serverEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid server environment:\n${issues}`);
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
