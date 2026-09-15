import { toReadingLogDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { CURRICULUM_LENGTH } from '@/lib/domain/books-365';
import { resolveBookForDay } from '@/lib/domain/library';
import { POINTS_FOR_READING } from '@/lib/domain/points';
import { ApiError } from '@/lib/errors';
import { upsertReadingLogSchema, type UpsertReadingLogInput } from '@/lib/validation/schemas';
import type { ReadingLogDto } from '@/types/domain';
import { z } from 'zod';

/**
 * `PUT /api/v1/library/:day/log` — record a reading and its reflection.
 *
 * Idempotent: re-saving a reflection updates the row and pays nothing. Points
 * are awarded exactly once, on the transition from unread to read.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const daySchema = z.coerce.number().int().min(1).max(CURRICULUM_LENGTH);

interface ReadingLogResponse {
  readingLog: ReadingLogDto;
  pointsAwarded: number;
  totalPoints: number;
}

export const PUT = withAuthedRoute<UpsertReadingLogInput, undefined, ReadingLogResponse>({
  bodySchema: upsertReadingLogSchema,
  rateLimit: 'mutation',
  handler: async ({ body, params, user, db }) => {
    const dayNumber = daySchema.parse(params.day);

    const { book } = await resolveBookForDay(db, dayNumber);
    if (!book) throw ApiError.notFound('خلاصهٔ این روز هنوز آماده نیست.');

    const existing = await db.userReadingLog.findUnique({
      where: { userId_bookId: { userId: user.id, bookId: book.id } },
    });

    const firstRead = body.markRead && !existing?.readAt;
    const readAt = body.markRead ? (existing?.readAt ?? new Date()) : null;

    const log = await db.userReadingLog.upsert({
      where: { userId_bookId: { userId: user.id, bookId: book.id } },
      create: {
        userId: user.id,
        bookId: book.id,
        dayNumber: book.dayNumber,
        readAt,
        reflection: body.reflection ?? null,
        highlights: body.highlights,
        rating: body.rating ?? null,
      },
      update: {
        readAt,
        ...(body.reflection !== undefined ? { reflection: body.reflection } : {}),
        ...(body.highlights.length ? { highlights: body.highlights } : {}),
        ...(body.rating !== undefined ? { rating: body.rating } : {}),
      },
    });

    const pointsAwarded = firstRead ? POINTS_FOR_READING : 0;
    const account = pointsAwarded
      ? await db.user.update({
          where: { id: user.id },
          data: { points: { increment: pointsAwarded } },
        })
      : await db.user.findUniqueOrThrow({ where: { id: user.id } });

    return { readingLog: toReadingLogDto(log), pointsAwarded, totalPoints: account.points };
  },
});
