'use client';

import { AlertTriangle, Calendar, Check, Loader2, RefreshCw, Unlink } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { useDisconnectGoogle, useForceGoogleSync, useGoogleLink } from '@/lib/api/queries';
import { toPersianDigits } from '@/lib/date/digits';
import { formatRelativeJalali } from '@/lib/date/jalali';
import { cn } from '@/lib/utils';

/**
 * تقویم گوگل — the connection card.
 *
 * The whole promise of this integration is that there is nothing to operate,
 * so the card leads with a status and not a button. "همگام‌سازی خودکار فعال
 * است" is the normal state; the force-sync button is deliberately small and
 * secondary, because a person who feels they have to press it is a person the
 * engine has already failed.
 *
 * Connecting is a full navigation rather than a `fetch`: an OAuth consent
 * screen cannot be opened any other way, and the server route sets the signed
 * state cookie on the way out.
 */

const CONNECT_PATH = '/api/v1/integrations/google/start';

/** What the callback wrote into `?google=` on its way back to this page. */
const CALLBACK_MESSAGES: Record<string, { tone: 'ok' | 'bad'; text: string }> = {
  connected: { tone: 'ok', text: 'حساب گوگل وصل شد؛ از این به بعد خودکار همگام می‌شود.' },
  cancelled: { tone: 'bad', text: 'اتصال نیمه‌کاره ماند. هر وقت خواستی دوباره امتحان کن.' },
  expired: { tone: 'bad', text: 'مهلت اتصال تمام شد؛ یک بار دیگر از اول شروع کن.' },
  scope: { tone: 'bad', text: 'بدون دسترسی به رویدادهای تقویم نمی‌شود همگام کرد.' },
  failed: { tone: 'bad', text: 'اتصال برقرار نشد. کمی بعد دوباره امتحان کن.' },
};

export function GoogleCalendarCard({ timezone }: { timezone?: string }) {
  const { data: link, isLoading } = useGoogleLink();
  const forceSync = useForceGoogleSync();
  const disconnect = useDisconnectGoogle();

  const haptics = useHapticFeedback();
  const { success, error } = useToast();
  const params = useSearchParams();

  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [notice, setNotice] = useState<(typeof CALLBACK_MESSAGES)[string] | null>(null);

  // The callback redirects here with a flag rather than rendering its own page,
  // so this is where the outcome is announced.
  useEffect(() => {
    const status = params.get('google');
    if (status) setNotice(CALLBACK_MESSAGES[status] ?? null);
  }, [params]);

  if (isLoading || !link) return <Card>{null}</Card>;

  if (!link.configured) {
    return (
      <Card>
        <Header />
        <p className="text-caption text-content-muted">
          این نسخه از کایزن به گوگل وصل نشده است. برای فعال‌کردنش باید کلیدهای گوگل در تنظیمات سرور
          قرار بگیرد.
        </p>
      </Card>
    );
  }

  if (!link.connected) {
    return (
      <Card>
        <Header />
        {notice ? <Notice tone={notice.tone} text={notice.text} /> : null}

        <p className="text-caption text-content-muted">
          کارها و رویدادهای سررسیددار خودکار در یک تقویم جدا به نام «Kayzen Planner» ساخته می‌شوند —
          تقویم شخصی‌ات دست‌نخورده می‌ماند.
        </p>

        <Button asChild size="block" onClick={() => haptics.impact('light')}>
          <a href={CONNECT_PATH}>وصل‌کردن حساب گوگل</a>
        </Button>
      </Card>
    );
  }

  const stalled = link.stalled ?? 0;
  const pending = link.pending ?? 0;

  return (
    <Card>
      <Header />
      {notice ? <Notice tone={notice.tone} text={notice.text} /> : null}

      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            link.needsReauth || stalled > 0 ? 'bg-rose-soft' : 'bg-emerald-soft',
          )}
          aria-hidden
        >
          {link.needsReauth || stalled > 0 ? (
            <AlertTriangle className="h-4 w-4 text-rose" />
          ) : (
            <Check className="h-4 w-4 text-emerald" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-caption text-content-primary" dir="ltr">
            {link.email}
          </span>
          <span className="block text-caption-sm text-content-muted">
            <SyncStatus link={link} pending={pending} stalled={stalled} />
          </span>
        </span>
      </div>

      <p className="text-caption-sm text-content-muted">
        آخرین همگام‌سازی:{' '}
        {link.lastSyncedAt
          ? formatRelativeJalali(new Date(link.lastSyncedAt), { timeZone: timezone })
          : 'هنوز انجام نشده'}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={forceSync.isPending}
          onClick={async () => {
            haptics.impact('light');
            try {
              await forceSync.mutateAsync();
              success('همگام شد');
            } catch {
              error('همگام‌سازی ناموفق بود');
            }
          }}
          className="kz-pressable flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-card border border-border text-caption text-content-secondary active:scale-95 disabled:opacity-50"
        >
          {forceSync.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-4 w-4 text-violet" aria-hidden />
          )}
          همگام‌سازی دستی
        </button>

        <button
          type="button"
          disabled={disconnect.isPending}
          onClick={async () => {
            // Two taps, no dialog — the same bargain the rest of the app
            // strikes for a reversible destructive action.
            if (!confirmingDisconnect) {
              haptics.impact('medium');
              setConfirmingDisconnect(true);
              window.setTimeout(() => setConfirmingDisconnect(false), 3000);
              return;
            }

            haptics.impact('heavy');
            await disconnect.mutateAsync().catch(() => error('قطع اتصال ناموفق بود'));
            setConfirmingDisconnect(false);
          }}
          className={cn(
            'kz-pressable flex min-h-[44px] items-center justify-center gap-2 rounded-card border px-4 text-caption active:scale-95 disabled:opacity-50',
            confirmingDisconnect
              ? 'border-rose bg-rose-soft text-rose'
              : 'border-border text-content-muted',
          )}
        >
          <Unlink className="h-4 w-4" aria-hidden />
          {confirmingDisconnect ? 'مطمئنی؟' : 'قطع اتصال'}
        </button>
      </div>
    </Card>
  );
}

function SyncStatus({
  link,
  pending,
  stalled,
}: {
  link: { needsReauth?: boolean };
  pending: number;
  stalled: number;
}) {
  if (link.needsReauth) return <>دسترسی منقضی شده؛ دوباره وصل شو.</>;
  if (stalled > 0) return <>{toPersianDigits(stalled)} تغییر نرفت — همگام‌سازی دستی را بزن.</>;
  if (pending > 0) return <>{toPersianDigits(pending)} تغییر در صف است…</>;

  return <>همگام‌سازی خودکار فعال است</>;
}

function Header() {
  return (
    <div className="flex items-center gap-2">
      <Calendar className="h-4 w-4 text-violet" aria-hidden />
      <h2 className="text-title text-content-primary">تقویم گوگل</h2>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="kz-card space-y-3" aria-label="تقویم گوگل">
      {children}
    </section>
  );
}

function Notice({ tone, text }: { tone: 'ok' | 'bad'; text: string }) {
  return (
    <p
      role="status"
      className={cn('text-caption-sm', tone === 'ok' ? 'text-emerald' : 'text-rose')}
    >
      {text}
    </p>
  );
}
