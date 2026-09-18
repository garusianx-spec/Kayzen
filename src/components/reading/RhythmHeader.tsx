'use client';

import { Flame, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ReadingSessionSheet } from './ReadingSessionSheet';
import { ProgressRing } from '@/components/ui/progress';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { useReadingHub, useUpdateReadingPlan, type ReadingHubSnapshot } from '@/lib/api/queries';
import { toPersianDigits } from '@/lib/date/digits';
import { JALALI_WEEKDAYS_SHORT } from '@/lib/date/jalali';
import {
  READING_DURATION_META,
  READING_MODES,
  formatMinutesAgainstGoal,
} from '@/lib/domain/reading-plan';
import { cn } from '@/lib/utils';
import type { ReadingDayDto, ReadingMode } from '@/types/domain';

/**
 * The top of the Reading Hub: one ring, one streak, one week, two switches.
 *
 * Seeded from the server render (`initial`) so the ring is never briefly empty
 * and the mode chips never flicker to the wrong one — the page already knows
 * the answer, and a header that re-decides it on the client is a header that
 * shows the wrong thing for a frame.
 *
 * Changing the mode swaps the half of the page *below* this component, which
 * the server rendered, so the switch calls `router.refresh()` after its
 * optimistic update. The summary half stays free of JavaScript that way; only
 * the shelf, which is genuinely interactive, ships any.
 */
