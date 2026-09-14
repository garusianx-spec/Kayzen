'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

/**
 * Text input.
 *
 * `text-base` (16px) is deliberate: anything smaller makes iOS Safari zoom on
 * focus, and the Android shell inherits the same layout.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, hasError, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-12 w-full rounded-card border border-border bg-card px-4 text-base text-content-primary',
        'placeholder:text-content-muted focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/40',
        'disabled:opacity-50',
        hasError && 'border-rose focus:border-rose focus:ring-rose/40',
        className,
      )}
      aria-invalid={hasError || undefined}
      {...props}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { hasError?: boolean }
>(function Textarea({ className, hasError, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'min-h-[96px] w-full rounded-card border border-border bg-card p-4 text-base leading-7 text-content-primary',
        'placeholder:text-content-muted focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/40',
        hasError && 'border-rose focus:border-rose focus:ring-rose/40',
        className,
      )}
      aria-invalid={hasError || undefined}
      {...props}
    />
  );
});

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p role="alert" className="mt-2 text-caption text-rose">
      {message}
    </p>
  );
}

export function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-2 flex items-baseline justify-between gap-2">
      <span className="text-caption font-medium text-content-secondary">{children}</span>
      {hint ? <span className="text-caption-sm text-content-muted">{hint}</span> : null}
    </label>
  );
}
