import { NextResponse } from 'next/server';

import { withAuthedRoute } from '@/lib/api/handler';
import { clientEnv } from '@/lib/env';
import { LINK_STATE_COOKIE, LINK_STATE_TTL_SECONDS, issueLinkState } from '@/lib/google/link-state';
import { authorizeUrl, requireGoogleConfig } from '@/lib/google/oauth';

/**
 * `GET /api/v1/integrations/google/start` — hand the browser to Google.
 *
 * A GET that redirects rather than a POST that returns a URL, because the
 * browser has to *navigate*: an OAuth consent screen opened with `fetch` is a
 * CORS error, and one opened in a popup is a popup blocker's lunch.
 *
 * The nonce and the PKCE verifier go into a short-lived signed cookie rather
 * than a server-side store. There is nothing here worth a table: the cookie is
 * `HttpOnly`, signed over the user id, and dead in ten minutes.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuthedRoute<undefined, undefined, never>({
  rateLimit: 'mutation',
  handler: async ({ user }) => {
    requireGoogleConfig();

    const { cookie, state, codeChallenge } = await issueLinkState(user.id);
    const response = NextResponse.redirect(authorizeUrl({ state, codeChallenge }));

    response.cookies.set(LINK_STATE_COOKIE, cookie, {
      httpOnly: true,
      // Lax, not Strict: Google's callback is a top-level cross-site
      // navigation, and Strict would withhold exactly the cookie that has to
      // arrive. Lax is the narrowest setting that still sends it.
      sameSite: 'lax',
      secure: clientEnv.appUrl.startsWith('https://'),
      path: '/',
      maxAge: LINK_STATE_TTL_SECONDS,
    });

    return response;
  },
});
