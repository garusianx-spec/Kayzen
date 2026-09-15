'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { FieldError, FieldLabel, Input } from '@/components/ui/input';
import { JalaliDatePicker } from '@/components/ui/jalali-date-picker';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { isQueued } from '@/lib/api/client';
import { useCreateCountdown } from '@/lib/api/queries';
import { formatRelativeJalali } from '@/lib/date/jalali';
import { createCountdownSchema } from '@/lib/validation/schemas';

/** "شمارش معکوس" composer — a date the user wants to feel approaching. */
export function CountdownComposer({ open, onClose }: { open: boolean; onClose(): void }) {
  const [title, setTitle] = useState('');
  const [eventAt, setEventAt] = useState<Date>(() => {
    const next = new Date();
    next.setDate(next.getDate() + 7);
    return next;
  });
  const [error, setError] = useState<string>();

  const createCountdown = useCreateCountdown();
  const haptics = useHapticFeedback();
  const { success, offline } = useToast();

  const submit = async (): Promise<void> => {
    const parsed = createCountdownSchema.safeParse({
      title,
      eventAt: eventAt.toISOString(),
      isAllDay: true,
      colorToken: 'violet',
      icon: 'calendar-heart',
      notifyBeforeMinutes: [1440, 60],
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'اطلاعات واردشده کامل نیست.');
      haptics.error();
      return;
    }

    try {
      const result = await createCountdown.mutateAsync({
        ...parsed.data,
        eventAt: parsed.data.eventAt.toISOString(),
      });

      haptics.impact('success');
      if (isQueued(result)) offline('آفلاین ذخیره شد');
      else success('شمارش معکوس ساخته شد');

      setTitle('');
      setError(undefined);
      onClose();
    } catch {
      setError('ثبت رویداد ممکن نشد؛ دوباره تلاش کنید.');
      haptics.error();
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="شمارش معکوس"
      description={formatRelativeJalali(eventAt)}
      footer={
        <Button size="block" onClick={submit} isLoading={createCountdown.isPending} haptic="medium">
          ثبت رویداد
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        <div>
          <FieldLabel htmlFor="countdown-title">مناسبت</FieldLabel>
          <Input
            id="countdown-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="مثلاً: شروع ترم جدید"
            hasError={Boolean(error)}
            autoFocus
          />
          <FieldError message={error} />
        </div>

        <div>
          <FieldLabel>تاریخ رویداد</FieldLabel>
          <JalaliDatePicker value={eventAt} onChange={setEventAt} />
        </div>
      </div>
    </Sheet>
  );
}
