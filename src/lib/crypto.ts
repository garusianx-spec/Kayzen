/**
 * Web Crypto helpers shared by the auth and push subsystems.
 *
 * Everything here runs on the standard `crypto.subtle` surface so the same code
 * works in the Node.js runtime, the Edge runtime and (for the encoding helpers)
 * the browser. No Node `crypto` import, no polyfill.
 */

const encoder = new TextEncoder();

export function utf8(value: string): Uint8Array {
  return encoder.encode(value);
}

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(view, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('hex string must have an even length');

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
}

export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

  return bytes;
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const input = typeof value === 'string' ? utf8(value) : value;
  return toHex(await crypto.subtle.digest('SHA-256', input as BufferSource));
}

export async function hmacSha256(key: string | Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    (typeof key === 'string' ? utf8(key) : key) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, utf8(message) as BufferSource));
}

export async function hmacSha256Hex(key: string | Uint8Array, message: string): Promise<string> {
  return toHex(await hmacSha256(key, message));
}

/** Byte-oriented HMAC, for the HKDF steps in the Web Push encryption path. */
export async function hmacSha256Bytes(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, message as BufferSource));
}

/**
 * HKDF (RFC 5869) restricted to outputs of at most 32 bytes.
 *
 * Every expansion Web Push needs — content key, nonce, IKM — is ≤32 bytes, so
 * the multi-block loop would be dead code. Longer requests throw rather than
 * silently truncating.
 */
export async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  if (length > 32) throw new Error('hkdf: this implementation emits at most 32 bytes');

  const prk = await hmacSha256Bytes(salt, ikm);
  const okm = await hmacSha256Bytes(prk, concatBytes(info, Uint8Array.of(1)));

  return okm.slice(0, length);
}

export function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);

  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Length-independent, constant-time string comparison.
 *
 * A naive `===` on an OTP digest leaks, through timing, how many leading
 * characters an attacker got right — which turns 10^6 guesses into ~60. Both
 * sides are hashed first so that comparing different-length inputs still runs
 * over a fixed 32 bytes, then XOR-accumulated with no early exit.
 */
export async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', utf8(left) as BufferSource),
    crypto.subtle.digest('SHA-256', utf8(right) as BufferSource),
  ]);

  const a = new Uint8Array(leftDigest);
  const b = new Uint8Array(rightDigest);

  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= (a[index] as number) ^ (b[index] as number);
  }

  return difference === 0;
}

/**
 * Uniform random integer in `[0, max)` using rejection sampling.
 *
 * `getRandomValues() % max` is biased whenever `max` does not divide 2^32, and
 * for a 6-digit OTP that bias is measurable. Values landing in the final,
 * incomplete bucket are discarded instead.
 */
export function randomInt(max: number): number {
  if (max <= 0 || !Number.isInteger(max)) throw new Error('max must be a positive integer');

  const limit = Math.floor(0xffff_ffff / max) * max;
  const buffer = new Uint32Array(1);

  for (;;) {
    crypto.getRandomValues(buffer);
    const value = buffer[0] as number;
    if (value < limit) return value % max;
  }
}

/** `length` cryptographically random decimal digits, leading zeros preserved. */
export function randomDigits(length: number): string {
  let digits = '';
  for (let index = 0; index < length; index += 1) digits += String(randomInt(10));
  return digits;
}

/** URL-safe opaque token of `bytes` bytes of entropy. */
export function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}
