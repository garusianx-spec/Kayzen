import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { Prisma } from '@prisma/client';

import { describeMisconfiguration } from '@/lib/api/handler';
import { fixedDevOtpCode } from '@/lib/auth/otp';
import {
  EnvConfigError,
  missingSmsCredentials,
  resetServerEnvCache,
  serverEnv,
  type ServerEnv,
} from '@/lib/env';

/**
 * The local development contract.
 *
 * Both halves of this file exist because signing in locally was impossible:
 * `POST /api/v1/auth/otp/send` answered 500, and the code you needed was in a
 * log line the server could no longer write.
 */

/**
 * Moves environment variables and drops the cached parse.
 *
 * Assignment goes through `Object.assign` because `@types/node` declares
 * `NODE_ENV` read-only — true of the process, not of a test deciding what the
 * process should look like.
 */
function setEnv(values: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name];
    else Object.assign(process.env, { [name]: value });
  }

  resetServerEnvCache();
}

/**
 * Variables these tests move. Captured before anything runs and put back after
 * each one, because `vitest.setup.ts` supplies several of them and a test that
 * deleted one would quietly break every file that ran after it.
 */
const TOUCHED = [
  'AUTH_DEV_OTP_CODE',
  'AUTH_OTP_LENGTH',
  'AUTH_JWT_SECRET',
  'AUTH_OTP_PEPPER',
  'SMS_PROVIDER',
  'KAVENEGAR_API_KEY',
  'NODE_ENV',
] as const;

const ORIGINAL = Object.fromEntries(TOUCHED.map((name) => [name, process.env[name]]));

afterEach(() => {
  setEnv(ORIGINAL);
});

function parseEnv(overrides: Record<string, string | undefined>) {
  setEnv(overrides);
  return serverEnv();
}

describe('fixed development OTP code', () => {
  it('pins the code outside production', () => {
    const env = parseEnv({ AUTH_DEV_OTP_CODE: '111111' });

    expect(env.AUTH_DEV_OTP_CODE).toBe('111111');
    expect(fixedDevOtpCode(env)).toBe('111111');
  });

  it('falls back to a random code when unset', () => {
    expect(fixedDevOtpCode(parseEnv({}))).toBeNull();
  });

  it('refuses to pin a code in production, whatever the environment says', () => {
    // `serverEnv()` already rejects this combination, so it cannot be reached
    // through configuration. The guard is asserted directly because it is the
    // last thing standing between a misread NODE_ENV and an app whose password
    // is printed in its own README.
    const production = {
      NODE_ENV: 'production',
      AUTH_DEV_OTP_CODE: '111111',
    } as ServerEnv;

    expect(fixedDevOtpCode(production)).toBeNull();
  });

  it('is rejected outright by a production environment', () => {
    expect(() => parseEnv({ NODE_ENV: 'production', AUTH_DEV_OTP_CODE: '111111' })).toThrow(
      /AUTH_DEV_OTP_CODE must not be set in production/,
    );
  });

  it('is rejected when it could never be typed in', () => {
    // A four-digit pin against a six-box input looks like "the fixed code does
    // not work" rather than like a typo in `.env.local`, so it fails at boot.
    expect(() => parseEnv({ AUTH_DEV_OTP_CODE: '1111', AUTH_OTP_LENGTH: '6' })).toThrow(
      /must be exactly AUTH_OTP_LENGTH \(6\) digits/,
    );

    expect(() => parseEnv({ AUTH_DEV_OTP_CODE: 'abcdef' })).toThrow(/digits only/);
  });

  it('accepts a pin that matches a non-default code length', () => {
    const env = parseEnv({ AUTH_DEV_OTP_CODE: '1234', AUTH_OTP_LENGTH: '4' });

    expect(fixedDevOtpCode(env)).toBe('1234');
  });
});

describe('logger transport', () => {
  it('constructs pino without a worker transport', async () => {
    // A pino `transport` runs in a worker thread whose entry point is resolved
    // as a filesystem path. Next.js bundles server code into
    // `.next/server/vendor-chunks/`, where that path does not exist, so the
    // worker exits at startup and every later log call throws `the worker has
    // exited` — a 500 from whichever route logged first, which in practice was
    // sign-in. Asserted against the source because there is no way to observe
    // "no worker was spawned" from a healthy logger.
    const source = await readFile(resolve(process.cwd(), 'src/lib/logger.ts'), 'utf8');

    expect(source).not.toMatch(/^\s*transport:/m);
    expect(source).not.toMatch(/pino\/file/);
  });
});

