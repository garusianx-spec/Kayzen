'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowDown, ArrowUp, Check, Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { toPersianDigits } from '@/lib/date/digits';
import { cn } from '@/lib/utils';

/**
 * The sub-task list builder.
 *
 * Reordering is two buttons rather than drag-and-drop, deliberately. A drag
 * handle inside a scrolling bottom sheet on a touch screen fights the sheet's
 * own gesture: the browser cannot tell "drag this row" from "dismiss this
 * sheet" until several frames in, and the resolution is always wrong for
 * somebody. Two 44px buttons are unglamorous, unambiguous, and reachable with
 * the thumb that is already holding the phone.
 *
 * Rows animate out with `AnimatePresence` so a deletion reads as a removal
 * rather than as the list below jumping up.
 */

export interface ChecklistDraft {
  /** Present for a line the server already knows about. */
  id?: string;
  title: string;
  completed: boolean;
}

const MAX_ITEMS = 30;

export function ChecklistBuilder({
  items,
  onChange,
}: {
  items: ChecklistDraft[];
  onChange: (next: ChecklistDraft[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const haptics = useHapticFeedback();
  const reduceMotion = useReducedMotion();

  const done = items.filter((item) => item.completed).length;

  const add = (): void => {
    const title = draft.trim();
    if (!title || items.length >= MAX_ITEMS) return;

    onChange([...items, { title, completed: false }]);
    setDraft('');
    haptics.impact('light');
    // Focus stays put so a list can be typed straight through without
    // reaching back to the field after every line.
    inputRef.current?.focus();
  };

  const move = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;

    const next = [...items];
    [next[index], next[target]] = [next[target] as ChecklistDraft, next[index] as ChecklistDraft];
    onChange(next);
    haptics.selection();
  };

  return (
    <section aria-label="زیرکارها" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-caption text-content-secondary">زیرکارها</span>
        {items.length > 0 ? (
          <span className="tabular text-caption-sm text-content-muted">
            {toPersianDigits(done)} از {toPersianDigits(items.length)}
          </span>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {items.map((item, index) => (
          <motion.div
            key={item.id ?? `${index}-${item.title}`}
            layout={!reduceMotion}
            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
            animate={reduceMotion ? undefined : { opacity: 1, height: 'auto' }}
            exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="flex items-center gap-1 overflow-hidden"
          >
            <button
              type="button"
              onClick={() => {
                const next = [...items];
                next[index] = { ...item, completed: !item.completed };
                onChange(next);
                haptics.impact(item.completed ? 'light' : 'success');
              }}
              aria-pressed={item.completed}
              aria-label={item.completed ? `${item.title} — انجام شد` : item.title}
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-card border transition-colors',
                'active:scale-95',
                item.completed
                  ? 'border-emerald bg-emerald-soft text-emerald'
                  : 'border-border text-content-muted',
              )}
            >
              <Check className={cn('h-4 w-4', item.completed ? 'opacity-100' : 'opacity-40')} />
            </button>

            <span
              className={cn(
                'min-w-0 flex-1 truncate text-body',
                item.completed ? 'text-content-muted line-through' : 'text-content-primary',
              )}
            >
              {item.title}
            </span>

            <button
              type="button"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              aria-label="بالاتر"
              className="flex h-11 w-9 items-center justify-center rounded-card text-content-muted active:scale-95 disabled:opacity-25"
            >
              <ArrowUp className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => move(index, 1)}
              disabled={index === items.length - 1}
              aria-label="پایین‌تر"
              className="flex h-11 w-9 items-center justify-center rounded-card text-content-muted active:scale-95 disabled:opacity-25"
            >
              <ArrowDown className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(items.filter((_, position) => position !== index));
                haptics.impact('light');
              }}
              aria-label={`حذف ${item.title}`}
              className="flex h-11 w-9 items-center justify-center rounded-card text-content-muted hover:text-rose active:scale-95"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>

      {items.length < MAX_ITEMS ? (
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add();
              }
            }}
            placeholder="یک قدم کوچک‌تر بنویس…"
            enterKeyHint="done"
            className="h-11"
            aria-label="زیرکار تازه"
          />
          <button
            type="button"
            onClick={add}
            disabled={draft.trim().length === 0}
            aria-label="افزودن زیرکار"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card border border-border text-violet active:scale-95 disabled:opacity-30"
          >
            <Plus className="h-5 w-5" aria-hidden />
          </button>
        </div>
      ) : null}
    </section>
  );
}
