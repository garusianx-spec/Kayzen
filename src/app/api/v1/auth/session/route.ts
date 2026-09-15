import { toSessionUserDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { revokeAllSessions } from '@/lib/auth/tokens';
import { clearSessionCookies } from '@/lib/auth/session';
import type { SessionUserDto } from '@/types/domain';

/**
 * `GET /api/v1/auth/session` — who am I?
 * `DELETE /api/v1/auth/session` — sign out everywhere.
 *
 * The GET is the client's source of truth for the signed-in user: the React
 * Query cache hydrates from it and every screen reads the result rather than
 * decoding the token itself.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuthedRoute<undefined, undefined, { user: SessionUserDto }>({
  handler: async ({ user, db }) => {
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    return { user: toSessionUserDto(row) };
  },
});

export const DELETE = withAuthedRoute<undefined, undefined, { revokedSessions: number }>({
  handler: async ({ user }) => {
    const revokedSessions = await revokeAllSessions(user.id);
    await clearSessionCookies();
    return { revokedSessions };
  },
});
