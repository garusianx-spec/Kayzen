'use client';

import { useEffect } from 'react';

import { useToast } from '@/components/ui/toast';
import { flushOutbox } from '@/lib/offline/outbox';

/**
 * Registers the service worker and handles its lifecycle.
 *
 * Two behaviours matter to users and both are easy to get wrong:
 *
 *  - **Updates.** A new worker installs in the background and then waits. Users
 *    in an installed app rarely "close all tabs", so the waiting worker could
 *    sit there for weeks. The toast tells them an update is ready and the tap
 *    activates it (`SKIP_WAITING`) and reloads once.
 *  - **Replay.** When the worker finishes flushing the offline outbox it posts
 *    a message back so the UI can refresh; the page also flushes on `online` in
 *    browsers with no Background Sync.
 */
export function ServiceWorkerRegistrar() {
  const { toast, success } = useToast();

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV === 'development') return;

    let reloading = false;

    const onControllerChange = (): void => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    const onMessage = (event: MessageEvent): void => {
      if (event.data?.type === 'OUTBOX_FLUSHED' && event.data.sent > 0) {
        success('تغییرات آفلاین ذخیره شد');
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    navigator.serviceWorker.addEventListener('message', onMessage);

    void navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener('statechange', () => {
            // `controller` is null on the very first install; that is not an
            // update and must not raise a toast.
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              toast('نسخهٔ تازه‌ای آماده است', {
                description: 'برای به‌روزرسانی، برنامه را دوباره باز کنید.',
              });
              registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch(() => {
        // A failed registration costs offline support, not the app.
      });

    const onOnline = (): void => {
      void flushOutbox();
    };

    window.addEventListener('online', onOnline);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      navigator.serviceWorker.removeEventListener('message', onMessage);
      window.removeEventListener('online', onOnline);
    };
  }, [toast, success]);

  return null;
}
