import { toPersianDigits } from '../date/digits';
import {
  DEFAULT_TIMEZONE,
  addJalaliDays,
  fromWallClock,
  jalaliWeekdayIndex,
  toWallClock,
} from '../date/jalali';

/**
 * Recurrence rules for tasks.
 *
 * A deliberately small RFC 5545 subset — `FREQ`, `INTERVAL`, `BYDAY`, `COUNT`,
 * `UNTIL` — because the UI only ever produces those, and a full RRULE engine is
 * a large dependency to carry for a feature whose worst failure is a task
 * reappearing on the wrong day.
 *
 * Monthly and yearly recurrence advance by *Jalali* months and years, so
 * "monthly on the 1st" means ۱ام of each Persian month, not the Gregorian one.
 */

export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  /** Persian weekday indices (0 = شنبه). `WEEKLY` only. */
  byDay?: number[];
  count?: number;
  until?: Date;
}

/** RFC 5545 weekday codes, in Persian week order. */
const WEEKDAY_CODES = ['SA', 'SU', 'MO', 'TU', 'WE', 'TH', 'FR'] as const;

export function parseRecurrence(rule: string | null | undefined): RecurrenceRule | null {
  if (!rule?.trim()) return null;

  const parts = new Map<string, string>();
  for (const segment of rule.replace(/^RRULE:/i, '').split(';')) {
    const [key, value] = segment.split('=');
    if (key && value) parts.set(key.trim().toUpperCase(), value.trim());
  }

  const frequency = parts.get('FREQ')?.toUpperCase();
  if (
    frequency !== 'DAILY' &&
    frequency !== 'WEEKLY' &&
    frequency !== 'MONTHLY' &&
    frequency !== 'YEARLY'
  ) {
    return null;
  }

  const interval = Number(parts.get('INTERVAL') ?? '1');
  const count = parts.has('COUNT') ? Number(parts.get('COUNT')) : undefined;

  const byDay = parts
    .get('BYDAY')
    ?.split(',')
    .map((code) =>
      WEEKDAY_CODES.indexOf(code.trim().toUpperCase() as (typeof WEEKDAY_CODES)[number]),
    )
    .filter((index) => index !== -1);

  let until: Date | undefined;
  const untilRaw = parts.get('UNTIL');
  if (untilRaw) {
    // Basic-format ISO 8601: `20250921T000000Z`.
    const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(untilRaw);
    if (match) {
      const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
      until = new Date(
        Date.UTC(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(minute),
          Number(second),
        ),
      );
    }
  }

  return {
    frequency,
    interval: Number.isFinite(interval) && interval > 0 ? Math.floor(interval) : 1,
    ...(byDay && byDay.length > 0 ? { byDay: [...new Set(byDay)].sort((a, b) => a - b) } : {}),
    ...(count !== undefined && Number.isFinite(count) && count > 0 ? { count } : {}),
    ...(until ? { until } : {}),
  };
}

export function serializeRecurrence(rule: RecurrenceRule): string {
  const segments = [`FREQ=${rule.frequency}`];

  if (rule.interval > 1) segments.push(`INTERVAL=${rule.interval}`);

  if (rule.byDay?.length) {
    segments.push(`BYDAY=${rule.byDay.map((index) => WEEKDAY_CODES[index]).join(',')}`);
  }

  if (rule.count) segments.push(`COUNT=${rule.count}`);

  if (rule.until) {
    const iso = rule.until
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
    segments.push(`UNTIL=${iso}`);
  }

  return `RRULE:${segments.join(';')}`;
}

/**
 * The first occurrence strictly after `from`.
 *
 * Returns `null` when the rule has run out (`UNTIL` passed). `COUNT` is not
 * enforced here — the caller owns the occurrence tally, since Kayzen
 * materialises one task instance at a time rather than expanding the series.
 */
export function nextOccurrence(
  rule: RecurrenceRule,
  from: Date,
  timezone: string = DEFAULT_TIMEZONE,
): Date | null {
  const wallClock = toWallClock(from, timezone);

  const advanced = (() => {
    switch (rule.frequency) {
      case 'DAILY':
        return addJalaliDays(wallClock, rule.interval);

      case 'WEEKLY':
        return nextWeeklyOccurrence(wallClock, rule);

      case 'MONTHLY': {
        const next = new Date(wallClock);
        // `addMonths` on a Jalali wall clock would need the Jalali month length;
        // stepping through `date-fns-jalali`'s own arithmetic keeps that correct.
        return addJalaliMonths(next, rule.interval);
      }

      case 'YEARLY':
        return addJalaliMonths(new Date(wallClock), rule.interval * 12);
    }
  })();

  const occurrence = fromWallClock(advanced, timezone);

  if (rule.until && occurrence.getTime() > rule.until.getTime()) return null;
  return occurrence;
}

