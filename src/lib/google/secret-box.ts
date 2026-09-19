import { fromBase64Url, toBase64Url, utf8 } from '../crypto';

/**
 * Authenticated encryption for secrets that must come back out again.
 *
 * The rest of the app only ever *hashes* secrets — passwords, OTP codes, cron
 * tokens — because it never needs the plaintext back. A Google refresh token is
 * the exception: it has to be replayed to Google months later, so it has to be
 * stored reversibly, and "reversibly" is only acceptable when it also means
 * "unreadable without the key and unmodifiable without detection".
 *
 * AES-256-GCM over Web Crypto, so the same code runs under Node and Edge. The
 * nonce is 12 random bytes prepended to the ciphertext — GCM's security rests
 * entirely on never reusing one under the same key, and 96 random bits is the
 * standard way to buy that without keeping a counter.
 *
 * The key is derived from the configured passphrase with SHA-256 rather than
 * used raw, so a passphrase of any length becomes exactly 32 bytes. That is a
 * key *derivation*, not a password KDF: the passphrase is a high-entropy
 * deployment secret, not something a person typed, so there is nothing here
 * for a slow hash to protect against.
 *
 * It lives under `google/` because that is its only caller. A second consumer
 * is the moment to promote it to a shared home, not before.
 */

const NONCE_BYTES = 12;
const VERSION = 'v1';

/** Cached per passphrase: `importKey` is not free and this runs per request. */
const keyCache = new Map<string, Promise<CryptoKey>>();

async function keyFor(passphrase: string): Promise<CryptoKey> {
  const cached = keyCache.get(passphrase);
  if (cached) return cached;

  const derived = crypto.subtle
    .digest('SHA-256', utf8(passphrase) as BufferSource)
    .then((bytes) =>
      crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']),
    );

  keyCache.set(passphrase, derived);
  return derived;
}

/** `v1.<nonce>.<ciphertext>`, all base64url. The prefix is a rotation hook. */
export async function sealSecret(plaintext: string, passphrase: string): Promise<string> {
  const key = await keyFor(passphrase);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce as BufferSource },
    key,
    utf8(plaintext) as BufferSource,
  );

  return `${VERSION}.${toBase64Url(nonce)}.${toBase64Url(ciphertext)}`;
}

/**
 * Opens a sealed secret, or returns null.
 *
 * Null rather than a throw on every failure path — wrong key, truncated value,
 * tampered ciphertext, a format from a future version — because every caller
 * wants the same answer to all of them: this token is unusable, ask the person
 * to reconnect. Distinguishing them would only hand an attacker an oracle.
 */
export async function openSecret(sealed: string, passphrase: string): Promise<string | null> {
  const parts = sealed.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return null;

  try {
    const key = await keyFor(passphrase);
    const nonce = fromBase64Url(parts[1] as string);
    if (nonce.length !== NONCE_BYTES) return null;

    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource },
      key,
      fromBase64Url(parts[2] as string) as BufferSource,
    );

    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

/** Test-only: drops the derived-key cache so a rotated passphrase is honoured. */
export function resetSecretBoxCache(): void {
  keyCache.clear();
}
