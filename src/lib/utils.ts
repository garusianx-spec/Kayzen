import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Conditional class names with Tailwind conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Clamps `value` into `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** `mm:ss` for the Pomodoro readout, with Persian digits applied by the caller. */
export function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Crypto-backed id for optimistic rows that have no server id yet. */
export function optimisticId(prefix = 'tmp'): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function isOptimisticId(id: string): boolean {
  return id.startsWith('tmp_');
}
