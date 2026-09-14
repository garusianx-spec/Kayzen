import { assertCronRequest } from '@/lib/api/cron';
import { withRoute } from '@/lib/api/handler';
import { toPersianDigits } from '@/lib/date/digits';
import { toJalaliDayKey, toUtcDateKey, toWallClock } from '@/lib/date/jalali';
import { prisma } from '@/lib/db/prisma';
import { withUserContext } from '@/lib/db/rls';
import { isScheduledOn } from '@/lib/domain/streak-engine';
import { logger } from '@/lib/logger';
import { sendPushNotification, type KayzenPushPayload } from '@/lib/push/webpush';

/**
 * `POST /api/v1/cron/reminders` — the daily nudge.
 *
 * Scheduled hourly. Each run picks the users whose *local* clock has just
 * reached their chosen reminder hour, which is how one UTC cron serves a user
 * base spread across timezones without sending anyone a 3 a.m. notification.
 *
 * A user with nothing open gets nothing: a reminder that says "۰ کار" trains
 * people to swipe the notification away without reading it.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface ReminderRunResult {
  usersConsidered: number;
  notificationsSent: number;
  subscriptionsRemoved: number;
  durationMs: number;
}

const BATCH_SIZE = 200;

/** Runs hourly, so "now" means anywhere inside the current local hour. */
function isReminderHour(now: Date, timezone: string, notifyAtHour: number): boolean {
  return toWallClock(now, timezone).getHours() === notifyAtHour;
}

function buildPayload(options: {
  openTasks: number;
  dueHabits: number;
  name: string | null;
}): KayzenPushPayload | null {
  if (options.openTasks === 0 && options.dueHabits === 0) return null;

  const greeting = options.name ? `${options.name} عزیز` : 'وقت کایزن است';
  const parts: string[] = [];

  if (options.openTasks > 0) parts.push(`${toPersianDigits(options.openTasks)} کار باز`);
  if (options.dueHabits > 0) parts.push(`${toPersianDigits(options.dueHabits)} عادت امروز`);

  return {
    title: greeting,
    body: `${parts.join(' و ')} منتظر شماست. یک درصد بهتر از دیروز.`,
    url: '/',
    tag: 'kayzen-daily',
    // Short double-tap: present enough to feel, brief enough not to annoy.
    vibrate: [15, 50, 15],
  };
}

async function runReminders(now: Date): Promise<ReminderRunResult> {
  const startedAt = Date.now();
  let usersConsidered = 0;
  let notificationsSent = 0;
  let subscriptionsRemoved = 0;
  let cursor: string | undefined;

  for (;;) {
    const users = await prisma.user.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        timezone: true,
        dayStartHour: true,
        notifyAtHour: true,
      },
    });

    if (users.length === 0) break;
    cursor = users[users.length - 1]?.id;

    for (const user of users) {
      if (!isReminderHour(now, user.timezone, user.notifyAtHour)) continue;
      usersConsidered += 1;

      const payload = await withUserContext(user.id, async (db) => {
        const dayKey = toJalaliDayKey(now, user.timezone, user.dayStartHour);
        const logDate = toUtcDateKey(now, user.timezone, user.dayStartHour);

        const [openTasks, habits, completedLogs] = await Promise.all([
          db.task.count({
            where: {
              userId: user.id,
              status: { in: ['PENDING', 'IN_PROGRESS'] },
              OR: [{ dueJalali: dayKey }, { dueAt: { lte: now } }],
            },
          }),
          db.habit.findMany({
            where: { userId: user.id, archivedAt: null },
            select: { id: true, frequency: true, targetPerDay: true },
          }),
          db.habitLog.findMany({
            where: { userId: user.id, logDate },
            select: { habitId: true, count: true },
          }),
        ]);

        const doneByHabit = new Map(completedLogs.map((log) => [log.habitId, log.count]));
        const dueHabits = habits.filter(
          (habit) =>
            isScheduledOn(logDate, habit.frequency) &&
            (doneByHabit.get(habit.id) ?? 0) < habit.targetPerDay,
        ).length;

        return buildPayload({ openTasks, dueHabits, name: user.name });
      });

      if (!payload) continue;

      const subscriptions = await prisma.pushSubscription.findMany({
        where: { userId: user.id },
      });

      for (const subscription of subscriptions) {
        const outcome = await sendPushNotification(subscription, payload, { urgency: 'normal' });

        if (outcome.ok) {
          notificationsSent += 1;
          if (subscription.failedAt) {
            await prisma.pushSubscription.update({
              where: { id: subscription.id },
              data: { failedAt: null },
            });
          }
          continue;
        }

        if (outcome.expired) {
          await prisma.pushSubscription.delete({ where: { id: subscription.id } });
          subscriptionsRemoved += 1;
          continue;
        }

        await prisma.pushSubscription.update({
          where: { id: subscription.id },
          data: { failedAt: new Date() },
        });
      }
    }

    if (users.length < BATCH_SIZE) break;
  }

  return {
    usersConsidered,
    notificationsSent,
    subscriptionsRemoved,
    durationMs: Date.now() - startedAt,
  };
}

export const POST = withRoute<undefined, undefined, ReminderRunResult>({
  rateLimit: 'cron',
  handler: async ({ request }) => {
    await assertCronRequest(request);

    const result = await runReminders(new Date());
    logger.info(result, 'reminder fan-out complete');

    return result;
  },
});

export const GET = POST;
