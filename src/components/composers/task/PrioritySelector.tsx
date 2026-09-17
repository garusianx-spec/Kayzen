'use client';

import { motion, useReducedMotion } from 'framer-motion';

import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { cn } from '@/lib/utils';

/**
 * Three levels of priority, each with its own light.
 *
 * The database column is an Eisenhower 1–4 ramp and predates this control. The
 * three levels the brief asks for map onto 1/2/3; a legacy 4 ("بعداً") is shown
 * as پایین rather than migrated, because the value still sorts correctly and
 * rewriting rows to tidy a display is not a trade worth making.
 *
 * Each level carries a distinct glow rather than only a distinct hue: at a
 * glance, in a dark room, on a phone at arm's length, luminance separates
 * faster than colour — and the same choice keeps the control legible to the
 * eight percent of men who will not reliably tell the amber from the crimson.
 */

export const PRIORITY_LEVELS = [
  {
    value: 3,
    label: 'پایین',
    hint: 'وقتی رسیدی',
    ring: 'border-sky text-sky',
    fill: 'bg-sky-soft',
    glow: '0 0 18px rgb(var(--kz-sky) / 0.35)',
  },
  {
    value: 2,
    label: 'متوسط',
    hint: 'این هفته',
    ring: 'border-flame text-flame',
    fill: 'bg-flame-soft',
    glow: '0 0 18px rgb(var(--kz-flame) / 0.38)',
  },
  {
    value: 1,
    label: 'بالا',
    hint: 'امروز، حتماً',
    ring: 'border-rose text-rose',
    fill: 'bg-rose-soft',
    glow: '0 0 20px rgb(var(--kz-rose) / 0.42)',
  },
] as const;

/** Folds the legacy "someday" value into the lowest of the three. */
export function normalisePriority(value: number): number {
  return value >= 3 ? 3 : value;
}

export function PrioritySelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const haptics = useHapticFeedback();
  const reduceMotion = useReducedMotion();
  const selected = normalisePriority(value);

  return (
    <div role="radiogroup" aria-label="اولویت" className="grid grid-cols-3 gap-2">
      {PRIORITY_LEVELS.map((level) => {
        const active = level.value === selected;

        return (
          <motion.button
            key={level.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              haptics.selection();
              onChange(level.value);
            }}
            // 44px is the floor for a touch target; this clears it with room
            // for the hint line underneath.
            className={cn(
              'flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-card border',
              'text-caption transition-colors',
              active ? cn(level.ring, level.fill) : 'border-border text-content-muted',
            )}
            style={active ? { boxShadow: level.glow } : undefined}
            whileTap={reduceMotion ? undefined : { scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          >
            <span className="font-bold">{level.label}</span>
            <span className={cn('text-caption-sm', active ? 'opacity-80' : 'opacity-70')}>
              {level.hint}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
