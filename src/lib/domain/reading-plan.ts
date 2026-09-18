import { toPersianDigits } from '../date/digits';
import {
  DEFAULT_TIMEZONE,
  jalaliWeekdayIndex,
  startOfUserDay,
  toJalaliDayKey,
  toWallClock,
  type JalaliDayKey,
} from '../date/jalali';

/**
 * The Reading Hub's arithmetic.
 *
 * Pure functions only: everything here takes its clock and its rows as
 * arguments, which is what lets the whole module be unit-tested without a
 * database and reused by both the server route and the client screen.
 *
 * The hub has two halves — the curated 365-day micro-summaries, and a book of
 * the reader's own — and one commitment that spans them. That is the shape the
 * types here encode: a `ReadingPlan` says how many minutes and which half, and
 * a `ReadingSession` is minutes on a day, with or without a book attached.
 */

/**
 * The three durations the picker offers.
 *
 * Three, not a slider. Fifteen minutes is the smallest span that is still
 * reading rather than glancing; an hour is about where a session stops fitting
 * into a day that has other things in it; thirty is the honest middle. A
 * free-text field would ask the reader to invent a number, and a number you
 * invented is one you can miss by one and feel bad about.
 */
export const READING_DURATIONS = [15, 30, 60] as const;

export type ReadingDuration = (typeof READING_DURATIONS)[number];

export const DEFAULT_READING_DURATION: ReadingDuration = 15;

export interface ReadingDurationMeta {
  minutes: ReadingDuration;
  label: string;
  /** One line under the chip, saying what the commitment is actually like. */
  hint: string;
}

export const READING_DURATION_META: readonly ReadingDurationMeta[] = [
  { minutes: 15, label: '۱۵ دقیقه', hint: 'قبل از خواب، اندازهٔ یک فنجان چای' },
  { minutes: 30, label: '۳۰ دقیقه', hint: 'یک فصل کوتاه، بیشتر روزها شدنی' },
  { minutes: 60, label: '۶۰ دقیقه', hint: 'یک نشستِ واقعی؛ روزهایی که وقت داری' },
] as const;

export function isReadingDuration(value: unknown): value is ReadingDuration {
  return (READING_DURATIONS as readonly unknown[]).includes(value);
}

/** Falls back to the default rather than throwing: a stored plan is not input. */
export function coerceReadingDuration(value: unknown): ReadingDuration {
  return isReadingDuration(value) ? value : DEFAULT_READING_DURATION;
}

export type ReadingMode = 'SUMMARY' | 'FULL_BOOK';

export interface ReadingModeMeta {
  mode: ReadingMode;
  label: string;
  description: string;
}

export const READING_MODES: readonly ReadingModeMeta[] = [
  {
    mode: 'SUMMARY',
    label: 'خلاصهٔ روزانه',
    description: 'هر روز جانِ یک کتاب، در چند دقیقه',
  },
  {
    mode: 'FULL_BOOK',
    label: 'کتاب کامل',
    description: 'کتاب خودت را صفحه‌به‌صفحه جلو ببر',
  },
] as const;

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

/** Half a day, used to land each step safely inside its own day. */
const HALF_DAY_MS = 12 * 60 * 60 * 1000;

/**
 * The last `count` day keys, today first.
 *
 * Each step lands at the *middle* of its day — the start of today, minus n
 * days, plus twelve hours — rather than n×24h back from the current instant.
 * Stepping from the raw instant puts the anchor within an hour of a day
 * boundary whenever the reader opens the app near midnight, and an hour of
 * daylight-saving drift is then enough to repeat a key or skip one. A repeated
 * key is a day that silently cannot be filled; a skipped one is a streak that
 * breaks for no reason. Iran has no DST today, but a reader's timezone is
 * theirs to set.
 */
export interface RecentDay {
  dayKey: JalaliDayKey;
  /** 0 = شنبه … 6 = جمعه, taken from the same anchor that produced the key. */
  weekdayIndex: number;
}

