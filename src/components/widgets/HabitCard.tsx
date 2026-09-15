'use client';

import { Check } from 'lucide-react';
import { useState } from 'react';

import { StreakFlame } from './StreakFlame';
import { ProgressRing } from '@/components/ui/progress';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { useLogHabit } from '@/lib/api/queries';
import { toPersianDigits } from '@/lib/date/digits';
import { cn } from '@/lib/utils';
import type { HabitDto } from '@/types/domain';

/** A habit, its ring, and the one control that matters: check it off. */
export function HabitCard({ habit }: { habit: HabitDto }) {
  const logHabit = useLogHabit();
  const haptics = useHapticFeedback();
  const [justIncremented, setJustIncremented] = useState(false);

  const progress = Math.min(1, habit.todayCount / Math.max(1, habit.targetPerDay));

  const handleCheck = (): void => {
    const undo = habit.isCompletedToday && habit.targetPerDay === 1;

    if (undo) {
      haptics.impact('light');
    } else {
      // Crossing the target is the moment worth celebrating; intermediate taps
      // on a multi-target habit get the lighter selection tick.
      const willComplete = habit.todayCount + 1 >= habit.targetPerDay;
      if (willComplete) {
        haptics.streakIncrement();
        setJustIncremented(true);
        window.setTimeout(() => setJustIncremented(false), 1200);
      } else {
        haptics.selection();
      }
    }

    logHabit.mutate({ id: habit.id, undo });
  };

  return (
    <article
      className={cn(
        'flex items-center gap-3 rounded-card border border-border bg-card p-3',
        !habit.isDueToday && 'opacity-60',
      )}
    >
      <ProgressRing value={progress} size={52} strokeWidth={5} tone={habit.colorToken}>
        <span className="tabular text-caption-sm text-content-secondary">
          {toPersianDigits(habit.todayCount)}
          {habit.targetPerDay > 1 ? `/${toPersianDigits(habit.targetPerDay)}` : ''}
        </span>
      </ProgressRing>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-body text-content-primary">{habit.title}</h3>
        <div className="mt-1 flex items-center gap-3">
          <StreakFlame streak={habit.currentStreak} animate={justIncremented} />
          <span className="text-caption-sm text-content-muted">
            {habit.isDueToday ? 'امروز سررسید دارد' : 'امروز سررسید ندارد'}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleCheck}
        disabled={logHabit.isPending}
        aria-label={
          habit.isCompletedToday ? `${habit.title} را برگردان` : `${habit.title} را ثبت کن`
        }
        className={cn(
          'kz-pressable flex h-11 w-11 items-center justify-center rounded-full border-2 transition-colors',
          habit.isCompletedToday
            ? 'border-emerald bg-emerald text-white'
            : 'border-border-strong text-content-muted hover:border-violet hover:text-violet',
        )}
      >
        <Check className="h-5 w-5" aria-hidden strokeWidth={3} />
      </button>
    </article>
  );
}
