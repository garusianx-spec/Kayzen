import { toBookDto, toCountdownDto, toReadingLogDto, toTaskDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { formatFullJalaliDate, toJalaliDayKey, toUtcDateKey } from '@/lib/date/jalali';
import { loadHabitsWithStreaks } from '@/lib/domain/habits';
import { resolveDailyAssignment } from '@/lib/domain/library';
import type { TodaySnapshotDto } from '@/types/domain';

/**
 * `GET /api/v1/today` — everything the home screen draws, in one round trip.
 *
 * The Today screen is the app's cold-start surface and the one most likely to be
 * opened on a bad connection, so it is deliberately a single request: one
 * response to cache, one response to replay from the service worker, and no
 * waterfall of five endpoints that can each fail separately.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuthedRoute<undefined, undefined, TodaySnapshotDto>({
  rateLimit: 'read',
  handler: async ({ user, db }) => {
    const now = new Date();
    const timezone = user.timezone;
    const dayStartHour = user.dayStartHour;
    const dayKey = toJalaliDayKey(now, timezone, dayStartHour);
    const dayStart = toUtcDateKey(now, timezone, dayStartHour);

    const account = await db.user.findUniqueOrThrow({ where: { id: user.id } });

    const [tasks, habits, countdowns, assignment, focusSessions] = await Promise.all([
      db.task.findMany({
        where: {
          userId: user.id,
          OR: [
            { dueJalali: dayKey },
            // Anything still open and overdue belongs on today's list too;
            // hiding it until the user goes looking is how tasks get forgotten.
            { dueAt: { lt: now }, status: { in: ['PENDING', 'IN_PROGRESS'] } },
            { dueAt: null, status: { in: ['PENDING', 'IN_PROGRESS'] } },
          ],
        },
        orderBy: [{ status: 'asc' }, { priority: 'asc' }, { position: 'asc' }],
        take: 50,
      }),
      loadHabitsWithStreaks(db, { userId: user.id, timezone, dayStartHour, now }),
      db.countdownEvent.findMany({
        where: { userId: user.id, eventAt: { gte: dayStart } },
        orderBy: { eventAt: 'asc' },
        take: 5,
      }),
      resolveDailyAssignment(db, { enrolledAt: account.enrolledAt, timezone, dayStartHour, now }),
      db.pomodoroSession.findMany({
        where: {
          userId: user.id,
          mode: 'FOCUS',
          completed: true,
          startedAt: { gte: dayStart },
        },
        select: { durationSeconds: true },
      }),
    ]);

    const readingLog = assignment.book
      ? await db.userReadingLog.findUnique({
          where: { userId_bookId: { userId: user.id, bookId: assignment.book.id } },
        })
      : null;

    const dueHabits = habits.filter((entry) => entry.streak.isDueToday);

    return {
      jalaliDayKey: dayKey,
      jalaliLabel: formatFullJalaliDate(now, timezone),
      tasks: tasks.map((task) => toTaskDto(task, now)),
      habits: habits.map((entry) => entry.dto),
      countdowns: countdowns.map((event) => toCountdownDto(event, { now, timezone, dayStartHour })),
      book: assignment.book
        ? toBookDto(assignment.book, { isReviewDay: assignment.isReviewDay })
        : null,
      readingLog: readingLog ? toReadingLogDto(readingLog) : null,
      stats: {
        tasksCompleted: tasks.filter((task) => task.status === 'COMPLETED').length,
        tasksTotal: tasks.length,
        habitsCompleted: dueHabits.filter((entry) => entry.streak.isCompletedToday).length,
        habitsDue: dueHabits.length,
        focusMinutes: Math.round(
          focusSessions.reduce((total, session) => total + session.durationSeconds, 0) / 60,
        ),
        points: account.points,
      },
    };
  },
});
