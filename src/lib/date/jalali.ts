import {
  addDays as addJalaliDays,
  differenceInCalendarDays,
  endOfMonth as endOfJalaliMonth,
  format as formatJalaliDate,
  getDate as getJalaliDate,
  getDaysInMonth as getJalaliDaysInMonth,
  getMonth as getJalaliMonth,
  getYear as getJalaliYear,
  startOfMonth as startOfJalaliMonth,
} from 'date-fns-jalali';

/**
 * Jalali (Solar Hijri) date engine.
 *
 * Two representations are in play and must not be confused:
 *
 *  - **Instant** — a real `Date`, always UTC-backed, what the database stores.
 *  - **Wall clock** — a `Date` whose *local* getters spell out the calendar
 *    fields the user sees in their own timezone. `date-fns-jalali` reads local
 *    getters, so every formatting call takes a wall clock.
 *
 * `toWallClock()` / `fromWallClock()` are the only bridge between the two, and
 * both are built on `Intl` rather than a fixed offset, so DST-observing zones
 * and historical offset changes are handled correctly.
 */

export const DEFAULT_TIMEZONE = 'Asia/Tehran';

/** Jalali month names, index 0 = فروردین. */
export const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

/** Persian weekday names, index 0 = شنبه (the first day of the Persian week). */
export const JALALI_WEEKDAYS = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
] as const;

/** Two-letter weekday labels for the calendar strip header. */
export const JALALI_WEEKDAYS_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as const;

/** `"1403-06-24"` — the denormalised day key stored on tasks and habit logs. */
export type JalaliDayKey = string;

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = partsFormatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    // `h23` rather than `hour12: false`, which yields "24" for midnight on some ICU builds.
    hourCycle: 'h23',
  });

  partsFormatterCache.set(timeZone, formatter);
  return formatter;
}

function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    return part ? Number(part.value) : 0;
  };

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

/**
 * Projects a real instant into a wall-clock `Date` for `timeZone`.
 *
 * The result is built with the *local* `Date` constructor on purpose: reading it
 * back with local getters — which is what `date-fns-jalali` does — yields the
 * user's calendar fields no matter what `TZ` the server runs under.
 */
export function toWallClock(instant: Date, timeZone: string = DEFAULT_TIMEZONE): Date {
  const { year, month, day, hour, minute, second } = zonedParts(instant, timeZone);
  return new Date(year, month - 1, day, hour, minute, second, 0);
}

/** Offset of `timeZone` at `instant`, in milliseconds east of UTC. */
export function timeZoneOffsetMs(instant: Date, timeZone: string = DEFAULT_TIMEZONE): number {
  const { year, month, day, hour, minute, second } = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtc - instant.getTime() + instant.getMilliseconds();
}

/**
 * Inverse of {@link toWallClock}: resolves a wall-clock `Date` back to the real
 * instant it denotes in `timeZone`.
 *
 * The offset is sampled twice because the first sample is taken at the wrong
 * instant near a DST transition; the second lands on the correct side of it.
 */
export function fromWallClock(wallClock: Date, timeZone: string = DEFAULT_TIMEZONE): Date {
  const asUtc = Date.UTC(
    wallClock.getFullYear(),
    wallClock.getMonth(),
    wallClock.getDate(),
    wallClock.getHours(),
    wallClock.getMinutes(),
    wallClock.getSeconds(),
    wallClock.getMilliseconds(),
  );

  const firstPass = new Date(asUtc - timeZoneOffsetMs(new Date(asUtc), timeZone));
  return new Date(asUtc - timeZoneOffsetMs(firstPass, timeZone));
}

/**
 * The instant at which the user's day containing `instant` began.
 *
 * `dayStartHour` lets night owls declare that their day rolls over at, say,
 * 04:00 — a task completed at 02:30 then still counts toward the previous day,
 * which is what the habit streak engine needs.
 */
