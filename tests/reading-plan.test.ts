import { describe, expect, it } from 'vitest';

import { toJalaliDayKey } from '@/lib/date/jalali';
import {
  DEFAULT_READING_DURATION,
  READING_DURATIONS,
  READING_DURATION_META,
  coerceReadingDuration,
  describePace,
  estimatePace,
  isReadingDuration,
  recentDayKeys,
  recentDays,
  sortShelf,
  summariseBookProgress,
  summariseRhythm,
} from '@/lib/domain/reading-plan';
import { minuteChoices } from '@/components/reading/ReadingSessionSheet';

/**
 * The Reading Hub's arithmetic.
 *
 * Everything the hub draws — the ring, the streak, the week strip, the "how
 * much further" line — is one of these functions. They take their clock as an
 * argument precisely so that this file can pin one.
 */

const TEHRAN = 'Asia/Tehran';
/** A fixed instant: mid-afternoon in Tehran, well away from a day boundary. */
const NOW = new Date('2026-09-18T11:00:00Z');

const key = (daysBack: number): string =>
  toJalaliDayKey(new Date(NOW.getTime() - daysBack * 86_400_000), TEHRAN, 0);

describe('durations', () => {
  it('offers exactly three, and the default is one of them', () => {
    expect(READING_DURATIONS).toEqual([15, 30, 60]);
    expect(isReadingDuration(DEFAULT_READING_DURATION)).toBe(true);
    expect(READING_DURATION_META.map((option) => option.minutes)).toEqual([...READING_DURATIONS]);
  });

  it('refuses anything else', () => {
    for (const value of [0, 17, 45, '30', null, undefined, Number.NaN]) {
      expect(isReadingDuration(value)).toBe(false);
    }
  });

  it('coerces a stored oddity back to the default rather than throwing', () => {
    // A plan row is not user input; a screen that crashes on one is worse than
    // one that quietly shows the default.
    expect(coerceReadingDuration(17)).toBe(DEFAULT_READING_DURATION);
    expect(coerceReadingDuration(60)).toBe(60);
  });
});

describe('recentDays', () => {
  it('starts at today and walks back one day at a time', () => {
    const keys = recentDayKeys({ count: 5, now: NOW, timezone: TEHRAN });

    expect(keys).toHaveLength(5);
    expect(keys[0]).toBe(key(0));
    expect(keys[4]).toBe(key(4));
    expect(new Set(keys).size).toBe(5);
  });

  it('never repeats or skips a day, even near the day boundary', () => {
    // 20:45 UTC is 00:15 the next day in Tehran — the exact moment a naive
    // walk from the current instant lands on the wrong side of midnight.
    const midnightish = new Date('2026-09-18T20:45:00Z');
    const keys = recentDayKeys({ count: 30, now: midnightish, timezone: TEHRAN });

    expect(new Set(keys).size).toBe(30);
  });

  it('carries the weekday of the day it keyed', () => {
    const days = recentDays({ count: 8, now: NOW, timezone: TEHRAN });

    for (const day of days) {
      expect(day.weekdayIndex).toBeGreaterThanOrEqual(0);
      expect(day.weekdayIndex).toBeLessThanOrEqual(6);
    }

    // Consecutive days are consecutive weekdays, wrapping at جمعه.
    for (const [index, day] of days.slice(1).entries()) {
      const previous = days[index]!;
      expect((day.weekdayIndex + 1) % 7).toBe(previous.weekdayIndex);
    }
  });

  it('respects a night owl day start', () => {
    // 00:30 Tehran with a 4am day start is still "yesterday" to the reader.
    const lateNight = new Date('2026-09-18T21:00:00Z');

    const normal = recentDayKeys({ count: 1, now: lateNight, timezone: TEHRAN })[0];
    const owl = recentDayKeys({ count: 1, now: lateNight, timezone: TEHRAN, dayStartHour: 4 })[0];

    expect(owl).not.toBe(normal);
  });
});

