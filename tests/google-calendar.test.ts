import { describe, expect, it } from 'vitest';

import { sha256Hex, toBase64Url } from '@/lib/crypto';
import { GoogleApiError } from '@/lib/google/calendar-api';
import { LINK_STATE_TTL_SECONDS, issueLinkState, readLinkState } from '@/lib/google/link-state';
import {
  calendarDate,
  countdownEvent,
  taskEvent,
  type CountdownForCalendar,
  type TaskForCalendar,
} from '@/lib/google/mapping';
import { openSecret, resetSecretBoxCache, sealSecret } from '@/lib/google/secret-box';
import {
  MAX_ATTEMPTS,
  backoffFor,
  claimDueJobs,
  completeJob,
  enqueueCalendarSync,
  failJob,
  forgetCalendarMirror,
  queueHealth,
} from '@/lib/google/sync-queue';
import { createMemoryClient } from '@/lib/db/memory/client';
import type { ScopedPrisma } from '@/lib/db/rls';

/**
 * The Google Calendar engine.
 *
 * Four things are worth pinning, and they are the four that would fail
 * silently. The sealed-token format, because a change to it un-links every
 * account at once. The link-state cookie, because it is the only thing
 * standing between an attacker's authorization code and somebody else's
 * account. The mapping, because it decides what a calendar shows. And the
 * backoff, because an integration that retries too eagerly is one that gets
 * rate-limited into permanent failure.
 *
 * The I/O — token exchange, the Calendar REST calls, the drain loop — is not
 * here: it is a thin shell over `fetch`, and a test of it would be a test of a
 * mock. The decisions all live in the pure modules below.
 */

const KEY = 'unit-test-encryption-key-unit-test-encryption-key';
const TEHRAN = 'Asia/Tehran';

// ---------------------------------------------------------------------------
// Sealed secrets
// ---------------------------------------------------------------------------

