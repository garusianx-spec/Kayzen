import { issueOtpChallenge, secondsUntilResendAllowed } from '@/lib/auth/otp';
import { maskPhone } from '@/lib/auth/phone';
import { withRoute } from '@/lib/api/handler';
import { prisma } from '@/lib/db/prisma';
import { clientEnv, serverEnv } from '@/lib/env';
import { ApiError } from '@/lib/errors';
import { checkRateLimit, clientIp } from '@/lib/ratelimit';
import { sendOtpSms, SmsDeliveryError, webOtpDomain } from '@/lib/sms';
import { sendOtpSchema, type SendOtpInput } from '@/lib/validation/schemas';

/**
 * `POST /api/v1/auth/otp/send` — start a sign-in challenge.
 *
 * The response is identical whether or not the number has an account: a
 * different message, status or timing here would turn the endpoint into a free
 * "is this person a Kayzen user?" oracle.
 *
 * Four independent brakes sit in front of the SMS gateway, checked cheapest and
 * most specific first so a throttled phone never burns the IP's budget:
 *
 *   1. one code per phone per `AUTH_OTP_RESEND_SECONDS` (default 120s),
 *   2. `AUTH_OTP_DAILY_SEND_LIMIT` codes per phone per rolling 24h,
 *   3. one code per IP per `AUTH_OTP_RESEND_SECONDS`,
 *   4. a database-side cooldown check, which still holds when Redis is down —
 *      the Redis limiter fails open so an outage cannot take sign-in down, and
 *      this is what stops that from becoming an SMS flood.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SendOtpResponse {
  challengeId: string;
  expiresAt: string;
  resendAfterSeconds: number;
  codeLength: number;
  phoneMasked: string;
  /** Domain the WebOTP binding line carries; the client asserts it matches. */
  otpDomain: string;
}

export const POST = withRoute<SendOtpInput, undefined, SendOtpResponse>({
  bodySchema: sendOtpSchema,
  handler: async ({ request, body }) => {
    const env = serverEnv();
    const { phone } = body;
    const ip = clientIp(request);

    const phoneWindow = await checkRateLimit('otp-send-phone', `phone:${phone}`);
    if (!phoneWindow.success) {
      throw ApiError.rateLimited(
        phoneWindow.retryAfterSeconds,
        'برای این شماره به‌تازگی کد فرستاده‌ایم؛ کمی صبر کنید.',
      );
    }

    const dailyWindow = await checkRateLimit('otp-send-daily', `phone:${phone}`);
    if (!dailyWindow.success) {
      throw ApiError.rateLimited(
        dailyWindow.retryAfterSeconds,
        'سقف ارسال پیامک برای امروز پر شده است.',
      );
    }

    const ipWindow = await checkRateLimit('otp-send-ip', `ip:${ip ?? 'unknown'}`);
    if (!ipWindow.success) {
      throw ApiError.rateLimited(
        ipWindow.retryAfterSeconds,
        'تعداد درخواست‌ها از این دستگاه زیاد است؛ کمی بعد تلاش کنید.',
      );
    }

    const cooldown = await secondsUntilResendAllowed(phone);
    if (cooldown > 0) {
      throw ApiError.rateLimited(cooldown, 'برای این شماره به‌تازگی کد فرستاده‌ایم؛ کمی صبر کنید.');
    }

    const challenge = await issueOtpChallenge({
      phone,
      ip,
      userAgent: request.headers.get('user-agent'),
    });

    try {
      await sendOtpSms({
        to: phone,
        code: challenge.code,
        template: 'sign-in',
        ttlSeconds: env.AUTH_OTP_TTL_SECONDS,
      });
    } catch (error) {
      // Nothing was delivered, so the challenge is dead weight. Consuming it
      // frees the number's live slot and lets the user retry at once instead of
      // waiting out a cooldown for a code they never received.
      await prisma.otpSession.updateMany({
        where: { challengeId: challenge.challengeId, consumedAt: null },
        data: { consumedAt: new Date() },
      });

      if (error instanceof SmsDeliveryError && !error.retryable) {
        throw ApiError.unprocessable('ارسال پیامک به این شماره ممکن نیست.', {
          phone: ['ارسال پیامک به این شماره ممکن نیست.'],
        });
      }

      throw ApiError.unavailable('ارسال پیامک ناموفق بود؛ چند لحظه بعد دوباره تلاش کنید.', 30);
    }

    return {
      challengeId: challenge.challengeId,
      expiresAt: challenge.expiresAt.toISOString(),
      resendAfterSeconds: challenge.resendAfterSeconds,
      codeLength: env.AUTH_OTP_LENGTH,
      phoneMasked: maskPhone(phone),
      otpDomain: webOtpDomain(clientEnv.appUrl),
    };
  },
});
