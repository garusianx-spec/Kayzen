'use client';

import { useEffect, useRef, useState } from 'react';

import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { useRecordPomodoro } from '@/lib/api/queries';
import { usePomodoroStore } from '@/stores/pomodoro-store';

/**
 * Drives the focus chamber.
 *
 * The store holds an absolute deadline; this hook is the 1 Hz heartbeat that
 * re-reads it, and the place where "the interval ended" becomes a real event:
 * haptics, and a durable record of the session (queued to the outbox when the
 * device is offline, because a finished 25-minute block must not evaporate
 * because the lift had no signal).
 *
 * Rehydration matters as much as ticking. A persisted `running` state whose
 * deadline passed while the app was closed is settled the moment the hook
 * mounts, so reopening the app shows a completed session rather than a timer
 * that has silently run negative.
 */

export interface PomodoroTimerState {
  remainingSeconds: number;
  totalSeconds: number;
  progress: number;
  mode: ReturnType<typeof usePomodoroStore.getState>['mode'];
  status: ReturnType<typeof usePomodoroStore.getState>['status'];
}

/** Final seconds that get a tick of haptic feedback. */
const TICK_THRESHOLD_SECONDS = 5;

export function usePomodoroTimer(): PomodoroTimerState {
  const store = usePomodoroStore();
  const haptics = useHapticFeedback();
  const recordPomodoro = useRecordPomodoro();

  const [remainingSeconds, setRemainingSeconds] = useState(() => store.remainingSeconds());
  const settledRef = useRef(false);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = (): void => {
      const remaining = usePomodoroStore.getState().remainingSeconds();
      setRemainingSeconds(remaining);

      const { status, mode, startedAt, taskId } = usePomodoroStore.getState();
      if (status !== 'running') return;

      if (
        remaining > 0 &&
        remaining <= TICK_THRESHOLD_SECONDS &&
        lastTickRef.current !== remaining
      ) {
        lastTickRef.current = remaining;
        haptics.timerTick();
      }

      if (remaining > 0) {
        settledRef.current = false;
        return;
      }

      // Guard against the interval firing twice before the store transitions.
      if (settledRef.current) return;
      settledRef.current = true;

      haptics.timerComplete();

      const durationSeconds = usePomodoroStore.getState().totalSeconds();
      recordPomodoro.mutate({
        taskId: taskId ?? undefined,
        mode,
        durationSeconds,
        startedAt: new Date(startedAt ?? Date.now() - durationSeconds * 1000).toISOString(),
        completed: true,
      });

      usePomodoroStore.getState().complete();
    };

    tick();
    const interval = window.setInterval(tick, 1000);

    return () => window.clearInterval(interval);
    // `recordPomodoro` and `haptics` are stable for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalSeconds = store.totalSeconds();

  return {
    remainingSeconds,
    totalSeconds,
    progress: totalSeconds === 0 ? 0 : 1 - remainingSeconds / totalSeconds,
    mode: store.mode,
    status: store.status,
  };
}
