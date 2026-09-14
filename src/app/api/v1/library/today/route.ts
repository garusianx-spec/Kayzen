import { toBookDto, toReadingLogDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { formatCurriculumCaption, summariseReadingProgress } from '@/lib/domain/books-365';
import { resolveDailyAssignment } from '@/lib/domain/library';
import type { BookDto, ReadingLogDto } from '@/types/domain';

/**
 * `GET /api/v1/library/today` — the day's micro-summary and the user's progress.
 *
 * The day number is a function of *enrolment*, not of the calendar: somebody who
 * joins in اسفند still starts at day ۱.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface TodayLibraryResponse {
  dayNumber: number;
  caption: string;
  book: BookDto | null;
  readingLog: ReadingLogDto | null;
  progress: {
    booksRead: number;
    currentStreak: number;
    completion: number;
    missedDayNumbers: number[];
  };
}

export const GET = withAuthedRoute<undefined, undefined, TodayLibraryResponse>({
  rateLimit: 'read',
  handler: async ({ user, db }) => {
    const account = await db.user.findUniqueOrThrow({ where: { id: user.id } });

    const assignment = await resolveDailyAssignment(db, {
      enrolledAt: account.enrolledAt,
      timezone: user.timezone,
      dayStartHour: user.dayStartHour,
    });

    const logs = await db.userReadingLog.findMany({
      where: { userId: user.id, readAt: { not: null } },
      select: { dayNumber: true },
    });

    const todayLog = assignment.book
      ? await db.userReadingLog.findUnique({
          where: { userId_bookId: { userId: user.id, bookId: assignment.book.id } },
        })
      : null;

    return {
      dayNumber: assignment.position.dayNumber,
      caption: formatCurriculumCaption(assignment.position),
      book: assignment.book
        ? toBookDto(assignment.book, { isReviewDay: assignment.isReviewDay })
        : null,
      readingLog: todayLog ? toReadingLogDto(todayLog) : null,
      progress: summariseReadingProgress({
        position: assignment.position,
        readDayNumbers: logs.map((log) => log.dayNumber),
      }),
    };
  },
});
