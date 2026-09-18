import type { Book365, ReadingPlan } from '@prisma/client';

import type { ScopedPrisma } from '../db/rls';
import { CURRICULUM_LENGTH, resolveCurriculumPosition, type CurriculumPosition } from './books-365';

/**
 * Which micro-summary a user gets today.
 *
 * The catalogue is curated by hand, so it grows over time rather than arriving
 * complete. A day with no curated entry becomes a **review day**: it re-surfaces
 * an earlier summary, wrapped around the seeded range. That is a better product
 * answer than an empty screen — spaced repetition is the point of the library —
 * and it keeps the curriculum a total function of the day number.
 */

export interface DailyAssignment {
  position: CurriculumPosition;
  book: Book365 | null;
  /** True when the curated entry for this day does not exist yet. */
  isReviewDay: boolean;
}

/** Cached catalogue size; the seeded count changes only on deploy. */
let cachedCatalogueSize: { value: number; readAt: number } | null = null;
const CATALOGUE_TTL_MS = 5 * 60 * 1000;

export async function catalogueSize(db: ScopedPrisma): Promise<number> {
  if (cachedCatalogueSize && Date.now() - cachedCatalogueSize.readAt < CATALOGUE_TTL_MS) {
    return cachedCatalogueSize.value;
  }

  const value = await db.book365.count();
  cachedCatalogueSize = { value, readAt: Date.now() };
  return value;
}

/** Test-only: drops the memoised catalogue size. */
export function resetCatalogueSizeCache(): void {
  cachedCatalogueSize = null;
}

export async function resolveBookForDay(
  db: ScopedPrisma,
  dayNumber: number,
): Promise<{ book: Book365 | null; isReviewDay: boolean }> {
  const clamped = Math.min(CURRICULUM_LENGTH, Math.max(1, Math.trunc(dayNumber)));

  const exact = await db.book365.findUnique({ where: { dayNumber: clamped } });
  if (exact) return { book: exact, isReviewDay: false };

  const size = await catalogueSize(db);
  if (size === 0) return { book: null, isReviewDay: false };

  const reviewDay = ((clamped - 1) % size) + 1;
  const book = await db.book365.findUnique({ where: { dayNumber: reviewDay } });

  return { book, isReviewDay: book !== null };
}

export async function resolveDailyAssignment(
  db: ScopedPrisma,
  options: { enrolledAt: Date; now?: Date; timezone: string; dayStartHour: number },
): Promise<DailyAssignment> {
  const position = resolveCurriculumPosition({
    enrolledAt: options.enrolledAt,
    now: options.now,
    timezone: options.timezone,
    dayStartHour: options.dayStartHour,
  });

  const { book, isReviewDay } = await resolveBookForDay(db, position.dayNumber);
  return { position, book, isReviewDay };
}

/**
 * The account's reading plan, created on first sight.
 *
 * Lazily rather than at sign-up: a plan row is a record that somebody has
 * opened the Reading Hub and been offered a commitment, and writing one for
 * every account at registration would make "has a plan" useless as a signal —
 * and would bake today's defaults into accounts that never asked for them.
 */
export async function ensureReadingPlan(db: ScopedPrisma, userId: string): Promise<ReadingPlan> {
  return db.readingPlan.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}
