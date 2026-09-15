import { SignJWT } from 'jose';

import { fromBase64Url, toBase64Url } from '../crypto';
import { serverEnv } from '../env';

/**
 * VAPID (RFC 8292) request signing.
 *
 * A push service will not accept an anonymous POST: every request carries a JWT
 * signed with the application server's P-256 key, audienced to the push
 * service's own origin. The public half travels alongside it in the same header
 * and is what the browser pinned when it created the subscription — which is
 * why rotating VAPID keys invalidates every existing subscription.
 */

export interface VapidKeyPair {
  publicKey: string;
  privateKey: string;
}

/**
 * Imports the raw base64url key pair as a WebCrypto signing key.
 *
 * The stored format is what every VAPID tool emits: a 32-byte private scalar and
 * a 65-byte uncompressed public point. WebCrypto wants a JWK, so the point is
 * split back into its `x` and `y` halves here.
 */
export async function importVapidPrivateKey(keys: VapidKeyPair): Promise<CryptoKey> {
  const publicBytes = fromBase64Url(keys.publicKey);
  const privateBytes = fromBase64Url(keys.privateKey);

  if (publicBytes.length !== 65 || publicBytes[0] !== 0x04) {
    throw new Error('VAPID public key must be a 65-byte uncompressed P-256 point');
  }

  if (privateBytes.length !== 32) {
    throw new Error('VAPID private key must be 32 bytes');
  }

  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: toBase64Url(publicBytes.slice(1, 33)),
      y: toBase64Url(publicBytes.slice(33, 65)),
      d: toBase64Url(privateBytes),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/** Origin of a push endpoint — the `aud` claim the push service checks. */
export function pushAudience(endpoint: string): string {
  return new URL(endpoint).origin;
}

/**
 * Builds the `Authorization: vapid t=…, k=…` header for one endpoint.
 *
 * The token is audienced per push service and deliberately short-lived: the spec
 * caps `exp` at 24 hours and services reject anything longer, so a 12-hour token
 * leaves room for clock skew on both ends.
 */
export async function vapidAuthorizationHeader(endpoint: string): Promise<string> {
  const env = serverEnv();

  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    throw new Error('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required to send push messages');
  }

  const key = await importVapidPrivateKey({
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  });

  const token = await new SignJWT({ sub: env.VAPID_SUBJECT })
    .setProtectedHeader({ alg: 'ES256', typ: 'JWT' })
    .setAudience(pushAudience(endpoint))
    .setExpirationTime(Math.floor(Date.now() / 1000) + 12 * 60 * 60)
    .sign(key);

  return `vapid t=${token}, k=${env.VAPID_PUBLIC_KEY}`;
}
