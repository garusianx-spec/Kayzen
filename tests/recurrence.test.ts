import { describe, expect, it } from 'vitest';

import {
  describeRecurrence,
  nextOccurrence,
  parseRecurrence,
  serializeRecurrence,
} from '@/lib/domain/recurrence';
import { createTaskSchema } from '@/lib/validation/schemas';
import { toJalaliDayKey } from '@/lib/date/jalali';

const TEHRAN = 'Asia/Tehran';

/**
 * Recurrence is a three-module contract: the composer serialises a rule, the
 * request schema validates the string, and the completion handler parses it
 * back to materialise the next instance. Each half is easy to change in
 * isolation and break the other two, so the round trip is asserted here.
 */

describe('serialize → validate → parse', () => {
  it('produces a string the task schema accepts', () => {
    for (const frequency of ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const) {
      const rule = serializeRecurrence({ frequency, interval: 1 });

      expect(rule.startsWith('RRULE:FREQ=')).toBe(true);
      expect(createTaskSchema.safeParse({ title: 'کار', recurrence: rule }).success).toBe(true);
    }
  });

  it('round-trips through the parser unchanged', () => {
    const original = { frequency: 'WEEKLY' as const, interval: 2, byDay: [0, 2] };
    const parsed = parseRecurrence(serializeRecurrence(original));

    expect(parsed?.frequency).toBe('WEEKLY');
    expect(parsed?.interval).toBe(2);
    expect(parsed?.byDay).toEqual([0, 2]);
  });

  it('rejects a rule the schema would not have produced', () => {
    expect(createTaskSchema.safeParse({ title: 'کار', recurrence: 'FREQ=DAILY' }).success).toBe(
      false,
    );
    expect(
      createTaskSchema.safeParse({ title: 'کار', recurrence: 'RRULE:FREQ=HOURLY' }).success,
    ).toBe(false);
  });

  it('treats a missing or malformed rule as "no recurrence"', () => {
    expect(parseRecurrence(null)).toBeNull();
    expect(parseRecurrence('')).toBeNull();
    expect(parseRecurrence('not a rule')).toBeNull();
  });
});

describe('nextOccurrence', () => {
  const from = new Date('2024-09-14T09:00:00Z'); // شنبه ۲۴ شهریور ۱۴۰۳

  it('advances a daily rule by its interval', () => {
    const rule = parseRecurrence('RRULE:FREQ=DAILY;INTERVAL=3');
    const next = nextOccurrence(rule!, from, TEHRAN);

    expect(toJalaliDayKey(next!, TEHRAN)).toBe('1403-06-27');
  });

  it('advances monthly in the Jalali calendar, not the Gregorian one', () => {
    const rule = parseRecurrence('RRULE:FREQ=MONTHLY');
    const next = nextOccurrence(rule!, from, TEHRAN);

    // ۲۴ شهریور → ۲۴ مهر, which is 30 Gregorian days here, not 31.
    expect(toJalaliDayKey(next!, TEHRAN)).toBe('1403-07-24');
  });

  it('stops once the rule has run out', () => {
    const rule = parseRecurrence('RRULE:FREQ=DAILY;UNTIL=20240915T000000Z');
    expect(nextOccurrence(rule!, new Date('2024-09-20T09:00:00Z'), TEHRAN)).toBeNull();
  });
});

describe('describeRecurrence', () => {
  it('reads as Persian, with the weekday names the engine indexes by', () => {
    expect(describeRecurrence({ frequency: 'DAILY', interval: 1 })).toBe('هر روز');
    expect(describeRecurrence({ frequency: 'WEEKLY', interval: 2 })).toContain('هر ۲ هفته');
    expect(describeRecurrence({ frequency: 'WEEKLY', interval: 1, byDay: [0, 2] })).toContain(
      'شنبه',
    );
  });
});
