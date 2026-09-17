'use client';

import { Plus } from 'lucide-react';

import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui-store';
import type { QuickActionKind } from '@/types/domain';

/**
 * The per-screen "add one of these".
 *
 * The floating button now lives only on Home, where it means "start
 * something". Every other screen is *about* one kind of thing, so the button
 * that adds one belongs in that screen's own header, where it can say what it
 * adds instead of offering a menu of six.
 *
 * 44px square, in the thumb's reach at the top of a one-handed grip, and
 * labelled — an unlabelled `+` at the end of a heading is a guess.
 */
export function ScreenAddButton({
  kind,
  label,
  className,
}: {
  kind: QuickActionKind;
  /** Announced, and shown beside the icon. */
  label: string;
  className?: string;
}) {
  const openComposer = useUiStore((state) => state.openComposer);
  const haptics = useHapticFeedback();

  return (
    <button
      type="button"
      onClick={() => {
        haptics.impact('medium');
        openComposer(kind);
      }}
      aria-label={label}
      className={cn(
        'kz-pressable flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-pill',
        'border border-border px-4 text-caption text-content-secondary',
        'hover:border-violet hover:text-violet active:scale-95',
        className,
      )}
    >
      <Plus className="h-4 w-4 text-violet" aria-hidden />
      {label}
    </button>
  );
}
