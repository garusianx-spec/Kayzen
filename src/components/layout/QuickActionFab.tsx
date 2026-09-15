'use client';

import { motion } from 'framer-motion';
import {
  BookMarked,
  CalendarClock,
  CheckSquare,
  Flame,
  PiggyBank,
  Plus,
  StickyNote,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Sheet } from '@/components/ui/sheet';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { usePrefersReducedMotion } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui-store';
import type { QuickActionKind } from '@/types/domain';

/**
 * The elevated FAB and its six-action sheet.
 *
 * The rotation is the whole interaction: `+` turns 45° into `×` while the sheet
 * rises, so one control reads unambiguously as both "add" and "close" without a
 * second button appearing anywhere.
 *
 * Six actions is the ceiling for a two-column grid that still clears the
 * keyboard on a small phone; a seventh would push the last row under the fold.
 */

interface QuickAction {
  kind: QuickActionKind;
  label: string;
  description: string;
  icon: LucideIcon;
  tone: string;
}

export const QUICK_ACTIONS: readonly QuickAction[] = [
  {
    kind: 'task',
    label: 'کار تازه',
    description: 'یک قدم برای امروز',
    icon: CheckSquare,
    tone: 'bg-violet-soft text-violet',
  },
  {
    kind: 'habit',
    label: 'عادت',
    description: 'زنجیرهٔ روزانه',
    icon: Flame,
    tone: 'bg-flame-soft text-flame',
  },
  {
    kind: 'countdown',
    label: 'شمارش معکوس',
    description: 'تا یک روز مهم',
    icon: CalendarClock,
    tone: 'bg-sky-soft text-sky',
  },
  {
    kind: 'note',
    label: 'یادداشت سریع',
    description: 'قبل از فراموشی',
    icon: StickyNote,
    tone: 'bg-violet-soft text-violet',
  },
  {
    kind: 'financial-box',
    label: 'هدف مالی',
    description: 'صندوق پس‌انداز',
    icon: PiggyBank,
    tone: 'bg-emerald-soft text-emerald',
  },
  {
    kind: 'book-reflection',
    label: 'خلاصهٔ کتاب',
    description: 'برداشت امروز',
    icon: BookMarked,
    tone: 'bg-flame-soft text-flame',
  },
] as const;

export function QuickActionFab() {
  const isOpen = useUiStore((state) => state.isQuickActionSheetOpen);
  const openQuickActions = useUiStore((state) => state.openQuickActions);
  const closeQuickActions = useUiStore((state) => state.closeQuickActions);
  const openComposer = useUiStore((state) => state.openComposer);
  const haptics = useHapticFeedback();
  const reduceMotion = usePrefersReducedMotion();

  return (
    <>
      <motion.button
        type="button"
        aria-label={isOpen ? 'بستن افزودن' : 'افزودن'}
        aria-expanded={isOpen}
        onClick={() => {
          haptics.impact('medium');
          if (isOpen) closeQuickActions();
          else openQuickActions();
        }}
        animate={reduceMotion ? undefined : { rotate: isOpen ? 45 : 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 24 }}
        className={cn(
          'fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5.25rem)] right-5 z-40',
          'flex h-14 w-14 items-center justify-center rounded-full',
          'bg-violet-gradient text-white shadow-fab active:scale-95',
        )}
      >
        <Plus className="h-7 w-7" aria-hidden strokeWidth={2.4} />
      </motion.button>

      <Sheet
        open={isOpen}
        onOpenChange={(open) => (open ? openQuickActions() : closeQuickActions())}
        title="چه چیزی اضافه کنیم؟"
        description="یک درصد بهتر از دیروز"
      >
        <div className="grid grid-cols-2 gap-3 pb-2">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;

            return (
              <button
                key={action.kind}
                type="button"
                onClick={() => {
                  haptics.impact('light');
                  openComposer(action.kind);
                }}
                className="kz-pressable flex flex-col items-start gap-2 rounded-card border border-border bg-card p-4 text-right"
              >
                <span className={cn('rounded-card p-2', action.tone)}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="text-body font-medium text-content-primary">{action.label}</span>
                <span className="text-caption-sm text-content-muted">{action.description}</span>
              </button>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}
