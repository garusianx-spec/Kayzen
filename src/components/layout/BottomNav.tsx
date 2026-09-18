'use client';

import { BookOpen, Flame, Home, LayoutGrid, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';

import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { cn } from '@/lib/utils';

/**
 * Floating bottom navigation.
 *
 * Frosted rather than solid so the content scrolling underneath stays legible —
 * on a 5-inch phone the bar eats a real share of the screen, and an opaque one
 * makes the list feel truncated.
 *
 * The bar floats above `env(safe-area-inset-bottom)` because the Android
 * gesture pill sits exactly where a bottom-anchored bar would otherwise land.
 */

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Five destinations, and no more.
 *
 * The focus room moved into the tools hub when the hub arrived: a bottom bar
 * is the app's table of contents, and a timer is something you go to on
 * purpose, not somewhere you navigate to by reflex.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'امروز', icon: Home },
  { href: '/habits', label: 'عادت‌ها', icon: Flame },
  { href: '/tools', label: 'ابزارها', icon: LayoutGrid },
  { href: '/finance', label: 'مالی', icon: Wallet },
  { href: '/library', label: 'مطالعه', icon: BookOpen },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function BottomNav() {
  const pathname = usePathname();
  const haptics = useHapticFeedback();

  return (
    <nav
      aria-label="ناوبری اصلی"
      className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-2"
    >
      <ul className="kz-frosted mx-auto flex max-w-md items-stretch justify-between gap-1 rounded-pill p-1.5 shadow-nav">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                onClick={() => haptics.selection()}
                className={cn(
                  'kz-pressable flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-pill px-1 py-2',
                  'text-caption-sm transition-colors',
                  active
                    ? 'bg-violet-soft text-violet'
                    : 'text-content-muted hover:text-content-secondary',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden strokeWidth={active ? 2.4 : 1.8} />
                <span className="leading-none">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
