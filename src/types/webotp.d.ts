/**
 * WebOTP API typings.
 *
 * `OTPCredential` is not in TypeScript's DOM library yet (it is a WICG spec, and
 * Chromium is the only implementation). These declarations describe exactly the
 * shape used by `useWebOtp()` — anything wider would be inventing API surface.
 *
 * @see https://wicg.github.io/web-otp/
 */

interface OTPCredential extends Credential {
  readonly type: 'otp';
  /** The digits parsed out of the `@domain #code` binding line. */
  readonly code: string;
}

interface OTPCredentialTransportType {
  transport: Array<'sms'>;
}

interface CredentialRequestOptions {
  /** Present only where the WebOTP API is implemented. */
  otp?: OTPCredentialTransportType;
}
