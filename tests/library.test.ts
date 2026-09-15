import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CURRICULUM_LENGTH,
  formatCurriculumCaption,
  resolveCurriculumPosition,
  summariseReadingProgress,
} from '@/lib/domain/books-365';
import { resetCatalogueSizeCache, resolveBookForDay } from '@/lib/domain/library';
import type { ScopedPrisma } from '@/lib/db/rls';

const TEHRAN = 'Asia/Tehran';

describe('resolveCurriculumPosition', () => {
  it('starts every user at day 1 on the day they enrol', () => {
    const enrolledAt = new Date('2024-09-14T09:00:00Z');
    const position = resolveCurriculumPosition({ enrolledAt, now: enrolledAt, timezone: TEHRAN });

    expect(position.dayNumber).toBe(1);
    expect(position.daysEnrolled).toBe(0);
    expect(position.cycle).toBe(0);
  });

  it('advances with the calendar, not with visits', () => {
    const enrolledAt = new Date('2024-09-14T09:00:00Z');
    const now = new Date('2024-10-07T09:00:00Z'); // 23 days later

    expect(resolveCurriculumPosition({ enrolledAt, now, timezone: TEHRAN }).dayNumber).toBe(24);
  });

  it('wraps into a second cycle after a full year', () => {
    const enrolledAt = new Date('2024-09-14T09:00:00Z');
    const now = new Date(enrolledAt.getTime() + CURRICULUM_LENGTH * 86_400_000);
    const position = resolveCurriculumPosition({ enrolledAt, now, timezone: TEHRAN });

    expect(position.dayNumber).toBe(1);
    expect(position.cycle).toBe(1);
    expect(position.isNewCycle).toBe(true);
  });

  it('never returns day 0 for a back-dated enrolment', () => {
    const now = new Date('2024-09-14T09:00:00Z');
    const enrolledAt = new Date('2024-09-20T09:00:00Z'); // clock skew

    expect(resolveCurriculumPosition({ enrolledAt, now, timezone: TEHRAN }).dayNumber).toBe(1);
  });
});

describe('summariseReadingProgress', () => {
  const position = { dayNumber: 10, daysEnrolled: 9, cycle: 0, isNewCycle: false };

  it('counts a streak backwards, treating an unread today as in progress', () => {
    const progress = summariseReadingProgress({
      position,
      readDayNumbers: [7, 8, 9],
    });

    expect(progress.currentStreak).toBe(3);
    expect(progress.booksRead).toBe(3);
  });

  it('lists the days still open for catch-up', () => {
    const progress = summariseReadingProgress({
      position,
      readDayNumbers: [1, 2, 5],
    });

    expect(progress.missedDayNumbers).toEqual([3, 4, 6, 7, 8, 9]);
  });

  it('caps the catch-up list', () => {
    const progress = summariseReadingProgress({
      position: { dayNumber: 100, daysEnrolled: 99, cycle: 0, isNewCycle: false },
      readDayNumbers: [],
      missedLimit: 3,
    });

    expect(progress.missedDayNumbers).toHaveLength(3);
  });
});

describe('formatCurriculumCaption', () => {
  it('names the day and the cycle', () => {
    expect(
      formatCurriculumCaption({ dayNumber: 24, daysEnrolled: 23, cycle: 0, isNewCycle: false }),
    ).toBe('روز 24 از 365');
    expect(
      formatCurriculumCaption({ dayNumber: 3, daysEnrolled: 368, cycle: 1, isNewCycle: false }),
    ).toBe('روز 3 از 365 · دور 2');
  });
});

describe('resolveBookForDay', () => {
  const seeded = [1, 2, 3].map((dayNumber) => ({ id: `book-${dayNumber}`, dayNumber }));

  function fakeDb(): ScopedPrisma {
    return {
      book365: {
        findUnique: vi.fn(
          async ({ where }: { where: { dayNumber: number } }) =>
            seeded.find((book) => book.dayNumber === where.dayNumber) ?? null,
        ),
        count: vi.fn(async () => seeded.length),
      },
    } as unknown as ScopedPrisma;
  }

  beforeEach(() => resetCatalogueSizeCache());

  it('returns the curated entry when one exists', async () => {
    const result = await resolveBookForDay(fakeDb(), 2);

    expect(result.book?.dayNumber).toBe(2);
    expect(result.isReviewDay).toBe(false);
  });

  it('wraps an uncurated day onto an earlier summary as a review day', async () => {
    // Day 5 with three curated entries wraps to ((5 - 1) % 3) + 1 = 2.
    const result = await resolveBookForDay(fakeDb(), 5);

    expect(result.book?.dayNumber).toBe(2);
    expect(result.isReviewDay).toBe(true);
  });

  it('clamps out-of-range days into the curriculum', async () => {
    await expect(resolveBookForDay(fakeDb(), 0)).resolves.toMatchObject({ book: { dayNumber: 1 } });
    await expect(resolveBookForDay(fakeDb(), 9_999)).resolves.toMatchObject({
      isReviewDay: true,
    });
  });

  it('returns nothing when the catalogue is empty', async () => {
    const emptyDb = {
      book365: { findUnique: vi.fn(async () => null), count: vi.fn(async () => 0) },
    } as unknown as ScopedPrisma;

    await expect(resolveBookForDay(emptyDb, 1)).resolves.toEqual({
      book: null,
      isReviewDay: false,
    });
  });
});