describe('missing SMS credentials', () => {
  it('asks nothing of the console sink', () => {
    expect(missingSmsCredentials({ SMS_PROVIDER: 'console' })).toEqual([]);
  });

  it('names every credential the chosen gateway lacks', () => {
    expect(missingSmsCredentials({ SMS_PROVIDER: 'kavenegar' })).toEqual(['KAVENEGAR_API_KEY']);

    expect(missingSmsCredentials({ SMS_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: 'AC123' })).toEqual([
      'TWILIO_AUTH_TOKEN',
      'TWILIO_FROM_NUMBER',
    ]);

    expect(missingSmsCredentials({ SMS_PROVIDER: 'kavenegar', KAVENEGAR_API_KEY: 'key' })).toEqual(
      [],
    );
  });

  it('is still a startup failure in production', () => {
    // Outside production the same list makes `smsProvider()` fall back to the
    // console sink. A deployment must not be allowed to reach that fallback.
    expect(() => parseEnv({ NODE_ENV: 'production', SMS_PROVIDER: 'kavenegar' })).toThrow(
      /KAVENEGAR_API_KEY is required when SMS_PROVIDER=kavenegar/,
    );
  });
});

describe('development secret fallbacks', () => {
  it('lets `next dev` boot without the two auth secrets', () => {
    const env = parseEnv({
      NODE_ENV: 'development',
      AUTH_JWT_SECRET: undefined,
      AUTH_OTP_PEPPER: undefined,
    });

    expect(env.AUTH_JWT_SECRET).toMatch(/development-insecure/);
    expect(env.AUTH_OTP_PEPPER).toMatch(/development-insecure/);
  });

  it('never substitutes one that was actually provided', () => {
    const env = parseEnv({ NODE_ENV: 'development', AUTH_JWT_SECRET: 'x'.repeat(40) });

    expect(env.AUTH_JWT_SECRET).toBe('x'.repeat(40));
  });

  it('applies only under an explicit development NODE_ENV', () => {
    // Not when NODE_ENV is absent: that is a bare `node` process, a script, or
    // a runtime whose configuration nobody has vouched for.
    expect(() =>
      parseEnv({ NODE_ENV: undefined, AUTH_JWT_SECRET: undefined, AUTH_OTP_PEPPER: undefined }),
    ).toThrow(EnvConfigError);

    expect(() => parseEnv({ NODE_ENV: 'production', AUTH_JWT_SECRET: undefined })).toThrow(
      /AUTH_JWT_SECRET/,
    );
  });
});

describe('configuration failures reaching a route', () => {
  it('reports a missing variable by name, and never its value', () => {
    let thrown: unknown;
    try {
      parseEnv({ NODE_ENV: 'test', AUTH_OTP_PEPPER: undefined });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EnvConfigError);
    const config = thrown as EnvConfigError;
    expect(config.variables).toContain('AUTH_OTP_PEPPER');

    const described = describeMisconfiguration(config);
    expect(described?.summary).toBe('server environment is incomplete');
    expect(described?.logFields).toEqual({ missingEnv: config.variables });
    expect(described?.details).toHaveProperty('AUTH_OTP_PEPPER');

    // The whole point of carrying names rather than the parsed environment.
    expect(JSON.stringify(described)).not.toContain(ORIGINAL.AUTH_OTP_PEPPER as string);
  });

  it('separates an unreachable database from a bug in the request', () => {
    const described = describeMisconfiguration(
      new Prisma.PrismaClientInitializationError('connect ECONNREFUSED', '6.2.1'),
    );

    expect(described?.summary).toBe('database is unreachable');
    expect(described?.details).toHaveProperty('DATABASE_URL');
  });

  it('leaves every other error to the opaque 500 path', () => {
    // A classifier that swallowed ordinary bugs would turn them into a 503
    // telling the user to try again later, forever.
    expect(describeMisconfiguration(new Error('boom'))).toBeNull();
    expect(describeMisconfiguration(new TypeError('x is not a function'))).toBeNull();
    expect(describeMisconfiguration(undefined)).toBeNull();
  });
});
