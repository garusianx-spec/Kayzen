import type { User } from '@prisma/client';

import { prisma } from '../db/prisma';
import { logger } from '../logger';
import { createRefreshToken, hashRefreshToken, signAccessToken } from './jwt';
import { clearSessionCookies, setSessionCookies, type SessionUser } from './session';

/**
 * Session lifecycle: issue, rotate, revoke.
 *
 * Refresh tokens are single-use. Every exchange mints a new one and marks the
 * old one rotated, which makes theft detectable: if a rotated token is ever
 * presented again, either the legitimate client replayed it or an attacker is
 * using a copy, and there is no way to tell them apart. The safe response is to
 * revoke the whole family and make everyone sign in again.
 */

export interface IssuedSession {
  user: SessionUser;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

function toSessionUser(
  user: Pick<User, 'id' | 'phone' | 'timezone' | 'dayStartHour'>,
): SessionUser {
  return {
    id: user.id,
    phone: user.phone,
    timezone: user.timezone,
    dayStartHour: user.dayStartHour,
  };
}

/** Mints a fresh token pair and writes both session cookies. */
export async function startSession(
  user: Pick<User, 'id' | 'phone' | 'timezone' | 'dayStartHour'>,
  options: { userAgent?: string | null } = {},
): Promise<IssuedSession> {
  const [access, refresh] = await Promise.all([
    signAccessToken({
      userId: user.id,
      phone: user.phone,
      timezone: user.timezone,
      dayStartHour: user.dayStartHour,
    }),
    createRefreshToken(),
  ]);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refresh.tokenHash,
      userAgent: options.userAgent?.slice(0, 300) ?? null,
      expiresAt: refresh.expiresAt,
    },
  });

  await setSessionCookies({ accessToken: access.token, refreshToken: refresh.token });

  return {
    user: toSessionUser(user),
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt,
  };
}

export type RotationFailure = 'missing' | 'unknown' | 'expired' | 'revoked' | 'reused';

export type RotationResult =
  | { ok: true; session: IssuedSession }
  | { ok: false; reason: RotationFailure };

/**
 * Exchanges a refresh token for a new pair.
 *
 * The lookup is by SHA-256 digest, which is why this path runs without a tenant
 * context: the caller's identity is what the token is being exchanged *for*.
 */
export async function rotateSession(
  presentedToken: string | undefined,
  options: { userAgent?: string | null } = {},
): Promise<RotationResult> {
  if (!presentedToken) return { ok: false, reason: 'missing' };

  const tokenHash = await hashRefreshToken(presentedToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!stored) return { ok: false, reason: 'unknown' };

  if (stored.rotatedAt) {
    // A token that has already been exchanged is being presented again. Assume
    // the worst and end every session this user has.
    logger.warn({ userId: stored.userId }, 'refresh token reuse detected; revoking token family');
    await revokeAllSessions(stored.userId);
    return { ok: false, reason: 'reused' };
  }

  if (stored.revokedAt) return { ok: false, reason: 'revoked' };
  if (stored.expiresAt <= new Date()) return { ok: false, reason: 'expired' };

  const now = new Date();
  const rotated = await prisma.refreshToken.updateMany({
    where: { id: stored.id, rotatedAt: null, revokedAt: null },
    data: { rotatedAt: now, revokedAt: now },
  });

  // Lost the race against a concurrent refresh: the other request already
  // issued the new pair, and this one must not mint a second family.
  if (rotated.count === 0) return { ok: false, reason: 'reused' };

  const session = await startSession(stored.user, options);
  return { ok: true, session };
}

/** Revokes one session (sign-out on this device) and clears the cookies. */
export async function endSession(presentedToken: string | undefined): Promise<void> {
  if (presentedToken) {
    const tokenHash = await hashRefreshToken(presentedToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await clearSessionCookies();
}

/** Revokes every live refresh token for a user (sign-out everywhere). */
export async function revokeAllSessions(userId: string): Promise<number> {
  const result = await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return result.count;
}
