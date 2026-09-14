'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Seconds-remaining countdown, driven by a deadline rather than a decrement.
 *
 * Backgrounded mobile tabs have their timers throttled or stopped outright, so a
 * `seconds - 1` tick comes back wrong after a minute in another app. Recomputing
 * from an absolute deadline on every tick means the displayed value is correct
 * the instant the tab wakes, however long it slept.
 */

export interface CountdownState {
  secondsRemaining: number;
  isRunning: boolean;
  /** Restarts the countdown with a new duration. */
  restart(seconds: number): void;
  stop(): void;
}

export function useCountdown(
  initialSeconds: number,
  options: { autoStart?: boolean } = {},
): CountdownState {
  const { autoStart = true } = options;
  const [deadline, setDeadline] = useState<number | null>(
    autoStart && initialSeconds > 0 ? Date.now() + initialSeconds * 1000 : null,
  );
  const [secondsRemaining, setSecondsRemaining] = useState(autoStart ? initialSeconds : 0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (deadline === null) return;

    const tick = (): void => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsRemaining(remaining);

      if (remaining === 0) {
        setDeadline(null);
        return;
      }

      frameRef.current = window.setTimeout(tick, 250);
    };

    tick();

    return () => {
      if (frameRef.current !== null) window.clearTimeout(frameRef.current);
    };
  }, [deadline]);

  // A tab returning to the foreground has a stale reading until the next tick;
  // recomputing on visibility change closes that gap immediately.
  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible' || deadline === null) return;
      setSecondsRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [deadline]);

  const restart = useCallback((seconds: number): void => {
    setSecondsRemaining(Math.max(0, seconds));
    setDeadline(seconds > 0 ? Date.now() + seconds * 1000 : null);
  }, []);

  const stop = useCallback((): void => {
    setDeadline(null);
    setSecondsRemaining(0);
  }, []);

  return { secondsRemaining, isRunning: deadline !== null, restart, stop };
}
