/**
 * Persian digit + number formatting.
 *
 * Persian users read `۱۲۳`, not `123`. Rather than relying on a font feature or
 * `Intl` inside hot render paths, digits are transliterated once at the edge of
 * the UI and cached formatters do the grouping.
 */

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] as const;
const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'] as const;

/** `1403/06/24` → `۱۴۰۳/۰۶/۲۴`. Non-digit characters pass through untouched. */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)] ?? digit);
}

/**
 * Normalises Persian (`۰-۹`) and Arabic-Indic (`٠-٩`) digits back to ASCII.
 * Every numeric form input runs through this before parsing — users type on
 * Persian keyboards and `Number('۱۲')` is `NaN`.
 */
export function toLatinDigits(input: string): string {
  let result = '';

  for (const char of input) {
    const persianIndex = PERSIAN_DIGITS.indexOf(char as (typeof PERSIAN_DIGITS)[number]);
    if (persianIndex !== -1) {
      result += String(persianIndex);
      continue;
    }

    const arabicIndex = ARABIC_INDIC_DIGITS.indexOf(char as (typeof ARABIC_INDIC_DIGITS)[number]);
    result += arabicIndex !== -1 ? String(arabicIndex) : char;
  }

  return result;
}

/** Parses user-typed numerics that may contain Persian digits, commas, or `٫`. */
export function parsePersianNumber(input: string): number | null {
  const normalised = toLatinDigits(input)
    .replace(/[,\s٬]/g, '')
    .replace('٫', '.');
  if (normalised === '' || !/^-?\d*\.?\d+$/.test(normalised)) return null;

  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}

const groupedFormatter = new Intl.NumberFormat('en-US', { useGrouping: true });

/** `2500000` → `۲٬۵۰۰٬۰۰۰` (Persian thousands separator). */
export function formatPersianNumber(value: number): string {
  return toPersianDigits(groupedFormatter.format(value)).replace(/,/g, '٬');
}

const CURRENCY_SUFFIX: Record<string, string> = {
  IRT: 'تومان',
  IRR: 'ریال',
  USD: 'دلار',
  EUR: 'یورو',
};

/** `formatCurrency(2500000)` → `۲٬۵۰۰٬۰۰۰ تومان`. */
export function formatCurrency(value: number, currency = 'IRT'): string {
  return `${formatPersianNumber(Math.round(value))} ${CURRENCY_SUFFIX[currency] ?? currency}`;
}

/**
 * Compacts large sums for cramped surfaces (progress chips, nav badges):
 * `2_500_000` → `۲.۵ میلیون`.
 */
export function formatCompactCurrency(value: number, currency = 'IRT'): string {
  const suffix = CURRENCY_SUFFIX[currency] ?? currency;
  const abs = Math.abs(value);

  const scale = (divisor: number, label: string): string => {
    const scaled = value / divisor;
    const rendered = Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(1);
    return `${toPersianDigits(rendered)} ${label} ${suffix}`;
  };

  if (abs >= 1_000_000_000) return scale(1_000_000_000, 'میلیارد');
  if (abs >= 1_000_000) return scale(1_000_000, 'میلیون');
  if (abs >= 1_000) return scale(1_000, 'هزار');

  return formatCurrency(value, currency);
}

/** `0.42` → `۴۲٪`. */
export function formatPercent(ratio: number): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  return `${toPersianDigits(Math.round(clamped * 100))}٪`;
}
