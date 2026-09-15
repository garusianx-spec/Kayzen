'use client';

import { useEffect, type ReactNode } from 'react';

import { ServiceWorkerRegistrar } from '@/components/pwa/ServiceWorkerRegistrar';
import { QueryProvider } from './QueryProvider';
import { ThemeProvider } from './ThemeProvider';
import { ToastViewport } from '@/components/ui/toast';
import { initSentry } from '@/lib/observability/sentry';

/**
 * The single client boundary at the root of the tree.
 *
 * Order matters: `QueryProvider` wraps everything because the service-worker
 * registrar and the toast viewport both raise messages that screens consume,
 * and the theme has to be applied before anything paints.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  // Browser-side error reporting starts as soon as the tree mounts; a no-op
  // when no DSN is configured.
  useEffect(() => initSentry('browser'), []);

  return (
    <QueryProvider>
      <ThemeProvider>
        {children}
        <ToastViewport />
        <ServiceWorkerRegistrar />
      </ThemeProvider>
    </QueryProvider>
  );
}
