import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { fixedDevOtpCode } from '@/lib/auth/otp';
import { resetServerEnvCache, serverEnv, type ServerEnv } from '@/lib/env';

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

afterEach(() => {
  setEnv({ AUTH_DEV_OTP_CODE: undefined, AUTH_OTP_LENGTH: undefined, NODE_ENV: 'test' });
});

function parseEnv(overrides: Record<string, string>) {
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
