import type { User } from '@prisma/client';

import { withRoute } from '@/lib/api/handler';
import { toSessionUserDto } from '@/lib/api/dto';
import { OTP_FAILURE_MESSAGES, verifyOtpChallenge } from '@/lib/auth/otp';
import { maskPhone } from '@/lib/auth/phone';
import { startSession } from '@/lib/auth/tokens';
import { prisma } from '@/lib/db/prisma';
import { withUserContext } from '@/lib/db/rls';
import { DEFAULT_TIMEZONE } from '@/lib/date/jalali';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/ratelimit';
import { verifyOtpSchema, type VerifyOtpInput } from '@/lib/validation/schemas';
import type { SessionUserDto } from '@/types/domain';

/**
 * `POST /api/v1/auth/otp/verify` — exchange a code for a session.
 *
 * A correct code does three things, in this order and no other:
 *
 *   1. consumes the challenge atomically (so a replay of the same code loses),
 *   2. finds or creates the account for that number,
 *   3. mints the access/refresh pair and writes both HttpOnly cookies.
 *
 * Account creation is the one write in the system that runs without a tenant
 * context — there is no tenant until this request succeeds. Everything after it,
 * including the `last_seen_at` touch, goes back through `withUserContext()`.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface VerifyOtpResponse {
  user: SessionUserDto;
  isNewUser: boolean;
  accessTokenExpiresAt: string;
}

export const POST = withRoute<VerifyOtpInput, undefined, VerifyOtpResponse>({
  bodySchema: verifyOtpSchema,
  handler: async ({ request, body }) => {
    const { phone, code, challengeId } = body;
    const timezone = body.timezone ?? DEFAULT_TIMEZONE;

    // Keyed by phone, not by challenge: cycling challenges must not hand an
    // attacker a fresh guessing budget.
    const attemptWindow = await checkRateLimit('otp-verify', `phone:${phone}`);
    if (!attemptWindow.success) {
      throw ApiError.rateLimited(
        attemptWindow.retryAfterSeconds,
        'تلاش‌های ناموفق زیاد بوده است؛ کمی بعد دوباره امتحان کنید.',
      );
    }

    const verification = await verifyOtpChallenge({ challengeId, phone, code });

    if (!verification.ok) {
      logger.warn(
        { phone: maskPhone(phone), reason: verification.reason },
        'otp verification rejected',
      );

      if (verification.reason === 'locked') {
        throw ApiError.rateLimited(
          verification.retryAfterSeconds,
          OTP_FAILURE_MESSAGES[verification.reason],
        );
      }

      throw new ApiError('UNAUTHORIZED', OTP_FAILURE_MESSAGES[verification.reason], {
        details: {
          code: [OTP_FAILURE_MESSAGES[verification.reason]],
          // The client renders "۲ تلاش باقی مانده" from this.
          attemptsRemaining: [String(verification.attemptsRemaining)],
        },
      });
    }

    const userAgent = request.headers.get('user-agent');
    const existing = await prisma.user.findUnique({ where: { phone } });
    const isNewUser = existing === null;
    const now = new Date();

    let user: User;

    if (existing) {
      user = await withUserContext(existing.id, (db) =>
        db.user.update({
          where: { id: existing.id },
          data: {
            lastSeenAt: now,
            phoneVerifiedAt: existing.phoneVerifiedAt ?? now,
            // A user who flies to another timezone should see their own days,
            // not the ones the account was created in.
            ...(body.timezone ? { timezone: body.timezone } : {}),
            ...(body.name ? { name: body.name } : {}),
          },
        }),
      );
    } else {
      user = await prisma.user.create({
        data: {
          phone,
          timezone,
          name: body.name ?? null,
          phoneVerifiedAt: now,
          lastSeenAt: now,
          enrolledAt: now,
        },
      });

      logger.info({ userId: user.id, phone: maskPhone(phone) }, 'account created via otp sign-in');
    }

    const session = await startSession(user, { userAgent });

    return {
      user: toSessionUserDto(user),
      isNewUser,
      accessTokenExpiresAt: session.accessTokenExpiresAt.toISOString(),
    };
  },
});
