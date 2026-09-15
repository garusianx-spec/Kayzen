'use client';

import { useCallback, useMemo } from 'react';

import { usePreferencesStore } from '@/stores/preferences-store';

/**
 * Native haptic feedback through the Web Vibration API.
 *
 * Inside the Trusted Web Activity this is a genuine native buzz: Chrome forwards
 * `navigator.vibrate()` to Android's vibrator service, so a completed task feels
 * the same as it would in a Kotlin app. In a desktop browser — and on iOS, which
 * does not implement the API at all — every call is a silent no-op, which is why
 * handlers can invoke it unconditionally.
 *
 * Two constraints shape the patterns below:
 *
 *  - **User activation is required.** Chrome ignores `vibrate()` outside a
 *    gesture-driven task, so haptics fire from event handlers, never from an
 *    effect reacting to arriving data.
 *  - **Short is native, long is annoying.** Android's own haptic constants sit
 *    between 10 ms and 40 ms; the patterns here stay in that range, and the
 *    `[15, 50, 15]` double-tap used for completion is the longest of them.
 */

export type HapticPattern =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'selection'
  | 'success'
  | 'warning'
  | 'error'
  | 'tick'
  | 'streak';

export const HAPTIC_PATTERNS: Record<HapticPattern, number | number[]> = {
  /** A tap landed. The default for buttons and chips. */
  light: 10,
  medium: 20,
  /** Destructive confirmation, long-press activation. */
  heavy: 35,
  /** Moving through a list, changing a segmented control. */
  selection: 8,
  /** Task ticked off, habit checked, goal reached. */
  success: [15, 50, 15],
  warning: [20, 60, 20],
  error: [45, 60, 45],
  /** Timer ticking through the final seconds. */
  tick: 6,
  /** A streak just grew: two quick taps and a longer flare. */
  streak: [12, 40, 12, 40, 28],
};

export function isVibrationSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export interface HapticFeedback {
  /** Fires an arbitrary pattern from the table above. */
  impact(pattern?: HapticPattern): boolean;
  /** `[15, 50, 15]` — the completion double-tap. */
  taskComplete(): boolean;
  /** Escalating flare for a streak increment. */
  streakIncrement(): boolean;
  /** 6 ms tick for the Pomodoro countdown's final seconds. */
  timerTick(): boolean;
  /** Longer pattern marking the end of a focus interval. */
  timerComplete(): boolean;
  selection(): boolean;
  error(): boolean;
  /** Stops any pattern still playing. */
  cancel(): void;
  readonly supported: boolean;
  readonly enabled: boolean;
}

export function useHapticFeedback(): HapticFeedback {
  const hapticsEnabled = usePreferencesStore((state) => state.hapticsEnabled);
  const supported = isVibrationSupported();
  const enabled = hapticsEnabled && supported;

  const impact = useCallback(
    (pattern: HapticPattern = 'light'): boolean => {
      if (!hapticsEnabled || !isVibrationSupported()) return false;

      try {
        return navigator.vibrate(HAPTIC_PATTERNS[pattern]);
      } catch {
        // Some Android builds throw instead of returning false when the device
        // has no vibrator; a failed buzz must never break an interaction.
        return false;
      }
    },
    [hapticsEnabled],
  );

  const cancel = useCallback((): void => {
    if (!isVibrationSupported()) return;

    try {
      navigator.vibrate(0);
    } catch {
      // Nothing to stop.
    }
  }, []);

  return useMemo<HapticFeedback>(
    () => ({
      impact,
      taskComplete: () => impact('success'),
      streakIncrement: () => impact('streak'),
      timerTick: () => impact('tick'),
      timerComplete: () => impact('warning'),
      selection: () => impact('selection'),
      error: () => impact('error'),
      cancel,
      supported,
      enabled,
    }),
    [impact, cancel, supported, enabled],
  );
}
