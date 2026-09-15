'use client';

import { create } from 'zustand';

import type { QuickActionKind } from '@/types/domain';

/**
 * Ephemeral UI state: which sheet is open, what the FAB is doing.
 *
 * Not persisted — a restored modal on next launch is never what the user wants.
 */

interface UiState {
  /** The FAB's radial action sheet. */
  isQuickActionSheetOpen: boolean;
  /** Composer currently open, or `null`. Drives which form the sheet renders. */
  activeComposer: QuickActionKind | null;
  /** Entity id when the composer is editing rather than creating. */
  composerEntityId: string | null;
  isCommandPaletteOpen: boolean;

  openQuickActions(): void;
  closeQuickActions(): void;
  openComposer(kind: QuickActionKind, entityId?: string): void;
  closeComposer(): void;
  toggleCommandPalette(open?: boolean): void;
}

export const useUiStore = create<UiState>()((set) => ({
  isQuickActionSheetOpen: false,
  activeComposer: null,
  composerEntityId: null,
  isCommandPaletteOpen: false,

  openQuickActions: () => set({ isQuickActionSheetOpen: true }),
  closeQuickActions: () => set({ isQuickActionSheetOpen: false }),

  openComposer: (kind, entityId) =>
    set({
      activeComposer: kind,
      composerEntityId: entityId ?? null,
      // The action sheet always yields to the composer it launched.
      isQuickActionSheetOpen: false,
    }),

  closeComposer: () => set({ activeComposer: null, composerEntityId: null }),

  toggleCommandPalette: (open) =>
    set((state) => ({ isCommandPaletteOpen: open ?? !state.isCommandPaletteOpen })),
}));
