'use client';

import { useEffect, type ReactNode } from 'react';

import { resolveTheme, usePreferencesStore } from '@/stores/preferences-store';

/**
 * Applies the theme to `<html data-theme>` and keeps the Android status bar in
 * step.
 *
 * First paint is handled by the inline bootstrap in `layout.tsx`, before React
 * loads, so there is no flash of the wrong palette. This component owns every
 * change after that — including following the OS while the setting is `system`,
 * which the bootstrap script cannot subscribe to.
 *
 * `<meta name="theme-color">` is what colours the TWA's status bar, so it has to
 * track the palette or the system bar ends up light-on-light after a switch.
 */

const THEME_COLORS = { dark: '#0B0B14', light: '#F8F7FC' } as const;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = usePreferencesStore((state) => state.theme);

  useEffect(() => {
    const apply = (): void => {
      const resolved = resolveTheme(theme);
      document.documentElement.dataset.theme = resolved;

      const meta = document.querySelector('meta[name="theme-color"]');
      meta?.setAttribute('content', THEME_COLORS[resolved]);
    };

    apply();

    if (theme !== 'system') return;

    const query = window.matchMedia('(prefers-color-scheme: light)');
    query.addEventListener('change', apply);

    return () => query.removeEventListener('change', apply);
  }, [theme]);

  return <>{children}</>;
}