describe('summariseRhythm', () => {
  const rhythm = (sessions: Array<{ dayKey: string; minutes: number }>, dailyMinutes = 30) =>
    summariseRhythm({ sessions, dailyMinutes, now: NOW, timezone: TEHRAN });

  it('sums a day across sittings', () => {
    const result = rhythm([
      { dayKey: key(0), minutes: 12 },
      { dayKey: key(0), minutes: 20 },
    ]);

    expect(result.minutesToday).toBe(32);
    expect(result.metGoalToday).toBe(true);
    expect(result.goalProgress).toBe(1);
  });

  it('caps the ring at one, so a long session does not overflow it', () => {
    expect(rhythm([{ dayKey: key(0), minutes: 300 }]).goalProgress).toBe(1);
  });

  it('counts a streak of days that met the goal', () => {
    const result = rhythm([
      { dayKey: key(0), minutes: 30 },
      { dayKey: key(1), minutes: 45 },
      { dayKey: key(2), minutes: 30 },
    ]);

    expect(result.streak).toBe(3);
  });

  it('does not break the streak on a today that has not happened yet', () => {
    // The day is not over. A counter that resets at midnight and un-resets
    // when you read spends most of the day lying.
    const result = rhythm([
      { dayKey: key(1), minutes: 30 },
      { dayKey: key(2), minutes: 30 },
    ]);

    expect(result.minutesToday).toBe(0);
    expect(result.streak).toBe(2);
  });

  it('does break on a yesterday that was missed', () => {
    const result = rhythm([
      { dayKey: key(0), minutes: 30 },
      { dayKey: key(2), minutes: 30 },
    ]);

    expect(result.streak).toBe(1);
  });

  it('counts a short day as missed', () => {
    const result = rhythm([
      { dayKey: key(1), minutes: 29 },
      { dayKey: key(2), minutes: 30 },
    ]);

    expect(result.streak).toBe(0);
  });

  it('measures the streak against the plan, so raising it can break one', () => {
    const sessions = [
      { dayKey: key(1), minutes: 20 },
      { dayKey: key(2), minutes: 20 },
    ];

    expect(rhythm(sessions, 15).streak).toBe(2);
    expect(rhythm(sessions, 30).streak).toBe(0);
  });

  it('draws a seven-day strip, today first', () => {
    const result = rhythm([{ dayKey: key(3), minutes: 40 }]);

    expect(result.week).toHaveLength(7);
    expect(result.week[0]?.dayKey).toBe(key(0));
    expect(result.week[3]?.minutes).toBe(40);
    expect(result.week[3]?.metGoal).toBe(true);
    expect(result.minutesThisWeek).toBe(40);
  });

  it('ignores sittings older than the strip in the week total', () => {
    const result = rhythm([
      { dayKey: key(2), minutes: 30 },
      { dayKey: key(40), minutes: 200 },
    ]);

    expect(result.minutesThisWeek).toBe(30);
  });
});

describe('summariseBookProgress', () => {
  it('is pages over pages', () => {
    const progress = summariseBookProgress({ totalPages: 400, currentPage: 100 });

    expect(progress.completion).toBeCloseTo(0.25);
    expect(progress.pagesLeft).toBe(300);
    expect(progress.isFinished).toBe(false);
  });

  it('cannot exceed the book', () => {
    // A bookmark past the last page renders as 140% progress otherwise.
    const progress = summariseBookProgress({ totalPages: 100, currentPage: 140 });

    expect(progress.completion).toBe(1);
    expect(progress.pagesLeft).toBe(0);
    expect(progress.isFinished).toBe(true);
  });

  it('treats a finished date as finished, whatever the page says', () => {
    const progress = summariseBookProgress({
      totalPages: 300,
      currentPage: 12,
      finishedAt: new Date(),
    });

    expect(progress.isFinished).toBe(true);
  });

  it('survives a zero-page book rather than dividing by zero', () => {
    expect(summariseBookProgress({ totalPages: 0, currentPage: 0 }).completion).toBe(0);
  });
});

