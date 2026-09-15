import { describe, expect, it } from 'vitest';

import {
  daysUntil,
  formatFullJalaliDate,
  formatRelativeJalali,
  jalaliWeekdayIndex,
  parseJalaliDayKey,
  startOfUserDay,
  toJalaliDayKey,
  toUtcDateKey,
  toWallClock,
  buildJalaliMonthGrid,
} from '@/lib/date/jalali';
import {
  formatCurrency,
  formatPersianNumber,
  parsePersianNumber,
  toLatinDigits,
  toPersianDigits,
} from '@/lib/date/digits';

const TEHRAN = 'Asia/Tehran';

describe('day keys', () => {
  it('maps an instant to the user’s Jalali calendar day', () => {
    // 2024-09-14T09:00:00Z is 12:30 in Tehran on ۲۴ شهریور ۱۴۰۳.
    const key = toJalaliDayKey(new Date('2024-09-14T09:00:00Z'), TEHRAN);
    expect(key).toBe('1403-06-24');
  });

  it('resolves the day in the user’s zone, not the server’s', () => {
    // 22:30 UTC is already the next day in Tehran (+03:30).
    const instant = new Date('2024-09-14T22:30:00Z');

    expect(toJalaliDayKey(instant, TEHRAN)).toBe('1403-06-25');
    expect(toJalaliDayKey(instant, 'UTC')).toBe('1403-06-24');
  });

  it('honours a custom day-start hour for night owls', () => {
    // 02:00 Tehran with a 04:00 roll-over still belongs to the previous day.
    const instant = new Date('2024-09-14T22:30:00Z'); // 02:00 Tehran, 15 Sep
    expect(toJalaliDayKey(instant, TEHRAN, 4)).toBe('1403-06-24');
    expect(toJalaliDayKey(instant, TEHRAN, 0)).toBe('1403-06-25');
  });

  it('parses and rejects day keys', () => {
    expect(parseJalaliDayKey('1403-06-24')).toEqual({ year: 1403, month: 6, day: 24 });
    expect(parseJalaliDayKey('1403-13-01')).toBeNull();
    expect(parseJalaliDayKey('1403-6-4')).toBeNull();
    expect(parseJalaliDayKey('not-a-date')).toBeNull();
  });

  it('normalises habit log dates to UTC midnight', () => {
    const key = toUtcDateKey(new Date('2024-09-14T09:00:00Z'), TEHRAN);

    expect(key.getUTCHours()).toBe(0);
    expect(key.getUTCMinutes()).toBe(0);
    expect(key.toISOString()).toBe('2024-09-14T00:00:00.000Z');
  });
});

describe('startOfUserDay', () => {
  it('returns the instant the user’s day began', () => {
    const start = startOfUserDay(new Date('2024-09-14T09:00:00Z'), TEHRAN, 0);
    // Midnight in Tehran is 20:30 UTC the previous day.
    expect(start.toISOString()).toBe('2024-09-13T20:30:00.000Z');
  });
});

describe('weekday indexing', () => {
  it('treats شنبه as the first day of the week', () => {
    // 2024-09-14 is a Saturday.
    const saturday = toWallClock(new Date('2024-09-14T09:00:00Z'), TEHRAN);
    expect(jalaliWeekdayIndex(saturday)).toBe(0);

    const sunday = toWallClock(new Date('2024-09-15T09:00:00Z'), TEHRAN);
    expect(jalaliWeekdayIndex(sunday)).toBe(1);

    const friday = toWallClock(new Date('2024-09-20T09:00:00Z'), TEHRAN);
    expect(jalaliWeekdayIndex(friday)).toBe(6);
  });
});

describe('formatting', () => {
  it('writes the full Persian date', () => {
    expect(formatFullJalaliDate(new Date('2024-09-14T09:00:00Z'), TEHRAN)).toBe(
      'شنبه 24 شهریور 1403',
    );
  });

  it('prefers calendar words over elapsed hours', () => {
    const now = new Date('2024-09-14T09:00:00Z');

    expect(formatRelativeJalali(new Date('2024-09-15T09:00:00Z'), { now, timeZone: TEHRAN })).toBe(
      'فردا',
    );
    expect(formatRelativeJalali(new Date('2024-09-13T09:00:00Z'), { now, timeZone: TEHRAN })).toBe(
      'دیروز',
    );
    expect(formatRelativeJalali(new Date('2024-09-03T09:00:00Z'), { now, timeZone: TEHRAN })).toBe(
      '11 روز پیش',
    );
  });

  it('counts whole calendar days for countdowns', () => {
    const now = new Date('2024-09-14T09:00:00Z');
    expect(daysUntil(new Date('2024-09-25T05:00:00Z'), { now, timeZone: TEHRAN })).toBe(11);
  });
});

describe('month grid', () => {
  it('always returns six weeks so the sheet never resizes', () => {
    const anchor = new Date('2024-09-14T09:00:00Z');
    const grid = buildJalaliMonthGrid(anchor, { timeZone: TEHRAN, now: anchor });

    expect(grid).toHaveLength(42);
    expect(grid.filter((cell) => cell.isCurrentMonth).length).toBeGreaterThanOrEqual(29);
    expect(grid.filter((cell) => cell.isToday)).toHaveLength(1);
  });
});

describe('Persian digits', () => {
  it('converts in both directions', () => {
    expect(toPersianDigits('1403/06/24')).toBe('۱۴۰۳/۰۶/۲۴');
    expect(toLatinDigits('۱۴۰۳-۰۶-۲۴')).toBe('1403-06-24');
    expect(toLatinDigits('٠٩١٢')).toBe('0912');
  });

  it('parses numbers typed on a Persian keyboard', () => {
    expect(parsePersianNumber('۲٬۵۰۰٬۰۰۰')).toBe(2_500_000);
    expect(parsePersianNumber('2,500,000')).toBe(2_500_000);
    expect(parsePersianNumber('۱۲٫۵')).toBe(12.5);
    expect(parsePersianNumber('abc')).toBeNull();
    expect(parsePersianNumber('')).toBeNull();
  });

  it('formats currency the way Persian readers expect', () => {
    expect(formatPersianNumber(2_500_000)).toBe('۲٬۵۰۰٬۰۰۰');
    expect(formatCurrency(2_500_000)).toBe('۲٬۵۰۰٬۰۰۰ تومان');
  });
});
