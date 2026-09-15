import { withAuthedRoute } from '@/lib/api/handler';
import { toUtcDateKey } from '@/lib/date/jalali';
import { loadHabitWithStreak } from '@/lib/domain/habits';
import { pointsForHabit } from '@/lib/domain/points';
import { ApiError } from '@/lib/errors';
import { logHabitSchema, uuidSchema, type LogHabitInput } from '@/lib/validation/schemas';
import type { HabitDto } from '@/types/domain';

/**
 * `POST /api/v1/habits/:id/log` — check a habit off for a day.
 * `DELETE` — undo that day's log.
 *
 * The day is keyed by the *user's* calendar day (timezone + day-start hour),
 * normalised to a UTC midnight so `unique(habit_id, log_date)` stays meaningful.
 * Logging twice in one day increments the count rather than creating a second
 * row, which is what makes "۳ لیوان از ۸" work for multi-target habits.
 *
 * Points are awarded only when the log crosses the day's target, and only once
 * per day — the fourth glass of water does not pay again.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface LogResponse {
  habit: HabitDto;
  pointsAwarded: number;
  totalPoints: number;
  /** True when this log pushed the day over the habit's target. */
  completedToday: boolean;
}

export const POST = withAuthedRoute<LogHabitInput, undefined, LogResponse>({
  bodySchema: logHabitSchema,
  rateLimit: 'mutation',
  handler: async ({ body, params, user, db }) => {
    const habitId = uuidSchema.parse(params.id);
    const now = body.loggedAt ?? new Date();

    const habit = await db.habit.findUnique({ where: { id: habitId } });
    if (!habit) throw ApiError.notFound('عادت موردنظر پیدا نشد.');

    const logDate = toUtcDateKey(now, user.timezone, user.dayStartHour);

    const existingLog = await db.habitLog.findUnique({
      where: { habitId_logDate: { habitId, logDate } },
    });

    const previousCount = existingLog?.count ?? 0;
    const nextCount = previousCount + body.count;
    const crossedTarget = previousCount < habit.targetPerDay && nextCount >= habit.targetPerDay;

    await db.habitLog.upsert({
      where: { habitId_logDate: { habitId, logDate } },
      create: {
        habitId,
        userId: user.id,
        logDate,
        count: body.count,
        note: body.note ?? null,
      },
      update: {
        count: nextCount,
        ...(body.note ? { note: body.note } : {}),
      },
    });

    const reloaded = await loadHabitWithStreak(db, {
      habitId,
      userId: user.id,
      timezone: user.timezone,
      dayStartHour: user.dayStartHour,
      now,
    });

    if (!reloaded) throw ApiError.notFound('عادت موردنظر پیدا نشد.');

    const pointsAwarded = crossedTarget ? pointsForHabit(reloaded.streak.currentStreak) : 0;

    const account = await db.user.update({
      where: { id: user.id },
      data: {
        ...(pointsAwarded ? { points: { increment: pointsAwarded } } : {}),
      },
    });

    // Keep the cached counters in step so a cold render (or the cron) starts
    // from the right numbers.
    await db.habit.update({
      where: { id: habitId },
      data: {
        currentStreak: reloaded.streak.currentStreak,
        longestStreak: Math.max(habit.longestStreak, reloaded.streak.longestStreak),
        graceDaysUsed: reloaded.streak.graceDaysUsed,
        lastCompletedOn: reloaded.streak.lastCompletedOn ?? habit.lastCompletedOn,
      },
    });

    return {
      habit: reloaded.dto,
      pointsAwarded,
      totalPoints: account.points,
      completedToday: reloaded.streak.isCompletedToday,
    };
  },
});

export const DELETE = withAuthedRoute<undefined, undefined, LogResponse>({
  rateLimit: 'mutation',
  handler: async ({ params, user, db }) => {
    const habitId = uuidSchema.parse(params.id);
    const now = new Date();
    const logDate = toUtcDateKey(now, user.timezone, user.dayStartHour);

    const habit = await db.habit.findUnique({ where: { id: habitId } });
    if (!habit) throw ApiError.notFound('عادت موردنظر پیدا نشد.');

    const existingLog = await db.habitLog.findUnique({
      where: { habitId_logDate: { habitId, logDate } },
    });

    const hadMetTarget = (existingLog?.count ?? 0) >= habit.targetPerDay;

    await db.habitLog.deleteMany({ where: { habitId, logDate } });

    const reloaded = await loadHabitWithStreak(db, {
      habitId,
      userId: user.id,
      timezone: user.timezone,
      dayStartHour: user.dayStartHour,
      now,
    });

    if (!reloaded) throw ApiError.notFound('عادت موردنظر پیدا نشد.');

    // Refund what the check-in paid, valued at the streak it produced.
    const refund = hadMetTarget ? pointsForHabit(reloaded.streak.currentStreak + 1) : 0;

    const account = await db.user.update({
      where: { id: user.id },
      data: { ...(refund ? { points: { decrement: refund } } : {}) },
    });

    if (account.points < 0) {
      await db.user.update({ where: { id: user.id }, data: { points: 0 } });
    }

    await db.habit.update({
      where: { id: habitId },
      data: {
        currentStreak: reloaded.streak.currentStreak,
        graceDaysUsed: reloaded.streak.graceDaysUsed,
      },
    });

    return {
      habit: reloaded.dto,
      pointsAwarded: -refund,
      totalPoints: Math.max(0, account.points),
      completedToday: reloaded.streak.isCompletedToday,
    };
  },
});
