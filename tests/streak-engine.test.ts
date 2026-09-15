import { describe, expect, it } from 'vitest';

import { toUtcDateKey } from '@/lib/date/jalali';
import {
  evaluateStreak,
  isScheduledOn,
  reconcileHabit,
  streakLabel,
  streakTier,
} from '@/lib/domain/streak-engine';
import { levelFromPoints, pointsForHabit, pointsForTask } from '@/lib/domain/points';

const TEHRAN = 'Asia/Tehran';
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/** Log for `offset` days before `now`, in the user's calendar. */
function logFor(now: Date, offset: number, count = 1) {
  const day = toUtcDateKey(new Date(now.getTime() - offset * 86_400_000), TEHRAN);
  return { logDate: day, count };
}

describe('evaluateStreak', () => {
  const now = new Date('2024-09-14T09:00:00Z');

  it('counts consecutive completed days', () => {
    const result = evaluateStreak({
      frequency: EVERY_DAY,
      targetPerDay: 1,
      graceDaysAllowed: 0,
      logs: [logFor(now, 0), logFor(now, 1), logFor(now, 2)],
      timezone: TEHRAN,
      now,
    });

    expect(result.currentStreak).toBe(3);
    expect(result.isCompletedToday).toBe(true);
  });

  it('does not break the streak on an unfinished today', () => {
    // The day is still in progress; zeroing the streak at 00:01 is the bug this
    // rule exists to prevent.
    const result = evaluateStreak({
      frequency: EVERY_DAY,
      targetPerDay: 1,
      graceDaysAllowed: 0,
      logs: [logFor(now, 1), logFor(now, 2)],
      timezone: TEHRAN,
      now,
    });

    expect(result.currentStreak).toBe(2);
    expect(result.isCompletedToday).toBe(false);
  });

  it('spends a grace day to survive one miss', () => {
    const result = evaluateStreak({
      frequency: EVERY_DAY,
      targetPerDay: 1,
      graceDaysAllowed: 1,
      logs: [logFor(now, 0), logFor(now, 1), logFor(now, 3), logFor(now, 4)],
      timezone: TEHRAN,
      now,
    });

    expect(result.graceDaysUsed).toBe(1);
    expect(result.currentStreak).toBe(4);
  });

  it('breaks once the grace budget is spent', () => {
    const result = evaluateStreak({
      frequency: EVERY_DAY,
      targetPerDay: 1,
      graceDaysAllowed: 0,
      logs: [logFor(now, 0), logFor(now, 2), logFor(now, 3)],
      timezone: TEHRAN,
      now,
    });

    expect(result.currentStreak).toBe(1);
  });

  it('ignores days the habit is not scheduled on', () => {
    // شنبه (0) and دوشنبه (2) only. 2024-09-14 is a Saturday.
    const result = evaluateStreak({
      frequency: [0, 2],
      targetPerDay: 1,
      graceDaysAllowed: 0,
      logs: [logFor(now, 0), logFor(now, 5)],
      timezone: TEHRAN,
      now,
    });

    // The five unscheduled days in between are not misses.
    expect(result.currentStreak).toBe(2);
  });

  it('requires the full daily target before a day counts', () => {
    const partial = evaluateStreak({
      frequency: EVERY_DAY,
      targetPerDay: 3,
      graceDaysAllowed: 0,
      logs: [logFor(now, 0, 2)],
      timezone: TEHRAN,
      now,
    });

    expect(partial.isCompletedToday).toBe(false);
    expect(partial.todayCount).toBe(2);

    const complete = evaluateStreak({
      frequency: EVERY_DAY,
      targetPerDay: 3,
      graceDaysAllowed: 0,
      logs: [logFor(now, 0, 3)],
      timezone: TEHRAN,
      now,
    });

    expect(complete.isCompletedToday).toBe(true);
  });

  it('reports a completion rate over the trailing 30 days', () => {
    const logs = Array.from({ length: 15 }, (_, index) => logFor(now, index));

    const result = evaluateStreak({
      frequency: EVERY_DAY,
      targetPerDay: 1,
      graceDaysAllowed: 0,
      logs,
      timezone: TEHRAN,
      now,
    });

    expect(result.completionRate).toBeCloseTo(0.5, 1);
  });

  it('never counts days before the habit existed', () => {
    const result = evaluateStreak({
      frequency: EVERY_DAY,
      targetPerDay: 1,
      graceDaysAllowed: 3,
      logs: [logFor(now, 0)],
      timezone: TEHRAN,
      now,
      createdAt: new Date(now.getTime() - 86_400_000),
    });

    expect(result.currentStreak).toBe(1);
  });
});

describe('isScheduledOn', () => {
  it('matches Persian weekday indices', () => {
    const saturday = toUtcDateKey(new Date('2024-09-14T09:00:00Z'), TEHRAN);

    expect(isScheduledOn(saturday, [0])).toBe(true);
    expect(isScheduledOn(saturday, [1, 2])).toBe(false);
    expect(isScheduledOn(saturday, [])).toBe(false);
  });
});

describe('reconcileHabit', () => {
  const evaluated = {
    currentStreak: 5,
    longestStreak: 5,
    graceDaysUsed: 1,
    lastCompletedOn: null,
    isDueToday: true,
    isCompletedToday: true,
    todayCount: 1,
    completionRate: 1,
  };

  it('returns null when nothing changed, so the cron writes nothing', () => {
    expect(
      reconcileHabit({ currentStreak: 5, longestStreak: 5, graceDaysUsed: 1 }, evaluated),
    ).toBeNull();
  });

  it('never lowers the recorded longest streak', () => {
    const next = reconcileHabit(
      { currentStreak: 2, longestStreak: 9, graceDaysUsed: 0 },
      evaluated,
    );

    expect(next).not.toBeNull();
    expect(next?.longestStreak).toBe(9);
    expect(next?.currentStreak).toBe(5);
  });
});

describe('streak presentation', () => {
  it('escalates the tier with the streak', () => {
    expect(streakTier(0)).toBe('none');
    expect(streakTier(2)).toBe('spark');
    expect(streakTier(5)).toBe('flame');
    expect(streakTier(20)).toBe('blaze');
    expect(streakTier(65)).toBe('inferno');
    expect(streakTier(100)).toBe('legend');
  });

  it('labels the badge in Persian', () => {
    expect(streakLabel(0)).toBe('شروع کن');
    expect(streakLabel(7)).toBe('۷ روز پیاپی');
  });
});

describe('points', () => {
  it('scales a task by difficulty and priority', () => {
    const trivialSomeday = pointsForTask({ difficulty: 'TRIVIAL', priority: 4 });
    const epicCritical = pointsForTask({ difficulty: 'EPIC', priority: 1 });

    expect(trivialSomeday).toBeLessThan(epicCritical);
    expect(pointsForTask({ difficulty: 'MEDIUM', priority: 3 })).toBe(10);
    expect(pointsForTask({ difficulty: 'MEDIUM', priority: 3, completedOnTime: true })).toBe(11);
  });

  it('caps the habit streak bonus so late days do not run away', () => {
    const early = pointsForHabit(1);
    const late = pointsForHabit(400);

    expect(late).toBeGreaterThan(early);
    expect(late).toBeLessThanOrEqual(early * 2);
  });

  it('produces a level curve that gets harder', () => {
    expect(levelFromPoints(0).level).toBe(1);
    expect(levelFromPoints(50).level).toBe(2);
    expect(levelFromPoints(150).level).toBe(3);
    expect(levelFromPoints(0).title).toBe('نوآموز');
    expect(levelFromPoints(10_000).progress).toBeGreaterThanOrEqual(0);
  });
});
