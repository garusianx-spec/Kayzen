import { describe, expect, it } from 'vitest';

import {
  createFinancialBoxSchema,
  createHabitSchema,
  createTaskSchema,
  otpCodeSchema,
  phoneSchema,
  pushSubscriptionSchema,
  sendOtpSchema,
  verifyOtpSchema,
} from '@/lib/validation/schemas';

/**
 * The schemas are the contract shared by the forms and the route handlers, so
 * these tests are really testing that one definition serves both: anything the
 * form accepts, the API accepts, and in exactly the same normalised shape.
 */

describe('phoneSchema', () => {
  it('normalises every accepted spelling to E.164', () => {
    for (const input of ['09123456789', '۰۹۱۲۳۴۵۶۷۸۹', '+98 912 345 6789', '00989123456789']) {
      expect(phoneSchema.parse(input)).toBe('+989123456789');
    }
  });

  it('reports a Persian error for an invalid number', () => {
    const result = phoneSchema.safeParse('02112345678');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('۰۹۱۲۳۴۵۶۷۸۹');
    }
  });
});

describe('otpCodeSchema', () => {
  it('normalises Persian digits and strips separators', () => {
    expect(otpCodeSchema.parse('۱۲۳۴۵۶')).toBe('123456');
    expect(otpCodeSchema.parse('123 456')).toBe('123456');
    expect(otpCodeSchema.parse('123-456')).toBe('123456');
  });

  it('rejects codes that are not 4–8 digits', () => {
    expect(otpCodeSchema.safeParse('12').success).toBe(false);
    expect(otpCodeSchema.safeParse('abcdef').success).toBe(false);
    expect(otpCodeSchema.safeParse('123456789').success).toBe(false);
  });
});

describe('auth request schemas', () => {
  it('accepts a complete send request', () => {
    const parsed = sendOtpSchema.parse({ phone: '۰۹۱۲۳۴۵۶۷۸۹', timezone: 'Asia/Tehran' });
    expect(parsed).toEqual({ phone: '+989123456789', timezone: 'Asia/Tehran' });
  });

  it('rejects an invalid IANA timezone', () => {
    expect(
      sendOtpSchema.safeParse({ phone: '09123456789', timezone: 'Mars/Olympus' }).success,
    ).toBe(false);
  });

  it('requires a challenge id on verification', () => {
    expect(verifyOtpSchema.safeParse({ phone: '09123456789', code: '123456' }).success).toBe(false);

    const parsed = verifyOtpSchema.parse({
      phone: '09123456789',
      code: '۱۲۳۴۵۶',
      challengeId: 'a'.repeat(32),
    });

    expect(parsed.code).toBe('123456');
    expect(parsed.phone).toBe('+989123456789');
  });
});

describe('domain schemas', () => {
  it('applies defaults so the API and the form agree on unset fields', () => {
    const task = createTaskSchema.parse({ title: '  سی دقیقه مطالعه  ' });

    expect(task.title).toBe('سی دقیقه مطالعه');
    expect(task.priority).toBe(3);
    expect(task.difficulty).toBe('MEDIUM');
    expect(task.tags).toEqual([]);
  });

  it('rejects a whitespace-only title', () => {
    expect(createTaskSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  it('accepts Persian-digit amounts on a financial goal', () => {
    const box = createFinancialBoxSchema.parse({
      title: 'سفر شمال',
      targetAmount: '۲٬۵۰۰٬۰۰۰',
    });

    expect(box.targetAmount).toBe(2_500_000);
    expect(box.currency).toBe('IRT');
  });

  it('de-duplicates and sorts habit weekdays', () => {
    const habit = createHabitSchema.parse({ title: 'آب', frequency: [3, 1, 1, 0] });
    expect(habit.frequency).toEqual([0, 1, 3]);
  });

  it('requires at least one scheduled weekday', () => {
    expect(createHabitSchema.safeParse({ title: 'آب', frequency: [] }).success).toBe(false);
  });

  it('validates a push subscription payload', () => {
    const parsed = pushSubscriptionSchema.parse({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) },
    });

    expect(parsed.endpoint).toContain('fcm.googleapis.com');
  });
});