describe('estimatePace', () => {
  it('averages only the sittings that covered ground', () => {
    // A sitting lost to a phone call is a real evening, but averaging it in as
    // zero makes the estimate say "never" — the one answer it must not give.
    const pace = estimatePace({
      sessions: [
        { dayKey: key(1), minutes: 30, pagesRead: 20 },
        { dayKey: key(2), minutes: 30, pagesRead: 0 },
        { dayKey: key(3), minutes: 30, pagesRead: 30 },
      ],
      pagesLeft: 100,
    });

    expect(pace.pagesPerSession).toBe(25);
    expect(pace.sessionsLeft).toBe(4);
  });

  it('has no opinion without a productive sitting', () => {
    expect(estimatePace({ sessions: [], pagesLeft: 100 }).sessionsLeft).toBeNull();
    expect(
      estimatePace({
        sessions: [{ dayKey: key(1), minutes: 30, pagesRead: 0 }],
        pagesLeft: 100,
      }).sessionsLeft,
    ).toBeNull();
  });

  it('has nothing to estimate once the book is done', () => {
    expect(
      estimatePace({
        sessions: [{ dayKey: key(1), minutes: 30, pagesRead: 20 }],
        pagesLeft: 0,
      }).sessionsLeft,
    ).toBeNull();
  });
});

describe('describePace', () => {
  const pace = (pagesLeft: number, pagesRead: number) =>
    estimatePace({ sessions: [{ dayKey: key(1), minutes: 30, pagesRead }], pagesLeft });

  it('celebrates rather than estimates when the book is finished', () => {
    const progress = summariseBookProgress({ totalPages: 100, currentPage: 100 });
    expect(describePace(progress, pace(0, 20))).toContain('تمامش کردی');
  });

  it('asks for a first session instead of inventing a pace', () => {
    const progress = summariseBookProgress({ totalPages: 300, currentPage: 0 });
    expect(describePace(progress, estimatePace({ sessions: [], pagesLeft: 300 }))).toContain(
      'اولین نشست',
    );
  });

  it('names the next small distance, in Persian digits', () => {
    const progress = summariseBookProgress({ totalPages: 300, currentPage: 200 });
    const line = describePace(progress, pace(100, 25));

    expect(line).toContain('۴');
    expect(line).toContain('۱۰۰');
    expect(line).not.toMatch(/[0-9]/);
  });

  it('says "one more" rather than "۱ نشست دیگر"', () => {
    const progress = summariseBookProgress({ totalPages: 300, currentPage: 290 });
    expect(describePace(progress, pace(10, 25))).toBe('یک نشست دیگر و تمام است.');
  });
});

describe('sortShelf', () => {
  it('puts what you are reading above what you have read', () => {
    const shelf = sortShelf([
      { id: 'done-old', finishedAt: '2026-01-01T00:00:00Z', createdAt: '2025-01-01T00:00:00Z' },
      { id: 'open-old', finishedAt: null, createdAt: '2025-06-01T00:00:00Z' },
      { id: 'done-new', finishedAt: '2026-08-01T00:00:00Z', createdAt: '2025-02-01T00:00:00Z' },
      { id: 'open-new', finishedAt: null, createdAt: '2026-09-01T00:00:00Z' },
    ]);

    expect(shelf.map((book) => book.id)).toEqual(['open-new', 'open-old', 'done-new', 'done-old']);
  });

  it('does not mutate its input', () => {
    const books = [
      { id: 'a', finishedAt: '2026-01-01T00:00:00Z', createdAt: '2025-01-01T00:00:00Z' },
      { id: 'b', finishedAt: null, createdAt: '2025-01-01T00:00:00Z' },
    ];

    sortShelf(books);
    expect(books[0]?.id).toBe('a');
  });
});

describe('minuteChoices', () => {
  it('always contains the plan itself', () => {
    for (const minutes of [15, 30, 60]) {
      expect(minuteChoices(minutes)).toContain(minutes);
    }
  });

  it('offers a shorter and a longer neighbour', () => {
    expect(minuteChoices(30)).toEqual([20, 30, 45]);
    expect(minuteChoices(15)).toEqual([10, 15, 20]);
  });

  it('does not run off either end of the steps', () => {
    expect(minuteChoices(5)).toEqual([5, 10]);
    expect(minuteChoices(90)).toEqual([60, 90]);
  });

  it('gives a plan the steps do not contain its own chip', () => {
    // A plan written before the durations were narrowed still has to be
    // selectable, or the sheet opens with nothing chosen.
    expect(minuteChoices(17)).toContain(17);
  });

  it('is sorted and free of duplicates', () => {
    const choices = minuteChoices(20);

    expect([...choices].sort((left, right) => left - right)).toEqual(choices);
    expect(new Set(choices).size).toBe(choices.length);
  });
});
