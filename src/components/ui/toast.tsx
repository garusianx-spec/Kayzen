'use client';

import * as ToastPrimitive from '@radix-ui/react-toast';
import { AlertTriangle, CheckCircle2, Info, WifiOff } from 'lucide-react';
import { useCallback, type ReactNode } from 'react';
import { create } from 'zustand';

import { cn } from '@/lib/utils';

/**
 * Toasts.
 *
 * The queue lives in a store rather than a context so that non-React code —
 * the API client's offline path, the service-worker update listener — can raise
 * one without a hook.
 */

export type ToastTone = 'info' | 'success' | 'error' | 'offline';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  durationMs: number;
}

interface ToastState {
  toasts: ToastItem[];
  push(toast: Omit<ToastItem, 'id' | 'tone' | 'durationMs'> & Partial<ToastItem>): string;
  dismiss(id: string): void;
}

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],

  push: (toast) => {
    const id = crypto.randomUUID();

    set((state) => ({
      toasts: [
        ...state.toasts.slice(-2), // at most three on screen at once
        {
          id,
          title: toast.title,
          description: toast.description,
          tone: toast.tone ?? 'info',
          durationMs: toast.durationMs ?? 4000,
        },
      ],
    }));

    return id;
  },

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
}));

export function useToast() {
  const push = useToastStore((state) => state.push);

  return {
    toast: useCallback(
      (title: string, options: { description?: string; tone?: ToastTone } = {}) =>
        push({ title, ...options }),
      [push],
    ),
    success: useCallback(
      (title: string, description?: string) => push({ title, description, tone: 'success' }),
      [push],
    ),
    error: useCallback(
      (title: string, description?: string) => push({ title, description, tone: 'error' }),
      [push],
    ),
    offline: useCallback(
      (title: string, description?: string) =>
        push({ title, description, tone: 'offline', durationMs: 6000 }),
      [push],
    ),
  };
}

const TONE_ICON: Record<ToastTone, ReactNode> = {
  info: <Info className="h-5 w-5 text-sky" aria-hidden />,
  success: <CheckCircle2 className="h-5 w-5 text-emerald" aria-hidden />,
  error: <AlertTriangle className="h-5 w-5 text-rose" aria-hidden />,
  offline: <WifiOff className="h-5 w-5 text-flame" aria-hidden />,
};

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={4000}>
      {toasts.map((toast) => (
        <ToastPrimitive.Root
          key={toast.id}
          duration={toast.durationMs}
          onOpenChange={(open) => {
            if (!open) dismiss(toast.id);
          }}
          className={cn(
            'kz-frosted pointer-events-auto flex w-full items-start gap-3 rounded-card p-4 shadow-card',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out',
            'data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-4',
          )}
        >
          {TONE_ICON[toast.tone]}
          <div className="min-w-0 flex-1">
            <ToastPrimitive.Title className="text-body font-medium text-content-primary">
              {toast.title}
            </ToastPrimitive.Title>
            {toast.description ? (
              <ToastPrimitive.Description className="mt-1 text-caption text-content-muted">
                {toast.description}
              </ToastPrimitive.Description>
            ) : null}
          </div>
        </ToastPrimitive.Root>
      ))}

      <ToastPrimitive.Viewport
        // Above the bottom navigation, never under the thumb.
        className="pointer-events-none fixed inset-x-0 bottom-nav-offset z-[60] mx-auto flex w-full max-w-md flex-col gap-2 px-4"
      />
    </ToastPrimitive.Provider>
  );
}
