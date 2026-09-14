import {
  DEFAULT_TIMEZONE,
  daysBetweenUtcKeys,
  jalaliWeekdayIndex,
  toUtcDateKey,
  toWallClock,
} from '../date/jalali';

/**
 * Habit streak engine.
 *
 * Deliberately a pure function over a log window: the nightly reconciliation
 * cron, the optimistic client update and the API response all call the same
 * code, so the number on screen can never disagree with the number in the
 * database.
 *
 * Three rules define a streak:
 *
 *  1. **Only scheduled days count.** A habit set to شنبه/دوشنبه is not "missed"
 *     on a یکشنبه, and a Sunday gap does not break it.
 *  2. **Today is never a miss.** The current day is still in progress until it
 *     rolls over at the user's `dayStartHour`, so an incomplete today leaves the
 *     streak standing rather than zeroing it at 00:01.
 *  3. **Grace days absorb misses.** Each missed scheduled day consumes one grace
 *     token. Tokens do not extend the streak — they only stop it from breaking —
 *     and once they run out the walk stops.
 */

export interface HabitLogEntry {
  /** UTC-midnight key for the user's calendar day (see `toUtcDateKey`). */
  logDate: Date;
  count: number;
}

export interface StreakInput {
  /** Persian weekday indices the habit is due on: 0 = شنبه … 6 = جمعه. */
  frequency: readonly number[];
  targetPerDay: number;
  graceDaysAllowed: number;
  /** Logs covering at least the window being evaluated. Order is irrelevant. */
  logs: readonly HabitLogEntry[];
  timezone?: string;
  dayStartHour?: number;
  now?: Date;
  /** Nothing before this day counts; stops the walk at the habit's creation. */
  createdAt?: Date;
  /** Safety bound on the backward walk. */
  maxLookbackDays?: number;
}

export interface StreakResult {
  currentStreak: number;
  longestStreak: number;
  graceDaysUsed: number;
  /** Most recent day whose target was met, or `null` if never. */
  lastCompletedOn: Date | null;
  isDueToday: boolean;
  isCompletedToday: boolean;
  /** Progress toward today's target, `0…targetPerDay`. */
  todayCount: number;
  /** Scheduled days met in the trailing 30 days, over scheduled days in that window. */
  completionRate: number;
}

const DAY_MS = 86_400_000;

/** Is this habit scheduled on the day `utcDayKey` falls on? */
export function isScheduledOn(utcDayKey: Date, frequency: readonly number[]): boolean {
  if (frequency.length === 0) return false;

  // `utcDayKey` is a UTC-midnight stamp; read it back with UTC getters and
  // rebuild a local wall clock so `jalaliWeekdayIndex` sees the intended day.
  const wallClock = new Date(
    utcDayKey.getUTCFullYear(),
    utcDayKey.getUTCMonth(),
    utcDayKey.getUTCDate(),
  );

  return frequency.includes(jalaliWeekdayIndex(wallClock));
}

function indexLogs(logs: readonly HabitLogEntry[]): Map<number, number> {
  const totals = new Map<number, number>();

  for (const log of logs) {
    const key = log.logDate.getTime();
    totals.set(key, (totals.get(key) ?? 0) + log.count);
  }

  return totals;
}

export function evaluateStreak(input: StreakInput): StreakResult {
  const {
    frequency,
    targetPerDay,
    graceDaysAllowed,
    logs,
    timezone = DEFAULT_TIMEZONE,
    dayStartHour = 0,
    now = new Date(),
    createdAt,
    maxLookbackDays = 730,
  } = input;

  const totals = indexLogs(logs);
  const today = toUtcDateKey(now, timezone, dayStartHour);
  const floor = createdAt ? toUtcDateKey(createdAt, timezone, dayStartHour) : null;

  const isSatisfied = (day: Date): boolean => (totals.get(day.getTime()) ?? 0) >= targetPerDay;

  const todayCount = totals.get(today.getTime()) ?? 0;
  const isDueToday = isScheduledOn(today, frequency);
  const isCompletedToday = todayCount >= targetPerDay;

  let currentStreak = 0;
  let graceDaysUsed = 0;
  let lastCompletedOn: Date | null = null;

  for (let offset = 0; offset < maxLookbackDays; offset += 1) {
    const day = new Date(today.getTime() - offset * DAY_MS);
    if (floor && day.getTime() < floor.getTime()) break;
    if (!isScheduledOn(day, frequency)) continue;

    if (isSatisfied(day)) {
      currentStreak += 1;
      lastCompletedOn ??= day;
      continue;
    }

    // Rule 2: an unfinished today is not yet a miss.
    if (offset === 0) continue;

    // Rule 3: spend a grace token, or stop.
    if (graceDaysUsed < graceDaysAllowed) {
      graceDaysUsed += 1;
      continue;
    }

    break;
  }

  return {
    currentStreak,
    longestStreak: Math.max(currentStreak, computeLongestStreak(input, totals, today)),
    graceDaysUsed,
    lastCompletedOn,
    isDueToday,
    isCompletedToday,
    todayCount,
    completionRate: computeCompletionRate(input, totals, today),
  };
}

