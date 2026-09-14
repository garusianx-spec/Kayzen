import { toLatinDigits, toPersianDigits } from '../date/digits';

/**
 * Iranian mobile number handling.
 *
 * One canonical form is stored and compared everywhere: E.164, `+989XXXXXXXXX`.
 * Users, however, type all of these — and on a Persian keyboard, in Persian
 * digits:
 *
 *   ۰۹۱۲۳۴۵۶۷۸۹ · 0912 345 6789 · +98 912 345 6789 · 00989123456789 · 9123456789
 *
 * Every one of them is the same number, and a login form that rejects four of
 * the five is a login form that loses users.
 */

/** The shape the API contract advertises for a "local" Iranian mobile number. */
export const IRAN_MOBILE_LOCAL_PATTERN = /^09[0-9]{9}$/;

/** The canonical stored shape. */
export const E164_PATTERN = /^\+989[0-9]{9}$/;

/**
 * Normalises any accepted input to `+989XXXXXXXXX`.
 *
 * Returns `null` for anything that is not a valid Iranian mobile number, which
 * is the only signal callers get — there is no "partially valid".
 */
export function normalizeIranianPhone(input: string): string | null {
  if (!input) return null;

  // Persian/Arabic-Indic digits first, then strip the separators people paste:
  // spaces, dashes, parentheses, dots, and the RTL marks a Persian keyboard
  // inserts around numbers.
  const digitsOnly = toLatinDigits(input)
    .replace(/[\s\-().‌‎‏]/g, '')
    .trim();

  const withoutPrefix = digitsOnly
    .replace(/^\+98/, '')
    .replace(/^0098/, '')
    .replace(/^98(?=9\d{9}$)/, '')
    .replace(/^0(?=9\d{9}$)/, '');

  // What is left must be a bare mobile subscriber number: 9 + operator + 8.
  if (!/^9[0-9]{9}$/.test(withoutPrefix)) return null;

  return `+98${withoutPrefix}`;
}

/** `+989123456789` → `09123456789`. Returns the input unchanged if not E.164. */
export function toLocalIranianPhone(e164: string): string {
  return E164_PATTERN.test(e164) ? `0${e164.slice(3)}` : e164;
}

/** `+989123456789` → `۰۹۱۲ ۳۴۵ ۶۷۸۹`, grouped the way the number is read aloud. */
export function formatPhoneForDisplay(e164: string): string {
  const local = toLocalIranianPhone(e164);
  if (!IRAN_MOBILE_LOCAL_PATTERN.test(local)) return toPersianDigits(local);

  return toPersianDigits(`${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`);
}

/**
 * `+989123456789` → `۰۹۱۲***۶۷۸۹`.
 *
 * Used on the verification screen and in every log line: enough for the user to
 * confirm they typed the right number, not enough for a leaked log to identify
 * them.
 */
export function maskPhone(e164: string): string {
  const local = toLocalIranianPhone(e164);
  if (local.length < 8) return '***';

  return toPersianDigits(`${local.slice(0, 4)}***${local.slice(-4)}`);
}

/** Operator behind the number, for support diagnostics and log context. */
export function iranianOperator(e164: string): 'MCI' | 'Irancell' | 'Rightel' | 'Shatel' | 'Other' {
  const local = toLocalIranianPhone(e164);
  const prefix = local.slice(0, 4);

  if (/^091[0-9]$|^0990$|^0991$|^0992$|^0993$|^0994$/.test(prefix)) return 'MCI';
  if (/^093[0-9]$|^0901$|^0902$|^0903$|^0905$|^0904$/.test(prefix)) return 'Irancell';
  if (/^0920$|^0921$|^0922$|^0923$/.test(prefix)) return 'Rightel';
  if (/^0998$/.test(prefix)) return 'Shatel';

  return 'Other';
}
