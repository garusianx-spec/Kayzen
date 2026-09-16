import { withAuthedRoute } from '@/lib/api/handler';
import { toSessionUserDto } from '@/lib/api/dto';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { maskPhone } from '@/lib/auth/phone';
import { revokeAllSessions, startSession } from '@/lib/auth/tokens';
import { ApiError } from '@/lib/errors';
import { setPasswordSchema, type SetPasswordInput } from '@/lib/validation/schemas';
import type { SessionUserDto } from '@/types/domain';

/**
 * `POST /api/v1/auth/password` — set or change this account's password.
 *
 * Reached from settings, and the intended route for an account created over
 * SMS: sign in with a code once, set a password, and the SMS gateway stops
 * being a single point of failure for that user.
 *
 * Setting the *first* password needs only a session, because the code that
 * produced that session already proved control of the number. Changing an
 * existing one needs the current password as well — a session is a bearer
 * token, and a borrowed phone should not be enough to lock its owner out.
 *
 * Every other session is revoked on success, and this one is reissued. The
 * usual reason to change a password is that someone else may have it.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SetPasswordResponse {
  user: SessionUserDto;
  /**
   * Refresh tokens invalidated by the change. Counts this device's previous
   * one, which is replaced in the same request, so the caller stays signed in.
   */
  revokedSessions: number;
  accessTokenExpiresAt: string;
}

export const POST = withAuthedRoute<SetPasswordInput, undefined, SetPasswordResponse>({
  bodySchema: setPasswordSchema,
  rateLimit: 'auth',
  handler: async ({ request, body, user, db, log }) => {
    const current = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    if (current.passwordHash) {
      if (!body.currentPassword) {
        throw ApiError.validation(
          { currentPassword: ['برای تغییر رمز، رمز فعلی را وارد کنید.'] },
          'رمز فعلی لازم است.',
        );
      }

      const matches = await verifyPassword(body.currentPassword, current.passwordHash);

      if (!matches) {
        log.warn({ userId: user.id }, 'password change rejected: current password is wrong');
        throw ApiError.validation(
          { currentPassword: ['رمز فعلی درست نیست.'] },
          'رمز فعلی درست نیست.',
        );
      }
    }

    const now = new Date();
    const updated = await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(body.password), passwordUpdatedAt: now },
    });

    // Everything is revoked — including this device's own refresh token — and
    // then a fresh pair is written, so the caller stays signed in here and
    // nowhere else.
    const revokedSessions = await revokeAllSessions(user.id);
    const session = await startSession(updated, {
      userAgent: request.headers.get('user-agent'),
    });

    log.info(
      {
        userId: user.id,
        phone: maskPhone(updated.phone),
        firstTime: current.passwordHash === null,
        revokedSessions,
      },
      'password set',
    );

    return {
      user: toSessionUserDto(updated),
      revokedSessions,
      accessTokenExpiresAt: session.accessTokenExpiresAt.toISOString(),
    };
  },
});
