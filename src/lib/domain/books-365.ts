import { toPersianDigits } from '../date/digits';
import { DEFAULT_TIMEZONE, daysBetweenUtcKeys, toUtcDateKey } from '../date/jalali';

/**
 * 365-book curriculum assignment.
 *
 * The library is a fixed, ordered set of 365 micro-summaries. Which one a user
 * sees today is a pure function of how long they have been enrolled — not of
 * the calendar date — so somebody who joins in اسفند still starts at day 1.
 *
 * Being a pure function also means the daily card is safe to render with ISR:
 * the summary content is identical for everyone on the same day number, and
 * only the (tiny, per-user) reading log needs a dynamic fetch.
 */

export const CURRICULUM_LENGTH = 365;

export interface CurriculumPosition {
  /** 1-based index into the library. */
  dayNumber: number;
  /** Days since enrolment, 0 on the first day. */
  daysEnrolled: number;
  /** How many full passes through the library the user has completed. */
  cycle: number;
  /** True on the first day of a new pass. */
  isNewCycle: boolean;
}

export function resolveCurriculumPosition(options: {
  enrolledAt: Date;
  now?: Date;
  timezone?: string;
  dayStartHour?: number;
}): CurriculumPosition {
  const { enrolledAt, now = new Date(), timezone = DEFAULT_TIMEZONE, dayStartHour = 0 } = options;

  const enrolledKey = toUtcDateKey(enrolledAt, timezone, dayStartHour);
  const todayKey = toUtcDateKey(now, timezone, dayStartHour);

  // A clock skew or a back-dated enrolment must never produce day 0 or negative.
  const daysEnrolled = Math.max(0, daysBetweenUtcKeys(enrolledKey, todayKey));

  const cycle = Math.floor(daysEnrolled / CURRICULUM_LENGTH);
  const dayNumber = (daysEnrolled % CURRICULUM_LENGTH) + 1;

  return {
    dayNumber,
    daysEnrolled,
    cycle,
    isNewCycle: cycle > 0 && dayNumber === 1,
  };
}

export interface ReadingProgress {
  booksRead: number;
  /** Consecutive days, ending today or yesterday, with a completed reading. */
  currentStreak: number;
  /** Share of the curriculum completed, `0…1`. */
  completion: number;
  /** Day numbers the user skipped and can still return to. */
  missedDayNumbers: number[];
}

/**
 * Summarises a user's progress through the library.
 *
 * `readDayNumbers` is the set of day numbers with a completed reading log; the
 * caller loads it once and reuses it for the header stats and the catch-up list.
 */
export function summariseReadingProgress(options: {
  position: CurriculumPosition;
  readDayNumbers: readonly number[];
  /** Cap on how many missed days to surface; the UI only shows a handful. */
  missedLimit?: number;
}): ReadingProgress {
  const { position, readDayNumbers, missedLimit = 10 } = options;
  const read = new Set(readDayNumbers);

  let currentStreak = 0;
  for (let dayNumber = position.dayNumber; dayNumber >= 1; dayNumber -= 1) {
    // Today may legitimately be unread — the day is not over yet.
    if (!read.has(dayNumber)) {
      if (dayNumber === position.dayNumber) continue;
      break;
    }
    currentStreak += 1;
  }

  const missedDayNumbers: number[] = [];
  for (let dayNumber = 1; dayNumber < position.dayNumber; dayNumber += 1) {
    if (read.has(dayNumber)) continue;
    if (missedDayNumbers.length >= missedLimit) break;
    missedDayNumbers.push(dayNumber);
  }

  return {
    booksRead: read.size,
    currentStreak,
    completion: Math.min(1, read.size / CURRICULUM_LENGTH),
    missedDayNumbers,
  };
}

/** `"روز ۲۴ از ۳۶۵"` — the progress caption under the daily card. */
export function formatCurriculumCaption(position: CurriculumPosition): string {
  const suffix = position.cycle > 0 ? ` · دور ${position.cycle + 1}` : '';
  return toPersianDigits(`روز ${position.dayNumber} از ${CURRICULUM_LENGTH}${suffix}`);
}
