import type { Habit } from '@prisma/client';

import { toHabitDto } from '../api/dto';
import type { ScopedPrisma } from '../db/rls';
import { toUtcDateKey } from '../date/jalali';
import { evaluateStreak, type StreakResult } from './streak-engine';
import type { HabitDto } from '@/types/domain';

/**
 * Habit read model.
 *
 * Streaks are evaluated rather than read: the stored `current_streak` is a cache
 * the nightly cron maintains, and between midnight and the cron run it is stale
 * by construction. Evaluating from the logs on read costs one indexed query per
 * habit set and removes a whole class of "my streak reset itself" reports.
 *
 * The lookback window is bounded so that a three-year-old habit does not drag
 * three years of logs into memory to render one card.
 */

const LOOKBACK_DAYS = 120;

export interface HabitWithStreak {
  habit: Habit;
  streak: StreakResult;
  dto: HabitDto;
}

export async function loadHabitsWithStreaks(
  db: ScopedPrisma,
  options: {
    userId: string;
    timezone: string;
    dayStartHour: number;
    now?: Date;
    includeArchived?: boolean;
    habitIds?: string[];
  },
): Promise<HabitWithStreak[]> {
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);

  const habits = await db.habit.findMany({
    where: {
      userId: options.userId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
      ...(options.habitIds ? { id: { in: options.habitIds } } : {}),
    },
    orderBy: { createdAt: 'asc' },
  });

  if (habits.length === 0) return [];

  const logs = await db.habitLog.findMany({
    where: {
      userId: options.userId,
      habitId: { in: habits.map((habit) => habit.id) },
      logDate: { gte: toUtcDateKey(since, options.timezone, options.dayStartHour) },
    },
    select: { habitId: true, logDate: true, count: true },
  });

  const logsByHabit = new Map<string, Array<{ logDate: Date; count: number }>>();
  for (const log of logs) {
    const bucket = logsByHabit.get(log.habitId) ?? [];
    bucket.push({ logDate: log.logDate, count: log.count });
    logsByHabit.set(log.habitId, bucket);
  }

  return habits.map((habit) => {
    const streak = evaluateStreak({
      frequency: habit.frequency,
      targetPerDay: habit.targetPerDay,
      graceDaysAllowed: habit.graceDaysAllowed,
      logs: logsByHabit.get(habit.id) ?? [],
      timezone: options.timezone,
      dayStartHour: options.dayStartHour,
      now,
      createdAt: habit.createdAt,
      maxLookbackDays: LOOKBACK_DAYS,
    });

    return { habit, streak, dto: toHabitDto(habit, streak) };
  });
}

/** Single-habit variant, for the routes that mutate one row and return it. */
export async function loadHabitWithStreak(
  db: ScopedPrisma,
  options: {
    habitId: string;
    userId: string;
    timezone: string;
    dayStartHour: number;
    now?: Date;
  },
): Promise<HabitWithStreak | null> {
  const [result] = await loadHabitsWithStreaks(db, {
    userId: options.userId,
    timezone: options.timezone,
    dayStartHour: options.dayStartHour,
    now: options.now,
    includeArchived: true,
    habitIds: [options.habitId],
  });

  return result ?? null;
}
