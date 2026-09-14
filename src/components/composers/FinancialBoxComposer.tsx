'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { FieldError, FieldLabel, Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { isQueued } from '@/lib/api/client';
import { useCreateFinancialBox } from '@/lib/api/queries';
import { formatCurrency, parsePersianNumber, toPersianDigits } from '@/lib/date/digits';
import { cn } from '@/lib/utils';
import { createFinancialBoxSchema } from '@/lib/validation/schemas';

/**
 * "هدف مالی" composer.
 *
 * The amount field accepts Persian digits and thousands separators, because
 * that is what a Persian keyboard produces and `Number('۲٬۵۰۰٬۰۰۰')` is `NaN`.
 * The live preview underneath shows the parsed value back, so a mistyped zero is
 * visible before the goal is created.
 */

const CATEGORIES = [
  { value: 'SAVINGS', label: 'پس‌انداز' },
  { value: 'TRAVEL', label: 'سفر' },
  { value: 'EDUCATION', label: 'آموزش' },
  { value: 'GADGET', label: 'وسیله' },
  { value: 'EMERGENCY', label: 'اضطراری' },
  { value: 'DEBT', label: 'بدهی' },
  { value: 'GIFT', label: 'هدیه' },
  { value: 'OTHER', label: 'دیگر' },
] as const;

const QUICK_AMOUNTS = [1_000_000, 5_000_000, 10_000_000, 50_000_000];

export function FinancialBoxComposer({ open, onClose }: { open: boolean; onClose(): void }) {
  const [title, setTitle] = useState('');
  const [amountText, setAmountText] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['value']>('SAVINGS');
  const [error, setError] = useState<string>();

  const createBox = useCreateFinancialBox();
  const haptics = useHapticFeedback();
  const { success, offline } = useToast();

  const parsedAmount = parsePersianNumber(amountText);

  const submit = async (): Promise<void> => {
    const parsed = createFinancialBoxSchema.safeParse({
      title,
      targetAmount: amountText,
      category,
      currency: 'IRT',
      colorToken: 'emerald',
      icon: 'piggy-bank',
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'اطلاعات واردشده کامل نیست.');
      haptics.error();
      return;
    }

    try {
      const result = await createBox.mutateAsync(parsed.data);
      haptics.impact('success');

      if (isQueued(result)) offline('آفلاین ذخیره شد');
      else success('صندوق ساخته شد');

      setTitle('');
      setAmountText('');
      setError(undefined);
      onClose();
    } catch {
      setError('ساخت صندوق ممکن نشد؛ دوباره تلاش کنید.');
      haptics.error();
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="هدف مالی"
      description="پول را برای چیزی که می‌خواهید کنار بگذارید"
      footer={
        <Button size="block" onClick={submit} isLoading={createBox.isPending} haptic="medium">
          ساختن صندوق
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        <div>
          <FieldLabel htmlFor="box-title">عنوان</FieldLabel>
          <Input
            id="box-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="مثلاً: سفر شمال"
            hasError={Boolean(error)}
            autoFocus
          />
          <FieldError message={error} />
        </div>

        <div>
          <FieldLabel
            htmlFor="box-amount"
            hint={parsedAmount ? formatCurrency(parsedAmount) : 'تومان'}
          >
            مبلغ هدف
          </FieldLabel>
          <Input
            id="box-amount"
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            inputMode="numeric"
            placeholder="۵٬۰۰۰٬۰۰۰"
            className="tabular"
          />

          <div className="mt-2 flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => {
                  haptics.selection();
                  setAmountText(String(amount));
                }}
                className="kz-pressable rounded-pill border border-border px-3 py-1.5 text-caption-sm text-content-secondary"
              >
                {toPersianDigits(amount / 1_000_000)} میلیون
              </button>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel>دسته</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  haptics.selection();
                  setCategory(option.value);
                }}
                className={cn(
                  'kz-pressable rounded-pill border px-4 py-2 text-caption transition-colors',
                  category === option.value
                    ? 'border-emerald bg-emerald-soft text-emerald'
                    : 'border-border text-content-muted',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
