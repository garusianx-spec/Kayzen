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
 * Kavenegar — verification lookup API.
 *
 * The lookup endpoint sends against a pre-approved template rather than free
 * text, which is what keeps OTP traffic on the high-priority service route in
 * Iran. The template is registered once in the Kavenegar panel and must contain
 * a `%token` placeholder plus the WebOTP binding line:
 *
 *     کایزن
 *     کد ورود شما: %token
 *     @kayzen.app #%token
 *
 * `%token` must not contain spaces, which is why the code is digits only.
 */

interface KavenegarResponse {
  return?: { status?: number; message?: string };
  entries?: Array<{ messageid?: number; status?: number }> | null;
}

/** Statuses that mean "stop retrying": the receptor or the account is the problem. */
const PERMANENT_STATUS = new Set([400, 407, 411, 412, 414, 417, 418, 451]);

export const kavenegarSmsProvider: SmsProvider = {
  id: 'kavenegar',

  async send(message: OtpSmsMessage): Promise<SmsSendResult> {
    const env = serverEnv();
    const apiKey = env.KAVENEGAR_API_KEY;

    if (!apiKey) {
      throw new SmsDeliveryError('kavenegar', 'KAVENEGAR_API_KEY is not configured', {
        retryable: false,
      });
    }

    const url = new URL(`https://api.kavenegar.com/v1/${apiKey}/verify/lookup.json`);
    // Kavenegar rejects E.164 on this endpoint; it wants the local `09…` form.
    url.searchParams.set('receptor', toLocalIranianPhone(message.to));
    url.searchParams.set('token', message.code);
    url.searchParams.set('template', env.KAVENEGAR_TEMPLATE);
    if (env.KAVENEGAR_SENDER) url.searchParams.set('sender', env.KAVENEGAR_SENDER);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(SMS_REQUEST_TIMEOUT_MS),
        cache: 'no-store',
      });
    } catch (error) {
      throw new SmsDeliveryError('kavenegar', 'Kavenegar did not answer in time', {
        retryable: true,
        cause: error,
      });
    }

    const payload = (await response.json().catch(() => null)) as KavenegarResponse | null;
    const status = payload?.return?.status ?? response.status;

    if (!response.ok || status !== 200) {
      throw new SmsDeliveryError(
        'kavenegar',
        payload?.return?.message ?? `Kavenegar rejected the request (status ${status})`,
        { retryable: !PERMANENT_STATUS.has(status), providerCode: status },
      );
    }

    return {
      providerId: 'kavenegar',
      messageId: payload?.entries?.[0]?.messageid?.toString(),
      acceptedAt: new Date(),
    };
  },
};
