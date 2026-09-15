'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Ambient audio control surface.
 *
 * The store holds *intent* only — which track, how loud, playing or not. The
 * Howler instance itself lives in `useAmbientAudio`, because an audio object is
 * not serialisable and must not survive a hot reload or a persisted rehydrate.
 */

export interface AmbientTrack {
  id: string;
  label: string;
  /** Looped source under `public/audio/`. */
  src: string;
  icon: string;
}

export const AMBIENT_TRACKS: readonly AmbientTrack[] = [
  { id: 'rain', label: 'باران', src: '/audio/rain.mp3', icon: 'cloud-rain' },
  { id: 'cafe', label: 'کافه', src: '/audio/cafe.mp3', icon: 'coffee' },
  { id: 'white-noise', label: 'نویز سفید', src: '/audio/white-noise.mp3', icon: 'radio' },
  { id: 'forest', label: 'جنگل', src: '/audio/forest.mp3', icon: 'trees' },
  { id: 'fireplace', label: 'شومینه', src: '/audio/fireplace.mp3', icon: 'flame' },
] as const;

interface AudioState {
  trackId: string | null;
  isPlaying: boolean;
  volume: number;
  /** Silences ambience without forgetting the selection. */
  muted: boolean;

  play(trackId: string): void;
  pause(): void;
  toggle(trackId?: string): void;
  stop(): void;
  setVolume(volume: number): void;
  toggleMute(): void;
}

export const useAudioStore = create<AudioState>()(
  persist(
    (set, get) => ({
      trackId: null,
      isPlaying: false,
      volume: 0.4,
      muted: false,

      play: (trackId) => set({ trackId, isPlaying: true, muted: false }),
      pause: () => set({ isPlaying: false }),

      toggle: (trackId) => {
        const state = get();
        const target = trackId ?? state.trackId;
        if (!target) return;

        // Tapping the track that is already playing stops it; tapping a
        // different one switches to it and keeps playing.
        const isSameTrack = target === state.trackId;
        set({
          trackId: target,
          isPlaying: isSameTrack ? !state.isPlaying : true,
          muted: false,
        });
      },

      stop: () => set({ isPlaying: false, trackId: null }),
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)), muted: false }),
      toggleMute: () => set((state) => ({ muted: !state.muted })),
    }),
    {
      name: 'kayzen:ambient',
      storage: createJSONStorage(() => localStorage),
      // `isPlaying` is deliberately not persisted: browsers block autoplay, so a
      // restored "playing" state would show a lying play button.
      partialize: (state) => ({ trackId: state.trackId, volume: state.volume, muted: state.muted }),
    },
  ),
);