export function recentDays(options: {
  count: number;
  now?: Date;
  timezone?: string;
  dayStartHour?: number;
}): RecentDay[] {
  const { count, now = new Date(), timezone = DEFAULT_TIMEZONE, dayStartHour = 0 } = options;

  const todayStart = startOfUserDay(now, timezone, dayStartHour).getTime();

  const days: RecentDay[] = [];
  for (let back = 0; back < Math.max(0, count); back += 1) {
    const anchor = new Date(todayStart - back * 86_400_000 + HALF_DAY_MS);

    days.push({
      dayKey: toJalaliDayKey(anchor, timezone, dayStartHour),
      // Derived from the anchor rather than from the key, so the letter under
      // a cell cannot disagree with the day the sessions were grouped into.
      weekdayIndex: jalaliWeekdayIndex(toWallClock(anchor, timezone)),
    });
  }

  return days;
}

export function recentDayKeys(options: {
  count: number;
  now?: Date;
  timezone?: string;
  dayStartHour?: number;
}): JalaliDayKey[] {
  return recentDays(options).map((day) => day.dayKey);
}

export interface ReadingSessionLike {
  dayKey: JalaliDayKey;
  minutes: number;
  pagesRead?: number;
}

export interface ReadingDay {
  dayKey: JalaliDayKey;
  /** 0 = شنبه … 6 = جمعه. */
  weekdayIndex: number;
  minutes: number;
  /** True once the day's minutes reach the plan's commitment. */
  metGoal: boolean;
}

export interface ReadingRhythm {
  /** Minutes logged today, across both halves of the hub. */
  minutesToday: number;
  /** `0…1`, capped — a 90-minute session on a 30-minute plan is still one ring. */
  goalProgress: number;
  metGoalToday: boolean;
  /** Consecutive days meeting the commitment, ending today or yesterday. */
  streak: number;
  /** Today first. The week strip reverses it for display. */
  week: ReadingDay[];
  minutesThisWeek: number;
}

/**
 * Turns a pile of sessions into the numbers the hub header shows.
 *
 * The streak skips an unmet *today* rather than breaking on it: the day is not
 * over, and a counter that resets at midnight and un-resets when you read is a
 * counter that spends most of the day lying. Yesterday is the first day that
 * can actually break it.
 */
export function summariseRhythm(options: {
  sessions: readonly ReadingSessionLike[];
  dailyMinutes: number;
  now?: Date;
  timezone?: string;
  dayStartHour?: number;
  /** How many days the strip covers. Seven, unless a test says otherwise. */
  windowDays?: number;
}): ReadingRhythm {
  const { sessions, dailyMinutes, windowDays = 7 } = options;
  const goal = Math.max(1, dailyMinutes);

  const byDay = new Map<JalaliDayKey, number>();
  for (const session of sessions) {
    byDay.set(session.dayKey, (byDay.get(session.dayKey) ?? 0) + Math.max(0, session.minutes));
  }

  // One longer walk than the strip needs, because a streak can reach back
  // further than the seven days the strip draws.
  const walk = recentDays({
    count: Math.max(windowDays, 400),
    now: options.now,
    timezone: options.timezone,
    dayStartHour: options.dayStartHour,
  });

  let streak = 0;
  for (const [index, day] of walk.entries()) {
    const minutes = byDay.get(day.dayKey) ?? 0;

    if (minutes < goal) {
      if (index === 0) continue;
      break;
    }

    streak += 1;
  }

  const week: ReadingDay[] = walk.slice(0, windowDays).map((day) => {
    const minutes = byDay.get(day.dayKey) ?? 0;
    return { ...day, minutes, metGoal: minutes >= goal };
  });

  const minutesToday = week[0]?.minutes ?? 0;

  return {
    minutesToday,
    goalProgress: Math.min(1, minutesToday / goal),
    metGoalToday: minutesToday >= goal,
    streak,
    week,
    minutesThisWeek: week.reduce((total, day) => total + day.minutes, 0),
  };
}

