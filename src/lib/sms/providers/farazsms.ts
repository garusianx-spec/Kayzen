import { toLocalIranianPhone } from '../../auth/phone';
import { serverEnv } from '../../env';
import {
  SMS_REQUEST_TIMEOUT_MS,
  SmsDeliveryError,
  type OtpSmsMessage,
  type SmsProvider,
  type SmsSendResult,
} from '../types';

/**
 * FarazSMS / IPPanel — pattern API.
 *
 * Like Kavenegar, delivery goes through a pre-registered pattern; the request
 * carries only the variables. The pattern must declare a `code` variable and
 * end with the WebOTP binding line:
 *
 *     کایزن
 *     کد ورود شما: %code%
 *     @kayzen.app #%code%
 */

interface IppanelResponse {
  status?: string;
  code?: number;
  message?: string;
  data?: { message_id?: number | string };
  error_message?: string;
}

export const farazSmsProvider: SmsProvider = {
  id: 'farazsms',

  async send(message: OtpSmsMessage): Promise<SmsSendResult> {
    const env = serverEnv();

    if (!env.FARAZSMS_API_KEY || !env.FARAZSMS_PATTERN_CODE || !env.FARAZSMS_ORIGINATOR) {
      throw new SmsDeliveryError('farazsms', 'FarazSMS credentials are incomplete', {
        retryable: false,
      });
    }

    let response: Response;
    try {
      response = await fetch('https://api2.ippanel.com/api/v1/sms/pattern/normal/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `AccessKey ${env.FARAZSMS_API_KEY}`,
        },
        body: JSON.stringify({
          code: env.FARAZSMS_PATTERN_CODE,
          sender: env.FARAZSMS_ORIGINATOR,
          recipient: toLocalIranianPhone(message.to),
          variable: { code: message.code },
        }),
        signal: AbortSignal.timeout(SMS_REQUEST_TIMEOUT_MS),
        cache: 'no-store',
      });
    } catch (error) {
      throw new SmsDeliveryError('farazsms', 'FarazSMS did not answer in time', {
        retryable: true,
        cause: error,
      });
    }

    const payload = (await response.json().catch(() => null)) as IppanelResponse | null;

    if (!response.ok || (payload?.code !== undefined && payload.code >= 400)) {
      const code = payload?.code ?? response.status;
      throw new SmsDeliveryError(
        'farazsms',
        payload?.error_message ?? payload?.message ?? `FarazSMS rejected the request (${code})`,
        // 4xx is a bad recipient or an unapproved pattern; neither improves on retry.
        { retryable: code >= 500, providerCode: code },
      );
    }

    return {
      providerId: 'farazsms',
      messageId: payload?.data?.message_id?.toString(),
      acceptedAt: new Date(),
    };
  },
};
