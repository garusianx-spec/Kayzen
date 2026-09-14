'use client';

import { Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { usePreferencesStore } from '@/stores/preferences-store';

/**
 * "Add to home screen" prompt.
 *
 * Chrome fires `beforeinstallprompt` when the PWA meets the installability
 * criteria — the same criteria Play requires of the TWA's manifest — and the
 * event must be captured, because the browser's own mini-infobar no longer
 * appears. It is deliberately *not* shown to anyone already inside the
 * installed app: `display-mode: standalone` means they installed it already,
 * whether from Play or from the browser.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const dismissed = usePreferencesStore((state) => state.installPromptDismissed);
  const dismiss = usePreferencesStore((state) => state.dismissInstallPrompt);
  const haptics = useHapticFeedback();

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const onBeforeInstall = (event: Event): void => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  if (!deferred || dismissed) return null;

  return (
    <div className="kz-frosted mx-4 mb-3 flex items-center gap-3 rounded-card px-4 py-3">
      <Download className="h-5 w-5 shrink-0 text-violet" aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="text-caption text-content-primary">کایزن را روی گوشی نصب کنید</p>
        <p className="text-caption-sm text-content-muted">بدون مرورگر، سریع‌تر و آفلاین.</p>
      </div>

      <button
        type="button"
        onClick={async () => {
          haptics.impact('medium');
          await deferred.prompt();
          await deferred.userChoice;
          setDeferred(null);
        }}
        className="kz-pressable rounded-pill bg-violet-gradient px-4 py-2 text-caption-sm text-white"
      >
        نصب
      </button>

      <button
        type="button"
        aria-label="بستن"
        onClick={() => {
          dismiss();
          setDeferred(null);
        }}
        className="kz-pressable rounded-full p-1 text-content-muted"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
