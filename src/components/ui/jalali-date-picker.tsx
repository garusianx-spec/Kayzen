'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { toPersianDigits } from '@/lib/date/digits';
import {
  JALALI_MONTHS,
  JALALI_WEEKDAYS_SHORT,
  addJalaliDays,
  buildJalaliMonthGrid,
  fromWallClock,
  getJalaliMonth,
  getJalaliYear,
  toJalaliDayKey,
  toWallClock,
} from '@/lib/date/jalali';
import { cn } from '@/lib/utils';

/**
 * Jalali month picker.
 *
 * Rendered from `buildJalaliMonthGrid()`, which always returns six rows, so the
 * sheet holding the picker never changes height between a 30-day and a 31-day
 * month — a resize mid-interaction moves the row under the user's finger.
 *
 * Navigation arrows are mirrored: in RTL, "next month" is to the *left*.
 */

export interface JalaliDatePickerProps {
  /** Selected instant, or `null` for no date. */
  value: Date | null;
  onChange(value: Date): void;
  timezone?: string;
  /** Preserves the time of day when only the date is picked. */
  className?: string;
}

export function JalaliDatePicker({
  value,
  onChange,
  timezone = 'Asia/Tehran',
  className,
}: JalaliDatePickerProps) {
  const haptics = useHapticFeedback();
  const [anchor, setAnchor] = useState<Date>(value ?? new Date());

  const grid = useMemo(
    () => buildJalaliMonthGrid(anchor, { timeZone: timezone }),
    [anchor, timezone],
  );

  const anchorWallClock = toWallClock(anchor, timezone);
  const monthLabel = `${JALALI_MONTHS[getJalaliMonth(anchorWallClock)] ?? ''} ${toPersianDigits(
    getJalaliYear(anchorWallClock),
  )}`;

  const selectedKey = value ? toJalaliDayKey(value, timezone) : null;

  const shiftMonth = (direction: 1 | -1): void => {
    haptics.selection();
    // Stepping 30 days lands inside the next/previous Jalali month for every
    // month length; the grid re-derives the real boundaries from there.
    setAnchor((current) =>
      fromWallClock(addJalaliDays(toWallClock(current, timezone), direction * 30), timezone),
    );
  };

  return (
    <div className={cn('rounded-card border border-border bg-card p-3', className)}>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="ماه قبل"
          className="kz-pressable rounded-full p-2 text-content-muted hover:bg-surface-raised"
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>

        <span className="text-body font-medium text-content-primary">{monthLabel}</span>

        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="ماه بعد"
          className="kz-pressable rounded-full p-2 text-content-muted hover:bg-surface-raised"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {JALALI_WEEKDAYS_SHORT.map((weekday) => (
          <span key={weekday} className="py-1 text-center text-caption-sm text-content-muted">
            {weekday}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.map((cell) => {
          const isSelected = selectedKey === cell.dayKey;

          return (
            <button
              key={cell.dayKey}
              type="button"
              onClick={() => {
                haptics.selection();
                // The picked day keeps the currently selected time of day, so
                // moving a 09:00 task to tomorrow keeps it at 09:00.
                const picked = new Date(cell.date);
                const previous = value ? toWallClock(value, timezone) : null;
                picked.setHours(previous?.getHours() ?? 9, previous?.getMinutes() ?? 0, 0, 0);
                onChange(fromWallClock(picked, timezone));
              }}
              className={cn(
                'tabular flex h-9 items-center justify-center rounded-card text-caption transition-colors',
                cell.isCurrentMonth ? 'text-content-primary' : 'text-content-muted/50',
                cell.isToday && !isSelected && 'ring-1 ring-violet/60',
                isSelected ? 'bg-violet text-white' : 'hover:bg-surface-raised',
              )}
            >
              {toPersianDigits(cell.dayOfMonth)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
