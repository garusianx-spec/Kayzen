'use client';

import { useEffect } from 'react';

import { captureException } from '@/lib/observability/sentry';

/**
 * Route-level error boundary.
 *
 * Reports to Sentry and offers a retry rather than stranding the user on a
 * blank screen — in an installed app there is no visible reload button to fall
 * back on.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset(): void;
}) {
  useEffect(() => {
    captureException(error, { digest: error.digest });
  }, [error]);

  return (
    <main className="flex min-h-viewport flex-col items-center justify-center gap-3 px-8 text-center">
      <h1 className="text-title-lg text-content-primary">چیزی درست پیش نرفت</h1>
      <p className="text-body text-content-muted">
        خطای غیرمنتظره‌ای رخ داد. می‌توانید دوباره تلاش کنید.
      </p>

      <button
        type="button"
        onClick={reset}
        className="kz-pressable mt-2 rounded-pill bg-violet-gradient px-6 py-3 text-body text-white"
      >
        تلاش دوباره
      </button>
    </main>
  );
}
