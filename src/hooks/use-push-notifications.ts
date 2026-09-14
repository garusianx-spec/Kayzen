'use client';

import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api/client';
import { fromBase64Url } from '@/lib/crypto';
import { clientEnv } from '@/lib/env';

/**
 * Web Push subscription management.
 *
 * Permission is requested from a user gesture only — Chrome ignores a prompt
 * raised on page load, and Android users who see an unsolicited one deny it,
 * permanently, for the origin.
 *
 * The VAPID public key travels as base64url and has to reach
 * `pushManager.subscribe()` as raw bytes; passing the string straight through
 * is the classic mistake that yields `InvalidAccessError` with no explanation.
 */

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export interface PushNotificationsState {
  permission: PushPermission;
  isSubscribed: boolean;
  isBusy: boolean;
  subscribe(): Promise<boolean>;
  unsubscribe(): Promise<void>;
}

function isSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function usePushNotifications(): PushNotificationsState {
  const [permission, setPermission] = useState<PushPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!isSupported()) {
      setPermission('unsupported');
      return;
    }

    setPermission(Notification.permission);

    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setIsSubscribed(subscription !== null))
      .catch(() => setIsSubscribed(false));
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported() || !clientEnv.vapidPublicKey) return false;

    setIsBusy(true);

    try {
      const granted = await Notification.requestPermission();
      setPermission(granted);
      if (granted !== 'granted') return false;

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();

      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          // Chrome refuses a subscription that is not user-visible; every push
          // Kayzen sends shows a notification, so this is honest.
          userVisibleOnly: true,
          applicationServerKey: fromBase64Url(clientEnv.vapidPublicKey) as BufferSource,
        }));

      const payload = subscription.toJSON();

      await api.post('/push/subscribe', {
        endpoint: subscription.endpoint,
        keys: { p256dh: payload.keys?.p256dh, auth: payload.keys?.auth },
      });

      setIsSubscribed(true);
      return true;
    } catch {
      return false;
    } finally {
      setIsBusy(false);
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!isSupported()) return;

    setIsBusy(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return;

      await api.delete('/push/subscribe', { endpoint: subscription.endpoint });
      await subscription.unsubscribe();
      setIsSubscribed(false);
    } catch {
      // The row may already be gone server-side; the local state is what the
      // next render reads.
    } finally {
      setIsBusy(false);
    }
  }, []);

  return { permission, isSubscribed, isBusy, subscribe, unsubscribe };
}
