import { assertCronRequest } from '@/lib/api/cron';
import { withRoute } from '@/lib/api/handler';
import { prisma } from '@/lib/db/prisma';
import { withUserContext } from '@/lib/db/rls';
import { googleOAuthConfig } from '@/lib/env';
import { drainCalendarQueue } from '@/lib/google/drain';
import { MAX_ATTEMPTS } from '@/lib/google/sync-queue';

/**
 * `POST /api/v1/cron/calendar-sync` — the safety net under the whole engine.
 *
 * Every mutation already drains its own queue after responding. This exists
 * for the cases where that could not happen or did not work: the process died
 * before `after()` ran, Google was down for an hour, a refresh hit a rate
 * limit, the person's phone finished replaying its offline outbox while the
 * app was closed.
 *
 * Without it the queue would be a queue only in name — one that fills up when
 * things go wrong and drains only when the person happens to touch a task.
 *
 * The scan runs on the *unscoped* client because it is looking across tenants
 * for work to do; every individual account's work then runs inside its own
 * `withUserContext`, so RLS applies to the part that actually reads and writes
 * rows.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A bounded bite per invocation; the next run picks up the rest. */
const MAX_ACCOUNTS_PER_RUN = 100;

interface CalendarCronResult {
  accounts: number;
  processed: number;
  failed: number;
}

export const POST = withRoute<undefined, undefined, CalendarCronResult>({
  handler: async ({ request, log }) => {
    await assertCronRequest(request);

    if (!googleOAuthConfig()) return { accounts: 0, processed: 0, failed: 0 };

    const due = await prisma.calendarSyncJob.findMany({
      where: { runAfter: { lte: new Date() }, attempts: { lt: MAX_ATTEMPTS } },
      select: { userId: true },
      distinct: ['userId'],
      take: MAX_ACCOUNTS_PER_RUN,
    });

    const result: CalendarCronResult = { accounts: due.length, processed: 0, failed: 0 };

    for (const { userId } of due) {
      try {
        await withUserContext(userId, async (db) => {
          const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
          const pass = await drainCalendarQueue(db, userId, user.timezone);

          result.processed += pass.processed;
          result.failed += pass.failed;
        });
      } catch (error) {
        // One account's bad day must not stop the other ninety-nine.
        log.warn({ err: error, userId }, 'calendar drain failed for an account');
        result.failed += 1;
      }
    }

    log.info(result, 'calendar sync cron finished');
    return result;
  },
});
