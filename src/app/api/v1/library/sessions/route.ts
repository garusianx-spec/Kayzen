import { toUserBookDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { toJalaliDayKey } from '@/lib/date/jalali';
import { recentDayKeys, summariseRhythm } from '@/lib/domain/reading-plan';
import { ensureReadingPlan } from '@/lib/domain/library';
import { ApiError } from '@/lib/errors';
import { logReadingSessionSchema, type LogReadingSessionInput } from '@/lib/validation/schemas';
import type { ReadingRhythmDto, UserBookDto } from '@/types/domain';

/**
 * `POST /api/v1/library/sessions` — "I read for a while."
 *
 * The body says how long, and — in full-book mode — what page the reader got
 * to. The *delta* is computed here rather than sent, so two sittings logged out
 * of order cannot inflate the total, and a reader who re-reads twenty pages
 * does not record negative progress.
 *
 * The response carries the recomputed rhythm so the ring, the streak and the
 * week strip all move in one round trip instead of three.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RHYTHM_WINDOW_DAYS = 400;

interface LogSessionResponse {
  rhythm: ReadingRhythmDto;
  /** The book the session advanced, when there was one. */
  book: UserBookDto | null;
}

export const POST = withAuthedRoute<LogReadingSessionInput, undefined, LogSessionResponse>({
  bodySchema: logReadingSessionSchema,
  rateLimit: 'mutation',
  handler: async ({ body, user, db }) => {
    const plan = await ensureReadingPlan(db, user.id);
    const dayKey = toJalaliDayKey(new Date(), user.timezone, user.dayStartHour);

    let book = body.bookId ? await db.userBook.findUnique({ where: { id: body.bookId } }) : null;

    if (body.bookId && !book) throw ApiError.notFound('این کتاب در قفسه‌ات نیست.');

    let pagesRead = 0;

    if (book && body.toPage !== undefined) {
      if (body.toPage > book.totalPages) {
        throw ApiError.unprocessable('این صفحه از آخرین صفحهٔ کتاب جلوتر است.', {
          toPage: ['شمارهٔ صفحه از کل صفحه‌های کتاب بیشتر است.'],
        });
      }

      pagesRead = Math.max(0, body.toPage - book.currentPage);

      book = await db.userBook.update({
        where: { id: book.id },
        data: {
          // Never backwards: a reader flicking back to re-read a chapter is
          // not undoing the progress they already made.
          currentPage: Math.max(book.currentPage, body.toPage),
          ...(body.toPage >= book.totalPages && book.finishedAt === null
            ? { finishedAt: new Date() }
            : {}),
        },
      });
    }

    await db.readingSession.create({
      data: {
        userId: user.id,
        bookId: book?.id ?? null,
        dayKey,
        minutes: body.minutes,
        pagesRead,
      },
    });

    const window = recentDayKeys({
      count: RHYTHM_WINDOW_DAYS,
      timezone: user.timezone,
      dayStartHour: user.dayStartHour,
    });

    const sessions = await db.readingSession.findMany({
      where: { userId: user.id, dayKey: { in: window } },
      select: { bookId: true, dayKey: true, minutes: true, pagesRead: true },
    });

    return {
      rhythm: summariseRhythm({
        sessions,
        dailyMinutes: plan.dailyMinutes,
        timezone: user.timezone,
        dayStartHour: user.dayStartHour,
      }),
      book: book
        ? toUserBookDto(
            book,
            sessions.filter((session) => session.bookId === book?.id),
          )
        : null,
    };
  },
});