function nextWeeklyOccurrence(wallClock: Date, rule: RecurrenceRule): Date {
  const byDay = rule.byDay?.length ? rule.byDay : [jalaliWeekdayIndex(wallClock)];

  // Scan the coming week for the next selected weekday.
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = addJalaliDays(wallClock, offset);
    if (byDay.includes(jalaliWeekdayIndex(candidate))) {
      // With INTERVAL > 1, skip the intervening weeks after landing on the day.
      return rule.interval > 1 ? addJalaliDays(candidate, (rule.interval - 1) * 7) : candidate;
    }
  }

  return addJalaliDays(wallClock, 7 * rule.interval);
}

/**
 * Adds Jalali months to a wall clock, clamping the day of month.
 *
 * ۳۱ام of a 31-day month rolls back to the last valid day of a shorter target
 * month (اسفند has 29 days in a common year), matching how every calendar app
 * handles "monthly on the 31st".
 */
function addJalaliMonths(wallClock: Date, months: number): Date {
  // Walking day-by-day would be O(days); instead step month boundaries directly
  // by asking date-fns-jalali for each month's length as we go.
  let cursor = new Date(wallClock);
  const targetDayOfMonth = jalaliDayOfMonth(cursor);

  for (let step = 0; step < Math.abs(months); step += 1) {
    cursor = months > 0 ? startOfNextJalaliMonth(cursor) : startOfPreviousJalaliMonth(cursor);
  }

  const daysInTarget = jalaliDaysInMonth(cursor);
  return addJalaliDays(cursor, Math.min(targetDayOfMonth, daysInTarget) - 1);
}

function jalaliDayOfMonth(wallClock: Date): number {
  return Number(new Intl.DateTimeFormat('en-u-ca-persian', { day: 'numeric' }).format(wallClock));
}

function jalaliDaysInMonth(wallClock: Date): number {
  // Step forward from the 1st until the month rolls over.
  let cursor = new Date(wallClock);
  let days = 0;

  const month = jalaliMonthOf(cursor);
  while (jalaliMonthOf(cursor) === month && days < 32) {
    days += 1;
    cursor = addJalaliDays(cursor, 1);
  }

  return days;
}

function jalaliMonthOf(wallClock: Date): string {
  return new Intl.DateTimeFormat('en-u-ca-persian', { month: 'numeric', year: 'numeric' }).format(
    wallClock,
  );
}

function startOfNextJalaliMonth(wallClock: Date): Date {
  let cursor = new Date(wallClock);
  const month = jalaliMonthOf(cursor);

  while (jalaliMonthOf(cursor) === month) {
    cursor = addJalaliDays(cursor, 1);
  }

  return cursor;
}

function startOfPreviousJalaliMonth(wallClock: Date): Date {
  let cursor = new Date(wallClock);
  const month = jalaliMonthOf(cursor);

  while (jalaliMonthOf(cursor) === month) {
    cursor = addJalaliDays(cursor, -1);
  }

  // `cursor` is now the last day of the previous month; rewind to its first.
  const previousMonth = jalaliMonthOf(cursor);
  while (jalaliMonthOf(addJalaliDays(cursor, -1)) === previousMonth) {
    cursor = addJalaliDays(cursor, -1);
  }

  return cursor;
}

/** `"هر ۲ هفته، شنبه و دوشنبه"` — the human-readable rule shown on a task row. */
export function describeRecurrence(rule: RecurrenceRule): string {
  const weekdayNames = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
  const unit = { DAILY: 'روز', WEEKLY: 'هفته', MONTHLY: 'ماه', YEARLY: 'سال' }[rule.frequency];
  // Every other number the user sees is transliterated; an interval left in
  // Latin digits reads as a rendering bug on an otherwise Persian row.
  const prefix =
    rule.interval === 1 ? `هر ${unit}` : `هر ${toPersianDigits(rule.interval)} ${unit}`;

  if (rule.frequency === 'WEEKLY' && rule.byDay?.length) {
    const days = rule.byDay.map((index) => weekdayNames[index] ?? '').filter(Boolean);
    return `${prefix}، ${days.join(' و ')}`;
  }

  return prefix;
}
