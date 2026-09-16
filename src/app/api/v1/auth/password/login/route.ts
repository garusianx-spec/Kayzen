import type { User } from '@prisma/client';

import { withRoute } from '@/lib/api/handler';
import { toSessionUserDto } from '@/lib/api/dto';
import { hashPassword, needsRehash, verifyPassword } from '@/lib/auth/password';
import { maskPhone } from '@/lib/auth/phone';
import { startSession } from '@/lib/auth/tokens';
import { prisma } from '@/lib/db/prisma';
import { withUserContext } from '@/lib/db/rls';
import { DEFAULT_TIMEZONE } from '@/lib/date/jalali';
import { ApiError } from '@/lib/errors';
import { checkRateLimit, clientIp } from '@/lib/ratelimit';
import { passwordLoginSchema, type PasswordLoginInput } from '@/lib/validation/schemas';
import type { SessionUserDto } from '@/types/domain';

/**
 * `POST /api/v1/auth/password/login` — sign in, or register, with a password.
 *
 * The SMS code remains the primary way in. This exists because delivery is not
 * something the application controls: a gateway outage, an exhausted credit
 * balance, or a carrier filtering pattern messages all reach the user as "the
 * code never arrived". A password is the door that stays open.
 *
 * Three cases, and the response must not let a stranger tell them apart:
 *
 *   1. **No account for this number.** One is created, with the password, and
 *      `phone_verified_at` left null — nobody has proved they hold the SIM.
 *      Registering here is what makes the route useful when SMS is down; the
 *      unverified marker is what stops it from being a way to squat on someone
 *      else's number and claim it later.
 *   2. **Account with a password.** Verified in constant time.
 *   3. **Account without one** (signed up over SMS and never set a password).
 *      Rejected with the *same* message and the same timing as a wrong
 *      password — `verifyPassword` performs a full derivation against a decoy —
 *      so the endpoint cannot be used to ask which numbers have passwords. The
 *      field-level detail says the account may need the SMS route instead,
 *      which is the one hint a real user needs and an enumerator cannot act on:
 *      it is attached to every failure, not just this one.
 *
 * Case 1 is deliberately not available once the number exists. Registration
 * creating an account and sign-in proving you own one are different operations,
 * and collapsing them is how "set a password on someone else's account" gets
 * built by accident.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PasswordLoginResponse {
  user: SessionUserDto;
  isNewUser: boolean;
  accessTokenExpiresAt: string;
}

/** One message for every failure. Which of the three it was is not the caller's business. */
const REJECTION = 'شماره یا رمز عبور درست نیست.';

export const POST = withRoute<PasswordLoginInput, undefined, PasswordLoginResponse>({
  bodySchema: passwordLoginSchema,
  handler: async ({ request, body, log }) => {
    const { phone, password } = body;
    const timezone = body.timezone ?? DEFAULT_TIMEZONE;
    const ip = clientIp(request);

    // Phone first, then IP: a throttled number must not spend the address's
    // budget, the same ordering the OTP send route uses.
    const phoneWindow = await checkRateLimit('password-login', `phone:${phone}`);
    if (!phoneWindow.success) {
      throw ApiError.rateLimited(
        phoneWindow.retryAfterSeconds,
        'تلاش‌های ناموفق زیاد بوده است؛ کمی بعد دوباره امتحان کنید.',
      );
    }

    const ipWindow = await checkRateLimit('password-login-ip', `ip:${ip ?? 'unknown'}`);
    if (!ipWindow.success) {
      throw ApiError.rateLimited(
        ipWindow.retryAfterSeconds,
        'تعداد تلاش‌ها از این دستگاه زیاد است؛ کمی بعد تلاش کنید.',
      );
    }

    const userAgent = request.headers.get('user-agent');
    const existing = await prisma.user.findUnique({ where: { phone } });
    const now = new Date();

    let user: User;
    let isNewUser = false;

    if (!existing) {
      user = await prisma.user.create({
        data: {
          phone,
          timezone,
          name: body.name ?? null,
          // Not null-by-omission: a password proves nothing about the SIM, and
          // the OTP route promotes this the first time a code is confirmed.
          phoneVerifiedAt: null,
          passwordHash: await hashPassword(password),
          passwordUpdatedAt: now,
          lastSeenAt: now,
          enrolledAt: now,
        },
      });

      isNewUser = true;
      log.info(
        { userId: user.id, phone: maskPhone(phone) },
        'account created via password sign-up',
      );
    } else {
      const matches = await verifyPassword(password, existing.passwordHash);

      if (!matches) {
        log.warn(
          { phone: maskPhone(phone), hasPassword: existing.passwordHash !== null },
          'password sign-in rejected',
        );

        throw new ApiError('UNAUTHORIZED', REJECTION, {
          details: {
            password: [REJECTION],
            // Present on every rejection, so it reveals nothing about this
            // account — but it is the sentence a locked-out real user needs.
            hint: ['اگر رمزی تنظیم نکرده‌اید، با پیامک وارد شوید و از تنظیمات رمز بگذارید.'],
          },
        });
      }

      // Raised work factors apply on the next successful sign-in, which is the
      // only moment the plaintext is available to re-derive from.
      const upgraded =
        existing.passwordHash && needsRehash(existing.passwordHash)
          ? { passwordHash: await hashPassword(password), passwordUpdatedAt: now }
          : {};

      user = await withUserContext(existing.id, (db) =>
        db.user.update({
          where: { id: existing.id },
          data: {
            lastSeenAt: now,
            ...(body.timezone ? { timezone: body.timezone } : {}),
            ...upgraded,
          },
        }),
      );
    }

    const session = await startSession(user, { userAgent });

    return {
      user: toSessionUserDto(user),
      isNewUser,
      accessTokenExpiresAt: session.accessTokenExpiresAt.toISOString(),
    };
  },
});
