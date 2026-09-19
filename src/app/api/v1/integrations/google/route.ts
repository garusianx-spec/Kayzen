import { toGoogleLinkDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { googleOAuthConfig } from '@/lib/env';
import { revokeToken } from '@/lib/google/oauth';
import { forgetCalendarMirror, queueHealth } from '@/lib/google/sync-queue';
import { revocableToken } from '@/lib/google/tokens';
import { logger } from '@/lib/logger';
import type { GoogleLinkDto } from '@/types/domain';

/**
 * `GET|DELETE /api/v1/integrations/google` — the settings card's endpoint.
 *
 * The DTO carries the linked address, the queue's health and the last clean
 * sync. It never carries a token, a scope string or an event id: the card has
 * no use for any of them, and a response shape is the last place to be
 * generous.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuthedRoute<undefined, undefined, { link: GoogleLinkDto }>({
  rateLimit: 'read',
  handler: async ({ user, db }) => {
    const configured = googleOAuthConfig() !== null;
    const account = await db.googleAccount.findUnique({ where: { userId: user.id } });

    if (!account) return { link: { configured, connected: false } };

    return {
      link: toGoogleLinkDto(account, await queueHealth(db, user.id), configured),
    };
  },
});

export const DELETE = withAuthedRoute<undefined, undefined, { link: GoogleLinkDto }>({
  rateLimit: 'mutation',
  handler: async ({ user, db }) => {
    const account = await db.googleAccount.findUnique({ where: { userId: user.id } });

    if (account) {
      // Asked of Google first, but the row goes either way: a revocation that
      // fails must not leave somebody unable to disconnect, which is the state
      // they were trying to leave.
      const token = await revocableToken(account);
      if (token) await revokeToken(token);

      await db.googleAccount.deleteMany({ where: { id: account.id } });
      await forgetCalendarMirror(db, user.id);

      logger.info({ userId: user.id }, 'unlinked a google account');
    }

    return { link: { configured: googleOAuthConfig() !== null, connected: false } };
  },
});
