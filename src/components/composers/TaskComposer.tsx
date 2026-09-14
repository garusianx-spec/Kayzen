'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { FieldError, FieldLabel, Input, Textarea } from '@/components/ui/input';
import { JalaliDatePicker } from '@/components/ui/jalali-date-picker';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { isQueued } from '@/lib/api/client';
import { useCreateTask } from '@/lib/api/queries';
import { formatShortJalaliDate } from '@/lib/date/jalali';
import { cn } from '@/lib/utils';
import { createTaskSchema } from '@/lib/validation/schemas';

/**
 * "کار تازه" composer.
 *
 * Validated with the *same* zod schema the route handler uses, so the form can
 * never accept something the API will reject — the two cannot drift because
 * there is only one definition.
 */

const PRIORITIES = [
  { value: 1, label: 'فوری', className: 'border-rose text-rose' },
  { value: 2, label: 'مهم', className: 'border-flame text-flame' },
  { value: 3, label: 'عادی', className: 'border-violet text-violet' },
  { value: 4, label: 'بعداً', className: 'border-border-strong text-content-muted' },
] as const;

const DIFFICULTIES = [
  { value: 'TRIVIAL', label: 'خیلی ساده' },
  { value: 'EASY', label: 'ساده' },
  { value: 'MEDIUM', label: 'متوسط' },
  { value: 'HARD', label: 'سخت' },
  { value: 'EPIC', label: 'حماسی' },
] as const;

export function TaskComposer({ open, onClose }: { open: boolean; onClose(): void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState<Date | null>(new Date());
  const [priority, setPriority] = useState(3);
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number]['value']>('MEDIUM');
  const [error, setError] = useState<string>();

  const createTask = useCreateTask();
  const haptics = useHapticFeedback();
  const { success, offline } = useToast();

  const reset = (): void => {
    setTitle('');
    setDescription('');
    setDueAt(new Date());
    setPriority(3);
    setDifficulty('MEDIUM');
    setError(undefined);
  };

  const submit = async (): Promise<void> => {
    const parsed = createTaskSchema.safeParse({
      title,
      description: description || undefined,
      dueAt: dueAt ? dueAt.toISOString() : undefined,
      priority,
      difficulty,
      tags: [],
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'اطلاعات واردشده کامل نیست.');
      haptics.error();
      return;
    }

    try {
      const result = await createTask.mutateAsync({
        title: parsed.data.title,
        description: parsed.data.description,
        dueAt: parsed.data.dueAt?.toISOString(),
        priority: parsed.data.priority,
        difficulty: parsed.data.difficulty,
        tags: parsed.data.tags,
      });

      haptics.impact('success');
      if (isQueued(result)) offline('آفلاین ذخیره شد', 'به‌محض اتصال ارسال می‌شود.');
      else success('کار اضافه شد');

      reset();
      onClose();
    } catch {
      setError('ثبت کار ممکن نشد؛ دوباره تلاش کنید.');
      haptics.error();
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="کار تازه"
      description="یک قدم کوچک برای امروز"
      footer={
        <Button size="block" onClick={submit} isLoading={createTask.isPending} haptic="medium">
          ثبت کار
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        <div>
          <FieldLabel htmlFor="task-title">عنوان</FieldLabel>
          <Input
            id="task-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="مثلاً: سی دقیقه مطالعه"
            hasError={Boolean(error)}
            autoFocus
            enterKeyHint="done"
          />
          <FieldError message={error} />
        </div>

        <div>
          <FieldLabel htmlFor="task-description" hint="اختیاری">
            توضیح
          </FieldLabel>
          <Textarea
            id="task-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="جزئیاتی که کمک می‌کند شروع کنید"
            rows={3}
          />
        </div>

        <div>
          <FieldLabel>اولویت</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {PRIORITIES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  haptics.selection();
                  setPriority(option.value);
                }}
                className={cn(
                  'kz-pressable rounded-pill border px-4 py-2 text-caption transition-colors',
                  priority === option.value
                    ? cn('bg-surface-raised', option.className)
                    : 'border-border text-content-muted',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel>سختی</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {DIFFICULTIES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  haptics.selection();
                  setDifficulty(option.value);
                }}
                className={cn(
                  'kz-pressable rounded-pill border px-4 py-2 text-caption transition-colors',
                  difficulty === option.value
                    ? 'border-violet bg-violet-soft text-violet'
                    : 'border-border text-content-muted',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel hint={dueAt ? formatShortJalaliDate(dueAt) : 'بدون تاریخ'}>
            تاریخ انجام
          </FieldLabel>
          <JalaliDatePicker value={dueAt} onChange={setDueAt} />
        </div>
      </div>
    </Sheet>
  );
}
