'use client';

import { Flame } from 'lucide-react';

import { toPersianDigits } from '@/lib/date/digits';
import { streakLabel, streakTier, type StreakTier } from '@/lib/domain/streak-engine';
import { cn } from '@/lib/utils';

/**
 * Streak badge.
 *
 * The tier drives the visual weight rather than the raw number, so a three-day
 * streak already looks like something worth protecting — which is precisely
 * when a user is most likely to abandon it.
 */

const TIER_STYLE: Record<StreakTier, string> = {
  none: 'text-content-muted',
  spark: 'text-flame/70',
  flame: 'text-flame',
  blaze: 'text-flame drop-shadow-[0_0_6px_rgb(var(--kz-flame)/0.6)]',
  inferno: 'text-flame drop-shadow-[0_0_10px_rgb(var(--kz-flame)/0.8)]',
  legend: 'text-flame drop-shadow-[0_0_14px_rgb(var(--kz-flame))]',
};

export function StreakFlame({
  streak,
  animate = false,
  className,
}: {
  streak: number;
  /** Pulses right after an increment; driven by the caller, not by a timer. */
  animate?: boolean;
  className?: string;
}) {
  const tier = streakTier(streak);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-caption font-medium',
        TIER_STYLE[tier],
        className,
      )}
      title={toPersianDigits(streakLabel(streak))}
    >
      <Flame
        className={cn('h-4 w-4', animate && 'animate-flame-pulse')}
        aria-hidden
        fill={tier === 'none' ? 'none' : 'currentColor'}
      />
      <span className="tabular">{toPersianDigits(streak)}</span>
    </span>
  );
}
