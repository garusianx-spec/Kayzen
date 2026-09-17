'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { PiggyBank, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { useCreateTransaction, useFinancialBoxes } from '@/lib/api/queries';
import { formatCompactCurrency, formatPersianNumber, parsePersianNumber } from '@/lib/date/digits';
import { toPersianDigits } from '@/lib/date/digits';
import { cn } from '@/lib/utils';

/**
 * The nearest savings goal, and a way to feed it without leaving home.
 *
 * "Nearest" means closest to done rather than most recently touched: the goal
 * you are about to reach is the one worth a nudge, and the one a deposit feels
 * best going into.
 *
 * The quick-deposit sheet offers three preset amounts before the keyboard.
 * Most deposits are round numbers a person makes repeatedly, and a number pad
 * on a phone is four taps and a mistake away from the same result.
 */

const PRESETS = [100_000, 500_000, 1_000_000];

export function FinanceGoalWidget() {
  const boxes = useFinancialBoxes();
  const createTransaction = useCreateTransaction();
  const haptics = useHapticFeedback();
  const reduceMotion = useReducedMotion();
  const { success } = useToast();

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');

  const goal = [...(boxes.data ?? [])]
    .filter((box) => box.targetAmount > 0)
    .sort((left, right) => right.progress - left.progress)[0];

  if (!goal) {
    return (
      <section className="kz-card flex items-center justify-between gap-3" aria-label="هدف مالی">
        <div className="min-w-0">
          <p className="text-title text-content-primary">هنوز صندوقی نداری</p>
          <p className="mt-0.5 text-caption text-content-muted">
            یک هدف بگذار تا پیشرفتش همین‌جا باشد.
          </p>
        </div>
        <Link
          href="/finance"
          onClick={() => haptics.selection()}
          className="shrink-0 rounded-pill border border-border px-4 py-2.5 text-caption text-content-secondary active:scale-95"
        >
          بساز
        </Link>
      </section>
    );
  }

  const parsed = parsePersianNumber(amount);
  const canDeposit = parsed !== null && parsed > 0 && !createTransaction.isPending;

  const deposit = async (value: number): Promise<void> => {
    await createTransaction.mutateAsync({ boxId: goal.id, amount: value, type: 'DEPOSIT' });
    haptics.impact('success');
    success('واریز شد', `${formatPersianNumber(value)} تومان به «${goal.title}»`);
    setAmount('');
    setOpen(false);
  };

  return (
    <>
      <section className="kz-card space-y-3" aria-label="هدف مالی">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-caption text-content-muted">
              <PiggyBank className="h-4 w-4 text-emerald" aria-hidden />
              نزدیک‌ترین هدف
            </p>
            <p className="mt-1 truncate text-title text-content-primary">
              {goal.icon ? `${goal.icon} ` : ''}
              {goal.title}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setOpen(true);
            }}
            aria-label={`واریز به ${goal.title}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-emerald bg-emerald-soft text-emerald active:scale-95"
          >
            <Plus className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div
          className="h-2 overflow-hidden rounded-pill bg-surface-sunken"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(goal.progress * 100)}
          aria-label={`پیشرفت ${goal.title}`}
        >
          <motion.div
            className="h-full rounded-pill bg-emerald"
            initial={reduceMotion ? false : { width: 0 }}
            animate={{ width: `${Math.min(100, Math.round(goal.progress * 100))}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 24 }}
          />
        </div>

        <p className="tabular text-caption text-content-muted">
          {formatCompactCurrency(goal.currentAmount, goal.currency)} از{' '}
          {formatCompactCurrency(goal.targetAmount, goal.currency)} ·{' '}
          <span className="text-emerald">{toPersianDigits(Math.round(goal.progress * 100))}٪</span>
        </p>
      </section>

      <Sheet open={open} onOpenChange={setOpen} title={`واریز به ${goal.title}`}>
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => void deposit(preset)}
                disabled={createTransaction.isPending}
                className={cn(
                  'tabular min-h-[56px] rounded-card border border-border text-caption',
                  'text-content-secondary active:scale-95 disabled:opacity-50',
                )}
              >
                {formatCompactCurrency(preset, goal.currency)}
              </button>
            ))}
          </div>

          <div>
            <Input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="numeric"
              dir="ltr"
              className="tabular text-center"
              placeholder="مبلغ دلخواه"
              aria-label="مبلغ واریز"
            />
            {parsed !== null && parsed > 0 ? (
              <p className="mt-1.5 text-center text-caption-sm text-content-muted">
                {formatPersianNumber(parsed)} تومان
              </p>
            ) : null}
          </div>

          <Button
            size="block"
            disabled={!canDeposit}
            isLoading={createTransaction.isPending}
            onClick={() => {
              if (parsed !== null) void deposit(parsed);
            }}
          >
            واریز
          </Button>
        </div>
      </Sheet>
    </>
  );
}
