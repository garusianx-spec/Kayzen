'use client';

import { ScreenAddButton } from '@/components/layout/ScreenAddButton';
import { ArrowDownLeft, ArrowUpRight, PiggyBank } from 'lucide-react';
import { useState } from 'react';

import { EmptyState } from '@/components/screens/TodayScreen';
import { Button } from '@/components/ui/button';
import { FieldLabel, Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { isQueued } from '@/lib/api/client';
import { useCreateTransaction, useFinancialBoxes } from '@/lib/api/queries';
import {
  formatCompactCurrency,
  formatCurrency,
  formatPercent,
  parsePersianNumber,
  toPersianDigits,
} from '@/lib/date/digits';
import type { FinancialBoxDto } from '@/types/domain';

/**
 * Savings pots.
 *
 * Every amount is rendered through the Persian formatters — grouped with `٬`,
 * in Persian digits, suffixed with تومان — because a Toman figure in Latin
 * digits is genuinely harder to read at a glance for the people using this.
 */
export function FinanceScreen() {
  const { data: boxes, isLoading } = useFinancialBoxes();
  const [activeBox, setActiveBox] = useState<FinancialBoxDto | null>(null);

  const totalSaved = boxes?.reduce((sum, box) => sum + box.currentAmount, 0) ?? 0;
  const totalTarget = boxes?.reduce((sum, box) => sum + box.targetAmount, 0) ?? 0;

  return (
    <div className="space-y-6 px-4 pt-4">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-display text-content-primary">صندوق‌ها</h1>
          <p className="text-caption text-content-secondary">
            {totalTarget > 0
              ? `${formatCompactCurrency(totalSaved)} از ${formatCompactCurrency(totalTarget)} جمع شده`
              : 'اولین هدفت را بگذار؛ از همان‌جا شروع می‌شود.'}
          </p>
        </div>

        <ScreenAddButton kind="financial-box" label="صندوق تازه" />
      </header>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : (boxes?.length ?? 0) === 0 ? (
        <EmptyState
          title="هنوز صندوقی نداری"
          description="یک هدف بگذار؛ حتی ماهی صد هزار تومان هم جمع می‌شود."
        />
      ) : (
        <div className="space-y-3">
          {boxes?.map((box) => (
            <article key={box.id} className="kz-card space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-title text-content-primary">{box.title}</h2>
                  <p className="tabular mt-1 text-caption text-content-muted">
                    {formatCurrency(box.currentAmount, box.currency)} از{' '}
                    {formatCurrency(box.targetAmount, box.currency)}
                  </p>
                </div>
                <span className="rounded-card bg-emerald-soft p-2 text-emerald">
                  <PiggyBank className="h-5 w-5" aria-hidden />
                </span>
              </div>

              <Progress value={box.progress} tone="emerald" label={`پیشرفت ${box.title}`} />

              <div className="flex items-center justify-between">
                <span className="tabular text-caption text-emerald">
                  {formatPercent(box.progress)}
                </span>
                {box.daysRemaining !== null ? (
                  <span className="tabular text-caption-sm text-content-muted">
                    {box.daysRemaining >= 0
                      ? `${toPersianDigits(box.daysRemaining)} روز تا مهلت`
                      : 'مهلت گذشته'}
                  </span>
                ) : null}
              </div>

              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => setActiveBox(box)}
              >
                ثبت تراکنش
              </Button>
            </article>
          ))}
        </div>
      )}

      <TransactionSheet box={activeBox} onClose={() => setActiveBox(null)} />
    </div>
  );
}

function TransactionSheet({ box, onClose }: { box: FinancialBoxDto | null; onClose(): void }) {
  const [amountText, setAmountText] = useState('');
  const [type, setType] = useState<'DEPOSIT' | 'WITHDRAWAL'>('DEPOSIT');
  const createTransaction = useCreateTransaction();
  const haptics = useHapticFeedback();
  const { success, offline, error } = useToast();

  const parsed = parsePersianNumber(amountText);

  const submit = async (): Promise<void> => {
    if (!box || !parsed || parsed <= 0) {
      haptics.error();
      error('مبلغ را درست وارد کنید');
      return;
    }

    try {
      const result = await createTransaction.mutateAsync({ boxId: box.id, amount: parsed, type });
      haptics.impact('success');

      if (isQueued(result)) offline('آفلاین ذخیره شد');
      else success(type === 'DEPOSIT' ? 'واریز ثبت شد' : 'برداشت ثبت شد');

      setAmountText('');
      onClose();
    } catch {
      haptics.error();
      error('ثبت تراکنش ممکن نشد');
    }
  };

  return (
    <Sheet
      open={box !== null}
      onOpenChange={(next) => !next && onClose()}
      title={box?.title ?? ''}
      description="واریز یا برداشت از این صندوق"
      footer={
        <Button
          size="block"
          onClick={submit}
          isLoading={createTransaction.isPending}
          haptic="medium"
        >
          ثبت
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setType('DEPOSIT')}
            className={
              type === 'DEPOSIT'
                ? 'kz-pressable flex items-center justify-center gap-2 rounded-card border border-emerald bg-emerald-soft p-3 text-emerald'
                : 'kz-pressable flex items-center justify-center gap-2 rounded-card border border-border p-3 text-content-muted'
            }
          >
            <ArrowDownLeft className="h-4 w-4" aria-hidden />
            واریز
          </button>

          <button
            type="button"
            onClick={() => setType('WITHDRAWAL')}
            className={
              type === 'WITHDRAWAL'
                ? 'kz-pressable flex items-center justify-center gap-2 rounded-card border border-rose bg-rose-soft p-3 text-rose'
                : 'kz-pressable flex items-center justify-center gap-2 rounded-card border border-border p-3 text-content-muted'
            }
          >
            <ArrowUpRight className="h-4 w-4" aria-hidden />
            برداشت
          </button>
        </div>

        <div>
          <FieldLabel htmlFor="transaction-amount" hint={parsed ? formatCurrency(parsed) : 'تومان'}>
            مبلغ
          </FieldLabel>
          <Input
            id="transaction-amount"
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            inputMode="numeric"
            placeholder="۵۰۰٬۰۰۰"
            className="tabular"
            autoFocus
          />
        </div>
      </div>
    </Sheet>
  );
}
