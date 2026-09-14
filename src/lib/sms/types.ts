/**
 * SMS gateway abstraction.
 *
 * Iranian gateways go down, get rate-limited, and occasionally lose an entire
 * operator route for an afternoon. Keeping the OTP flow behind one narrow
 * interface means swapping Kavenegar for FarazSMS is an environment variable,
 * not a refactor — and it keeps the auth routes free of provider quirks like
 * Kavenegar's local-format receptor or IPPanel's pattern variables.
 */

export type OtpTemplateId = 'sign-in' | 'phone-change';

export interface OtpSmsMessage {
  /** Recipient in E.164 (`+989…`). Adapters convert to what their API wants. */
  to: string;
  /** The plaintext code. Lives in memory for the duration of one request. */
  code: string;
  template: OtpTemplateId;
  /** Fully rendered body, for gateways that accept free text (e.g. Twilio). */
  text: string;
  /** Seconds the code stays valid; rendered into the body. */
  ttlSeconds: number;
}

export interface SmsSendResult {
  providerId: string;
  /** Gateway-side id, when one is returned. Logged for delivery support. */
  messageId?: string;
  acceptedAt: Date;
}

export interface SmsProvider {
  readonly id: string;
  send(message: OtpSmsMessage): Promise<SmsSendResult>;
}

/**
 * A delivery failure.
 *
 * `retryable` separates "the gateway is briefly unhappy" (5xx, timeout, quota)
 * from "this number will never receive this message" (invalid receptor, blocked
 * recipient). The route surfaces the first as a 503 the user can retry and the
 * second as a validation error on the phone field.
 */
export class SmsDeliveryError extends Error {
  readonly providerId: string;
  readonly retryable: boolean;
  readonly providerCode?: string | number;

  constructor(
    providerId: string,
    message: string,
    options: { retryable?: boolean; providerCode?: string | number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'SmsDeliveryError';
    this.providerId = providerId;
    this.retryable = options.retryable ?? true;
    this.providerCode = options.providerCode;
  }
}

/** Shared fetch timeout. A gateway that has not answered in 8s will not. */
export const SMS_REQUEST_TIMEOUT_MS = 8_000;
