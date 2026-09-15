'use client';

import { Howl } from 'howler';
import { useEffect, useRef } from 'react';

import { AMBIENT_TRACKS, useAudioStore } from '@/stores/audio-store';

/**
 * Binds the ambient audio store to an actual Howler instance.
 *
 * Howler rather than a bare `<audio>` element for one reason that matters on
 * mobile: gapless looping. An `<audio loop>` tag has an audible seam at the loop
 * point, which is precisely the kind of thing that pulls attention back out of a
 * focus session.
 *
 * The instance lives in a ref, never in the store: it is not serialisable, must
 * not survive a persisted rehydrate, and must be disposed on unmount or a
 * navigation leaves rain playing forever.
 */
export function useAmbientAudio(): void {
  const trackId = useAudioStore((state) => state.trackId);
  const isPlaying = useAudioStore((state) => state.isPlaying);
  const volume = useAudioStore((state) => state.volume);
  const muted = useAudioStore((state) => state.muted);

  const howlRef = useRef<Howl | null>(null);
  const loadedTrackRef = useRef<string | null>(null);

  useEffect(() => {
    if (!trackId) {
      howlRef.current?.stop();
      howlRef.current?.unload();
      howlRef.current = null;
      loadedTrackRef.current = null;
      return;
    }

    if (loadedTrackRef.current !== trackId) {
      const track = AMBIENT_TRACKS.find((candidate) => candidate.id === trackId);
      if (!track) return;

      howlRef.current?.stop();
      howlRef.current?.unload();

      howlRef.current = new Howl({
        src: [track.src],
        loop: true,
        html5: false,
        volume: muted ? 0 : volume,
        preload: true,
      });

      loadedTrackRef.current = trackId;
    }

    const howl = howlRef.current;
    if (!howl) return;

    howl.volume(muted ? 0 : volume);

    if (isPlaying && !howl.playing()) howl.play();
    if (!isPlaying && howl.playing()) howl.pause();
  }, [trackId, isPlaying, volume, muted]);

  useEffect(() => {
    return () => {
      howlRef.current?.stop();
      howlRef.current?.unload();
      howlRef.current = null;
    };
  }, []);
}
