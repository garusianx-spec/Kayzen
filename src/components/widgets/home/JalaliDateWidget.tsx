'use client';

import { CalendarDays } from 'lucide-react';

import { toPersianDigits } from '@/lib/date/digits';
import {
  JALALI_MONTHS,
  JALALI_WEEKDAYS,
  jalaliWeekdayIndex,
  parseJalaliDayKey,
  toJalaliDayKey,
  toWallClock,
} from '@/lib/date/jalali';

/**
 * The date, said properly.
 *
 * The greeting above already carries a one-line Jalali date; this is the
 * version for someone who actually needs to know what day it is — the number
 * large enough to read at arm's length, the month and weekday spelled out, and
 * the Gregorian date small underneath, because a Persian user booking anything
 * international still has to translate.
 */

export function JalaliDateWidget({ timezone }: { timezone: string }) {
  const now = new Date();
  const jalali = parseJalaliDayKey(toJalaliDayKey(now, timezone));

  // The weekday comes from the *wall clock* in the user's zone, not from the
  // browser's: a user in Tehran opening the app from a laptop set to UTC at
  // 01:00 is already on the next Persian day.
  const weekday = JALALI_WEEKDAYS[jalaliWeekdayIndex(toWallClock(now, timezone))] ?? '';
  const gregorian = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);

  return (
    <section className="kz-card flex items-center gap-4" aria-label="تقویم جلالی">
      <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-card bg-violet-soft">
        <span className="tabular text-display leading-none text-violet">
          {jalali ? toPersianDigits(jalali.day) : '—'}
        </span>
      </div>

      <div className="min-w-0">
        <p className="text-title text-content-primary">
          {weekday}
          {jalali ? ` · ${JALALI_MONTHS[jalali.month - 1]}` : ''}
        </p>
        <p className="tabular mt-0.5 text-caption text-content-muted">
          {jalali ? toPersianDigits(jalali.year) : ''}
        </p>
        <p dir="ltr" className="mt-1 flex items-center gap-1.5 text-caption-sm text-content-muted">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          {gregorian}
        </p>
      </div>
    </section>
  );
}
