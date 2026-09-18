'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BookOpen, Check, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { BookComposer } from './BookComposer';
import { ReadingSessionSheet } from './ReadingSessionSheet';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import {
  useDeleteBook,
  useReadingHub,
  useUpdateBook,
  type ReadingHubSnapshot,
} from '@/lib/api/queries';
import { toPersianDigits } from '@/lib/date/digits';
import { describePace, summariseBookProgress } from '@/lib/domain/reading-plan';
import { cn } from '@/lib/utils';
import type { ColorToken, UserBookDto } from '@/types/domain';

/**
 * قفسهٔ من — the full-book half of the Reading Hub.
 *
 * Progress is pages, not percent, because a reader knows what page they
 * stopped on and would have to do arithmetic to produce a percentage. The bar
 * is the derived thing; the number under it is the one they recognise.
 *
 * Finished books stay on the shelf rather than disappearing. A list of what you
 * have read is most of why anybody keeps a reading log at all, and a tracker
 * that empties itself the moment you succeed is a tracker that only ever shows
 * unfinished work.
 */

const SPINE_TONES: Record<ColorToken, string> = {
  violet: 'bg-violet',
  flame: 'bg-flame',
  emerald: 'bg-emerald',
  rose: 'bg-rose',
  sky: 'bg-sky',
};

