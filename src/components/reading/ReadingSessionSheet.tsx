'use client';

import { BookMarked, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { FieldError, FieldLabel, Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { useLogReadingSession } from '@/lib/api/queries';
import { formatPersianNumber, parsePersianNumber, toPersianDigits } from '@/lib/date/digits';
import { cn } from '@/lib/utils';
import type { UserBookDto } from '@/types/domain';

/**
 * "چقدر خواندی؟" — logging one sitting.
 *
 * The minute chips are built around the reader's own commitment rather than
 * being a fixed 15/30/60: somebody on a sixty-minute plan who reads for
 * fifteen has still read, and should not have to hunt for the number in a
 * field. The plan's own duration is always the middle chip and the default,
 * so the common case is open-and-confirm.
 *
 * In full-book mode the second field asks what page they reached, not how many
 * pages they covered. That is the number printed at the bottom of the page in
 * front of them; the subtraction is the server's job.
 */

const MINUTE_STEPS: readonly number[] = [5, 10, 15, 20, 30, 45, 60, 90];

/** The plan's duration, flanked by the nearest steps on either side. */
export function minuteChoices(dailyMinutes: number): number[] {
  const index = MINUTE_STEPS.findIndex((step) => step >= dailyMinutes);
  const anchor = index === -1 ? MINUTE_STEPS.length - 1 : index;

  const window = MINUTE_STEPS.slice(Math.max(0, anchor - 1), anchor + 2);

  // A plan set to a value the steps do not contain still deserves its own chip.
  const choices = new Set([...window, dailyMinutes]);
  return [...choices].sort((left, right) => left - right);
}

export interface ReadingSessionSheetProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  dailyMinutes: number;
  /** Present in full-book mode; the page field appears with it. */
  book?: UserBookDto | null;
}

export function ReadingSessionSheet({
  open,
  onOpenChange,
  dailyMinutes,
  book = null,
}: ReadingSessionSheetProps) {
  const [minutes, setMinutes] = useState(dailyMinutes);
  const [page, setPage] = useState('');
  const [error, setError] = useState<string>();

  const logSession = useLogReadingSession();
  const haptics = useHapticFeedback();
  const { success } = useToast();

  useEffect(() => {
    if (!open) return;

    setMinutes(dailyMinutes);
    // Pre-filled with where they already were, so a reader who only wants to
    // log time can leave it alone and one who moved edits a number in place.
    setPage(book ? formatPersianNumber(book.currentPage) : '');
    setError(undefined);
  }, [open, dailyMinutes, book]);

  const choices = minuteChoices(dailyMinutes);
  const toPage = parsePersianNumber(page);

  const submit = async (): Promise<void> => {
    if (book && page.trim() !== '' && toPage === null) {
      setError('شمارهٔ صفحه را با عدد بنویس.');
      haptics.error();
      return;
    }

    if (book && toPage !== null && toPage > book.totalPages) {
      setError(
        toPersianDigits(`این کتاب ${book.totalPages} صفحه دارد؛ عدد بزرگ‌تری نمی‌شود ثبت کرد.`),
      );
      haptics.error();
      return;
    }

    try {
      const result = await logSession.mutateAsync({
        minutes,
        ...(book ? { bookId: book.id } : {}),
        ...(book && toPage !== null ? { toPage } : {}),
      });

      haptics.impact('success');

      success(
        'ثبت شد',
        result.rhythm.metGoalToday
          ? 'قرار امروزت را نگه داشتی 🌱'
          : toPersianDigits(
              `${result.rhythm.minutesToday} دقیقه از ${dailyMinutes} — هر دقیقه‌اش حساب است.`,
            ),
      );

      onOpenChange(false);
    } catch {
      haptics.error();
      setError('ثبت نشد؛ دوباره تلاش کن.');
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={book ? book.title : 'مطالعهٔ امروز'}
      description={book?.author ?? undefined}
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <span className="flex items-center gap-1.5 text-caption text-content-secondary">
            <Timer className="h-3.5 w-3.5" aria-hidden />
            چند دقیقه خواندی؟
          </span>

          <div className="grid grid-cols-3 gap-2">
            {choices.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => {
                  haptics.selection();
                  setMinutes(choice);
                }}
                aria-pressed={minutes === choice}
                className={cn(
                  'tabular min-h-[44px] rounded-card border text-caption transition-colors active:scale-95',
                  minutes === choice
                    ? 'border-flame bg-flame-soft text-flame'
                    : 'border-border text-content-muted',
                )}
              >
                {toPersianDigits(choice)} دقیقه
              </button>
            ))}
          </div>
        </div>

        {book ? (
          <div>
            <FieldLabel htmlFor="reading-page">
              <span className="flex items-center gap-1.5">
                <BookMarked className="h-3.5 w-3.5" aria-hidden />
                تا کدام صفحه رسیدی؟
              </span>
            </FieldLabel>
            <Input
              id="reading-page"
              value={page}
              onChange={(event) => {
                setPage(event.target.value);
                setError(undefined);
              }}
              inputMode="numeric"
              dir="ltr"
              className="tabular text-end"
              placeholder={toPersianDigits(book.currentPage)}
              hasError={Boolean(error)}
            />
            <FieldError message={error} />

            {toPage !== null && toPage > book.currentPage ? (
              <p className="mt-1.5 text-caption-sm text-emerald">
                {toPersianDigits(toPage - book.currentPage)} صفحه جلوتر از دفعهٔ قبل.
              </p>
            ) : (
              <p className="mt-1.5 text-caption-sm text-content-muted">
                اگر جایت عوض نشده، همین عدد را بگذار؛ دقیقه‌ها ثبت می‌شوند.
              </p>
            )}
          </div>
        ) : error ? (
          <FieldError message={error} />
        ) : null}

        <Button
          size="block"
          onClick={submit}
          disabled={logSession.isPending}
          isLoading={logSession.isPending}
        >
          ثبت مطالعه
        </Button>
      </div>
    </Sheet>
  );
}
