import { toBookDto, toReadingLogDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { CURRICULUM_LENGTH } from '@/lib/domain/books-365';
import { resolveBookForDay } from '@/lib/domain/library';
import { ApiError } from '@/lib/errors';
import type { BookDto, ReadingLogDto } from '@/types/domain';
import { z } from 'zod';

/** `GET /api/v1/library/:day` — one entry from the curriculum. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const daySchema = z.coerce.number().int().min(1).max(CURRICULUM_LENGTH);

export const GET = withAuthedRoute<
  undefined,
  undefined,
  { book: BookDto; readingLog: ReadingLogDto | null }
>({
  rateLimit: 'read',
  handler: async ({ params, user, db }) => {
    const dayNumber = daySchema.parse(params.day);

    const { book, isReviewDay } = await resolveBookForDay(db, dayNumber);
    if (!book) throw ApiError.notFound('خلاصهٔ این روز هنوز آماده نیست.');

    const log = await db.userReadingLog.findUnique({
      where: { userId_bookId: { userId: user.id, bookId: book.id } },
    });

    return {
      book: toBookDto(book, { isReviewDay }),
      readingLog: log ? toReadingLogDto(log) : null,
    };
  },
});
