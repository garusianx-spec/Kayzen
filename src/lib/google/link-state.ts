import { constantTimeEqual, hmacSha256Hex, randomToken, sha256Hex, toBase64Url } from '../crypto';
import { isProduction, serverEnv } from '../env';

/**
 * The cookie that survives the trip to Google and back.
 *
 * Kayzen's session cookie is `SameSite=Strict`, which means it is *not* sent on
 * the top-level navigation Google makes back to `/callback`. That is the
 * setting working as intended, and it is why the callback cannot authenticate
 * the ordinary way — so this cookie does it instead.
 *
 * It carries three things and is signed over all of them:
 *
 *  - **who started the link**, so the callback knows whose account to attach
 *    the grant to without a session;
 *  - **the `state` nonce**, compared against the one Google echoes back, which
 *    is what stops an attacker from pasting their own authorization code into
 *    somebody else's browser and quietly linking *their* Google account;
 *  - **the PKCE verifier**, which never leaves this cookie.
 *
 * `SameSite=Lax` rather than `Strict`, because Lax is exactly "send on a
 * top-level GET navigation" — the one case that has to work. `HttpOnly` and
 * `Secure` regardless: nothing in the browser has any business reading it, and
 * the verifier is a credential for the duration of the flow.
 */

export const LINK_STATE_COOKIE = isProduction ? '__Host-kayzen_gl' : 'kayzen_gl';

/** Long enough to sign in to Google and grant consent; short enough to expire. */
export const LINK_STATE_TTL_SECONDS = 10 * 60;

export interface LinkState {
  userId: string;
  state: string;
  codeVerifier: string;
  expiresAt: number;
}

function signingKey(): string {
  // The session secret, not the token-encryption key: this signs a short-lived
  // browser cookie, which is the same job `AUTH_JWT_SECRET` already does, and
  // rotating it should invalidate an in-flight link rather than the stored
  // grants — which is exactly the behaviour that falls out of reusing it.
  return serverEnv().AUTH_JWT_SECRET;
}

function encode(payload: LinkState): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

function decode(encoded: string): LinkState | null {
  try {
    const json: unknown = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), (character) =>
          character.charCodeAt(0),
        ),
      ),
    );

    if (typeof json !== 'object' || json === null) return null;
    const candidate = json as Partial<LinkState>;

    if (
      typeof candidate.userId !== 'string' ||
      typeof candidate.state !== 'string' ||
      typeof candidate.codeVerifier !== 'string' ||
      typeof candidate.expiresAt !== 'number'
    ) {
      return null;
    }

    return candidate as LinkState;
  } catch {
    return null;
  }
}

export interface IssuedLinkState {
  /** The cookie value: `<payload>.<signature>`. */
  cookie: string;
  /** The opaque nonce handed to Google. */
  state: string;
  /** S256 of the verifier, for the authorize URL. */
  codeChallenge: string;
}

export async function issueLinkState(
  userId: string,
  now: Date = new Date(),
): Promise<IssuedLinkState> {
  const state = randomToken(24);
  // RFC 7636 allows 43–128 characters; 32 random bytes base64url is 43.
  const codeVerifier = randomToken(32);

  const payload: LinkState = {
    userId,
    state,
    codeVerifier,
    expiresAt: now.getTime() + LINK_STATE_TTL_SECONDS * 1000,
  };

  const encoded = encode(payload);
  const signature = await hmacSha256Hex(signingKey(), encoded);

  return {
    cookie: `${encoded}.${signature}`,
    state,
    // PKCE hashes the *ASCII* verifier and base64url-encodes the raw digest.
    // `sha256Hex` gives hex, so the digest is rebuilt from it here rather than
    // adding a second hashing helper for one caller.
    codeChallenge: toBase64Url(hexToBytes(await sha256Hex(codeVerifier))),
  };
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Verifies a returned cookie against the `state` Google echoed back.
 *
 * Null for every failure — bad signature, expired, missing, mismatched — for
 * the same reason `openSecret` does: the caller's answer is identical in all
 * of them, and telling them apart only helps somebody probing.
 */
export async function readLinkState(
  cookie: string | undefined,
  returnedState: string,
  now: Date = new Date(),
): Promise<LinkState | null> {
  if (!cookie) return null;

  const separator = cookie.lastIndexOf('.');
  if (separator <= 0) return null;

  const encoded = cookie.slice(0, separator);
  const signature = cookie.slice(separator + 1);

  const expected = await hmacSha256Hex(signingKey(), encoded);
  if (!(await constantTimeEqual(signature, expected))) return null;

  const payload = decode(encoded);
  if (!payload) return null;

  if (payload.expiresAt <= now.getTime()) return null;
  if (!(await constantTimeEqual(payload.state, returnedState))) return null;

  return payload;
}
