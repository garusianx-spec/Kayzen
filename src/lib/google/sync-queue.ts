import type { CalendarEntity, CalendarOperation, CalendarSyncJob } from '@prisma/client';

import type { ScopedPrisma } from '../db/rls';
import { logger } from '../logger';

/**
 * The durable outbox that stands between a tap in Kayzen and a write to Google.
 *
 * Nothing in a request handler talks to Google. A handler that did would make
 * saving a task as slow as Google is, and as reliable — which is to say, it
 * would fail whenever a third party had a bad minute, in a form the person
 * reads as "Kayzen lost my task".
 *
 * So every mutation enqueues instead, and the drain runs afterwards: in the
 * same invocation via `after()` when there is one, on the cron otherwise. The
 * write to Kayzen's own database is what the person is waiting for, and it
 * commits whether Google is reachable or not.
 *
 * **The queue holds desired end state, not history.** One row per object, by
 * unique constraint: five rapid edits collapse to one job, and an UPSERT
 * followed by a DELETE overwrites to DELETE. That is not an optimisation — it
 * is what makes replaying the queue idempotent, which is what makes retrying
 * safe.
 */

/** Exponential, from a minute, capped where a person would rather be told. */
const BACKOFF_MINUTES = [1, 5, 15, 60, 240] as const;

/** After this many failures the job stops asking and the card says so. */
export const MAX_ATTEMPTS = 6;

export function backoffFor(attempts: number, now: Date = new Date()): Date {
  const index = Math.min(Math.max(0, attempts - 1), BACKOFF_MINUTES.length - 1);
  const minutes = BACKOFF_MINUTES[index] ?? 240;

  return new Date(now.getTime() + minutes * 60_000);
}

export interface EnqueueInput {
  userId: string;
  entity: CalendarEntity;
  entityId: string;
  operation: CalendarOperation;
  /** Required for DELETE: by the time it runs, the row it refers to is gone. */
  googleEventId?: string | null;
}

/**
 * Records that an object needs pushing.
 *
 * Never throws into the caller's path. A task that saved but failed to enqueue
 * is a task that is merely out of sync; a task that failed to save because the
 * *queue* was busy is a lost task, and the person was only ever asking for the
 * first thing.
 */
export async function enqueueCalendarSync(db: ScopedPrisma, input: EnqueueInput): Promise<void> {
  try {
    const shared = {
      operation: input.operation,
      googleEventId: input.googleEventId ?? null,
      // A fresh intent starts over: the object changed, so whatever was
      // failing about the previous shape of it is no longer the question.
      attempts: 0,
      runAfter: new Date(),
      lastError: null,
    };

    await db.calendarSyncJob.upsert({
      where: {
        userId_entity_entityId: {
          userId: input.userId,
          entity: input.entity,
          entityId: input.entityId,
        },
      },
      update: shared,
      create: {
        userId: input.userId,
        entity: input.entity,
        entityId: input.entityId,
        ...shared,
      },
    });
  } catch (error) {
    logger.error({ err: error, ...input }, 'could not enqueue a calendar sync job');
  }
}

/** Jobs that are due, oldest first. The drain takes a bounded bite. */
export async function claimDueJobs(
  db: ScopedPrisma,
  userId: string,
  options: { limit?: number; now?: Date } = {},
): Promise<CalendarSyncJob[]> {
  const { limit = 25, now = new Date() } = options;

  return db.calendarSyncJob.findMany({
    where: { userId, runAfter: { lte: now }, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
}

export async function completeJob(db: ScopedPrisma, jobId: string): Promise<void> {
  // Deleted, not marked done: the row's entire purpose was to say "this object
  // is behind", and keeping a tombstone would collide with the unique
  // constraint the next time the same object changes.
  await db.calendarSyncJob.deleteMany({ where: { id: jobId } });
}

export async function failJob(
  db: ScopedPrisma,
  job: CalendarSyncJob,
  error: string,
  now: Date = new Date(),
): Promise<void> {
  const attempts = job.attempts + 1;

  await db.calendarSyncJob.updateMany({
    where: { id: job.id },
    data: {
      attempts,
      runAfter: backoffFor(attempts, now),
      // Truncated: an API error body can be kilobytes, and the column exists
      // to answer "why" on a settings card, not to archive Google's prose.
      lastError: error.slice(0, 500),
    },
  });
}

export interface QueueHealth {
  pending: number;
  /** Jobs that have given up. The settings card surfaces these. */
  stalled: number;
}

export async function queueHealth(db: ScopedPrisma, userId: string): Promise<QueueHealth> {
  const [pending, stalled] = await Promise.all([
    db.calendarSyncJob.count({ where: { userId, attempts: { lt: MAX_ATTEMPTS } } }),
    db.calendarSyncJob.count({ where: { userId, attempts: { gte: MAX_ATTEMPTS } } }),
  ]);

  return { pending, stalled };
}

/** Wipes the queue and every mirror id. Used when a link is torn down. */
export async function forgetCalendarMirror(db: ScopedPrisma, userId: string): Promise<void> {
  await db.calendarSyncJob.deleteMany({ where: { userId } });

  // The ids point at events in a calendar this account can no longer reach.
  // Leaving them would make a later reconnect try to patch events that belong
  // to a grant that no longer exists.
  await Promise.all([
    db.task.updateMany({ where: { userId }, data: { googleEventId: null } }),
    db.countdownEvent.updateMany({ where: { userId }, data: { googleEventId: null } }),
  ]);
}
