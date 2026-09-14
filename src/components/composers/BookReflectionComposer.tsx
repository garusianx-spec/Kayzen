'use client';

import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { FieldLabel, Textarea } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { api, isQueued } from '@/lib/api/client';
import { queryKeys, useSaveReadingLog } from '@/lib/api/queries';
import { toPersianDigits } from '@/lib/date/digits';
import { cn } from '@/lib/utils';
import type { BookDto, ReadingLogDto } from '@/types/domain';

/**
 * "خلاصهٔ کتاب" composer.
 *
 * Opens on whatever the user's curriculum says today is, so the action is one
 * tap from the FAB with no book picker in between — the 365 library is a daily
 * ritual, not a catalogue to browse.
 */

interface TodayLibraryResponse {
  dayNumber: number;
  caption: string;
  book: BookDto | null;
  readingLog: ReadingLogDto | null;
}

export function BookReflectionComposer({ open, onClose }: { open: boolean; onClose(): void }) {
  const [reflection, setReflection] = useState('');
  const [rating, setRating] = useState<number | null>(null);

  const haptics = useHapticFeedback();
  const { success, offline } = useToast();
  const saveLog = useSaveReadingLog();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.libraryToday,
    queryFn: () => api.get<TodayLibraryResponse>('/library/today'),
    enabled: open,
  });

  const submit = async (): Promise<void> => {
    if (!data?.book) return;

    try {
      const result = await saveLog.mutateAsync({
        dayNumber: data.dayNumber,
        reflection: reflection || undefined,
        rating: rating ?? undefined,
        markRead: true,
      });

      haptics.impact('success');
      if (isQueued(result)) offline('آفلاین ذخیره شد');
      else success('برداشت امروز ثبت شد');

      setReflection('');
      setRating(null);
      onClose();
    } catch {
      haptics.error();
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="خلاصهٔ امروز"
      description={data?.caption}
      footer={
        <Button
          size="block"
          onClick={submit}
          isLoading={saveLog.isPending}
          disabled={!data?.book}
          haptic="medium"
        >
          ثبت برداشت
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        {isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : data?.book ? (
          <article className="rounded-card border border-border bg-card p-4">
            <h4 className="text-title text-content-primary">{data.book.titleFa}</h4>
            <p className="mt-1 text-caption text-content-muted">{data.book.authorFa}</p>
            <p className="mt-3 whitespace-pre-line text-body leading-8 text-content-secondary">
              {data.book.summaryFa}
            </p>

            {data.book.keyTakeaways.length ? (
              <ul className="mt-3 space-y-1.5">
                {data.book.keyTakeaways.map((takeaway) => (
                  <li key={takeaway} className="flex gap-2 text-caption text-content-secondary">
                    <span aria-hidden className="text-violet">
                      •
                    </span>
                    {takeaway}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ) : (
          <p className="text-body text-content-muted">خلاصهٔ امروز هنوز آماده نیست.</p>
        )}

        <div>
          <FieldLabel htmlFor="book-reflection" hint={data?.book?.reflectionPrompt}>
            برداشت شما
          </FieldLabel>
          <Textarea
            id="book-reflection"
            value={reflection}
            onChange={(event) => setReflection(event.target.value)}
            placeholder="یک جمله کافی است…"
            rows={4}
            data-selectable="true"
          />
        </div>

        <div>
          <FieldLabel>امتیاز</FieldLabel>
          <div className="flex gap-2" dir="ltr">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                aria-label={`${toPersianDigits(value)} ستاره`}
                aria-pressed={rating === value}
                onClick={() => {
                  haptics.selection();
                  setRating(value);
                }}
                className="kz-pressable rounded-full p-1"
              >
                <Star
                  className={cn(
                    'h-7 w-7 transition-colors',
                    rating !== null && value <= rating
                      ? 'fill-flame text-flame'
                      : 'text-content-muted',
                  )}
                  aria-hidden
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
