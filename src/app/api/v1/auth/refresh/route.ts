import { toSessionUserDto } from '@/lib/api/dto';
import { withRoute } from '@/lib/api/handler';
import { REFRESH_TOKEN_COOKIE } from '@/lib/auth/session';
import { rotateSession } from '@/lib/auth/tokens';
import { withUserContext } from '@/lib/db/rls';
import { ApiError } from '@/lib/errors';
import { clearSessionCookies } from '@/lib/auth/session';
import type { SessionUserDto } from '@/types/domain';

/**
 * `POST /api/v1/auth/refresh` — rotate the session.
 *
 * Called by the API client when a request comes back 401, and once on app
 * start-up so a cold launch of the installed app does not begin with a failed
 * request. Rotation is single-use: presenting a token twice is treated as theft
 * and ends every session the account has (see `rotateSession`).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RefreshResponse {
  user: SessionUserDto;
  accessTokenExpiresAt: string;
}

export const POST = withRoute<undefined, undefined, RefreshResponse>({
  rateLimit: 'auth',
  handler: async ({ request }) => {
    const presented = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
    const result = await rotateSession(presented, {
      userAgent: request.headers.get('user-agent'),
    });

    if (!result.ok) {
      // Whatever the reason, the browser is holding something unusable.
      await clearSessionCookies();
      throw ApiError.unauthorized(
        result.reason === 'reused'
          ? 'نشست شما به دلایل امنیتی بسته شد؛ دوباره وارد شوید.'
          : 'نشست شما منقضی شده است؛ دوباره وارد شوید.',
      );
    }

    const user = await withUserContext(result.session.user.id, (db) =>
      db.user.findUniqueOrThrow({ where: { id: result.session.user.id } }),
    );

    return {
      user: toSessionUserDto(user),
      accessTokenExpiresAt: result.session.accessTokenExpiresAt.toISOString(),
    };
  },
});
