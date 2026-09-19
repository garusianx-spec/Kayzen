import { z } from 'zod';

import { logger } from '../logger';

/**
 * The slice of the Google Calendar API this app actually uses.
 *
 * Hand-rolled `fetch` rather than `googleapis`: that package is ~40 MB and
 * pulls in a discovery layer, a generated client for two hundred services and
 * a Node-only auth stack. Kayzen calls five endpoints. The whole surface is
 * below, and it runs in the Edge runtime as well as Node.
 *
 * Every response that becomes data is zod-parsed. These payloads cross a trust
 * boundary in exactly the way a form body does, and "it is Google, it will be
 * fine" is how a schema change becomes a 500 in a cron job at 3am.
 */

const BASE = 'https://www.googleapis.com/calendar/v3';

/** Google's own name for the calendar we make. Also its summary in the UI. */
export const KAYZEN_CALENDAR_SUMMARY = 'Kayzen Planner';

export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`google calendar api ${status}: ${detail}`);
    this.name = 'GoogleApiError';
  }

  /** 401/403 mean the grant is the problem; retrying the same call will not help. */
  get isAuthFailure(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /** 404 on a patch or delete: somebody removed the event in Google. */
  get isMissing(): boolean {
    return this.status === 404 || this.status === 410;
  }

  /** Rate limits and outages: the same call will work later. */
  get isTransient(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

async function call<T>(options: {
  accessToken: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  schema?: z.ZodType<T>;
}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BASE}${options.path}`, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    // A network failure is indistinguishable from an outage from here, and
    // both want the same answer: try again later.
    logger.warn({ err: error, path: options.path }, 'google calendar unreachable');
    throw new GoogleApiError(503, 'network');
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new GoogleApiError(response.status, detail.slice(0, 500));
  }

  if (!options.schema) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);
  const parsed = options.schema.safeParse(payload);

  if (!parsed.success) {
    logger.error(
      { path: options.path, issues: parsed.error.issues },
      'google calendar response had an unexpected shape',
    );
    throw new GoogleApiError(502, 'unexpected response shape');
  }

  return parsed.data;
}

const calendarSchema = z.object({ id: z.string().min(1), summary: z.string().optional() });
const eventSchema = z.object({ id: z.string().min(1), htmlLink: z.string().optional() });

export interface GoogleEventBody {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string } | { date: string };
  end: { dateTime: string; timeZone: string } | { date: string };
  location?: string;
  colorId?: string;
  reminders?: { useDefault: false; overrides: Array<{ method: 'popup'; minutes: number }> };
  /// Kayzen's own id, so an event can be traced back without a local lookup.
  extendedProperties?: { private: Record<string, string> };
}

/** Creates the dedicated calendar and returns its id. */
export async function createKayzenCalendar(accessToken: string, timeZone: string): Promise<string> {
  const created = await call({
    accessToken,
    method: 'POST',
    path: '/calendars',
    body: { summary: KAYZEN_CALENDAR_SUMMARY, timeZone, description: 'کارها و رویدادهای کایزن' },
    schema: calendarSchema,
  });

  return created.id;
}

/** Confirms a stored calendar id still exists. Cheap, and catches a deletion. */
export async function calendarExists(accessToken: string, calendarId: string): Promise<boolean> {
  try {
    await call({
      accessToken,
      method: 'GET',
      path: `/calendars/${encodeURIComponent(calendarId)}`,
      schema: calendarSchema,
    });
    return true;
  } catch (error) {
    if (error instanceof GoogleApiError && error.isMissing) return false;
    throw error;
  }
}

export async function insertEvent(
  accessToken: string,
  calendarId: string,
  body: GoogleEventBody,
): Promise<string> {
  const created = await call({
    accessToken,
    method: 'POST',
    path: `/calendars/${encodeURIComponent(calendarId)}/events`,
    body,
    schema: eventSchema,
  });

  return created.id;
}

export async function patchEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  body: GoogleEventBody,
): Promise<void> {
  await call({
    accessToken,
    method: 'PATCH',
    path: `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    body,
  });
}

/** Deletes an event. A 404 is success: the end state is what matters. */
export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  try {
    await call({
      accessToken,
      method: 'DELETE',
      path: `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    });
  } catch (error) {
    if (error instanceof GoogleApiError && error.isMissing) return;
    throw error;
  }
}
