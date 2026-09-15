import { serverEnv } from '../../env';
import {
  SMS_REQUEST_TIMEOUT_MS,
  SmsDeliveryError,
  type OtpSmsMessage,
  type SmsProvider,
  type SmsSendResult,
} from '../types';

/**
 * Twilio — free-text SMS.
 *
 * The international fallback route: no pattern registration, so the body is
 * sent verbatim, WebOTP binding line included. Delivery into Iran is neither
 * fast nor guaranteed, which is why this adapter is a fallback rather than the
 * default.
 */

interface TwilioResponse {
  sid?: string;
  message?: string;
  code?: number;
  status?: string;
}

/** Twilio error codes that will never succeed on retry (bad number, opt-out). */
const PERMANENT_CODES = new Set([21211, 21214, 21408, 21610, 21614]);

export const twilioSmsProvider: SmsProvider = {
  id: 'twilio',

  async send(message: OtpSmsMessage): Promise<SmsSendResult> {
    const env = serverEnv();

    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
      throw new SmsDeliveryError('twilio', 'Twilio credentials are incomplete', {
        retryable: false,
      });
    }

    const body = new URLSearchParams({
      To: message.to,
      From: env.TWILIO_FROM_NUMBER,
      Body: message.text,
    });

    let response: Response;
    try {
      response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
          },
          body,
          signal: AbortSignal.timeout(SMS_REQUEST_TIMEOUT_MS),
          cache: 'no-store',
        },
      );
    } catch (error) {
      throw new SmsDeliveryError('twilio', 'Twilio did not answer in time', {
        retryable: true,
        cause: error,
      });
    }

    const payload = (await response.json().catch(() => null)) as TwilioResponse | null;

    if (!response.ok) {
      const code = payload?.code ?? response.status;
      throw new SmsDeliveryError(
        'twilio',
        payload?.message ?? `Twilio rejected the request (${code})`,
        {
          retryable: !PERMANENT_CODES.has(Number(code)) && response.status >= 500,
          providerCode: code,
        },
      );
    }

    return { providerId: 'twilio', messageId: payload?.sid, acceptedAt: new Date() };
  },
};
