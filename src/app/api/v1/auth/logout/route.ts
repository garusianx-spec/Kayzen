import { withRoute } from '@/lib/api/handler';
import { REFRESH_TOKEN_COOKIE } from '@/lib/auth/session';
import { endSession } from '@/lib/auth/tokens';

/**
 * `POST /api/v1/auth/logout` — sign out on this device.
 *
 * Revokes the presented refresh token and clears both cookies. Deliberately
 * unauthenticated: an expired access token must not stand between a user and
 * signing out.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withRoute<undefined, undefined, { ok: true }>({
  handler: async ({ request }) => {
    await endSession(request.cookies.get(REFRESH_TOKEN_COOKIE)?.value);
    return { ok: true };
  },
});
