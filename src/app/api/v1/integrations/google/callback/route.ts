import { NextResponse } from 'next/server';
import { z } from 'zod';

import { withRoute } from '@/lib/api/handler';
import { withUserContext } from '@/lib/db/rls';
import { clientEnv } from '@/lib/env';
import { ensureCalendar } from '@/lib/google/drain';
import { LINK_STATE_COOKIE, readLinkState } from '@/lib/google/link-state';
import { exchangeCode, readIdTokenClaims } from '@/lib/google/oauth';
import { sealTokens } from '@/lib/google/tokens';
import { logger } from '@/lib/logger';

/**
 * `GET /api/v1/integrations/google/callback` — Google sends the browser here.
 *
 * Unauthenticated by the ordinary route, on purpose: the session cookie is
 * `SameSite=Strict` and is therefore *not* sent on this navigation. The signed
 * link-state cookie authenticates it instead, and comparing its nonce with the
 * `state` Google echoed back is what stops somebody pasting their own code into
 * another person's browser to attach their calendar to that account.
 *
 * Every exit is a redirect back to `/settings` with a flag, because the person
 * is looking at a browser tab, not at JSON.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().max(100).optional(),
});

type CallbackQuery = z.infer<typeof querySchema>;

function settingsRedirect(status: string): NextResponse {
  const url = new URL('/settings', clientEnv.appUrl);
  url.searchParams.set('google', status);

  const response = NextResponse.redirect(url);
  // The flow is over either way; leaving a verifier in the browser would be
  // leaving a credential behind for no reason.
  response.cookies.delete(LINK_STATE_COOKIE);

  return response;
}

export const GET = withRoute<undefined, CallbackQuery, never>({
  querySchema,
  rateLimit: 'mutation',
  handler: async ({ request, query }) => {
    // The user pressed "cancel" on the consent screen. Not an error worth a
    // stack trace, and the settings card simply stays disconnected.
    if (query.error || !query.code || !query.state) return settingsRedirect('cancelled');

    const link = await readLinkState(request.cookies.get(LINK_STATE_COOKIE)?.value, query.state);

    if (!link) {
      logger.warn('google callback presented an invalid or expired link state');
      return settingsRedirect('expired');
    }

    const tokens = await exchangeCode({ code: query.code, codeVerifier: link.codeVerifier });
    const claims = tokens.id_token ? readIdTokenClaims(tokens.id_token) : null;

    if (!claims) return settingsRedirect('failed');

    // Google can grant fewer scopes than were asked for. Without the events
    // scope the integration would link successfully and then fail on every
    // write, which is the worst of both outcomes.
    const granted = new Set(tokens.scope.split(' '));
    if (!granted.has('https://www.googleapis.com/auth/calendar.events')) {
      logger.warn({ scope: tokens.scope }, 'google withheld the calendar.events scope');
      return settingsRedirect('scope');
    }

    const sealed = await sealTokens(tokens);

    await withUserContext(link.userId, async (db) => {
      const account = await db.googleAccount.upsert({
        where: { userId: link.userId },
        update: {
          googleSub: claims.sub,
          email: claims.email,
          scope: tokens.scope,
          lastSyncError: null,
          ...sealed,
        },
        create: {
          userId: link.userId,
          googleSub: claims.sub,
          email: claims.email,
          scope: tokens.scope,
          ...sealed,
        },
      });

      const user = await db.user.findUniqueOrThrow({ where: { id: link.userId } });

      // Provisioned now rather than lazily on the first sync, so the person
      // sees "Kayzen Planner" in Google the moment they connect — and so a
      // failure here is visible while they are still looking at the screen.
      await ensureCalendar(db, account, tokens.access_token, user.timezone);
    });

    logger.info({ userId: link.userId }, 'linked a google account');
    return settingsRedirect('connected');
  },
});
