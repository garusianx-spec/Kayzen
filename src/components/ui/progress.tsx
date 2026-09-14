'use client';

import * as ProgressPrimitive from '@radix-ui/react-progress';

import { toPersianDigits } from '@/lib/date/digits';
import { cn } from '@/lib/utils';
import type { ColorToken } from '@/types/domain';

const TRACK_TONES: Record<ColorToken, string> = {
  violet: 'bg-violet',
  flame: 'bg-flame',
  emerald: 'bg-emerald',
  rose: 'bg-rose',
  sky: 'bg-sky',
};

export interface ProgressProps {
  /** `0…1`. Values outside the range are clamped. */
  value: number;
  tone?: ColorToken;
  className?: string;
  label?: string;
}

export function Progress({ value, tone = 'violet', className, label }: ProgressProps) {
  const clamped = Math.min(1, Math.max(0, value));
  const percent = Math.round(clamped * 100);

  return (
    <ProgressPrimitive.Root
      value={percent}
      className={cn('h-2 w-full overflow-hidden rounded-pill bg-surface-sunken', className)}
      aria-label={label}
      aria-valuetext={`${toPersianDigits(percent)}٪`}
    >
      <ProgressPrimitive.Indicator
        className={cn('h-full rounded-pill transition-[width] duration-500', TRACK_TONES[tone])}
        // RTL: the bar has to grow from the right edge, so the indicator is
        // sized rather than translated.
        style={{ width: `${percent}%` }}
      />
    </ProgressPrimitive.Root>
  );
}

/**
 * Circular progress, for the habit rings and the Pomodoro dial.
 *
 * The arc starts at 12 o'clock and sweeps counter-clockwise, matching the
 * direction Persian readers scan.
 */
export function ProgressRing({
  value,
  size = 64,
  strokeWidth = 6,
  tone = 'violet',
  children,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  tone?: ColorToken;
  children?: React.ReactNode;
}) {
  const clamped = Math.min(1, Math.max(0, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const STROKE: Record<ColorToken, string> = {
    violet: 'stroke-violet',
    flame: 'stroke-flame',
    emerald: 'stroke-emerald',
    rose: 'stroke-rose',
    sky: 'stroke-sky',
  };

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
        className="-rotate-90 scale-x-[-1]"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className="fill-none stroke-surface-sunken"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          className={cn('fill-none transition-[stroke-dashoffset] duration-700', STROKE[tone])}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </div>
  );
}
