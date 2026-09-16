import {
  clientEnv,
  isProduction,
  missingSmsCredentials,
  serverEnv,
  type SmsProviderId,
} from '../env';
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

/** Warned about once per process, not once per sign-in attempt. */
let warnedAboutFallback = false;

/**
 * The active gateway, or the console sink when the configured one cannot send.
 *
 * Naming a gateway without holding credentials for it is a startup failure in
 * production — `serverEnv()` refuses to parse. Everywhere else it falls back to
 * printing the code, because the alternative is a `SmsDeliveryError` that the
 * route turns into "ارسال پیامک به این شماره ممکن نیست": a message that blames
 * the user's phone number for an empty `.env.local`.
 */
export function smsProvider(): SmsProvider {
  const env = serverEnv();
  const missing = missingSmsCredentials(env);

  if (missing.length === 0) return PROVIDERS[env.SMS_PROVIDER];

  if (!warnedAboutFallback) {
    warnedAboutFallback = true;
    logger.warn(
      { provider: env.SMS_PROVIDER, missing },
      'SMS credentials are missing; falling back to the console provider',
    );
  }

  return consoleSmsProvider;
}

/**
 * Renders and dispatches one verification code.
 *
 * The plaintext code is passed in, used, and dropped: it is never returned to
 * the caller, never logged here, and never written to the database — only its
 * HMAC digest is persisted (see `src/lib/auth/otp.ts`). The one exception is the
 * `console` provider, whose entire job is to print it, and which `serverEnv()`
 * refuses to start in production for exactly that reason.
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

  // The fallback above must never be able to reach a real deployment.
  if (isProduction && provider.id === 'console') {
    throw new Error('the console SMS provider must not be used in production');
  }

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