export function BookshelfPanel({ initial }: { initial: ReadingHubSnapshot }) {
  const { data = initial, isLoading } = useReadingHub();
  const haptics = useHapticFeedback();

  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<UserBookDto | null>(null);
  const [logging, setLogging] = useState<UserBookDto | null>(null);

  const reading = data.books.filter((book) => book.finishedAt === null);
  const finished = data.books.filter((book) => book.finishedAt !== null);

  return (
    <section className="space-y-4" aria-label="قفسهٔ من">
      <div className="flex items-baseline justify-between">
        <h2 className="text-title text-content-primary">قفسهٔ من</h2>
        {finished.length > 0 ? (
          <span className="tabular text-caption-sm text-content-muted">
            {toPersianDigits(finished.length)} کتاب تمام‌شده
          </span>
        ) : null}
      </div>

      {isLoading && data.books.length === 0 ? (
        <div className="space-y-2">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : reading.length === 0 && finished.length === 0 ? (
        <div className="rounded-card border border-dashed border-border p-8 text-center">
          <BookOpen className="mx-auto mb-3 h-6 w-6 text-content-muted" aria-hidden />
          <p className="text-body text-content-primary">قفسه‌ات هنوز خالی است</p>
          <p className="mt-1 text-caption text-content-muted">
            همان کتابی که این روزها کنار تختت است را اضافه کن؛ بقیه‌اش صفحه‌به‌صفحه جلو می‌رود.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {reading.map((book) => (
              <BookRow
                key={book.id}
                book={book}
                onLog={() => setLogging(book)}
                onEdit={() => setEditing(book)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}

      <button
        type="button"
        onClick={() => {
          haptics.impact('light');
          setComposing(true);
        }}
        className="kz-pressable flex min-h-[44px] w-full items-center justify-center gap-2 rounded-card border border-dashed border-border text-caption text-content-muted transition-colors hover:border-violet hover:text-violet active:scale-[0.98]"
      >
        <Plus className="h-4 w-4" aria-hidden />
        کتاب تازه
      </button>

      {finished.length > 0 ? (
        <section aria-label="کتاب‌های تمام‌شده" className="space-y-2 border-t border-border pt-4">
          <h3 className="text-caption text-content-secondary">تمام‌شده‌ها</h3>
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {finished.map((book) => (
                <FinishedRow key={book.id} book={book} />
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ) : null}

      <BookComposer open={composing} onOpenChange={setComposing} />

      <BookComposer
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next) setEditing(null);
        }}
        book={editing}
      />

      <ReadingSessionSheet
        open={logging !== null}
        onOpenChange={(next) => {
          if (!next) setLogging(null);
        }}
        dailyMinutes={data.plan.dailyMinutes}
        book={logging}
      />
    </section>
  );
}

function BookRow({ book, onLog, onEdit }: { book: UserBookDto; onLog(): void; onEdit(): void }) {
  const updateBook = useUpdateBook();
  const haptics = useHapticFeedback();
  const reduceMotion = useReducedMotion();

  const progress = summariseBookProgress(book);

  return (
    <motion.li
      layout={!reduceMotion}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
      transition={{ type: 'spring', stiffness: 360, damping: 32 }}
      className="kz-card flex gap-3"
    >
      {/* The spine: a book on a real shelf is recognised by its colour long
          before its title is legible, and a list of identical cards is not. */}
      <span
        className={cn('w-1.5 shrink-0 rounded-pill', SPINE_TONES[book.colorToken])}
        aria-hidden
      />

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-title text-content-primary">{book.title}</h3>
            {book.author ? (
              <p className="mt-0.5 truncate text-caption-sm text-content-muted">{book.author}</p>
            ) : null}
          </div>

          <button
            type="button"
            aria-label={`ویرایش ${book.title}`}
            onClick={onEdit}
            className="kz-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-content-muted hover:text-violet active:scale-95"
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <Progress
          value={progress.completion}
          tone={book.colorToken}
          label={`پیشرفت ${book.title}`}
        />

        <p className="tabular text-caption-sm text-content-secondary">
          صفحهٔ {toPersianDigits(book.currentPage)} از {toPersianDigits(book.totalPages)}
        </p>

        <p className="text-caption-sm text-content-muted">{describePace(progress, book.pace)}</p>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onLog}
            className="kz-pressable flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-card border border-flame/50 bg-flame-soft text-caption text-flame active:scale-95"
          >
            <BookOpen className="h-4 w-4" aria-hidden />
            ادامه دادم
          </button>

          <button
            type="button"
            onClick={() => {
              haptics.impact('success');
              updateBook.mutate({ id: book.id, finished: true });
            }}
            className="kz-pressable flex min-h-[44px] items-center justify-center gap-2 rounded-card border border-border px-4 text-caption text-content-muted active:scale-95"
          >
            <Check className="h-4 w-4" aria-hidden />
            تمامش کردم
          </button>
        </div>
      </div>
    </motion.li>
  );
}

function FinishedRow({ book }: { book: UserBookDto }) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const updateBook = useUpdateBook();
  const deleteBook = useDeleteBook();
  const haptics = useHapticFeedback();
  const reduceMotion = useReducedMotion();

  return (
    <motion.li
      layout={!reduceMotion}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={reduceMotion ? undefined : { opacity: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
      className="flex items-center gap-2 rounded-card border border-border bg-card p-2"
    >
      <span
        className={cn('h-8 w-1.5 shrink-0 rounded-pill', SPINE_TONES[book.colorToken])}
        aria-hidden
      />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-caption text-content-secondary">{book.title}</span>
        <span className="tabular block text-caption-sm text-content-muted">
          {toPersianDigits(book.totalPages)} صفحه · خوانده شد ✓
        </span>
      </span>

      <button
        type="button"
        aria-label={`برگرداندن ${book.title} به در حال خواندن`}
        onClick={() => {
          haptics.impact('light');
          updateBook.mutate({ id: book.id, finished: false });
        }}
        className="kz-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-content-muted hover:text-violet active:scale-95"
      >
        <RotateCcw className="h-4 w-4" aria-hidden />
      </button>

      <button
        type="button"
        aria-label={isConfirmingDelete ? `تأیید حذف ${book.title}` : `حذف ${book.title}`}
        onClick={() => {
          // Two taps, no dialog — the same bargain the note card strikes: a
          // modal for one row is heavier than the action deserves, and one tap
          // is too easy to hit by accident.
          if (!isConfirmingDelete) {
            haptics.impact('medium');
            setIsConfirmingDelete(true);
            window.setTimeout(() => setIsConfirmingDelete(false), 3000);
            return;
          }

          haptics.impact('heavy');
          deleteBook.mutate(book.id);
        }}
        className={cn(
          'kz-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:scale-95',
          isConfirmingDelete ? 'bg-rose-soft text-rose' : 'text-content-muted hover:text-rose',
        )}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </motion.li>
  );
}
