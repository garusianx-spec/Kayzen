'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { toLatinDigits, toPersianDigits } from '@/lib/date/digits';
import { cn } from '@/lib/utils';

/**
 * Segmented one-time-code field.
 *
 * Built on a **single** `<input>` that the boxes are painted over, rather than
 * one input per digit. That choice is what makes every fill path work at once:
 *
 *  - `autocomplete="one-time-code"` gives Android and iOS keyboards their
 *    "from Messages" suggestion — per-digit inputs get no suggestion at all;
 *  - WebOTP writes the whole code into one field (`useWebOtp` hands it here);
 *  - pasting a code from another app just works, with no per-box splitting;
 *  - screen readers announce one labelled field instead of six unlabelled ones.
 *
 * The visible boxes render Persian digits, while `value` stays ASCII — the
 * server issued `123456`, and `۱۲۳۴۵۶` would never match it.
 */

export interface OtpInputProps {
  value: string;
  onChange(value: string): void;
  length?: number;
  disabled?: boolean;
  hasError?: boolean;
  autoFocus?: boolean;
  /** Fired once the field holds `length` digits. */
  onComplete?(value: string): void;
  label?: string;
}

export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled,
  hasError,
  autoFocus = true,
  onComplete,
  label = 'کد تأیید پیامک‌شده',
}: OtpInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const haptics = useHapticFeedback();
  const inputId = useId();
  const completedRef = useRef(false);

  useEffect(() => {
    if (!autoFocus || disabled) return;

    // A frame's delay: focusing during the enter transition makes Android
    // reposition the sheet mid-animation.
    const timer = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(timer);
  }, [autoFocus, disabled]);

  useEffect(() => {
    if (value.length === length && !completedRef.current) {
      completedRef.current = true;
      haptics.impact('light');
      onComplete?.(value);
    }

    if (value.length < length) completedRef.current = false;
  }, [value, length, onComplete, haptics]);

  const handleChange = (raw: string): void => {
    // Persian keyboards emit ۰-۹; the server only ever issued ASCII digits.
    const digits = toLatinDigits(raw).replace(/\D/g, '').slice(0, length);
    if (digits !== value) haptics.impact('selection');
    onChange(digits);
  };

  const cells = Array.from({ length }, (_, index) => value[index] ?? '');
  const activeIndex = Math.min(value.length, length - 1);

  return (
    <div className="relative" data-selectable="true">
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>

      <input
        ref={inputRef}
        id={inputId}
        // The three attributes that make OS-level autofill work. `one-time-code`
        // is the one browsers key their SMS suggestion off; dropping it silently
        // costs the feature.
        autoComplete="one-time-code"
        inputMode="numeric"
        pattern="[0-9]*"
        name="otp"
        type="text"
        maxLength={length}
        value={value}
        disabled={disabled}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? `${inputId}-error` : undefined}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // Transparent, full-bleed and on top: taps anywhere on the boxes land
        // on the real field, so the caret and keyboard behave natively.
        className="absolute inset-0 z-10 h-full w-full cursor-pointer bg-transparent text-transparent caret-transparent outline-none"
        style={{ letterSpacing: '2em' }}
      />

      <div className="pointer-events-none flex justify-center gap-2" dir="ltr" aria-hidden>
        {cells.map((digit, index) => {
          const isActive = focused && index === activeIndex && !disabled;

          return (
            <div
              key={index}
              className={cn(
                'tabular flex h-14 w-11 items-center justify-center rounded-card border text-title-lg transition-all',
                'bg-card text-content-primary',
                digit ? 'border-border-strong' : 'border-border',
                isActive && 'border-violet shadow-glow',
                hasError && 'border-rose',
                disabled && 'opacity-50',
              )}
            >
              {digit ? (
                toPersianDigits(digit)
              ) : isActive ? (
                <span className="h-6 w-px animate-pulse bg-violet" />
              ) : (
                <span className="text-content-muted">·</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
