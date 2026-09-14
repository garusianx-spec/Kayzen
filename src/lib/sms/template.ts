import { toPersianDigits } from '../date/digits';
import type { OtpTemplateId } from './types';

/**
 * OTP message bodies.
 *
 * The last line is not decoration: the WebOTP API only fills a code
 * automatically when the message ends with `@<domain> #<code>`, where `<domain>`
 * is the exact origin host the app is served from. Chrome inside the Trusted
 * Web Activity applies the same rule, so the binding line is what makes
 * "code arrives → field fills itself" work on Android.
 *
 * Rules the format imposes, all of which are easy to break by accident:
 *   - the binding line must be the LAST line of the message;
 *   - the domain carries no scheme and no trailing slash;
 *   - the code after `#` must match the code in the human-readable text;
 *   - the code itself stays in ASCII digits — a Persian-digit code would be
 *     typed back as something the server never issued.
 */

const BODIES: Record<OtpTemplateId, (code: string, minutes: string) => string> = {
  'sign-in': (code, minutes) =>
    `کایزن\nکد ورود شما: ${code}\nاین کد تا ${minutes} دقیقه معتبر است.\nاگر شما درخواست نداده‌اید، این پیام را نادیده بگیرید.`,
  'phone-change': (code, minutes) =>
    `کایزن\nکد تأیید شمارهٔ جدید: ${code}\nاین کد تا ${minutes} دقیقه معتبر است.`,
};

/** Host of the deployment, without scheme, port or trailing slash. */
export function webOtpDomain(appUrl: string): string {
  try {
    return new URL(appUrl).hostname;
  } catch {
    return appUrl.replace(/^https?:\/\//, '').replace(/[:/].*$/, '');
  }
}

export function renderOtpSms(options: {
  template: OtpTemplateId;
  code: string;
  ttlSeconds: number;
  appUrl: string;
}): string {
  const minutes = toPersianDigits(Math.max(1, Math.round(options.ttlSeconds / 60)));
  const body = BODIES[options.template](options.code, minutes);

  return `${body}\n\n@${webOtpDomain(options.appUrl)} #${options.code}`;
}