/**
 * Longest historical run, computed forward over the log window.
 *
 * Grace days are *not* applied here: the record a user is proud of should be a
 * run they actually completed, not one padded by forgiveness tokens.
 */
function computeLongestStreak(
  input: StreakInput,
  totals: Map<number, number>,
  today: Date,
): number {
  const { frequency, targetPerDay, maxLookbackDays = 730 } = input;
  if (totals.size === 0) return 0;

  const earliestLog = Math.min(...totals.keys());
  const walkStart = Math.max(earliestLog, today.getTime() - maxLookbackDays * DAY_MS);

  let longest = 0;
  let running = 0;

  for (let cursor = walkStart; cursor <= today.getTime(); cursor += DAY_MS) {
    const day = new Date(cursor);
    if (!isScheduledOn(day, frequency)) continue;

    if ((totals.get(cursor) ?? 0) >= targetPerDay) {
      running += 1;
      longest = Math.max(longest, running);
    } else if (cursor !== today.getTime()) {
      running = 0;
    }
  }

  return longest;
}

/** Share of the last 30 days' scheduled days that were met. Drives the ring chart. */
function computeCompletionRate(
  input: StreakInput,
  totals: Map<number, number>,
  today: Date,
): number {
  const { frequency, targetPerDay } = input;

  let scheduled = 0;
  let satisfied = 0;

  for (let offset = 0; offset < 30; offset += 1) {
    const day = new Date(today.getTime() - offset * DAY_MS);
    if (!isScheduledOn(day, frequency)) continue;

    scheduled += 1;
    if ((totals.get(day.getTime()) ?? 0) >= targetPerDay) satisfied += 1;
  }

  return scheduled === 0 ? 0 : satisfied / scheduled;
}

/**
 * Flame tier for the streak badge.
 *
 * The UI escalates the badge's glow and colour with the tier rather than
 * printing a raw number, so a 3-day streak still feels like progress.
 */
export type StreakTier = 'none' | 'spark' | 'flame' | 'blaze' | 'inferno' | 'legend';

export function streakTier(streak: number): StreakTier {
  if (streak <= 0) return 'none';
  if (streak < 3) return 'spark';
  if (streak < 7) return 'flame';
  if (streak < 21) return 'blaze';
  if (streak < 66) return 'inferno';
  return 'legend';
}

/** Persian label for the streak badge tooltip. */
export function streakLabel(streak: number): string {
  if (streak <= 0) return 'شروع کن';
  return `${streak} روز پیاپی`;
}

/**
 * Decides what the nightly cron should write for one habit.
 *
 * Returns `null` when nothing changed, so the reconciliation job can skip the
 * write entirely for the (very common) untouched habit.
 */
export function reconcileHabit(
  stored: { currentStreak: number; longestStreak: number; graceDaysUsed: number },
  evaluated: StreakResult,
): { currentStreak: number; longestStreak: number; graceDaysUsed: number } | null {
  const next = {
    currentStreak: evaluated.currentStreak,
    longestStreak: Math.max(stored.longestStreak, evaluated.longestStreak),
    graceDaysUsed: evaluated.graceDaysUsed,
  };

  const unchanged =
    next.currentStreak === stored.currentStreak &&
    next.longestStreak === stored.longestStreak &&
    next.graceDaysUsed === stored.graceDaysUsed;

  return unchanged ? null : next;
}

export { toUtcDateKey, toWallClock, daysBetweenUtcKeys };