export function RhythmHeader({ initial }: { initial: ReadingHubSnapshot }) {
  const { data = initial } = useReadingHub();
  const updatePlan = useUpdateReadingPlan();
  const haptics = useHapticFeedback();
  const router = useRouter();

  const [logging, setLogging] = useState(false);

  const { plan, rhythm } = data;

  const setMode = (mode: ReadingMode): void => {
    if (mode === plan.mode) return;

    haptics.selection();
    updatePlan.mutate(
      { mode },
      // The other half of the page is server-rendered against the old mode.
      { onSuccess: () => router.refresh() },
    );
  };

  return (
    <section className="space-y-4" aria-label="ریتم مطالعه">
      <div className="kz-card flex items-center gap-4">
        <ProgressRing value={rhythm.goalProgress} size={84} strokeWidth={7} tone="flame">
          <span className="text-center">
            <span className="tabular block text-title text-content-primary">
              {toPersianDigits(rhythm.minutesToday)}
            </span>
            <span className="block text-caption-sm text-content-muted">دقیقه</span>
          </span>
        </ProgressRing>

        <div className="min-w-0 flex-1 space-y-2">
          <p className="tabular text-caption text-content-secondary">
            {formatMinutesAgainstGoal(rhythm.minutesToday, plan.dailyMinutes)}
          </p>

          <p className="text-caption-sm text-content-muted">
            {rhythm.metGoalToday
              ? 'قرار امروزت را نگه داشتی 🌱'
              : rhythm.minutesToday > 0
                ? 'شروع شده؛ باقی‌اش هم می‌شود.'
                : 'هر روز کمی — همین یک‌درصد است.'}
          </p>

          {rhythm.streak > 0 ? (
            <p className="tabular flex items-center gap-1.5 text-caption-sm text-flame">
              <Flame className="h-3.5 w-3.5" aria-hidden />
              {toPersianDigits(rhythm.streak)} روز پشت‌سرهم
            </p>
          ) : null}
        </div>
      </div>

      <WeekStrip week={rhythm.week} />

      <div className="space-y-2">
        <span className="text-caption text-content-secondary">هر روز چقدر؟</span>
        <div className="grid grid-cols-3 gap-2">
          {READING_DURATION_META.map((option) => {
            const active = option.minutes === plan.dailyMinutes;

            return (
              <button
                key={option.minutes}
                type="button"
                onClick={() => {
                  if (active) return;
                  haptics.selection();
                  updatePlan.mutate({ dailyMinutes: option.minutes });
                }}
                aria-pressed={active}
                className={cn(
                  'min-h-[44px] rounded-card border px-2 py-2 text-center transition-colors active:scale-95',
                  active
                    ? 'border-flame bg-flame-soft text-flame'
                    : 'border-border text-content-muted',
                )}
              >
                <span className="tabular block text-caption">{option.label}</span>
              </button>
            );
          })}
        </div>

        <p className="text-caption-sm text-content-muted">
          {READING_DURATION_META.find((option) => option.minutes === plan.dailyMinutes)?.hint ??
            'یک قرار کوچک با خودت.'}
        </p>
      </div>

      <div className="space-y-2">
        <span className="text-caption text-content-secondary">چطور می‌خوانی؟</span>

        <div
          role="tablist"
          aria-label="حالت مطالعه"
          className="grid grid-cols-2 gap-1 rounded-card bg-surface-sunken p-1"
        >
          {READING_MODES.map((option) => {
            const active = option.mode === plan.mode;

            return (
              <button
                key={option.mode}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMode(option.mode)}
                className={cn(
                  'min-h-[44px] rounded-card px-3 text-caption transition-colors active:scale-95',
                  active
                    ? 'bg-card text-content-primary shadow-card'
                    : 'text-content-muted hover:text-content-secondary',
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <p className="text-caption-sm text-content-muted">
          {READING_MODES.find((option) => option.mode === plan.mode)?.description}
        </p>
      </div>

      {plan.mode === 'SUMMARY' ? (
        <>
          <button
            type="button"
            onClick={() => {
              haptics.impact('light');
              setLogging(true);
            }}
            className="kz-pressable flex min-h-[44px] w-full items-center justify-center gap-2 rounded-card border border-flame/50 bg-flame-soft text-caption text-flame active:scale-[0.98]"
          >
            <Play className="h-4 w-4" aria-hidden />
            ثبت مطالعهٔ امروز
          </button>

          <ReadingSessionSheet
            open={logging}
            onOpenChange={setLogging}
            dailyMinutes={plan.dailyMinutes}
          />
        </>
      ) : null}
    </section>
  );
}

/**
 * Seven cells, oldest on the right.
 *
 * `week` arrives today-first; reversing it puts the oldest day first in the
 * DOM, which in an RTL row is the rightmost position — so time runs right to
 * left, the direction the rest of the page is read in.
 *
 * The weekday letter comes with the data rather than being recomputed here:
 * the server derived it from the same instant it keyed the sessions by, and a
 * second derivation is a second chance to disagree.
 */
function WeekStrip({ week }: { week: ReadingDayDto[] }) {
  return (
    <ul className="flex items-end justify-between gap-1" aria-label="هفتهٔ گذشته">
      {[...week].reverse().map((day, index) => {
        const isToday = index === week.length - 1;
        const label = JALALI_WEEKDAYS_SHORT[day.weekdayIndex] ?? '—';

        return (
          <li key={day.dayKey} className="flex flex-1 flex-col items-center gap-1.5">
            <span
              className={cn(
                'flex h-9 w-full items-center justify-center rounded-card border text-caption-sm transition-colors',
                day.metGoal
                  ? 'border-flame bg-flame-soft text-flame'
                  : day.minutes > 0
                    ? 'border-border-strong bg-surface-raised text-content-secondary'
                    : 'border-dashed border-border text-content-muted',
                isToday && 'ring-1 ring-violet',
              )}
              aria-label={`${label}: ${toPersianDigits(day.minutes)} دقیقه`}
            >
              {/* A cell reading "۰" on six days of seven is noise; the dash
                  says "nothing here" without pretending to be a measurement. */}
              <span className="tabular" aria-hidden>
                {day.minutes > 0 ? toPersianDigits(day.minutes) : '—'}
              </span>
            </span>
            <span className="text-caption-sm text-content-muted" aria-hidden>
              {label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