export function startOfUserDay(
  instant: Date,
  timeZone: string = DEFAULT_TIMEZONE,
  dayStartHour = 0,
): Date {
  const wallClock = toWallClock(instant, timeZone);

  if (wallClock.getHours() < dayStartHour) {
    wallClock.setDate(wallClock.getDate() - 1);
  }

  wallClock.setHours(dayStartHour, 0, 0, 0);
  return fromWallClock(wallClock, timeZone);
}

/** Formats a wall clock with a `date-fns-jalali` pattern. */
export function formatWallClock(wallClock: Date, pattern: string): string {
  return formatJalaliDate(wallClock, pattern);
}

/** Formats a real instant in the user's timezone with a Jalali pattern. */
export function formatInstant(
  instant: Date,
  pattern: string,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  return formatJalaliDate(toWallClock(instant, timeZone), pattern);
}

/**
 * The stable, sortable day key for an instant: `"1403-06-24"`.
 *
 * Stored alongside `due_at` on tasks so that "everything due today" is an index
 * scan on a `varchar(10)` rather than a per-row timezone conversion.
 */
export function toJalaliDayKey(
  instant: Date,
  timeZone: string = DEFAULT_TIMEZONE,
  dayStartHour = 0,
): JalaliDayKey {
  const dayStart = startOfUserDay(instant, timeZone, dayStartHour);
  return formatJalaliDate(toWallClock(dayStart, timeZone), 'yyyy-MM-dd');
}

/** Parses `"1403-06-24"` into its numeric parts; `null` when malformed. */
export function parseJalaliDayKey(
  key: JalaliDayKey,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;

  const [, year, month, day] = match;
  const parsed = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };

  if (parsed.month < 1 || parsed.month > 12 || parsed.day < 1 || parsed.day > 31) return null;
  return parsed;
}

/**
 * The UTC midnight key used by `habit_logs.log_date` and `habits.last_completed_on`.
 *
 * Habit logs are keyed by *the user's* calendar day, but Postgres `date` columns
 * carry no zone. Normalising to UTC midnight of that day keeps `unique(habit_id,
 * log_date)` meaningful and comparisons portable.
 */
export function toUtcDateKey(
  instant: Date,
  timeZone: string = DEFAULT_TIMEZONE,
  dayStartHour = 0,
): Date {
  const dayStart = startOfUserDay(instant, timeZone, dayStartHour);
  const wallClock = toWallClock(dayStart, timeZone);
  return new Date(
    Date.UTC(wallClock.getFullYear(), wallClock.getMonth(), wallClock.getDate(), 0, 0, 0, 0),
  );
}

/** Whole days between two UTC date keys — positive when `later` is after `earlier`. */
export function daysBetweenUtcKeys(earlier: Date, later: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / 86_400_000);
}

/** Persian weekday index of a wall clock: 0 = شنبه … 6 = جمعه. */
export function jalaliWeekdayIndex(wallClock: Date): number {
  // JS weeks start on Sunday (0); Persian weeks start on Saturday.
  return (wallClock.getDay() + 1) % 7;
}

/** `"شنبه ۲۴ شهریور ۱۴۰۳"` — the header line on the Today screen. */
export function formatFullJalaliDate(instant: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  const wallClock = toWallClock(instant, timeZone);
  const weekday = JALALI_WEEKDAYS[jalaliWeekdayIndex(wallClock)] ?? '';
  const month = JALALI_MONTHS[getJalaliMonth(wallClock)] ?? '';

  return `${weekday} ${getJalaliDate(wallClock)} ${month} ${getJalaliYear(wallClock)}`;
}

/** `"۲۴ شهریور"` — compact form for list rows and chips. */
export function formatShortJalaliDate(instant: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  const wallClock = toWallClock(instant, timeZone);
  return `${getJalaliDate(wallClock)} ${JALALI_MONTHS[getJalaliMonth(wallClock)] ?? ''}`;
}

/**
 * Persian relative time: `"۱۱ روز پیش"`, `"فردا"`, `"۳ ساعت دیگر"`.
 *
 * Day-granularity comparisons run on calendar days rather than elapsed hours, so
 * 23:00 → 01:00 reads as "فردا" and not "۲ ساعت دیگر".
 */
