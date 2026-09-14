'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CloudOff, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { useOnlineStatus } from '@/hooks/use-online-status';
import { flushOutbox, listQueued } from '@/lib/offline/outbox';
import { toPersianDigits } from '@/lib/date/digits';

/**
 * Connectivity and pending-changes strip.
 *
 * Shown only when it has something to say: offline, or online with writes still
 * queued. A permanent status bar teaches people to ignore it, and the one time
 * it matters — "your last three changes have not been saved yet" — they would.
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const [pending, setPending] = useState(0);
  const [isFlushing, setIsFlushing] = useState(false);
  const queryClient = useQueryClient();

  const refreshPending = useCallback(async (): Promise<void> => {
    setPending((await listQueued()).length);
  }, []);

  useEffect(() => {
    void refreshPending();

    // The queue changes from mutations, from the service worker's background
    // replay, and from the window coming back online; polling at a low rate is
    // simpler and more robust than subscribing to all three.
    const interval = window.setInterval(() => void refreshPending(), 5000);
    return () => window.clearInterval(interval);
  }, [refreshPending]);

  const flush = async (): Promise<void> => {
    setIsFlushing(true);

    try {
      const result = await flushOutbox();
      if (result.sent > 0) await queryClient.invalidateQueries();
    } finally {
      setIsFlushing(false);
      void refreshPending();
    }
  };

  if (isOnline && pending === 0) return null;

  return (
    <div
      role="status"
      className="kz-frosted mx-4 mb-3 flex items-center gap-3 rounded-card px-4 py-3 text-caption"
    >
      <CloudOff className="h-4 w-4 shrink-0 text-flame" aria-hidden />

      <p className="min-w-0 flex-1 text-content-secondary">
        {isOnline
          ? `${toPersianDigits(pending)} تغییر در انتظار ارسال است.`
          : 'آفلاین هستید؛ تغییرها ذخیره و بعداً ارسال می‌شوند.'}
      </p>

      {isOnline && pending > 0 ? (
        <button
          type="button"
          onClick={flush}
          disabled={isFlushing}
          className="kz-pressable inline-flex items-center gap-1 rounded-pill bg-violet-soft px-3 py-1.5 text-caption-sm text-violet"
        >
          <RefreshCw
            className={isFlushing ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'}
            aria-hidden
          />
          ارسال
        </button>
      ) : null}
    </div>
  );
}
