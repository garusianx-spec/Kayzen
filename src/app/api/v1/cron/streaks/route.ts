import { assertCronRequest } from '@/lib/api/cron';
import { withRoute } from '@/lib/api/handler';
import { prisma } from '@/lib/db/prisma';
import { withUserContext } from '@/lib/db/rls';
import { loadHabitsWithStreaks } from '@/lib/domain/habits';
import { reconcileHabit } from '@/lib/domain/streak-engine';
import { logger } from '@/lib/logger';

/**
 * `POST /api/v1/cron/streaks` — nightly reconciliation.
 *
 * Runs hourly rather than once at midnight, because "midnight" is a different
 * instant for every timezone the user base spans. The work is idempotent —
 * `reconcileHabit` returns `null` when nothing changed — so re-running it costs
 * a read and writes nothing.
 *
 * Each user is processed inside their own `withUserContext()` transaction. The
 * job never sees two tenants' rows in one query, which keeps the RLS guarantee
 * intact even here.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface ReconcileResult {
  usersProcessed: number;
  habitsUpdated: number;
  otpSessionsPurged: number;
  refreshTokensPurged: number;
  durationMs: number;
}

const BATCH_SIZE = 200;

async function reconcile(): Promise<ReconcileResult> {
  const startedAt = Date.now();
  let usersProcessed = 0;
  let habitsUpdated = 0;
  let cursor: string | undefined;

  for (;;) {
    const users = await prisma.user.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, timezone: true, dayStartHour: true },
    });

    if (users.length === 0) break;
    cursor = users[users.length - 1]?.id;

    for (const user of users) {
      usersProcessed += 1;

      const updated = await withUserContext(user.id, async (db) => {
        const habits = await loadHabitsWithStreaks(db, {
          userId: user.id,
          timezone: user.timezone,
          dayStartHour: user.dayStartHour,
        });

        let writes = 0;

        for (const { habit, streak } of habits) {
          const next = reconcileHabit(habit, streak);
          if (!next) continue;

          await db.habit.update({
            where: { id: habit.id },
            data: {
              currentStreak: next.currentStreak,
              longestStreak: next.longestStreak,
              graceDaysUsed: next.graceDaysUsed,
              lastCompletedOn: streak.lastCompletedOn ?? habit.lastCompletedOn,
            },
          });

          writes += 1;
        }

        return writes;
      });

      habitsUpdated += updated;
    }

    if (users.length < BATCH_SIZE) break;
  }

  const [purged] = await prisma.$queryRaw<
    Array<{ otp_sessions_deleted: bigint; refresh_tokens_deleted: bigint }>
  >`select * from app.purge_expired_credentials()`;

  return {
    usersProcessed,
    habitsUpdated,
    otpSessionsPurged: Number(purged?.otp_sessions_deleted ?? 0),
    refreshTokensPurged: Number(purged?.refresh_tokens_deleted ?? 0),
    durationMs: Date.now() - startedAt,
  };
}

export const POST = withRoute<undefined, undefined, ReconcileResult>({
  rateLimit: 'cron',
  handler: async ({ request }) => {
    await assertCronRequest(request);

    const result = await reconcile();
    logger.info(result, 'streak reconciliation complete');

    return result;
  },
});

/** Vercel Cron issues GETs; the work and the authentication are identical. */
export const GET = POST;