export function formatRelativeJalali(
  instant: Date,
  options: { now?: Date; timeZone?: string; dayStartHour?: number } = {},
): string {
  const { now = new Date(), timeZone = DEFAULT_TIMEZONE, dayStartHour = 0 } = options;

  const targetDay = toUtcDateKey(instant, timeZone, dayStartHour);
  const todayKey = toUtcDateKey(now, timeZone, dayStartHour);
  const dayDelta = daysBetweenUtcKeys(todayKey, targetDay);

  if (dayDelta === 0) {
    const minutes = Math.round((instant.getTime() - now.getTime()) / 60_000);
    const absMinutes = Math.abs(minutes);

    if (absMinutes < 1) return 'همین حالا';
    if (absMinutes < 60) {
      return minutes > 0 ? `${absMinutes} دقیقه دیگر` : `${absMinutes} دقیقه پیش`;
    }

    const hours = Math.round(absMinutes / 60);
    return minutes > 0 ? `${hours} ساعت دیگر` : `${hours} ساعت پیش`;
  }

  if (dayDelta === 1) return 'فردا';
  if (dayDelta === -1) return 'دیروز';
  if (dayDelta === 2) return 'پس‌فردا';
  if (dayDelta === -2) return 'پریروز';

  const absDays = Math.abs(dayDelta);

  if (absDays < 30) {
    return dayDelta > 0 ? `${absDays} روز دیگر` : `${absDays} روز پیش`;
  }

  const months = Math.round(absDays / 30);
  if (months < 12) {
    return dayDelta > 0 ? `${months} ماه دیگر` : `${months} ماه پیش`;
  }

  const years = Math.round(absDays / 365);
  return dayDelta > 0 ? `${years} سال دیگر` : `${years} سال پیش`;
}

/** Whole days from now until `instant`, in the user's calendar. Drives countdowns. */
export function daysUntil(instant: Date, options: { now?: Date; timeZone?: string } = {}): number {
  const { now = new Date(), timeZone = DEFAULT_TIMEZONE } = options;
  return daysBetweenUtcKeys(toUtcDateKey(now, timeZone), toUtcDateKey(instant, timeZone));
}

export interface JalaliCalendarCell {
  /** Wall-clock date this cell represents. */
  date: Date;
  dayOfMonth: number;
  dayKey: JalaliDayKey;
  /** False for the leading/trailing days borrowed from adjacent months. */
  isCurrentMonth: boolean;
  isToday: boolean;
}

/**
 * Builds the 6×7 grid behind the Jalali month picker.
 *
 * The grid always renders six rows so the sheet does not resize between months.
 */
export function buildJalaliMonthGrid(
  anchor: Date,
  options: { timeZone?: string; now?: Date } = {},
): JalaliCalendarCell[] {
  const { timeZone = DEFAULT_TIMEZONE, now = new Date() } = options;

  const anchorWallClock = toWallClock(anchor, timeZone);
  const monthStart = startOfJalaliMonth(anchorWallClock);
  const leadingBlanks = jalaliWeekdayIndex(monthStart);
  const gridStart = addJalaliDays(monthStart, -leadingBlanks);
  const monthEnd = endOfJalaliMonth(anchorWallClock);
  const todayKey = toJalaliDayKey(now, timeZone);

  return Array.from({ length: 42 }, (_, offset) => {
    const date = addJalaliDays(gridStart, offset);
    const dayKey = formatJalaliDate(date, 'yyyy-MM-dd');

    return {
      date,
      dayOfMonth: getJalaliDate(date),
      dayKey,
      isCurrentMonth:
        differenceInCalendarDays(date, monthStart) >= 0 &&
        differenceInCalendarDays(date, monthEnd) <= 0,
      isToday: dayKey === todayKey,
    } satisfies JalaliCalendarCell;
  });
}

export {
  addJalaliDays,
  getJalaliDate,
  getJalaliDaysInMonth,
  getJalaliMonth,
  getJalaliYear,
  startOfJalaliMonth,
  endOfJalaliMonth,
};
