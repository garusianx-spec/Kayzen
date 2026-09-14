'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * WebOTP: fill the verification code from the SMS without leaving the app.
 *
 * When the message ends with `@<domain> #<code>` and the domain matches the
 * origin, Chrome — including the Chrome that renders the Trusted Web Activity —
 * offers to hand the code straight to the page. Inside the installed app the
 * user sees no SMS app, no clipboard, no switching: the field simply fills.
 *
 * Preconditions that silently disable it if missed, all handled here or in
 * `src/lib/sms/template.ts`:
 *   - a secure, top-level browsing context (the TWA qualifies),
 *   - the binding line is the last line of the SMS,
 *   - one outstanding `credentials.get()` call at a time, aborted when the
 *     component unmounts or the code is entered by hand.
 *
 * The input still carries `autocomplete="one-time-code"`, which is what lets
 * iOS and older Android fill it from the keyboard suggestion strip — the two
 * mechanisms are complementary, not alternatives.
 */

export interface WebOtpOptions {
  /** Only listen while the verification screen is actually waiting for a code. */
  enabled?: boolean;
  onReceive: (code: string) => void;
  onError?: (error: unknown) => void;
}

export interface WebOtpState {
  supported: boolean;
  listening: boolean;
  /** Cancels the pending request — call it when the user types the code. */
  abort(): void;
}

export function isWebOtpSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'OTPCredential' in window &&
    typeof navigator !== 'undefined' &&
    'credentials' in navigator
  );
}

export function useWebOtp({ enabled = true, onReceive, onError }: WebOtpOptions): WebOtpState {
  const [listening, setListening] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  // Held in refs so a new inline callback on each render does not tear down and
  // restart the SMS listener mid-delivery.
  const onReceiveRef = useRef(onReceive);
  onReceiveRef.current = onReceive;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!enabled || !isWebOtpSupported()) return;

    const controller = new AbortController();
    controllerRef.current = controller;
    setListening(true);

    navigator.credentials
      .get({ otp: { transport: ['sms'] }, signal: controller.signal })
      .then((credential) => {
        const otp = credential as OTPCredential | null;
        if (otp?.code) onReceiveRef.current(otp.code);
      })
      .catch((error: unknown) => {
        // Aborting is the normal teardown path, not a failure.
        if (error instanceof DOMException && error.name === 'AbortError') return;
        onErrorRef.current?.(error);
      })
      .finally(() => setListening(false));

    return () => {
      controller.abort();
      controllerRef.current = null;
      setListening(false);
    };
  }, [enabled]);

  return {
    supported: isWebOtpSupported(),
    listening,
    abort: () => controllerRef.current?.abort(),
  };
}
