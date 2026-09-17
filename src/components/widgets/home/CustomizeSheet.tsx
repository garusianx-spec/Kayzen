'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckSquare,
  Flame,
  LayoutGrid,
  PiggyBank,
  Quote,
  RotateCcw,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

import { Sheet } from '@/components/ui/sheet';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import {
  DEFAULT_LAYOUT,
  HOME_WIDGETS,
  reorder,
  toggle,
  type HomeWidgetId,
} from '@/lib/domain/home-widgets';
import { cn } from '@/lib/utils';

/**
 * The home screen, rearranged.
 *
 * Visible widgets sit at the top in their real order, with the arrows that move
 * them; hidden ones are below, in registry order, waiting. That split is the
 * whole design — a single list with checkboxes makes "which of these am I
 * actually seeing, and in what order" a puzzle, and this screen exists to
 * answer exactly that question.
 *
 * Arrows rather than drag handles, for the same reason as the task checklist: a
 * drag inside a bottom sheet fights the sheet's own dismiss gesture, and the
 * browser cannot tell them apart until several frames in.
 *
 * Every change is applied immediately. There is no save button, because there
 * is nothing to lose by being wrong — the arrow that moved a widget too far
 * moves it back.
 */

const ICONS: Record<string, LucideIcon> = {
  Sparkles,
  CalendarDays,
  Quote,
  CalendarClock,
  CheckSquare,
  Flame,
  PiggyBank,
  BookOpen,
  LayoutGrid,
};

export function CustomizeSheet({
  open,
  onOpenChange,
  layout,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: HomeWidgetId[];
  onChange: (next: HomeWidgetId[]) => void;
}) {
  const haptics = useHapticFeedback();
  const reduceMotion = useReducedMotion();

  const hidden = HOME_WIDGETS.filter((widget) => !layout.includes(widget.id));
  const isDefault =
    layout.length === DEFAULT_LAYOUT.length &&
    layout.every((id, index) => id === DEFAULT_LAYOUT[index]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="چیدمان صفحهٔ امروز">
      <div className="space-y-6">
        <p className="text-caption text-content-muted">
          هرچه لازم نداری خاموش کن، و بقیه را به ترتیبی که به کارت می‌آید بچین.
        </p>

        <section className="space-y-2" aria-label="ویجت‌های روشن">
          <h3 className="text-caption text-content-secondary">روی صفحه</h3>

          {layout.length === 0 ? (
            <p className="rounded-card border border-dashed border-border p-4 text-center text-caption text-content-muted">
              همه‌چیز خاموش است؛ از پایین یکی را روشن کن.
            </p>
          ) : (
            <AnimatePresence initial={false}>
              {layout.map((id, index) => {
                const meta = HOME_WIDGETS.find((widget) => widget.id === id);
                if (!meta) return null;
                const Icon = ICONS[meta.icon] ?? LayoutGrid;

                return (
                  <motion.div
                    key={id}
                    layout={!reduceMotion}
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduceMotion ? undefined : { opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                    className="flex items-center gap-2 rounded-card border border-border p-2"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-violet-soft text-violet">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-content-primary">
                        {meta.label}
                      </span>
                      <span className="block truncate text-caption-sm text-content-muted">
                        {meta.description}
                      </span>
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        haptics.selection();
                        onChange(reorder(layout, id, -1));
                      }}
                      disabled={index === 0}
                      aria-label={`${meta.label} بالاتر`}
                      className="flex h-11 w-9 items-center justify-center rounded-card text-content-muted active:scale-95 disabled:opacity-25"
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        haptics.selection();
                        onChange(reorder(layout, id, 1));
                      }}
                      disabled={index === layout.length - 1}
                      aria-label={`${meta.label} پایین‌تر`}
                      className="flex h-11 w-9 items-center justify-center rounded-card text-content-muted active:scale-95 disabled:opacity-25"
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        haptics.impact('light');
                        onChange(toggle(layout, id));
                      }}
                      aria-label={`خاموش کردن ${meta.label}`}
                      className="min-h-[44px] shrink-0 rounded-pill px-3 text-caption-sm text-content-muted hover:text-rose active:scale-95"
                    >
                      خاموش
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </section>

        {hidden.length > 0 ? (
          <section className="space-y-2" aria-label="ویجت‌های خاموش">
            <h3 className="text-caption text-content-secondary">خاموش</h3>

            {hidden.map((meta) => {
              const Icon = ICONS[meta.icon] ?? LayoutGrid;

              return (
                <button
                  key={meta.id}
                  type="button"
                  onClick={() => {
                    haptics.impact('light');
                    onChange(toggle(layout, meta.id));
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-card border border-dashed border-border p-2',
                    'text-start opacity-70 hover:opacity-100 active:scale-[0.99]',
                  )}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-surface-raised text-content-muted">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-content-primary">
                      {meta.label}
                    </span>
                    <span className="block truncate text-caption-sm text-content-muted">
                      {meta.description}
                    </span>
                  </span>

                  <span className="shrink-0 rounded-pill border border-border px-3 py-2 text-caption-sm text-violet">
                    روشن کن
                  </span>
                </button>
              );
            })}
          </section>
        ) : null}

        {isDefault ? null : (
          <button
            type="button"
            onClick={() => {
              haptics.impact('medium');
              onChange([...DEFAULT_LAYOUT]);
            }}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-pill border border-border text-caption text-content-muted active:scale-95"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            بازگشت به چیدمان پیش‌فرض
          </button>
        )}
      </div>
    </Sheet>
  );
}
