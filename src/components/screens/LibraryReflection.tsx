'use client';

import { Check, Star } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { FieldLabel, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { isQueued } from '@/lib/api/client';
import { useSaveReadingLog } from '@/lib/api/queries';
import { toPersianDigits } from '@/lib/date/digits';
import { cn } from '@/lib/utils';
import type { ReadingLogDto } from '@/types/domain';

/**
 * The interactive island on the (server-rendered) library page.
 *
 * The summary itself is static content the server renders; only this form needs
 * client JavaScript, so the page ships almost none.
 */
export function LibraryReflection({
  dayNumber,
  prompt,
  initialLog,
}: {
  dayNumber: number;
  prompt: string;
  initialLog: ReadingLogDto | null;
}) {
  const [reflection, setReflection] = useState(initialLog?.reflection ?? '');
  const [rating, setRating] = useState<number | null>(initialLog?.rating ?? null);
  const [isRead, setIsRead] = useState(Boolean(initialLog?.readAt));

  const saveLog = useSaveReadingLog();
  const haptics = useHapticFeedback();
  const { success, offline } = useToast();

  const save = async (markRead: boolean): Promise<void> => {
    try {
      const result = await saveLog.mutateAsync({
        dayNumber,
        reflection: reflection || undefined,
        rating: rating ?? undefined,
        markRead,
      });

      setIsRead(markRead);
      haptics.impact('success');

      if (isQueued(result)) offline('آفلاین ذخیره شد');
      else success(markRead ? 'خوانده شد ✓' : 'یادداشت ذخیره شد');
    } catch {
      haptics.error();
    }
  };

  return (
    <section className="kz-card space-y-4" aria-label="برداشت شما">
      <div>
        <FieldLabel htmlFor="reflection" hint={prompt}>
          برداشت شما
        </FieldLabel>
        <Textarea
          id="reflection"
          value={reflection}
          onChange={(event) => setReflection(event.target.value)}
          placeholder="یک جمله از چیزی که امروز یاد گرفتید…"
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

      <div className="flex gap-2">
        <Button
          variant={isRead ? 'secondary' : 'primary'}
          className="flex-1"
          onClick={() => save(true)}
          isLoading={saveLog.isPending}
          haptic="medium"
        >
          {isRead ? (
            <>
              <Check className="h-5 w-5" aria-hidden />
              خوانده شد
            </>
          ) : (
            'ثبت مطالعه'
          )}
        </Button>

        <Button variant="outline" onClick={() => save(isRead)} isLoading={saveLog.isPending}>
          ذخیرهٔ یادداشت
        </Button>
      </div>
    </section>
  );
}