describe('sealSecret / openSecret', () => {
  it('round-trips a refresh token', async () => {
    const token = '1//0abcdefgHIJKLMNOP-refresh-token';
    const sealed = await sealSecret(token, KEY);

    expect(sealed).not.toContain(token);
    expect(await openSecret(sealed, KEY)).toBe(token);
  });

  it('carries a version prefix, so the format can be rotated later', async () => {
    expect(await sealSecret('x', KEY)).toMatch(/^v1\./);
  });

  it('never produces the same ciphertext twice', async () => {
    // GCM's whole security rests on a nonce never repeating under one key.
    const first = await sealSecret('same input', KEY);
    const second = await sealSecret('same input', KEY);

    expect(first).not.toBe(second);
    expect(await openSecret(first, KEY)).toBe(await openSecret(second, KEY));
  });

  it('refuses a different key', async () => {
    resetSecretBoxCache();
    const sealed = await sealSecret('secret', KEY);

    expect(await openSecret(sealed, 'another-key-another-key-another-key')).toBeNull();
  });

  it('refuses tampered ciphertext rather than returning garbage', async () => {
    const sealed = await sealSecret('secret', KEY);
    const parts = sealed.split('.');
    const flipped = `${parts[0]}.${parts[1]}.${(parts[2] ?? '').slice(0, -2)}AA`;

    expect(await openSecret(flipped, KEY)).toBeNull();
  });

  it('refuses a malformed or future-version value', async () => {
    for (const value of ['', 'v1', 'v1.only-two', 'v2.aaaa.bbbb', 'not-sealed-at-all']) {
      expect(await openSecret(value, KEY)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// The link-state cookie
// ---------------------------------------------------------------------------

const USER = '6da00b62-1ec4-418e-847f-913bba8442dd';

describe('link state', () => {
  it('round-trips the user through a matching state', async () => {
    const issued = await issueLinkState(USER);
    const read = await readLinkState(issued.cookie, issued.state);

    expect(read?.userId).toBe(USER);
    expect(read?.codeVerifier).toHaveLength(43);
  });

  it('derives the PKCE challenge as base64url(sha256(verifier))', async () => {
    const issued = await issueLinkState(USER);
    const read = await readLinkState(issued.cookie, issued.state);

    const digest = await sha256Hex(read?.codeVerifier ?? '');
    const bytes = Uint8Array.from(
      (digest.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)),
    );

    expect(issued.codeChallenge).toBe(toBase64Url(bytes));
    // base64url, no padding — Google rejects `=` in a code challenge.
    expect(issued.codeChallenge).not.toContain('=');
  });

  it('refuses a state that does not match the cookie', async () => {
    // This is the attack it exists for: an attacker's own authorization code
    // pasted into somebody else's browser, to link the attacker's calendar to
    // that person's account.
    const issued = await issueLinkState(USER);

    expect(await readLinkState(issued.cookie, 'a-different-state')).toBeNull();
  });

  it('refuses a cookie whose signature was edited', async () => {
    const issued = await issueLinkState(USER);
    const [payload] = issued.cookie.split('.');
    const forged = `${payload}.${'0'.repeat(64)}`;

    expect(await readLinkState(forged, issued.state)).toBeNull();
  });

  it('refuses a payload edited under a stolen signature', async () => {
    const issued = await issueLinkState(USER);
    const separator = issued.cookie.lastIndexOf('.');
    const signature = issued.cookie.slice(separator + 1);

    const swapped = toBase64Url(
      new TextEncoder().encode(
        JSON.stringify({
          userId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          state: issued.state,
          codeVerifier: 'x'.repeat(43),
          expiresAt: Date.now() + 60_000,
        }),
      ),
    );

    expect(await readLinkState(`${swapped}.${signature}`, issued.state)).toBeNull();
  });

  it('expires', async () => {
    const issued = await issueLinkState(USER, new Date('2026-01-01T00:00:00Z'));
    const later = new Date(Date.parse('2026-01-01T00:00:00Z') + LINK_STATE_TTL_SECONDS * 1000 + 1);

    expect(await readLinkState(issued.cookie, issued.state, later)).toBeNull();
  });

  it('refuses a missing cookie', async () => {
    expect(await readLinkState(undefined, 'anything')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

const task = (overrides: Partial<TaskForCalendar> = {}): TaskForCalendar => ({
  id: 'task-1',
  title: 'زنگ زدن به مامان',
  description: null,
  dueAt: new Date('2026-09-19T10:00:00Z'),
  remindAt: null,
  priority: 3,
  location: null,
  estimatedPomodoros: null,
  status: 'PENDING',
  ...overrides,
});

describe('taskEvent', () => {
  it('maps a due task onto an appointment', () => {
    const event = taskEvent(task(), TEHRAN);

    expect(event?.summary).toBe('زنگ زدن به مامان');
    expect(event?.start).toEqual({ dateTime: '2026-09-19T10:00:00.000Z', timeZone: TEHRAN });
    expect(event?.extendedProperties?.private).toEqual({
      kayzenEntity: 'TASK',
      kayzenId: 'task-1',
    });
  });

  it('gives an undated task no place on a calendar', () => {
    // A calendar answers "when". Putting a whenever-task at "today" would
    // invent a commitment the person never made.
    expect(taskEvent(task({ dueAt: null }), TEHRAN)).toBeNull();
  });

  it('takes a finished task off the calendar', () => {
    expect(taskEvent(task({ status: 'COMPLETED' }), TEHRAN)).toBeNull();
    expect(taskEvent(task({ status: 'ARCHIVED' }), TEHRAN)).toBeNull();
  });

  it('defaults to half an hour, and uses the estimate when there is one', () => {
    const plain = taskEvent(task(), TEHRAN);
    const estimated = taskEvent(task({ estimatedPomodoros: 3 }), TEHRAN);

    const span = (event: ReturnType<typeof taskEvent>): number => {
      const start = Date.parse((event?.start as { dateTime: string }).dateTime);
      const end = Date.parse((event?.end as { dateTime: string }).dateTime);
      return (end - start) / 60_000;
    };

    expect(span(plain)).toBe(30);
    expect(span(estimated)).toBe(75);
  });

  it('colours by priority, and falls back for a priority it does not know', () => {
    expect(taskEvent(task({ priority: 1 }), TEHRAN)?.colorId).toBe('11');
    expect(taskEvent(task({ priority: 4 }), TEHRAN)?.colorId).toBe('8');
    expect(taskEvent(task({ priority: 9 }), TEHRAN)?.colorId).toBe('9');
  });

  it('turns an absolute reminder into minutes before', () => {
    const event = taskEvent(task({ remindAt: new Date('2026-09-19T09:30:00Z') }), TEHRAN);

    expect(event?.reminders).toEqual({
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 30 }],
    });
  });

  it('drops a reminder that has drifted past the due date', () => {
    // The due date moved later and the reminder did not. Clamping to zero
    // would fire it at the moment the task starts, which is not a reminder.
    const event = taskEvent(task({ remindAt: new Date('2026-09-19T11:00:00Z') }), TEHRAN);

    expect(event?.reminders).toBeUndefined();
  });

  it('carries location and description only when they exist', () => {
    const bare = taskEvent(task(), TEHRAN);
    expect(bare).not.toHaveProperty('location');
    expect(bare).not.toHaveProperty('description');

    const full = taskEvent(task({ location: 'بازار', description: 'برای تولد' }), TEHRAN);
    expect(full?.location).toBe('بازار');
    expect(full?.description).toBe('برای تولد');
  });
});

const countdown = (overrides: Partial<CountdownForCalendar> = {}): CountdownForCalendar => ({
  id: 'countdown-1',
  title: 'تولد مریم',
  description: null,
  eventAt: new Date('2026-09-19T20:30:00Z'),
  isAllDay: true,
  colorToken: 'rose',
  notifyBeforeMinutes: [1440, 60],
  ...overrides,
});

describe('countdownEvent', () => {
  it('makes an all-day countdown an all-day event', () => {
    // A birthday at 00:00 reads as "۱۲:۰۰ ق.ظ" in Google, which is wrong in a
    // way people notice immediately.
    const event = countdownEvent(countdown(), TEHRAN);

    expect(event.start).toEqual({ date: '2026-09-20' });
    // Google's all-day end is exclusive, so a one-day event ends tomorrow.
    expect(event.end).toEqual({ date: '2026-09-21' });
  });

  it('keeps a timed countdown timed, with an hour on it', () => {
    const event = countdownEvent(countdown({ isAllDay: false }), TEHRAN);

    expect(event.start).toEqual({ dateTime: '2026-09-19T20:30:00.000Z', timeZone: TEHRAN });
    expect(event.end).toEqual({ dateTime: '2026-09-19T21:30:00.000Z', timeZone: TEHRAN });
  });

  it('colours by token and falls back for an unknown one', () => {
    expect(countdownEvent(countdown({ colorToken: 'rose' }), TEHRAN).colorId).toBe('11');
    expect(countdownEvent(countdown({ colorToken: 'chartreuse' }), TEHRAN).colorId).toBe('3');
  });

  it('sorts reminders furthest-out first and drops duplicates', () => {
    const event = countdownEvent(countdown({ notifyBeforeMinutes: [60, 1440, 60, 10] }), TEHRAN);

    expect(event.reminders?.overrides).toEqual([
      { method: 'popup', minutes: 1440 },
      { method: 'popup', minutes: 60 },
      { method: 'popup', minutes: 10 },
    ]);
  });

  it('caps at five overrides and rejects out-of-range values', () => {
    const event = countdownEvent(
      countdown({ notifyBeforeMinutes: [1, 2, 3, 4, 5, 6, 7, -1, 99_999] }),
      TEHRAN,
    );

    expect(event.reminders?.overrides).toHaveLength(5);
    expect(event.reminders?.overrides.map((o) => o.minutes)).not.toContain(-1);
    expect(event.reminders?.overrides.map((o) => o.minutes)).not.toContain(99_999);
  });

  it('inherits the calendar default rather than declaring "no reminders"', () => {
    // `useDefault: false` with an empty list means "never nudge me", which is
    // a real answer — but not the one an empty array in our column means.
    expect(
      countdownEvent(countdown({ notifyBeforeMinutes: [] }), TEHRAN).reminders,
    ).toBeUndefined();
  });
});

describe('calendarDate', () => {
  it('reads the date in the given zone, not the runtime one', () => {
    // 20:30 UTC is already tomorrow in Tehran (+03:30). A server in London
    // would otherwise put a birthday on the wrong day.
    const instant = new Date('2026-09-19T20:30:00Z');

    expect(calendarDate(instant, TEHRAN)).toBe('2026-09-20');
    expect(calendarDate(instant, 'UTC')).toBe('2026-09-19');
  });
});

// ---------------------------------------------------------------------------
// Retry policy
// ---------------------------------------------------------------------------

describe('backoffFor', () => {
  const now = new Date('2026-09-19T12:00:00Z');
  const minutes = (attempts: number): number =>
    (backoffFor(attempts, now).getTime() - now.getTime()) / 60_000;

  it('climbs from a minute to four hours', () => {
    expect(minutes(1)).toBe(1);
    expect(minutes(2)).toBe(5);
    expect(minutes(3)).toBe(15);
    expect(minutes(4)).toBe(60);
    expect(minutes(5)).toBe(240);
  });

  it('stops climbing rather than growing without bound', () => {
    expect(minutes(50)).toBe(240);
  });

  it('handles a zero or negative attempt count', () => {
    expect(minutes(0)).toBe(1);
    expect(minutes(-3)).toBe(1);
  });

  it('gives up before the backoff outlives anybody’s patience', () => {
    // Six attempts is about nine hours of trying. Past that the settings card
    // asks the person to intervene instead of retrying forever.
    expect(MAX_ATTEMPTS).toBe(6);
  });
});

describe('GoogleApiError', () => {
  it('separates the three failures that want three different answers', () => {
    expect(new GoogleApiError(401, '').isAuthFailure).toBe(true);
    expect(new GoogleApiError(403, '').isAuthFailure).toBe(true);

    expect(new GoogleApiError(404, '').isMissing).toBe(true);
    expect(new GoogleApiError(410, '').isMissing).toBe(true);

    expect(new GoogleApiError(429, '').isTransient).toBe(true);
    expect(new GoogleApiError(503, '').isTransient).toBe(true);

    const ordinary = new GoogleApiError(400, 'bad request');
    expect(ordinary.isAuthFailure).toBe(false);
    expect(ordinary.isMissing).toBe(false);
    expect(ordinary.isTransient).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The outbox, against the real query engine
// ---------------------------------------------------------------------------

/**
 * These run against the in-memory Prisma substitute rather than mocks.
 *
 * The collapse semantics — five edits become one job, an upsert becomes a
 * delete — are enforced by a *unique constraint*, not by application code. A
 * test with a hand-rolled fake would assert that the code I wrote does what I
 * wrote, and would keep passing if the constraint were dropped tomorrow.
 */
async function freshDb(): Promise<{ db: ScopedPrisma; userId: string }> {
  const client = createMemoryClient() as unknown as ScopedPrisma;
  const user = await client.user.create({
    data: { phone: `+98912${Math.floor(Math.random() * 10_000_000)}` },
  });

  return { db: client, userId: user.id };
}

describe('the calendar outbox', () => {
  it('records one job for one change', async () => {
    const { db, userId } = await freshDb();

    await enqueueCalendarSync(db, {
      userId,
      entity: 'TASK',
      entityId: '11111111-1111-4111-8111-111111111111',
      operation: 'UPSERT',
    });

    const jobs = await claimDueJobs(db, userId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.operation).toBe('UPSERT');
  });

  it('collapses repeated edits of the same object into one job', async () => {
    const { db, userId } = await freshDb();
    const entityId = '22222222-2222-4222-8222-222222222222';

    for (let edit = 0; edit < 5; edit += 1) {
      await enqueueCalendarSync(db, { userId, entity: 'TASK', entityId, operation: 'UPSERT' });
    }

    expect(await claimDueJobs(db, userId)).toHaveLength(1);
  });

  it('lets a delete overwrite a pending upsert', async () => {
    // The queue holds the desired end state. Somebody who creates a task and
    // deletes it before the drain runs wants no event, not an event and then
    // a removal.
    const { db, userId } = await freshDb();
    const entityId = '33333333-3333-4333-8333-333333333333';

    await enqueueCalendarSync(db, { userId, entity: 'TASK', entityId, operation: 'UPSERT' });
    await enqueueCalendarSync(db, {
      userId,
      entity: 'TASK',
      entityId,
      operation: 'DELETE',
      googleEventId: 'evt-1',
    });

    const jobs = await claimDueJobs(db, userId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.operation).toBe('DELETE');
    expect(jobs[0]?.googleEventId).toBe('evt-1');
  });

  it('keeps a task and a countdown with the same id apart', async () => {
    const { db, userId } = await freshDb();
    const entityId = '44444444-4444-4444-8444-444444444444';

    await enqueueCalendarSync(db, { userId, entity: 'TASK', entityId, operation: 'UPSERT' });
    await enqueueCalendarSync(db, { userId, entity: 'COUNTDOWN', entityId, operation: 'UPSERT' });

    expect(await claimDueJobs(db, userId)).toHaveLength(2);
  });

  it('holds a failed job back, then gives up and says so', async () => {
    const { db, userId } = await freshDb();
    const entityId = '55555555-5555-4555-8555-555555555555';

    await enqueueCalendarSync(db, { userId, entity: 'TASK', entityId, operation: 'UPSERT' });

    const [job] = await claimDueJobs(db, userId);
    await failJob(db, job!, 'google said no');

    // Not due again for a minute, so a second drain in the same second leaves
    // it alone rather than hammering a service that just refused.
    expect(await claimDueJobs(db, userId)).toHaveLength(0);
    expect(await claimDueJobs(db, userId, { now: new Date(Date.now() + 120_000) })).toHaveLength(1);

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const [again] = await claimDueJobs(db, userId, { now: new Date(Date.now() + 86_400_000) });
      if (!again) break;
      await failJob(db, again, 'still no');
    }

    const health = await queueHealth(db, userId);
    expect(health.pending).toBe(0);
    expect(health.stalled).toBe(1);
  });

  it('removes a job on success rather than keeping a tombstone', async () => {
    // A tombstone would collide with the unique constraint the next time the
    // same object changed, and the object would stop syncing.
    const { db, userId } = await freshDb();
    const entityId = '66666666-6666-4666-8666-666666666666';

    await enqueueCalendarSync(db, { userId, entity: 'TASK', entityId, operation: 'UPSERT' });
    const [job] = await claimDueJobs(db, userId);
    await completeJob(db, job!.id);

    expect(await claimDueJobs(db, userId)).toHaveLength(0);

    await enqueueCalendarSync(db, { userId, entity: 'TASK', entityId, operation: 'UPSERT' });
    expect(await claimDueJobs(db, userId)).toHaveLength(1);
  });

  it('forgets every mirror id when the link is torn down', async () => {
    const { db, userId } = await freshDb();

    const task = await db.task.create({
      data: { userId, title: 'با مرور', googleEventId: 'evt-task' },
    });
    const countdown = await db.countdownEvent.create({
      data: { userId, title: 'تولد', eventAt: new Date(), googleEventId: 'evt-countdown' },
    });
    await enqueueCalendarSync(db, {
      userId,
      entity: 'TASK',
      entityId: task.id,
      operation: 'UPSERT',
    });

    await forgetCalendarMirror(db, userId);

    expect(await claimDueJobs(db, userId)).toHaveLength(0);
    expect((await db.task.findUnique({ where: { id: task.id } }))?.googleEventId).toBeNull();
    expect(
      (await db.countdownEvent.findUnique({ where: { id: countdown.id } }))?.googleEventId,
    ).toBeNull();
  });

  it('keeps one account’s queue out of another’s', async () => {
    const first = await freshDb();
    const entityId = '77777777-7777-4777-8777-777777777777';

    await enqueueCalendarSync(first.db, {
      userId: first.userId,
      entity: 'TASK',
      entityId,
      operation: 'UPSERT',
    });

    const second = await freshDb();
    expect(await claimDueJobs(second.db, second.userId)).toHaveLength(0);
  });
});
