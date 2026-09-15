'use client';

import { Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { KayzenLogo } from '@/components/brand/KayzenLogo';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { NAV_ITEMS } from './BottomNav';

/**
 * The branded top bar.
 *
 * Sticky rather than fixed, and frosted like the bottom navigation, so the two
 * chrome surfaces read as one system. It pads itself out of
 * `env(safe-area-inset-top)` because the Trusted Web Activity draws edge to
 * edge underneath the Android status bar — without that the logo sits behind
 * the clock.
 *
 * On the home tab the bar carries the full lockup; on every other tab the
 * wordmark gives way to the section name, so the user always knows where they
 * are. The mark itself never leaves, which is the point of putting it here.
 */
export function AppHeader() {
  const pathname = usePathname();
  const haptics = useHapticFeedback();

  const isHome = pathname === '/';
  const section = NAV_ITEMS.find((item) => item.href !== '/' && pathname.startsWith(item.href));

  return (
    <header className="sticky top-0 z-30 pt-safe-top">
      <div className="kz-frosted flex h-14 items-center justify-between gap-3 px-4">
        <Link
          href="/"
          onClick={() => haptics.selection()}
          className="kz-pressable flex min-w-0 items-center gap-2 rounded-pill"
          aria-label="کایزن — رفتن به امروز"
        >
          {isHome ? (
            <KayzenLogo variant="full" size={26} label={null} />
          ) : (
            <>
              <KayzenLogo variant="mark" size={24} label={null} />
              <span className="truncate text-title text-foreground">{section?.label}</span>
            </>
          )}
        </Link>

        <Link
          href="/settings"
          onClick={() => haptics.selection()}
          aria-label="تنظیمات"
          aria-current={pathname === '/settings' ? 'page' : undefined}
          className="kz-pressable rounded-full border border-border p-2 text-muted-foreground hover:text-foreground"
        >
          <Settings className="h-5 w-5" aria-hidden />
        </Link>
      </div>
    </header>
  );
}
