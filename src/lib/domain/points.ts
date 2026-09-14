import type { TaskDifficulty } from '@prisma/client';

/**
 * Point economy.
 *
 * Points exist to make micro-improvements legible, not to gamify the app into a
 * slot machine, so the curve is intentionally flat: the difference between the
 * easiest and hardest task is 5×, and streak bonuses cap out quickly.
 */

const DIFFICULTY_POINTS: Record<TaskDifficulty, number> = {
  TRIVIAL: 2,
  EASY: 5,
  MEDIUM: 10,
  HARD: 20,
  EPIC: 35,
};

/** Priority 1 (critical) is worth a 50% premium; priority 4 no premium at all. */
const PRIORITY_MULTIPLIER: Record<number, number> = {
  1: 1.5,
  2: 1.25,
  3: 1,
  4: 0.75,
};

export function pointsForTask(options: {
  difficulty: TaskDifficulty;
  priority: number;
  /** Completed before the due date earns a small punctuality bonus. */
  completedOnTime?: boolean;
}): number {
  const base = DIFFICULTY_POINTS[options.difficulty];
  const multiplier = PRIORITY_MULTIPLIER[options.priority] ?? 1;
  const punctuality = options.completedOnTime ? 1.1 : 1;

  return Math.round(base * multiplier * punctuality);
}

/**
 * Points for checking off a habit.
 *
 * The streak bonus grows logarithmically and is capped at 2×, so day 400 is
 * worth roughly what day 60 is — the reward for a long streak is the streak.
 */
export function pointsForHabit(streakAfterCheck: number): number {
  const base = 8;
  const bonus = Math.min(1, Math.log10(Math.max(1, streakAfterCheck)) / 2);
  return Math.round(base * (1 + bonus));
}

export const POINTS_FOR_READING = 15;
export const POINTS_FOR_POMODORO = 12;

export interface LevelInfo {
  level: number;
  pointsIntoLevel: number;
  pointsForNextLevel: number;
  progress: number;
  title: string;
}

/** Persian rank titles, chosen to read as craft mastery rather than combat ranks. */
const LEVEL_TITLES = [
  'نوآموز',
  'کوشا',
  'پیگیر',
  'منظم',
  'استوار',
  'چیره‌دست',
  'سرآمد',
  'استاد',
] as const;

/**
 * Level curve: level *n* starts at `50 · n · (n − 1) / 2` points, i.e. each level
 * costs 50 more than the one before. Level 1 → 2 is 50 points, 9 → 10 is 450.
 */
export function levelFromPoints(points: number): LevelInfo {
  const safePoints = Math.max(0, points);

  let level = 1;
  let threshold = 0;
  let step = 50;

  while (safePoints >= threshold + step) {
    threshold += step;
    level += 1;
    step += 50;
  }

  return {
    level,
    pointsIntoLevel: safePoints - threshold,
    pointsForNextLevel: step,
    progress: step === 0 ? 0 : (safePoints - threshold) / step,
    title: LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, Math.floor((level - 1) / 3))] ?? 'نوآموز',
  };
}
