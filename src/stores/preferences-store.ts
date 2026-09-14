'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Device-local preferences.
 *
 * Deliberately separate from the account preferences the API stores: theme and
 * haptics have to be readable *before* the session resolves — the theme is
 * applied by an inline script on the very first paint — and they are reasonably
 * per-device. The server copy remains the source of truth across devices and is
 * merged in by `syncFromAccount()` once the session loads.
 */

export type ThemeSetting = 'system' | 'light' | 'dark';

interface PreferencesState {
  theme: ThemeSetting;
  hapticsEnabled: boolean;
  ambientEnabled: boolean;
  /** Dismissed the install prompt; do not nag again this device. */
  installPromptDismissed: boolean;

  setTheme(theme: ThemeSetting): void;
  setHapticsEnabled(enabled: boolean): void;
  setAmbientEnabled(enabled: boolean): void;
  dismissInstallPrompt(): void;
  syncFromAccount(account: {
    theme: 'SYSTEM' | 'LIGHT' | 'DARK';
    hapticsEnabled: boolean;
    ambientEnabled: boolean;
  }): void;
}

export const PREFERENCES_STORAGE_KEY = 'kayzen:preferences';

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'dark',
      hapticsEnabled: true,
      ambientEnabled: true,
      installPromptDismissed: false,

      setTheme: (theme) => set({ theme }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      setAmbientEnabled: (ambientEnabled) => set({ ambientEnabled }),
      dismissInstallPrompt: () => set({ installPromptDismissed: true }),

      syncFromAccount: (account) =>
        set({
          theme: account.theme.toLowerCase() as ThemeSetting,
          hapticsEnabled: account.hapticsEnabled,
          ambientEnabled: account.ambientEnabled,
        }),
    }),
    {
      name: PREFERENCES_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** Resolves `system` against the OS setting. Safe to call during SSR. */
export function resolveTheme(theme: ThemeSetting): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined') return 'dark';

  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
