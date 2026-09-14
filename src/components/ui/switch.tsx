'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';

import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { cn } from '@/lib/utils';

export interface ToggleProps {
  checked: boolean;
  onCheckedChange(checked: boolean): void;
  disabled?: boolean;
  label: string;
  description?: string;
  id?: string;
}

/** Settings toggle. RTL-aware: the thumb travels right-to-left when enabled. */
export function Toggle({
  checked,
  onCheckedChange,
  disabled,
  label,
  description,
  id,
}: ToggleProps) {
  const haptics = useHapticFeedback();

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-body text-content-primary">
          {label}
        </label>
        {description ? (
          <p className="mt-0.5 text-caption text-content-muted">{description}</p>
        ) : null}
      </div>

      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => {
          haptics.selection();
          onCheckedChange(next);
        }}
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-pill border border-border transition-colors',
          checked ? 'bg-violet' : 'bg-surface-sunken',
          disabled && 'opacity-50',
        )}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            'block h-5 w-5 rounded-full bg-white shadow transition-transform',
            'translate-x-[-2px] data-[state=checked]:translate-x-[-22px]',
          )}
        />
      </SwitchPrimitive.Root>
    </div>
  );
}
