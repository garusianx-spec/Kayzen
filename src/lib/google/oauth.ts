import { z } from 'zod';

import { clientEnv, googleOAuthConfig } from '../env';
import { ApiError } from '../errors';
import { logger } from '../logger';

/**
 * The Google OAuth 2.0 authorization-code dance, with PKCE.
 *
 * PKCE on a confidential client is belt and braces — we hold a client secret,
 * so an intercepted code cannot be redeemed without it — but it costs one hash
 * and closes the window where a code leaks through a redirect chain, a browser
 * extension or a shared device's history. There is no reason to skip it.
 *
 * `access_type=offline` with `prompt=consent` is what makes the refresh token
 * arrive. Google issues one *only* on the first consent unless consent is asked
 * for again, which is the single most common way this integration silently
 * half-works: the link succeeds, the first hour is fine, and then it dies with
 * no refresh token to recover with.
 */

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  // The account's own address, shown on the settings card so that somebody with
  // two Google accounts can tell which one they linked.
  'https://www.googleapis.com/auth/userinfo.email',
  // Events only. Kayzen never reads the calendar list, never touches settings,
  // and never asks for `calendar` — the wider scope would let it delete a
  // calendar, which nothing here has any business doing.
  'https://www.googleapis.com/auth/calendar.events',
  // Needed to create the dedicated "Kayzen Planner" calendar once, at connect.
  'https://www.googleapis.com/auth/calendar.app.created',
] as const;

const AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

/** The redirect Google sends the browser back to. Must match the console. */
export function redirectUri(): string {
  const base = (clientEnv.appUrl ?? '').replace(/\/$/, '');
  return `${base}/api/v1/integrations/google/callback`;
}

export function requireGoogleConfig(): ReturnType<typeof googleOAuthConfig> & object {
  const config = googleOAuthConfig();
  if (!config) throw ApiError.unavailable('اتصال گوگل روی این نسخه پیکربندی نشده است.');

  return config;
}

export function authorizeUrl(options: { state: string; codeChallenge: string }): string {
  const config = requireGoogleConfig();

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    // Without both of these there is no refresh token, and the link dies an
    // hour later with no way back but a re-consent the user did not expect.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: options.state,
    code_challenge: options.codeChallenge,
    code_challenge_method: 'S256',
  });

  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

/**
 * Google's token response.
 *
 * Parsed rather than cast: this is a payload from another party crossing into
 * our data model, and a silently-absent `access_token` would otherwise be
 * stored as `undefined` and fail hours later somewhere unrelated.
 */
const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.coerce.number().int().positive().default(3600),
  // Absent on a refresh — Google only re-issues one when it rotates.
  refresh_token: z.string().min(1).optional(),
  scope: z.string().default(''),
  id_token: z.string().optional(),
  token_type: z.string().optional(),
});

export type GoogleTokens = z.infer<typeof tokenResponseSchema>;

async function postToken(body: URLSearchParams): Promise<GoogleTokens> {
  let response: Response;

  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    logger.warn({ err: error }, 'google token endpoint unreachable');
    throw ApiError.unavailable('ارتباط با گوگل برقرار نشد؛ کمی بعد دوباره امتحان کن.');
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    // The body carries `error` / `error_description`, which are the only useful
    // diagnostics Google gives — logged, never shown, because they are English
    // and occasionally quote the client id.
    logger.warn({ status: response.status, payload }, 'google refused a token request');
    throw ApiError.unavailable('گوگل درخواست را نپذیرفت؛ دوباره وصل شو.');
  }

  const parsed = tokenResponseSchema.safeParse(payload);
  if (!parsed.success) {
    logger.error({ issues: parsed.error.issues }, 'google token response had an unexpected shape');
    throw ApiError.unavailable('پاسخ گوگل قابل‌خواندن نبود.');
  }

  return parsed.data;
}

export async function exchangeCode(options: {
  code: string;
  codeVerifier: string;
}): Promise<GoogleTokens> {
  const config = requireGoogleConfig();

  return postToken(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: options.code,
      code_verifier: options.codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri(),
    }),
  );
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const config = requireGoogleConfig();

  return postToken(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  );
}

/**
 * Asks Google to forget the grant.
 *
 * Best-effort on purpose: the local row is deleted either way. A revocation
 * that fails leaves a token Google would still honour, but keeping the row
 * because the remote call failed would leave the person unable to disconnect
 * at all — which is worse, and is the state they were trying to leave.
 */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });

    return response.ok;
  } catch (error) {
    logger.warn({ err: error }, 'google revocation failed; dropping the link anyway');
    return false;
  }
}

/** The `email` and `sub` claims out of an ID token, unverified-but-safe. */
export function readIdTokenClaims(idToken: string): { sub: string; email: string } | null {
  // The token came straight from Google's token endpoint over TLS in response
  // to our own authenticated request, so its signature adds nothing here — the
  // channel already authenticated it. It is *not* safe to do this to a token
  // that arrived from a client, and this function is never called with one.
  const payload = idToken.split('.')[1];
  if (!payload) return null;

  try {
    const json: unknown = JSON.parse(
      Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    );

    const claims = z.object({ sub: z.string().min(1), email: z.string().email() }).safeParse(json);

    return claims.success ? claims.data : null;
  } catch {
    return null;
  }
}
