import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

import { randomToken, sha256Hex, utf8 } from '../crypto';
import { serverEnv } from '../env';

/**
 * Short-lived access tokens.
 *
 * HS256 over a shared secret: Kayzen is a single deployment issuing and
 * verifying its own tokens, so asymmetric keys would add key-distribution work
 * for no threat-model benefit. The secret is validated to be ≥32 characters at
 * boot by `serverEnv()`.
 *
 * The claims carry the two fields every request needs — timezone and day-start
 * hour — so the "what day is it for this user" calculation never costs a
 * database round trip. Both are refreshed whenever the access token is.
 */

export interface KayzenClaims extends JWTPayload {
  /** Kayzen user UUID. Also the tenant key used by RLS. */
  sub: string;
  /** E.164 phone, for support diagnostics and the account screen header. */
  phone: string;
  timezone: string;
  dayStartHour: number;
}

let cachedSecret: Uint8Array | null = null;

function secretKey(): Uint8Array {
  cachedSecret ??= utf8(serverEnv().AUTH_JWT_SECRET);
  return cachedSecret;
}

export async function signAccessToken(claims: {
  userId: string;
  phone: string;
  timezone: string;
  dayStartHour: number;
}): Promise<{ token: string; expiresAt: Date }> {
  const env = serverEnv();
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = issuedAt + env.AUTH_ACCESS_TOKEN_TTL_SECONDS;

  const token = await new SignJWT({
    phone: claims.phone,
    timezone: claims.timezone,
    dayStartHour: claims.dayStartHour,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.userId)
    .setIssuer(env.AUTH_JWT_ISSUER)
    .setAudience(env.AUTH_JWT_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAtSeconds)
    .sign(secretKey());

  return { token, expiresAt: new Date(expiresAtSeconds * 1000) };
}

/** Verifies signature, issuer, audience and expiry. Returns `null` on any failure. */
export async function verifyAccessToken(token: string): Promise<KayzenClaims | null> {
  const env = serverEnv();

  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: env.AUTH_JWT_ISSUER,
      audience: env.AUTH_JWT_AUDIENCE,
      algorithms: ['HS256'],
      clockTolerance: 5,
    });

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;

    return {
      ...payload,
      sub: payload.sub,
      phone: typeof payload.phone === 'string' ? payload.phone : '',
      timezone: typeof payload.timezone === 'string' ? payload.timezone : 'Asia/Tehran',
      dayStartHour: typeof payload.dayStartHour === 'number' ? payload.dayStartHour : 0,
    } satisfies KayzenClaims;
  } catch {
    return null;
  }
}

/**
 * Mints an opaque refresh token plus the SHA-256 digest stored in the database.
 *
 * Only the digest is persisted, so a database disclosure yields no usable
 * refresh tokens. The token itself is 32 bytes of CSPRNG output — not a JWT —
 * because it must be revocable, and revocation means a row lookup either way.
 */
export async function createRefreshToken(): Promise<{
  token: string;
  tokenHash: string;
  expiresAt: Date;
}> {
  const env = serverEnv();
  const token = randomToken(32);

  return {
    token,
    tokenHash: await hashRefreshToken(token),
    expiresAt: new Date(Date.now() + env.AUTH_REFRESH_TOKEN_TTL_SECONDS * 1000),
  };
}

export async function hashRefreshToken(token: string): Promise<string> {
  return sha256Hex(token);
}
