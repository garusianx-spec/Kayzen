import type { GoogleAccount } from '@prisma/client';

import type { ScopedPrisma } from '../db/rls';
import { logger } from '../logger';
import { refreshAccessToken, requireGoogleConfig, type GoogleTokens } from './oauth';
import { openSecret, sealSecret } from './secret-box';

/**
 * Access tokens, kept fresh without anybody noticing.
 *
 * The promise this module makes to the rest of the app is one function:
 * {@link accessTokenFor} always returns a token that works, or throws
 * {@link GoogleReauthRequired} when only the person can fix it. Nothing above
 * this line ever sees an expiry, a refresh, or a 401.
 */

/** The grant is gone: revoked, expired, or sealed with a key we no longer have. */
export class GoogleReauthRequired extends Error {
  constructor(readonly reason: string) {
    super(`google re-authorisation required: ${reason}`);
    this.name = 'GoogleReauthRequired';
  }
}

/**
 * Refresh this far before the token actually dies.
 *
 * A token that expires mid-request is a request that fails, and the whole
 * point of this module is that the caller never sees one. Sixty seconds is
 * comfortably longer than any single Calendar call.
 */
const REFRESH_SKEW_SECONDS = 60;

export interface SealedTokens {
  refreshToken: string;
  accessToken: string | null;
  accessTokenExpiresAt: Date | null;
}

/** Seals whatever Google just handed us, ready for the column. */
export async function sealTokens(
  tokens: GoogleTokens,
  previousRefreshToken?: string,
): Promise<SealedTokens> {
  const { encryptionKey } = requireGoogleConfig();

  // A refresh response usually omits `refresh_token`: Google only re-issues
  // one when it rotates. Dropping the old one on every refresh is the classic
  // way to un-link every account an hour after a deploy.
  const refreshToken = tokens.refresh_token ?? previousRefreshToken;
  if (!refreshToken) {
    throw new GoogleReauthRequired('google returned no refresh token and none was stored');
  }

  return {
    refreshToken: await sealSecret(refreshToken, encryptionKey),
    accessToken: await sealSecret(tokens.access_token, encryptionKey),
    accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
  };
}

function stillFresh(account: Pick<GoogleAccount, 'accessTokenExpiresAt'>, now: Date): boolean {
  if (!account.accessTokenExpiresAt) return false;
  return account.accessTokenExpiresAt.getTime() - now.getTime() > REFRESH_SKEW_SECONDS * 1000;
}

/**
 * A usable access token for this account, refreshing silently if needed.
 *
 * The refreshed pair is written back before it is returned, so the next request
 * — in this process or another one — reuses it instead of spending a second
 * refresh. Google rate-limits refreshes per account, and a deployment that
 * refreshes on every call finds that out under load rather than in testing.
 */
export async function accessTokenFor(
  db: ScopedPrisma,
  account: GoogleAccount,
  now: Date = new Date(),
): Promise<string> {
  const { encryptionKey } = requireGoogleConfig();

  if (account.accessToken && stillFresh(account, now)) {
    const opened = await openSecret(account.accessToken, encryptionKey);
    if (opened) return opened;

    // A stored token that will not open means the key changed under us. The
    // refresh token below is almost certainly in the same state, but it costs
    // one attempt to find out and the alternative is silent failure.
    logger.warn({ userId: account.userId }, 'stored google access token failed to open');
  }

  const refreshToken = await openSecret(account.refreshToken, encryptionKey);
  if (!refreshToken) {
    throw new GoogleReauthRequired('stored refresh token could not be opened');
  }

  const tokens = await refreshAccessToken(refreshToken);
  const sealed = await sealTokens(tokens, refreshToken);

  await db.googleAccount.update({
    where: { id: account.id },
    data: {
      refreshToken: sealed.refreshToken,
      accessToken: sealed.accessToken,
      accessTokenExpiresAt: sealed.accessTokenExpiresAt,
      // Whatever went wrong last time, a successful refresh is evidence it is
      // over; leaving a stale error on the settings card is its own bug.
      lastSyncError: null,
    },
  });

  return tokens.access_token;
}

/** Opens the refresh token for revocation on disconnect. Null if unopenable. */
export async function revocableToken(account: GoogleAccount): Promise<string | null> {
  const config = requireGoogleConfig();
  return openSecret(account.refreshToken, config.encryptionKey);
}