// ---------------------------------------------------------------------------
// Books
// ---------------------------------------------------------------------------

export interface BookProgress {
  /** `0…1`. */
  completion: number;
  pagesLeft: number;
  isFinished: boolean;
}

export function summariseBookProgress(book: {
  totalPages: number;
  currentPage: number;
  finishedAt?: Date | string | null;
}): BookProgress {
  const total = Math.max(1, Math.trunc(book.totalPages));
  const current = Math.min(total, Math.max(0, Math.trunc(book.currentPage)));

  return {
    completion: current / total,
    pagesLeft: total - current,
    isFinished: Boolean(book.finishedAt) || current >= total,
  };
}

export interface ShelfEntry {
  finishedAt: Date | string | null;
  createdAt: Date | string;
}

/**
 * Shelf order: what you are reading, then what you have read.
 *
 * Sorted here rather than in the query because "unfinished first" means NULLs
 * first, and Postgres puts them last on an ascending sort. Prisma can say
 * `nulls: 'first'`, but the ordering is a product decision — the book you are
 * halfway through is the one your next tap is for — and a product decision
 * that lives in a query is one nobody can test.
 */
export function sortShelf<T extends ShelfEntry>(books: readonly T[]): T[] {
  const time = (value: Date | string | null): number =>
    value === null ? 0 : new Date(value).getTime();

  return [...books].sort((left, right) => {
    const leftOpen = left.finishedAt === null;
    const rightOpen = right.finishedAt === null;

    if (leftOpen !== rightOpen) return leftOpen ? -1 : 1;

    // Within each group, most recent first: the newest book you are reading,
    // and the one you finished most recently.
    return leftOpen
      ? time(right.createdAt) - time(left.createdAt)
      : time(right.finishedAt) - time(left.finishedAt);
  });
}

export interface ReadingPace {
  /** Mean pages per session across the sittings that covered ground. */
  pagesPerSession: number;
  /** Sessions still to go at that pace; null when there is nothing to go on. */
  sessionsLeft: number | null;
}

/**
 * How much further, at the pace actually observed.
 *
 * Sessions that covered no ground are excluded from the mean rather than
 * counted as zero: re-reading a chapter or losing a sitting to a phone call is
 * a real evening, but averaging it in makes the estimate say "never", which is
 * the one answer a progress estimate must not give.
 */
export function estimatePace(options: {
  sessions: readonly ReadingSessionLike[];
  pagesLeft: number;
}): ReadingPace {
  const productive = options.sessions.filter((session) => (session.pagesRead ?? 0) > 0);

  if (productive.length === 0 || options.pagesLeft <= 0) {
    return { pagesPerSession: 0, sessionsLeft: null };
  }

  const pages = productive.reduce((total, session) => total + (session.pagesRead ?? 0), 0);
  const pagesPerSession = pages / productive.length;

  return {
    pagesPerSession,
    sessionsLeft: Math.max(1, Math.ceil(options.pagesLeft / pagesPerSession)),
  };
}

/**
 * The encouraging line under a book's progress bar.
 *
 * Kaizen, not pressure: it names the next small distance rather than the whole
 * remaining mountain, and when there is no pace to go on it says so instead of
 * inventing one.
 */
export function describePace(progress: BookProgress, pace: ReadingPace): string {
  if (progress.isFinished) return 'تمامش کردی 🌱';
  if (pace.sessionsLeft === null) return 'اولین نشست را ثبت کن تا سرعتت را بفهمیم.';

  if (pace.sessionsLeft === 1) return 'یک نشست دیگر و تمام است.';

  return toPersianDigits(
    `با همین سرعت، ${pace.sessionsLeft} نشست دیگر تا صفحهٔ آخر — ${progress.pagesLeft} صفحه.`,
  );
}

/** `"۱۲ دقیقه از ۳۰"` — the ring's caption. */
export function formatMinutesAgainstGoal(minutes: number, goal: number): string {
  return toPersianDigits(`${Math.round(minutes)} دقیقه از ${goal}`);
}
