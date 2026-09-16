import { describe, expect, it } from 'vitest';

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  hashPassword,
  needsRehash,
  verifyPassword,
} from '@/lib/auth/password';
import { passwordLoginSchema, setPasswordSchema } from '@/lib/validation/schemas';

/**
 * Password hashing.
 *
 * The properties asserted here are the ones whose absence would not show up in
 * any manual test: a hash that is not salted still logs you in, and a
 * verification that returns early on an account with no password still returns
 * the right answer — it just answers a question nobody asked.
 */

describe('hashPassword', () => {
  it('produces a self-describing, parameterised encoding', async () => {
    const encoded = await hashPassword('correct horse battery staple');
    const [scheme, parameters, salt, key] = encoded.split('$');

    expect(scheme).toBe('scrypt');
    // Named parameters rather than positional ones, so raising the work factor
    // later leaves every existing row verifiable.
    expect(parameters).toMatch(/^N=\d+,r=\d+,p=\d+$/);
    expect(salt).toBeTruthy();
    expect(key).toBeTruthy();
    expect(encoded).not.toContain('correct horse');
  });

  it('salts every hash', async () => {
    const [first, second] = await Promise.all([hashPassword('same'), hashPassword('same')]);

    expect(first).not.toBe(second);
    await expect(verifyPassword('same', first)).resolves.toBe(true);
    await expect(verifyPassword('same', second)).resolves.toBe(true);
  });

  it('treats the two Unicode spellings of a character as one password', async () => {
    // A composed é and a decomposed e + combining accent are the same password
    // to a person and different byte strings to a computer.
    const encoded = await hashPassword('café-passphrase');

    await expect(verifyPassword('café-passphrase', encoded)).resolves.toBe(true);
  });
});

describe('verifyPassword', () => {
  it('accepts the right password and rejects a near miss', async () => {
    const encoded = await hashPassword('a-long-enough-passphrase');

    await expect(verifyPassword('a-long-enough-passphrase', encoded)).resolves.toBe(true);
    await expect(verifyPassword('a-long-enough-passphrasE', encoded)).resolves.toBe(false);
    await expect(verifyPassword('', encoded)).resolves.toBe(false);
  });

  it('rejects an account with no password without saying so', async () => {
    await expect(verifyPassword('anything', null)).resolves.toBe(false);
  });

  it('does not answer faster for an account with no password', async () => {
    // The whole point of the decoy hash. If this regressed, the endpoint would
    // let anyone ask which phone numbers have passwords, a few hundred
    // milliseconds at a time.
    const encoded = await hashPassword('a-long-enough-passphrase');

    const timeOf = async (stored: string | null): Promise<number> => {
      const started = process.hrtime.bigint();
      await verifyPassword('some-guess', stored);
      return Number(process.hrtime.bigint() - started) / 1e6;
    };

    // Warm up, so the first derivation's cost does not land on whichever case
    // happens to run first.
    await timeOf(encoded);

    const withHash = await timeOf(encoded);
    const withoutHash = await timeOf(null);
    const ratio = Math.max(withHash, withoutHash) / Math.min(withHash, withoutHash);

    // Generous: this asserts "same order of magnitude", which is what defeats a
    // remote attacker, without turning a busy CI runner into a flake.
    expect(ratio).toBeLessThan(3);
  });

  it('rejects a malformed or hostile stored value', async () => {
    await expect(verifyPassword('guess', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('guess', 'scrypt$N=bogus$a$b')).resolves.toBe(false);
    await expect(verifyPassword('guess', 'bcrypt$N=1,r=1,p=1$a$b')).resolves.toBe(false);

    // Parameters large enough to exhaust memory are refused rather than
    // attempted: a stored value is data, and data does not get to choose how
    // much of the server it consumes.
    await expect(verifyPassword('guess', 'scrypt$N=1073741824,r=32,p=16$a$b')).resolves.toBe(false);
  });
});

describe('needsRehash', () => {
  it('leaves a current hash alone and marks a weaker one', async () => {
    expect(needsRehash(await hashPassword('passphrase'))).toBe(false);
    expect(needsRehash('scrypt$N=16384,r=8,p=1$AAAA$AAAA')).toBe(true);
    expect(needsRehash('bcrypt$whatever')).toBe(true);
  });
});

describe('password schemas', () => {
  it('holds new passwords to a length floor', () => {
    expect(setPasswordSchema.safeParse({ password: 'x'.repeat(PASSWORD_MIN_LENGTH) }).success).toBe(
      true,
    );
    expect(
      setPasswordSchema.safeParse({ password: 'x'.repeat(PASSWORD_MIN_LENGTH - 1) }).success,
    ).toBe(false);
    expect(
      setPasswordSchema.safeParse({ password: 'x'.repeat(PASSWORD_MAX_LENGTH + 1) }).success,
    ).toBe(false);
  });

  it('refuses a change that changes nothing', () => {
    const result = setPasswordSchema.safeParse({
      password: 'the-same-one',
      currentPassword: 'the-same-one',
    });

    expect(result.success).toBe(false);
  });

  it('does not apply the length floor when signing in', () => {
    // A rule added later must not lock out an account whose password predates
    // it — and the boundary is not something a login form should reveal.
    const result = passwordLoginSchema.safeParse({ phone: '09123456789', password: 'short' });

    expect(result.success).toBe(true);
  });

  it('still normalises the phone on the password route', () => {
    const result = passwordLoginSchema.safeParse({
      phone: '۰۹۱۲۳۴۵۶۷۸۹',
      password: 'a-passphrase',
    });

    expect(result.success && result.data.phone).toBe('+989123456789');
  });
});
