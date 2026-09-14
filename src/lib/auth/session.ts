import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

import { clientEnv, isProduction, serverEnv } from '../env';
import { verifyAccessToken, type KayzenClaims } from './jwt';

/**
 * Session cookie handling.
 *
 * Tokens live in `HttpOnly; Secure; SameSite=Strict` cookies, so XSS cannot read
 * them and no cross-site request carries them. `Strict` costs nothing here: a
 * Trusted Web Activity navigates to its own origin directly, and there is no
 * third-party embedding to support — unlike an in-chat mini app, which would
 * have forced `SameSite=None`.
 *
 * The `__Host-` prefix pins the cookies to this exact origin (Secure, Path=/,
 * no Domain), which blocks a subdomain from overwriting a session. It requires
 * `Secure`, so plain-HTTP local development falls back to unprefixed names.
 */

export const ACCESS_TOKEN_COOKIE = isProduction ? '__Host-kayzen_at' : 'kayzen_at';
export const REFRESH_TOKEN_COOKIE = isProduction ? '__Host-kayzen_rt' : 'kayzen_rt';

export interface SessionUser {
  id: string;
  phone: string;
  timezone: string;
  dayStartHour: number;
}

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
  } as const;
}

export async function setSessionCookies(tokens: {
  accessToken: string;
  refreshToken: string;
}): Promise<void> {
  const env = serverEnv();
  const cookieStore = await cookies();

  cookieStore.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...baseCookieOptions(),
    maxAge: env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
  });

  cookieStore.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...baseCookieOptions(),
    maxAge: env.AUTH_REFRESH_TOKEN_TTL_SECONDS,
  });
}

export async function clearSessionCookies(): Promise<void> {
  const cookieStore = await cookies();

  for (const name of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]) {
    cookieStore.set(name, '', { ...baseCookieOptions(), maxAge: 0 });
  }
}

function toSessionUser(claims: KayzenClaims): SessionUser {
  return {
    id: claims.sub,
    phone: claims.phone,
    timezone: claims.timezone,
    dayStartHour: claims.dayStartHour,
  };
}

/** Resolves the caller from a request. Route handlers use this. */
export async function getSessionFromRequest(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifyAccessToken(token);
  return claims ? toSessionUser(claims) : null;
}

/** Server Component / Server Action variant, reading from the request cookie store. */
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifyAccessToken(token);
  return claims ? toSessionUser(claims) : null;
}

/**
 * Rejects cross-origin state changes.
 *
 * `SameSite=Strict` already stops a browser from attaching the session cookie
 * to a cross-site request, and this is the belt to that pair of braces: a
 * mutation must either carry no `Origin` (same-origin fetch in some browsers,
 * or a non-browser client) or carry exactly this deployment's origin.
 */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;

  const allowed = new Set<string>([clientEnv.appUrl, request.nextUrl.origin]);
  return allowed.has(origin);
}
