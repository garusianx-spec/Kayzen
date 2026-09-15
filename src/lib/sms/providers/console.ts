import { maskPhone } from '../../auth/phone';
import { logger } from '../../logger';
import type { OtpSmsMessage, SmsProvider, SmsSendResult } from '../types';

/**
 * Development sink.
 *
 * Prints the rendered message — code included — to the server log and sends
 * nothing. `serverEnv()` refuses to start a production deployment configured
 * this way, because a log-readable OTP is not an OTP.
 */
export const consoleSmsProvider: SmsProvider = {
  id: 'console',

  async send(message: OtpSmsMessage): Promise<SmsSendResult> {
    logger.warn(
      { to: maskPhone(message.to), template: message.template },
      'console SMS provider: nothing was delivered',
    );

    console.warn(`\n[kayzen:sms] → ${message.to}\n${message.text}\n`);

    return { providerId: 'console', acceptedAt: new Date() };
  },
};
