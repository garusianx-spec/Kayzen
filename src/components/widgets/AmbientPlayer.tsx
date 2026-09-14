'use client';

import { Pause, Play, Volume2, VolumeX } from 'lucide-react';

import { useAmbientAudio } from '@/hooks/use-ambient-audio';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { AMBIENT_TRACKS, useAudioStore } from '@/stores/audio-store';
import { cn } from '@/lib/utils';

/**
 * Ambient sound strip.
 *
 * Playback has to start from a tap: mobile browsers refuse to begin audio
 * without a user gesture, and a "playing" state restored from storage would be
 * a play button that lies. The store therefore never persists `isPlaying`.
 */
export function AmbientPlayer() {
  useAmbientAudio();

  const { trackId, isPlaying, volume, muted, toggle, setVolume, toggleMute } = useAudioStore();
  const haptics = useHapticFeedback();

  return (
    <section className="kz-card space-y-3" aria-label="صدای محیط">
      <div className="flex items-center justify-between">
        <h2 className="text-title text-content-primary">صدای محیط</h2>

        <button
          type="button"
          onClick={() => {
            haptics.selection();
            toggleMute();
          }}
          aria-label={muted ? 'صدادار' : 'بی‌صدا'}
          className="kz-pressable rounded-full p-2 text-content-muted hover:text-content-primary"
        >
          {muted ? (
            <VolumeX className="h-5 w-5" aria-hidden />
          ) : (
            <Volume2 className="h-5 w-5" aria-hidden />
          )}
        </button>
      </div>

      <div className="snap-strip -mx-1 flex gap-2 px-1">
        {AMBIENT_TRACKS.map((track) => {
          const active = trackId === track.id;

          return (
            <button
              key={track.id}
              type="button"
              onClick={() => {
                haptics.impact('light');
                toggle(track.id);
              }}
              className={cn(
                'kz-pressable flex shrink-0 snap-start items-center gap-2 rounded-pill border px-4 py-2 text-caption',
                active && isPlaying
                  ? 'border-violet bg-violet-soft text-violet'
                  : 'border-border text-content-muted',
              )}
            >
              {active && isPlaying ? (
                <Pause className="h-4 w-4" aria-hidden />
              ) : (
                <Play className="h-4 w-4" aria-hidden />
              )}
              {track.label}
            </button>
          );
        })}
      </div>

      <label className="flex items-center gap-3">
        <span className="sr-only">بلندی صدا</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(event) => setVolume(Number(event.target.value) / 100)}
          className="h-1 w-full accent-violet"
        />
      </label>
    </section>
  );
}
