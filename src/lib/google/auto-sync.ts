import { after } from 'next/server';

import type { ScopedPrisma } from '../db/rls';
import { googleOAuthConfig } from '../env';
import { logger } from '../logger';
import { withUserContext } from '../db/rls';
import { drainCalendarQueue } from './drain';
import { enqueueCalendarSync, type EnqueueInput } from './sync-queue';

/**
 * The one call a mutation route makes. Everything else is downstream of it.
 *
 * Two steps, and the order is the whole design:
 *
 *  1. **enqueue**, inside the request's own transaction, so the intent commits
 *     with the change that caused it. A task that saved and a job that did not
 *     is a task that silently never reaches Google;
 *  2. **drain, after the response**, with Next's `after()`. The person is
 *     waiting for their task to save, not for Google to acknowledge it — and
 *     on a bad day Google takes ten seconds. Draining inside the handler would
 *     make Kayzen exactly as slow, and exactly as reliable, as a third party.
 *
 * If the process dies before `after()` runs, or the deployment has no
 * `after()` at all, nothing is lost: the job is in the database and the cron
 * picks it up. That is the difference between an outbox and a fire-and-forget.
 */

/** Skipped entirely when the deployment has no Google project. */
function enabled(): boolean {
  return googleOAuthConfig() !== null;
}

export async function syncToCalendar(db: ScopedPrisma, input: EnqueueInput): Promise<void> {
  if (!enabled()) return;

  const linked = await db.googleAccount.findUnique({
    where: { userId: input.userId },
    select: { id: true },
  });

  // No link, no queue. Filling an outbox for an account that has never
  // connected would mean a surprise flood of a year's events the day somebody
  // finally presses connect.
  if (!linked) return;

  await enqueueCalendarSync(db, input);
  scheduleDrain(input.userId);
}

/**
 * Runs the queue once the response has been sent.
 *
 * A fresh `withUserContext` rather than the request's client: by the time this
 * body executes, the handler's transaction has committed and closed, and
 * reusing a finished transaction is a use-after-free with extra steps.
 */
export function scheduleDrain(userId: string): void {
  after(async () => {
    try {
      await withUserContext(userId, async (db) => {
        const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
        await drainCalendarQueue(db, userId, user.timezone);
      });
    } catch (error) {
      // The response has already gone out; there is nobody left to tell. The
      // cron will retry, which is the point of the queue.
      logger.warn({ err: error, userId }, 'post-response calendar drain failed');
    }
  });
}
