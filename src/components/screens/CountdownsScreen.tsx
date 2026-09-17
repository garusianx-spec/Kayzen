'use client';

import { ScreenAddButton } from '@/components/layout/ScreenAddButton';
import { CalendarClock, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { EmptyState } from '@/components/screens/TodayScreen';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { useCountdowns, useDeleteCountdown, useSession } from '@/lib/api/queries';
import { toPersianDigits } from '@/lib/date/digits';
import { formatFullJalaliDate } from '@/lib/date/jalali';
import { cn } from '@/lib/utils';
import type { ColorToken, CountdownDto } from '@/types/domain';

/**
 * Countdowns.
 *
 * The number of days is the point of the screen, so it is set at display size
 * and everything else — title, date, colour — arranges itself around it. Past
 * events are kept rather than hidden: an anniversary is still a countdown, it
 * just counts the other way.
 */
export function CountdownsScreen() {
  const { data: countdowns, isLoading } = useCountdowns();
  const { data: user } = useSession();

  const upcoming = countdowns?.filter((event) => event.daysRemaining >= 0) ?? [];
  const past = countdowns?.filter((event) => event.daysRemaining < 0) ?? [];

  return (
    <div className="space-y-5 px-4 pt-4">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-display text-content-primary">شمارش معکوس</h1>
          <p className="text-caption text-content-secondary">
            {upcoming.length
              ? `${toPersianDigits(upcoming.length)} رویداد در راه است`
              : 'روزهایی که منتظرشان هستید.'}
          </p>
        </div>

        <ScreenAddButton kind="countdown" label="رویداد تازه" />
      </header>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (countdowns?.length ?? 0) === 0 ? (
        <EmptyState
          title="هنوز رویدادی در راه نیست"
          description="یک تاریخ مهم اضافه کن تا روزشماری‌اش با تو باشد."
        />
      ) : (
        <>
          {upcoming.length ? (
            <section className="space-y-2" aria-label="رویدادهای پیش‌رو">
              {upcoming.map((event) => (
                <CountdownRow key={event.id} event={event} timezone={user?.timezone} />
              ))}
            </section>
          ) : null}

          {past.length ? (
            <section className="space-y-2" aria-label="رویدادهای گذشته">
              <h2 className="text-caption text-content-muted">گذشته</h2>
              {past.map((event) => (
                <CountdownRow key={event.id} event={event} timezone={user?.timezone} isPast />
              ))}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

const ACCENT: Record<ColorToken, string> = {
  violet: 'text-violet',
  flame: 'text-flame',
  emerald: 'text-emerald',
  rose: 'text-rose',
  sky: 'text-sky',
};

function CountdownRow({
  event,
  timezone,
  isPast,
}: {
  event: CountdownDto;
  timezone?: string;
  isPast?: boolean;
}) {
  const deleteCountdown = useDeleteCountdown();
  const haptics = useHapticFeedback();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  return (
    <Card className={cn('flex items-center gap-4', isPast && 'opacity-60')}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <CalendarClock className={cn('h-4 w-4 shrink-0', ACCENT[event.colorToken])} aria-hidden />
          <h3 className="truncate text-body text-content-primary">{event.title}</h3>
        </div>

        <p className="mt-1 text-caption-sm text-content-muted">
          {formatFullJalaliDate(new Date(event.eventAt), timezone)}
        </p>

        <Badge tone={event.colorToken} className="mt-2">
          {event.relativeLabel}
        </Badge>
      </div>

      <div className="flex shrink-0 flex-col items-center">
        <span className={cn('tabular text-display leading-none', ACCENT[event.colorToken])}>
          {toPersianDigits(Math.abs(event.daysRemaining))}
        </span>
        <span className="mt-1 text-caption-sm text-content-muted">روز</span>
      </div>

      <button
        type="button"
        aria-label={isConfirmingDelete ? 'تأیید حذف' : 'حذف رویداد'}
        onClick={() => {
          if (!isConfirmingDelete) {
            haptics.impact('medium');
            setIsConfirmingDelete(true);
            window.setTimeout(() => setIsConfirmingDelete(false), 3000);
            return;
          }

          haptics.impact('heavy');
          deleteCountdown.mutate(event.id);
        }}
        className={cn(
          'kz-pressable shrink-0 rounded-full p-2',
          isConfirmingDelete ? 'bg-rose-soft text-rose' : 'text-content-muted hover:text-rose',
        )}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </Card>
  );
}
