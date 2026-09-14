'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { FieldError, FieldLabel, Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { isQueued } from '@/lib/api/client';
import { useCreateHabit } from '@/lib/api/queries';
import { JALALI_WEEKDAYS_SHORT } from '@/lib/date/jalali';
import { toPersianDigits } from '@/lib/date/digits';
import { cn } from '@/lib/utils';
import { createHabitSchema } from '@/lib/validation/schemas';
import type { ColorToken } from '@/types/domain';

/**
 * "عادت" composer.
 *
 * Weekdays are indexed the Persian way — 0 = شنبه — which is what the streak
 * engine expects. Using the JavaScript convention here would silently shift
 * every schedule by one day.
 */

const COLORS: Array<{ token: ColorToken; className: string; label: string }> = [
  { token: 'flame', className: 'bg-flame', label: 'کهربایی' },
  { token: 'violet', className: 'bg-violet', label: 'بنفش' },
  { token: 'emerald', className: 'bg-emerald', label: 'زمردی' },
  { token: 'sky', className: 'bg-sky', label: 'آبی' },
  { token: 'rose', className: 'bg-rose', label: 'سرخ' },
];

export function HabitComposer({ open, onClose }: { open: boolean; onClose(): void }) {
  const [title, setTitle] = useState('');
  const [frequency, setFrequency] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [targetPerDay, setTargetPerDay] = useState(1);
  const [colorToken, setColorToken] = useState<ColorToken>('flame');
  const [error, setError] = useState<string>();

  const createHabit = useCreateHabit();
  const haptics = useHapticFeedback();
  const { success, offline } = useToast();

  const toggleDay = (day: number): void => {
    haptics.selection();
    setFrequency((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort(),
    );
  };

  const submit = async (): Promise<void> => {
    const parsed = createHabitSchema.safeParse({
      title,
      frequency,
      targetPerDay,
      colorToken,
      icon: 'sparkles',
      graceDaysAllowed: 1,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'اطلاعات واردشده کامل نیست.');
      haptics.error();
      return;
    }

    try {
      const result = await createHabit.mutateAsync(parsed.data);
      haptics.streakIncrement();

      if (isQueued(result)) offline('آفلاین ذخیره شد', 'به‌محض اتصال ارسال می‌شود.');
      else success('عادت ساخته شد', 'از همین امروز شروع کنید.');

      setTitle('');
      setFrequency([0, 1, 2, 3, 4, 5, 6]);
      setTargetPerDay(1);
      setError(undefined);
      onClose();
    } catch {
      setError('ثبت عادت ممکن نشد؛ دوباره تلاش کنید.');
      haptics.error();
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="عادت تازه"
      description="زنجیره‌ای که هر روز یک حلقه بلندتر می‌شود"
      footer={
        <Button size="block" onClick={submit} isLoading={createHabit.isPending} haptic="medium">
          ساختن عادت
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        <div>
          <FieldLabel htmlFor="habit-title">عنوان</FieldLabel>
          <Input
            id="habit-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="مثلاً: هشت لیوان آب"
            hasError={Boolean(error)}
            autoFocus
          />
          <FieldError message={error} />
        </div>

        <div>
          <FieldLabel hint="روزهایی که این عادت سررسید دارد">روزهای هفته</FieldLabel>
          <div className="flex justify-between gap-1">
            {JALALI_WEEKDAYS_SHORT.map((label, index) => {
              const active = frequency.includes(index);

              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleDay(index)}
                  aria-pressed={active}
                  className={cn(
                    'kz-pressable h-11 flex-1 rounded-card border text-caption transition-colors',
                    active
                      ? 'border-flame bg-flame-soft text-flame'
                      : 'border-border text-content-muted',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <FieldLabel hint={`${toPersianDigits(targetPerDay)} بار در روز`}>هدف روزانه</FieldLabel>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setTargetPerDay((value) => Math.max(1, value - 1))}
              aria-label="کاهش"
            >
              −
            </Button>
            <span className="tabular flex-1 text-center text-title text-content-primary">
              {toPersianDigits(targetPerDay)}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setTargetPerDay((value) => Math.min(50, value + 1))}
              aria-label="افزایش"
            >
              +
            </Button>
          </div>
        </div>

        <div>
          <FieldLabel>رنگ</FieldLabel>
          <div className="flex gap-3">
            {COLORS.map((color) => (
              <button
                key={color.token}
                type="button"
                aria-label={color.label}
                aria-pressed={colorToken === color.token}
                onClick={() => {
                  haptics.selection();
                  setColorToken(color.token);
                }}
                className={cn(
                  'kz-pressable h-9 w-9 rounded-full transition-transform',
                  color.className,
                  colorToken === color.token &&
                    'ring-2 ring-content-primary ring-offset-2 ring-offset-surface-raised',
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
