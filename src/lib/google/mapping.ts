import { toWallClock } from '../date/jalali';
import type { GoogleEventBody } from './calendar-api';

/**
 * Kayzen rows → Google Calendar event bodies.
 *
 * Pure, and therefore the part of this integration that has tests. Everything
 * else in `src/lib/google/` is I/O with a thin shell around it; this is where
 * the actual product decisions live — what belongs on a calendar at all, how
 * long a task occupies, what colour it takes, when it should nudge.
 */

/** A task with no due date is not an appointment. Thirty minutes is the floor. */
const DEFAULT_TASK_MINUTES = 30;
/** One pomodoro, as the rest of the app counts them. */
const POMODORO_MINUTES = 25;

/** Google's event palette is eleven fixed slots; these are the closest four. */
const PRIORITY_COLOR: Record<number, string> = {
  1: '11', // Tomato — فوری
  2: '6', // Tangerine — مهم
  3: '9', // Blueberry — عادی
  4: '8', // Graphite — یک روزی
};

const TOKEN_COLOR: Record<string, string> = {
  violet: '3', // Grape
  flame: '6', // Tangerine
  emerald: '10', // Basil
  rose: '11', // Tomato
  sky: '7', // Peacock
};

/** `2026-09-19` in the given zone — an all-day event's own idea of a date. */
export function calendarDate(instant: Date, timeZone: string): string {
  const wall = toWallClock(instant, timeZone);
  const pad = (value: number): string => String(value).padStart(2, '0');

  return `${wall.getFullYear()}-${pad(wall.getMonth() + 1)}-${pad(wall.getDate())}`;
}

/** Google wants an exclusive end date for all-day events, so tomorrow. */
function nextCalendarDate(instant: Date, timeZone: string): string {
  return calendarDate(new Date(instant.getTime() + 86_400_000), timeZone);
}

export interface TaskForCalendar {
  id: string;
  title: string;
  description: string | null;
  dueAt: Date | null;
  remindAt: Date | null;
  priority: number;
  location: string | null;
  estimatedPomodoros: number | null;
  status: string;
}

/**
 * A task as an appointment, or null when it does not belong on a calendar.
 *
 * Three ways a task earns a null, and each is a deliberate product call:
 *
 *  - **no due date.** A calendar answers "when"; a task with no when has no
 *    honest place on one, and putting it at "today" would quietly invent a
 *    commitment the person never made.
 *  - **completed.** The point of the mirror is to show what is still owed. A
 *    calendar full of finished chores is a calendar people stop reading.
 *  - **archived.** Same, with less ambiguity.
 *
 * The caller turns a null into a DELETE, so unticking a task or clearing its
 * due date removes the event rather than leaving a ghost.
 */
export function taskEvent(task: TaskForCalendar, timeZone: string): GoogleEventBody | null {
  if (!task.dueAt) return null;
  if (task.status === 'COMPLETED' || task.status === 'ARCHIVED') return null;

  const minutes = task.estimatedPomodoros
    ? task.estimatedPomodoros * POMODORO_MINUTES
    : DEFAULT_TASK_MINUTES;

  const end = new Date(task.dueAt.getTime() + minutes * 60_000);

  return {
    summary: task.title,
    ...(task.description ? { description: task.description } : {}),
    start: { dateTime: task.dueAt.toISOString(), timeZone },
    end: { dateTime: end.toISOString(), timeZone },
    ...(task.location ? { location: task.location } : {}),
    colorId: PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR[3],
    ...remindersFor(task.dueAt, task.remindAt),
    extendedProperties: { private: { kayzenEntity: 'TASK', kayzenId: task.id } },
  };
}

export interface CountdownForCalendar {
  id: string;
  title: string;
  description: string | null;
  eventAt: Date;
  isAllDay: boolean;
  colorToken: string;
  notifyBeforeMinutes: number[];
}

/**
 * A countdown as an event.
 *
 * All-day countdowns become all-day events rather than midnight appointments:
 * a birthday at 00:00 shows up at the top of the day in Google, which is where
 * a birthday belongs, and an anniversary that reads "۱۲:۰۰ ق.ظ" is wrong in a
 * way people notice immediately.
 */
export function countdownEvent(countdown: CountdownForCalendar, timeZone: string): GoogleEventBody {
  const base = {
    summary: countdown.title,
    ...(countdown.description ? { description: countdown.description } : {}),
    colorId: TOKEN_COLOR[countdown.colorToken] ?? TOKEN_COLOR.violet,
    ...remindersFromMinutes(countdown.notifyBeforeMinutes),
    extendedProperties: { private: { kayzenEntity: 'COUNTDOWN', kayzenId: countdown.id } },
  } satisfies Partial<GoogleEventBody>;

  if (countdown.isAllDay) {
    return {
      ...base,
      start: { date: calendarDate(countdown.eventAt, timeZone) },
      end: { date: nextCalendarDate(countdown.eventAt, timeZone) },
    };
  }

  return {
    ...base,
    start: { dateTime: countdown.eventAt.toISOString(), timeZone },
    end: { dateTime: new Date(countdown.eventAt.getTime() + 3_600_000).toISOString(), timeZone },
  };
}

/** Google counts reminders in minutes *before* the start, and caps them at 4 weeks. */
const MAX_REMINDER_MINUTES = 40_320;

function remindersFromMinutes(minutes: readonly number[]): Pick<GoogleEventBody, 'reminders'> {
  const overrides = [...new Set(minutes)]
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= MAX_REMINDER_MINUTES)
    .sort((left, right) => right - left)
    // Google rejects more than five overrides on one event.
    .slice(0, 5)
    .map((value) => ({ method: 'popup' as const, minutes: Math.round(value) }));

  // An empty override list with `useDefault: false` means "no reminders at
  // all", which is a real answer — but an event Kayzen created with no nudge
  // is less useful than one that inherits the calendar's own default.
  return overrides.length > 0 ? { reminders: { useDefault: false, overrides } } : {};
}

/**
 * A task's single reminder, expressed the way Google wants it.
 *
 * Kayzen stores an absolute instant (`remindAt`) because that is what its own
 * scheduler needs; Google wants an offset. A reminder that has drifted behind
 * the due date — the due date moved later, the reminder did not — is dropped
 * rather than clamped to zero, which would fire at the moment the task starts.
 */
function remindersFor(dueAt: Date, remindAt: Date | null): Pick<GoogleEventBody, 'reminders'> {
  if (!remindAt) return {};

  const minutes = Math.round((dueAt.getTime() - remindAt.getTime()) / 60_000);
  if (minutes <= 0 || minutes > MAX_REMINDER_MINUTES) return {};

  return remindersFromMinutes([minutes]);
}
