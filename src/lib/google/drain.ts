import type { CalendarSyncJob, GoogleAccount } from '@prisma/client';

import type { ScopedPrisma } from '../db/rls';
import { logger } from '../logger';
import {
  GoogleApiError,
  calendarExists,
  createKayzenCalendar,
  deleteEvent,
  insertEvent,
  patchEvent,
} from './calendar-api';
import { countdownEvent, taskEvent } from './mapping';
import { claimDueJobs, completeJob, failJob } from './sync-queue';
import { GoogleReauthRequired, accessTokenFor } from './tokens';

/**
 * Running the queue.
 *
 * One pass over the due jobs for one account. Called from three places — after
 * a mutation, from the cron, and from the "force sync" button — and it does not
 * care which: the work is idempotent, so a job running twice is a wasted
 * request rather than a duplicate event.
 *
 * Failures are sorted into three kinds, because they want three different
 * answers. A transient failure (Google is busy, the network dropped) goes back
 * on the queue with a longer fuse. An auth failure stops the whole pass — every
 * remaining job would fail the same way, and hammering a revoked grant is how
 * an integration gets rate-limited. Anything else is this job's own problem and
 * only this job pays for it.
 */

export interface DrainResult {
  processed: number;
  failed: number;
  /** True when the person has to reconnect; the settings card says so. */
  needsReauth: boolean;
}

/**
 * The account's calendar, provisioning it if this is the first time.
 *
 * Also re-provisions when the stored id has stopped resolving, which happens
 * for the ordinary reason that somebody deleted "Kayzen Planner" from their
 * Google account. Treating that as a fatal error would leave the integration
 * permanently broken over a thing the person is entitled to do.
 */
export async function ensureCalendar(
  db: ScopedPrisma,
  account: GoogleAccount,
  accessToken: string,
  timeZone: string,
): Promise<string> {
  if (account.calendarId && (await calendarExists(accessToken, account.calendarId))) {
    return account.calendarId;
  }

  const calendarId = await createKayzenCalendar(accessToken, timeZone);
  await db.googleAccount.update({ where: { id: account.id }, data: { calendarId } });

  logger.info({ userId: account.userId }, 'provisioned the Kayzen Planner calendar');
  return calendarId;
}

async function runJob(
  db: ScopedPrisma,
  job: CalendarSyncJob,
  context: { accessToken: string; calendarId: string; timeZone: string },
): Promise<void> {
  const { accessToken, calendarId, timeZone } = context;

  if (job.operation === 'DELETE') {
    if (job.googleEventId) await deleteEvent(accessToken, calendarId, job.googleEventId);
    return;
  }

  const body =
    job.entity === 'TASK'
      ? await taskBody(db, job.entityId, timeZone)
      : await countdownBody(db, job.entityId, timeZone);

  // The row is gone, or no longer belongs on a calendar — a task that was
  // ticked off, or had its due date cleared, between the enqueue and the
  // drain. The end state is "no event", which is a delete.
  if (!body) {
    if (job.googleEventId) await deleteEvent(accessToken, calendarId, job.googleEventId);
    await clearMirrorId(db, job);
    return;
  }

  if (job.googleEventId) {
    try {
      await patchEvent(accessToken, calendarId, job.googleEventId, body.event);
      return;
    } catch (error) {
      // Somebody deleted the event in Google. Falling through to an insert is
      // what makes the mirror self-healing rather than permanently one event
      // short.
      if (!(error instanceof GoogleApiError) || !error.isMissing) throw error;
    }
  }

  const eventId = await insertEvent(accessToken, calendarId, body.event);
  await setMirrorId(db, job, eventId);
}

async function taskBody(db: ScopedPrisma, id: string, timeZone: string) {
  const task = await db.task.findUnique({ where: { id } });
  if (!task) return null;

  const event = taskEvent(task, timeZone);
  return event ? { event } : null;
}

async function countdownBody(db: ScopedPrisma, id: string, timeZone: string) {
  const countdown = await db.countdownEvent.findUnique({ where: { id } });
  if (!countdown) return null;

  return { event: countdownEvent(countdown, timeZone) };
}

async function setMirrorId(db: ScopedPrisma, job: CalendarSyncJob, eventId: string): Promise<void> {
  const where = { id: job.entityId };

  if (job.entity === 'TASK') {
    await db.task.updateMany({ where, data: { googleEventId: eventId } });
  } else {
    await db.countdownEvent.updateMany({ where, data: { googleEventId: eventId } });
  }
}

async function clearMirrorId(db: ScopedPrisma, job: CalendarSyncJob): Promise<void> {
  const where = { id: job.entityId };

  if (job.entity === 'TASK') {
    await db.task.updateMany({ where, data: { googleEventId: null } });
  } else {
    await db.countdownEvent.updateMany({ where, data: { googleEventId: null } });
  }
}

export async function drainCalendarQueue(
  db: ScopedPrisma,
  userId: string,
  timeZone: string,
  options: { limit?: number } = {},
): Promise<DrainResult> {
  const result: DrainResult = { processed: 0, failed: 0, needsReauth: false };

  const account = await db.googleAccount.findUnique({ where: { userId } });
  if (!account) return result;

  const jobs = await claimDueJobs(db, userId, { limit: options.limit });
  if (jobs.length === 0) {
    // Still worth recording: "last synced" should mean "last time we knew we
    // were in step", not "last time something happened to be queued".
    await db.googleAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date(), lastSyncError: null },
    });
    return result;
  }

  let accessToken: string;
  let calendarId: string;

  try {
    accessToken = await accessTokenFor(db, account);
    calendarId = await ensureCalendar(db, account, accessToken, timeZone);
  } catch (error) {
    return failWholePass(db, account, error, result);
  }

  for (const job of jobs) {
    try {
      await runJob(db, job, { accessToken, calendarId, timeZone });
      await completeJob(db, job.id);
      result.processed += 1;
    } catch (error) {
      if (error instanceof GoogleApiError && error.isAuthFailure) {
        return failWholePass(db, account, error, result);
      }

      const message = error instanceof Error ? error.message : 'unknown error';
      await failJob(db, job, message);
      result.failed += 1;

      logger.warn({ err: error, jobId: job.id, userId }, 'calendar sync job failed');
    }
  }

  await db.googleAccount.update({
    where: { id: account.id },
    data: {
      // Only a clean pass counts as "in step"; a pass with failures leaves the
      // previous timestamp alone rather than claiming a sync that did not
      // fully happen.
      ...(result.failed === 0 ? { lastSyncedAt: new Date(), lastSyncError: null } : {}),
    },
  });

  return result;
}

async function failWholePass(
  db: ScopedPrisma,
  account: GoogleAccount,
  error: unknown,
  result: DrainResult,
): Promise<DrainResult> {
  const needsReauth =
    error instanceof GoogleReauthRequired ||
    (error instanceof GoogleApiError && error.isAuthFailure);

  const message = error instanceof Error ? error.message : 'unknown error';

  await db.googleAccount.update({
    where: { id: account.id },
    data: { lastSyncError: message.slice(0, 500) },
  });

  logger.warn({ err: error, userId: account.userId }, 'calendar sync pass aborted');

  return { ...result, needsReauth };
}
