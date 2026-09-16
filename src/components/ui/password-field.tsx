'use client';

import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';

import { FieldError, FieldLabel, Input } from './input';
import { cn } from '@/lib/utils';

/**
 * Password input with a reveal toggle.
 *
 * The toggle is not a nicety on this app's primary target. Typing a passphrase
 * on an Android soft keyboard, in a form whose surrounding text is right to
 * left, with no character echo, is how people end up choosing short passwords —
 * so the eye is offered, defaulting to hidden.
 *
 * The field stays `dir="ltr"`: a password is a byte string, and rendering it
 * right to left would show the caret on the wrong side of what was typed.
 */

export interface PasswordFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'dir'> {
  label: string;
  error?: string;
  /** Rendered under the field when there is no error. */
  hint?: string;
  containerClassName?: string;
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField({ label, error, hint, containerClassName, className, id, ...props }, ref) {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    const hintId = `${fieldId}-hint`;

    const [revealed, setRevealed] = useState(false);
    const Icon = revealed ? EyeOff : Eye;

    return (
      <div className={containerClassName}>
        <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>

        <div className="relative">
          <Input
            ref={ref}
            id={fieldId}
            type={revealed ? 'text' : 'password'}
            dir="ltr"
            hasError={Boolean(error)}
            aria-describedby={hint && !error ? hintId : undefined}
            // Physical `pr`, not logical `ps`. The button is positioned against
            // the wrapper, which inherits the page's RTL, so it lands on the
            // right; the input itself is `dir="ltr"`, so a logical property
            // here would resolve the other way and let the text run under it.
            className={cn('pr-12 text-start', className)}
            {...props}
          />

          <button
            type="button"
            onClick={() => setRevealed((previous) => !previous)}
            // Announced as a state, not as a command, so a screen reader user
            // knows whether the password is currently visible.
            aria-pressed={revealed}
            aria-label={revealed ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'}
            className={cn(
              'absolute inset-y-0 right-0 flex w-12 items-center justify-center',
              'rounded-card text-content-muted transition hover:text-content-primary',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/40',
            )}
            tabIndex={-1}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {error ? (
          <FieldError message={error} />
        ) : hint ? (
          <p id={hintId} className="mt-2 text-caption-sm text-content-muted">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
