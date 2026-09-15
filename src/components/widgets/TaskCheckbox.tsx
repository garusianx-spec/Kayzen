'use client';

import { motion } from 'framer-motion';

import { usePrefersReducedMotion } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

/**
 * The checkbox users tap dozens of times a day.
 *
 * The tick is an SVG path drawn with `stroke-dashoffset` rather than an icon
 * that pops in: the stroke animating along its own length is what makes ticking
 * something off feel like an action rather than a state change. 240 ms is the
 * upper bound where it still reads as instant.
 */

const PRIORITY_RING: Record<number, string> = {
  1: 'border-rose',
  2: 'border-flame',
  3: 'border-violet',
  4: 'border-border-strong',
};

export interface TaskCheckboxProps {
  checked: boolean;
  onChange(checked: boolean): void;
  priority?: number;
  disabled?: boolean;
  label: string;
}

export function TaskCheckbox({
  checked,
  onChange,
  priority = 3,
  disabled,
  label,
}: TaskCheckboxProps) {
  const reduceMotion = usePrefersReducedMotion();

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'kz-pressable relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        checked ? 'border-emerald bg-emerald' : cn('bg-transparent', PRIORITY_RING[priority]),
        disabled && 'opacity-50',
      )}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
        <motion.path
          d="M4 12.5 L9.5 18 L20 6.5"
          stroke="white"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: 'easeOut' }}
        />
      </svg>
    </button>
  );
}
