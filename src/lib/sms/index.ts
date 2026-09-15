import { clientEnv, serverEnv, type SmsProviderId } from '../env';
import { logger } from '../logger';
import { maskPhone } from '../auth/phone';
import { consoleSmsProvider } from './providers/console';
import { farazSmsProvider } from './providers/farazsms';
import { kavenegarSmsProvider } from './providers/kavenegar';
import { twilioSmsProvider } from './providers/twilio';
import { renderOtpSms } from './template';
import type { OtpTemplateId, SmsProvider, SmsSendResult } from './types';

/**
 * Gateway selection.
 *
 * One provider is active per deployment, chosen by `SMS_PROVIDER`. Adding a
 * gateway means writing one adapter and adding it to this record — nothing in
 * the auth routes changes.
 */
const PROVIDERS: Record<SmsProviderId, SmsProvider> = {
  console: consoleSmsProvider,
  kavenegar: kavenegarSmsProvider,
  farazsms: farazSmsProvider,
  twilio: twilioSmsProvider,
};

export function smsProvider(): SmsProvider {
  return PROVIDERS[serverEnv().SMS_PROVIDER];
}

/**
 * Renders and dispatches one verification code.
 *
 * The plaintext code is passed in, used, and dropped: it is never returned to
 * the caller, never logged, and never written to the database — only its HMAC
 * digest is persisted (see `src/lib/auth/otp.ts`).
 */
export async function sendOtpSms(options: {
  to: string;
  code: string;
  template: OtpTemplateId;
  ttlSeconds: number;
}): Promise<SmsSendResult> {
  const provider = smsProvider();
  const text = renderOtpSms({
    template: options.template,
    code: options.code,
    ttlSeconds: options.ttlSeconds,
    appUrl: clientEnv.appUrl,
  });

  const result = await provider.send({
    to: options.to,
    code: options.code,
    template: options.template,
    text,
    ttlSeconds: options.ttlSeconds,
  });

  logger.info(
    {
      provider: result.providerId,
      messageId: result.messageId,
      to: maskPhone(options.to),
      template: options.template,
    },
    'otp sms accepted by gateway',
  );

  return result;
}

export { renderOtpSms, webOtpDomain } from './template';
export { SmsDeliveryError } from './types';
export type { OtpSmsMessage, OtpTemplateId, SmsProvider, SmsSendResult } from './types';
