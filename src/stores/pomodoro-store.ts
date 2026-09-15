'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { PomodoroMode } from '@/types/domain';

/**
 * Pomodoro timer state.
 *
 * The timer is stored as an **absolute deadline**, not as a decrementing
 * counter. A counter driven by `setInterval` drifts — and stops entirely when a
 * mobile browser suspends background timers — so a backgrounded Mini App would
 * come back showing the wrong time. Deriving the remaining seconds from
 * `endsAt - Date.now()` on every tick makes the display correct no matter how
 * long the tab was frozen.
 */

export interface PomodoroSettings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  /** Focus cycles completed before a long break is offered. */
  cyclesBeforeLongBreak: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
}

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
  autoStartBreaks: true,
  autoStartFocus: false,
};

interface PomodoroState {
  mode: PomodoroMode;
  status: 'idle' | 'running' | 'paused' | 'completed';
  /** Epoch ms at which the current interval ends. `null` while idle. */
  endsAt: number | null;
  /** Seconds left, frozen at the moment of pausing. */
  pausedRemaining: number | null;
  startedAt: number | null;
  /** Focus intervals completed in this sitting; resets on a long break. */
  completedCycles: number;
  taskId: string | null;
  settings: PomodoroSettings;

  start(mode?: PomodoroMode, taskId?: string | null): void;
  pause(): void;
  resume(): void;
  reset(): void;
  complete(): void;
  skipToNext(): void;
  setTask(taskId: string | null): void;
  updateSettings(settings: Partial<PomodoroSettings>): void;
  /** Seconds remaining right now. Call from a 1 Hz tick; safe to call at any rate. */
  remainingSeconds(): number;
  /** Total length of the current interval, for the progress ring. */
  totalSeconds(): number;
}

function durationFor(mode: PomodoroMode, settings: PomodoroSettings): number {
  switch (mode) {
    case 'FOCUS':
      return settings.focusMinutes * 60;
    case 'SHORT_BREAK':
      return settings.shortBreakMinutes * 60;
    case 'LONG_BREAK':
      return settings.longBreakMinutes * 60;
  }
}

/** The interval that should follow `mode`, given how many cycles are done. */
export function nextMode(
  mode: PomodoroMode,
  completedCycles: number,
  settings: PomodoroSettings,
): PomodoroMode {
  if (mode !== 'FOCUS') return 'FOCUS';

  const isLongBreakDue = (completedCycles + 1) % settings.cyclesBeforeLongBreak === 0;
  return isLongBreakDue ? 'LONG_BREAK' : 'SHORT_BREAK';
}

export const usePomodoroStore = create<PomodoroState>()(
  persist(
    (set, get) => ({
      mode: 'FOCUS',
      status: 'idle',
      endsAt: null,
      pausedRemaining: null,
      startedAt: null,
      completedCycles: 0,
      taskId: null,
      settings: DEFAULT_POMODORO_SETTINGS,

      start: (mode, taskId) => {
        const state = get();
        const nextTimerMode = mode ?? state.mode;
        const duration = durationFor(nextTimerMode, state.settings);

        set({
          mode: nextTimerMode,
          status: 'running',
          endsAt: Date.now() + duration * 1000,
          pausedRemaining: null,
          startedAt: Date.now(),
          taskId: taskId !== undefined ? taskId : state.taskId,
        });
      },

      pause: () => {
        const state = get();
        if (state.status !== 'running') return;

        set({ status: 'paused', pausedRemaining: state.remainingSeconds(), endsAt: null });
      },

      resume: () => {
        const state = get();
        if (state.status !== 'paused' || state.pausedRemaining === null) return;

        set({
          status: 'running',
          endsAt: Date.now() + state.pausedRemaining * 1000,
          pausedRemaining: null,
        });
      },

      reset: () => set({ status: 'idle', endsAt: null, pausedRemaining: null, startedAt: null }),

      complete: () => {
        const state = get();
        const wasFocus = state.mode === 'FOCUS';
        const completedCycles = wasFocus ? state.completedCycles + 1 : state.completedCycles;
        const following = nextMode(state.mode, state.completedCycles, state.settings);

        const shouldAutoStart = wasFocus
          ? state.settings.autoStartBreaks
          : state.settings.autoStartFocus;

        set({
          mode: following,
          completedCycles: following === 'FOCUS' && !wasFocus ? completedCycles : completedCycles,
          status: shouldAutoStart ? 'running' : 'completed',
          endsAt: shouldAutoStart
            ? Date.now() + durationFor(following, state.settings) * 1000
            : null,
          pausedRemaining: null,
          startedAt: shouldAutoStart ? Date.now() : null,
        });
      },

      skipToNext: () => {
        const state = get();
        const following = nextMode(state.mode, state.completedCycles, state.settings);

        set({
          mode: following,
          status: 'idle',
          endsAt: null,
          pausedRemaining: null,
          startedAt: null,
        });
      },

      setTask: (taskId) => set({ taskId }),

      updateSettings: (settings) =>
        set((state) => ({ settings: { ...state.settings, ...settings } })),

      remainingSeconds: () => {
        const state = get();

        if (state.status === 'paused') return state.pausedRemaining ?? 0;
        if (state.status !== 'running' || state.endsAt === null) {
          return durationFor(state.mode, state.settings);
        }

        return Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
      },

      totalSeconds: () => durationFor(get().mode, get().settings),
    }),
    {
      name: 'kayzen:pomodoro',
      storage: createJSONStorage(() => localStorage),
      // Only the durable parts are persisted; `status` is recomputed on rehydrate
      // by `usePomodoroTimer`, which checks whether `endsAt` has already passed.
      partialize: (state) => ({
        mode: state.mode,
        status: state.status,
        endsAt: state.endsAt,
        pausedRemaining: state.pausedRemaining,
        startedAt: state.startedAt,
        completedCycles: state.completedCycles,
        taskId: state.taskId,
        settings: state.settings,
      }),
    },
  ),
);
