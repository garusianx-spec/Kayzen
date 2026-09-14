'use client';

import { useEffect, useState } from 'react';

/**
 * Connectivity, for the offline-first surfaces.
 *
 * `navigator.onLine` is famously optimistic — it reports "online" for a captive
 * portal — so it is treated as a hint that gates the offline banner and the
 * mutation queue's flush attempt, never as proof a request will succeed.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = (): void => setIsOnline(true);
    const handleOffline = (): void => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
