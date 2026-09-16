import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './password-policy';

/**
 * Password hashing.
 *
 * scrypt, from `node:crypto`, rather than Argon2 or bcrypt as a dependency.
 * Three reasons, in order of weight:
 *
 *  - It is memory-hard, which is the property that matters: an attacker with a
 *    GPU or an FPGA gains far less against scrypt than against a CPU-bound hash.
 *    bcrypt's 4 KiB working set is the reason it no longer resists custom
 *    hardware well.
 *  - Argon2 has no implementation in Node's standard library. Every option is a
 *    native module that has to compile on each build machine — a CI runner, a
 *    Vercel builder, an Alpine container — and this project builds icons and
 *    Web Push encryption by hand precisely so that none of that can break a
 *    deploy.
 *  - bcryptjs would avoid the native module but silently truncates at 72 bytes
 *    and is slower per unit of work than the C implementation it replaces.
 *
 * Parameters are OWASP's `N=2^15, r=8, p=3` — roughly 250 ms and 32 MiB per
 * verification on a modern core, which is a cost a sign-in can carry and a
 * bulk cracker cannot.
 *
 * The encoding names the parameters, so raising them later leaves existing
 * hashes verifiable and `needsRehash()` marks them for replacement on the next
 * successful sign-in.
 */

// `promisify` resolves to the three-argument overload, which has no place for
// `maxmem`; the cast names the one this module actually calls.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

interface ScryptParameters {
  N: number;
  r: number;
  p: number;
}

const CURRENT: ScryptParameters = { N: 32_768, r: 8, p: 3 };

const KEY_BYTES = 32;
const SALT_BYTES = 16;

/**
 * Node's default `maxmem` is exactly 32 MiB, which `N=2^15, r=8` meets to the
 * byte and then exceeds with its own overhead. Without this, hashing throws
 * instead of being slow.
 */
const MAX_MEMORY = 128 * 1024 * 1024;

function encodeParameters({ N, r, p }: ScryptParameters): string {
  return `N=${N},r=${r},p=${p}`;
}

function parseParameters(value: string): ScryptParameters | null {
  const parsed: Partial<Record<'N' | 'r' | 'p', number>> = {};

  for (const pair of value.split(',')) {
    const [name, raw] = pair.split('=');
    if (name !== 'N' && name !== 'r' && name !== 'p') return null;

    const number = Number(raw);
    if (!Number.isInteger(number) || number < 1) return null;
    parsed[name] = number;
  }

  if (parsed.N === undefined || parsed.r === undefined || parsed.p === undefined) return null;

  // A hash claiming absurd parameters would be a denial of service against the
  // server that tried to verify it.
  if (parsed.N > 2 ** 20 || parsed.r > 32 || parsed.p > 16) return null;

  return { N: parsed.N, r: parsed.r, p: parsed.p };
}

async function derive(
  password: string,
  salt: Buffer,
  parameters: ScryptParameters,
): Promise<Buffer> {
  // Normalised so that the same password typed on two keyboards — a composed
  // and a decomposed form of the same accented character — is the same
  // password. Persian text reaches here through the same path.
  const normalised = password.normalize('NFKC');

  return (await scryptAsync(normalised, salt, KEY_BYTES, {
    ...parameters,
    maxmem: MAX_MEMORY,
  })) as Buffer;
}

/** `scrypt$N=32768,r=8,p=3$<salt>$<hash>`, both halves base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, CURRENT);

  return [
    'scrypt',
    encodeParameters(CURRENT),
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

/**
 * A real hash of a value nobody holds, used as the comparison target when an
 * account has no password. Computed once, at module load, so that the first
 * such request is not measurably slower than the rest.
 */
const DUMMY_HASH =
  'scrypt$N=32768,r=8,p=3$AAAAAAAAAAAAAAAAAAAAAA$' +
  Buffer.alloc(KEY_BYTES, 0).toString('base64url');

/**
 * Checks a password against a stored hash.
 *
 * `stored` may be `null` — an account that has never set one. That case still
 * performs a full derivation against a throwaway hash before returning false,
 * so "this account has no password" and "that password is wrong" take the same
 * time. Without it, the endpoint answers, in a few hundred milliseconds, which
 * phone numbers have passwords.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const encoded = stored ?? DUMMY_HASH;
  const parts = encoded.split('$');

  if (parts.length !== 4 || parts[0] !== 'scrypt') {
    await derive(password, randomBytes(SALT_BYTES), CURRENT);
    return false;
  }

  const parameters = parseParameters(parts[1] as string);
  if (!parameters) {
    await derive(password, randomBytes(SALT_BYTES), CURRENT);
    return false;
  }

  const salt = Buffer.from(parts[2] as string, 'base64url');
  const expected = Buffer.from(parts[3] as string, 'base64url');
  const actual = await derive(password, salt, parameters);

  // Lengths must match before `timingSafeEqual`, which throws otherwise.
  if (expected.length !== actual.length) return false;
  if (!timingSafeEqual(expected, actual)) return false;

  // The derivation happened either way; only the answer is withheld.
  return stored !== null;
}

/** True when `stored` was produced with weaker parameters than the current ones. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return true;

  const parameters = parseParameters(parts[1] as string);
  if (!parameters) return true;

  return parameters.N < CURRENT.N || parameters.r < CURRENT.r || parameters.p < CURRENT.p;
}
