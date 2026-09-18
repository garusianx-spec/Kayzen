import { toReadingPlanDto, toUserBookDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { ensureReadingPlan } from '@/lib/domain/library';
import { recentDayKeys, sortShelf, summariseRhythm } from '@/lib/domain/reading-plan';
import type { ReadingPlanDto, ReadingRhythmDto, UserBookDto } from '@/types/domain';

/**
 * `GET /api/v1/library/hub` — everything above the fold of the Reading Hub.
 *
 * One request rather than three, for the same reason the Today screen has one:
 * the plan, the rhythm ring and the shelf are drawn together, and three
 * endpoints would give three chances for a half-rendered screen on a weak
 * connection.
 *
 * Sessions are fetched for the streak window only. A year of sittings is a few
 * hundred rows, which is cheap — but "all of them" grows without a ceiling, and
 * the streak cannot reach past the window anyway.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Long enough for any streak the header will ever print. */
const RHYTHM_WINDOW_DAYS = 400;

interface HubResponse {
  plan: ReadingPlanDto;
  rhythm: ReadingRhythmDto;
  books: UserBookDto[];
}

export const GET = withAuthedRoute<undefined, undefined, HubResponse>({
  rateLimit: 'read',
  handler: async ({ user, db }) => {
    const plan = await ensureReadingPlan(db, user.id);

    const window = recentDayKeys({
      count: RHYTHM_WINDOW_DAYS,
      timezone: user.timezone,
      dayStartHour: user.dayStartHour,
    });

    const [sessions, books] = await Promise.all([
      db.readingSession.findMany({
        where: { userId: user.id, dayKey: { in: window } },
        select: { bookId: true, dayKey: true, minutes: true, pagesRead: true },
      }),
      db.userBook.findMany({ where: { userId: user.id } }),
    ]);

    // Grouped once for the whole shelf: a per-book query would be one round
    // trip per row for data this request already holds.
    const byBook = new Map<string, typeof sessions>();
    for (const session of sessions) {
      if (!session.bookId) continue;
      const bucket = byBook.get(session.bookId);
      if (bucket) bucket.push(session);
      else byBook.set(session.bookId, [session]);
    }

    return {
      plan: toReadingPlanDto(plan),
      rhythm: summariseRhythm({
        sessions,
        dailyMinutes: plan.dailyMinutes,
        timezone: user.timezone,
        dayStartHour: user.dayStartHour,
      }),
      books: sortShelf(books).map((book) => toUserBookDto(book, byBook.get(book.id) ?? [])),
    };
  },
});
