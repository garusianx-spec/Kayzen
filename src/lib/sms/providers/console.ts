import { maskPhone } from '../../auth/phone';
import { fixedDevOtpCode } from '../../auth/otp';
import { serverEnv } from '../../env';
import { logger } from '../../logger';
import type { OtpSmsMessage, SmsProvider, SmsSendResult } from '../types';

/**
 * Development sink.
 *
 * Prints the rendered message — code included — to the server console and sends
 * nothing. `serverEnv()` refuses to start a production deployment configured
 * this way, because a log-readable OTP is not an OTP.
 *
 * The banner goes through `console.warn` rather than the structured logger on
 * purpose. This is the one line a developer is looking for in a wall of
 * `prisma:query` output, and it is for a human reading a terminal, not for a log
 * aggregator; the structured record next to it is the one a machine reads.
 */
export const consoleSmsProvider: SmsProvider = {
  id: 'console',

  async send(message: OtpSmsMessage): Promise<SmsSendResult> {
    const pinned = fixedDevOtpCode(serverEnv()) !== null;

    logger.warn(
      { to: maskPhone(message.to), template: message.template, pinned },
      'console SMS provider: nothing was delivered',
    );

    const rule = '─'.repeat(52);
    console.warn(
      [
        '',
        rule,
        `  کایزن · کد ورود  ${message.code}${pinned ? '   (AUTH_DEV_OTP_CODE)' : ''}`,
        `  ${message.to}  ·  ${message.ttlSeconds}s`,
        rule,
        message.text,
        rule,
        '',
      ].join('\n'),
    );

    return { providerId: 'console', acceptedAt: new Date() };
  },
};
