'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { ApiClientError } from '@/lib/api/client';

/**
 * React Query configuration.
 *
 * Tuned for a phone on an unreliable connection rather than a desktop on
 * fibre:
 *
 *  - `networkMode: 'offlineFirst'` lets queries run against the service worker's
 *    cache while `navigator.onLine` is false, instead of being paused;
 *  - a 4xx is never retried — the server has already decided, and three more
 *    attempts only burn battery and rate-limit budget;
 *  - refetch on focus is off: the installed app is foregrounded constantly, and
 *    re-fetching every list each time is noise, not freshness.
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 24 * 60 * 60 * 1000,
        networkMode: 'offlineFirst',
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: (failureCount, error) => {
          if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) {
            return false;
          }

          return failureCount < 2;
        },
      },
      mutations: {
        networkMode: 'offlineFirst',
        retry: 0,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  // `useState` rather than a module singleton: a shared client across server
  // renders would leak one user's cache into another's response.
  const [queryClient] = useState(createQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
