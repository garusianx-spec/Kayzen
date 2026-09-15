'use client';

import type { ReactNode } from 'react';

import { AppHeader } from './AppHeader';
import { BottomNav } from './BottomNav';
import { OfflineBanner } from './OfflineBanner';
import { QuickActionFab } from './QuickActionFab';
import { ComposerHost } from '@/components/composers/ComposerHost';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';

/**
 * The frame every signed-in screen renders inside.
 *
 * Bottom padding clears the floating navigation *and* the safe-area inset, so
 * the last row of a list is never parked under the Android gesture pill — the
 * single most common way a mobile web app feels unfinished.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto flex min-h-viewport w-full max-w-md flex-col">
      <AppHeader />
      <main className="flex-1 pb-nav-offset">{children}</main>

      <OfflineBanner />
      <InstallPrompt />
      <QuickActionFab />
      <ComposerHost />
      <BottomNav />
    </div>
  );
}
