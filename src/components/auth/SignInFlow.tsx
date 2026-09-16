'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, KeyRound, MessageSquareDot, ShieldCheck, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { OtpInput } from './OtpInput';
import { PasswordSignInForm } from './PasswordSignInForm';
import { Button } from '@/components/ui/button';
import { FieldError, FieldLabel, Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useCountdown } from '@/hooks/use-countdown';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { useWebOtp } from '@/hooks/use-web-otp';
import { ApiClientError, api } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { formatPhoneForDisplay } from '@/lib/auth/phone';
import { toPersianDigits } from '@/lib/date/digits';
import { cn } from '@/lib/utils';
import { phoneSchema } from '@/lib/validation/schemas';
import type { SessionUserDto } from '@/types/domain';

/**
 * Phone + SMS one-time-password sign-in.
 *
 * Two steps in one route rather than two routes: the challenge id, the resend
 * deadline and the masked number all have to survive the transition, and a
 * navigation would either drop them or push them through the URL, where a
 * challenge id does not belong.
 *
 * The verification step leans on three separate fill paths so that the user
 * almost never types the code: WebOTP (`useWebOtp`) inside the Android shell,
 * the keyboard's own `one-time-code` suggestion, and paste. Typing is the
 * fallback, not the plan.
 *
 * A password tab sits beside it. SMS delivery in Iran is not something this app
 * controls, and "the code never arrived" is otherwise a dead end. The switcher
 * lives here rather than a level up because it must disappear once a code is in
 * flight: changing method mid-challenge would silently abandon it.
 */

interface SendResponse {
  challengeId: string;
  expiresAt: string;
  resendAfterSeconds: number;
  codeLength: number;
  phoneMasked: string;
  otpDomain: string;
}

interface VerifyResponse {
  user: SessionUserDto;
  isNewUser: boolean;
  accessTokenExpiresAt: string;
  passwordCleared: boolean;
}

type Step = 'phone' | 'code';
type Method = 'otp' | 'password';

const METHODS: Array<{ value: Method; label: string; icon: typeof Smartphone }> = [
  { value: 'otp', label: 'ورود با پیامک', icon: Smartphone },
  { value: 'password', label: 'ورود با رمز عبور', icon: KeyRound },
];

function MethodTabs({ value, onChange }: { value: Method; onChange: (next: Method) => void }) {
  return (
    <div role="tablist" aria-label="روش ورود" className="grid grid-cols-2 gap-2">
      {METHODS.map((method) => {
        const Icon = method.icon;
        const active = method.value === value;

        return (
          <button
            key={method.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(method.value)}
            className={cn(
              'kz-pressable flex items-center justify-center gap-2 rounded-card border p-3 text-caption',
              active
                ? 'border-violet bg-violet-soft text-violet'
                : 'border-border text-content-muted',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {method.label}
          </button>
        );
      })}
    </div>
  );
}

export function SignInFlow() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const haptics = useHapticFeedback();
  const { success, error: errorToast } = useToast();

  const [method, setMethod] = useState<Method>('otp');
  const [step, setStep] = useState<Step>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [challenge, setChallenge] = useState<SendResponse | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const resendTimer = useCountdown(0, { autoStart: false });

  const normalized = phoneSchema.safeParse(phoneInput);
  const canSend = normalized.success && !isSending;

  const sendCode = async (): Promise<void> => {
    if (!normalized.success) {
      setError('شمارهٔ موبایل را درست وارد کنید.');
      haptics.error();
      return;
    }

    setIsSending(true);
    setError(undefined);

    try {
      const result = await api.post<SendResponse>('/auth/otp/send', {
        phone: normalized.data,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      setChallenge(result);
      setCode('');
      setAttemptsRemaining(null);
      setStep('code');
      resendTimer.restart(result.resendAfterSeconds);
      haptics.impact('medium');
      success('کد فرستاده شد', `به ${result.phoneMasked}`);
    } catch (caught) {
      haptics.error();

      if (caught instanceof ApiClientError) {
        setError(caught.message);
        if (caught.retryAfterSeconds) resendTimer.restart(caught.retryAfterSeconds);
      } else {
        setError('ارسال کد ممکن نشد؛ دوباره تلاش کنید.');
      }
    } finally {
      setIsSending(false);
    }
  };

  const verifyCode = useCallback(
    async (submitted: string): Promise<void> => {
      if (!challenge || !normalized.success || isVerifying) return;

      setIsVerifying(true);
      setError(undefined);

      try {
        const result = await api.post<VerifyResponse>('/auth/otp/verify', {
          phone: normalized.data,
          code: submitted,
          challengeId: challenge.challengeId,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });

        haptics.impact('success');
        queryClient.setQueryData(queryKeys.session, result.user);

        if (result.passwordCleared) {
          // Rare, and worth a sentence rather than a silent surprise the next
          // time they try the password tab.
          success('خوش برگشتید', 'رمز عبور قبلی این شماره پاک شد؛ از تنظیمات رمز تازه بگذارید.');
        } else {
          success(result.isNewUser ? 'خوش آمدید 🌱' : 'خوش برگشتید');
        }

        router.replace('/');
      } catch (caught) {
        haptics.error();
        setCode('');

        if (caught instanceof ApiClientError) {
          setError(caught.message);

          const remaining = caught.fieldError('attemptsRemaining');
          setAttemptsRemaining(remaining === undefined ? null : Number(remaining));

          if (caught.retryAfterSeconds) resendTimer.restart(caught.retryAfterSeconds);
        } else {
          errorToast('تأیید کد ممکن نشد');
        }
      } finally {
        setIsVerifying(false);
      }
    },
    [
      challenge,
      normalized,
      isVerifying,
      haptics,
      queryClient,
      success,
      router,
      errorToast,
      resendTimer,
    ],
  );

  // WebOTP: when Chrome parses the `@domain #code` line, the code arrives here
  // and the form submits itself — the user never leaves the app.
  const webOtp = useWebOtp({
    enabled: step === 'code',
    onReceive: (received) => {
      setCode(received);
      void verifyCode(received);
    },
  });

  if (method === 'password') {
    return (
      <div className="space-y-6">
        <MethodTabs value={method} onChange={setMethod} />
        <PasswordSignInForm />
      </div>
    );
  }

  if (step === 'phone') {
    return (
      <div className="space-y-6">
        <MethodTabs value={method} onChange={setMethod} />

        <section className="space-y-6">
          <header className="space-y-2 text-center">
            <h1 className="text-display text-content-primary">کایزن</h1>
            <p className="text-body text-content-muted">
              با شمارهٔ موبایل وارد شوید؛ رمزی در کار نیست.
            </p>
          </header>

          <div>
            <FieldLabel htmlFor="phone">شمارهٔ موبایل</FieldLabel>
            <Input
              id="phone"
              value={phoneInput}
              onChange={(event) => {
                setPhoneInput(event.target.value);
                setError(undefined);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canSend) void sendCode();
              }}
              // `tel` gives the keyboard's own number autofill; the field itself
              // accepts Persian digits and normalises them.
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              enterKeyHint="send"
              dir="ltr"
              className="tabular text-center"
              placeholder="۰۹۱۲۳۴۵۶۷۸۹"
              hasError={Boolean(error)}
              autoFocus
            />
            <FieldError message={error} />
          </div>

          <Button size="block" onClick={sendCode} disabled={!canSend} isLoading={isSending}>
            ارسال کد تأیید
            <ArrowRight className="h-5 w-5 rotate-180" aria-hidden />
          </Button>

          <p className="flex items-start gap-2 text-caption-sm text-content-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald" aria-hidden />
            شماره فقط برای ورود استفاده می‌شود و در اختیار کسی قرار نمی‌گیرد.
          </p>
        </section>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <header className="space-y-2 text-center">
        <h1 className="text-title-lg text-content-primary">کد تأیید را وارد کنید</h1>
        <p className="text-body text-content-muted">
          کد {toPersianDigits(challenge?.codeLength ?? 6)} رقمی به{' '}
          <span dir="ltr" className="tabular">
            {formatPhoneForDisplay(normalized.success ? normalized.data : '')}
          </span>{' '}
          فرستاده شد.
        </p>
      </header>

      <OtpInput
        value={code}
        onChange={(next) => {
          setCode(next);
          setError(undefined);
        }}
        length={challenge?.codeLength ?? 6}
        disabled={isVerifying}
        hasError={Boolean(error)}
        onComplete={(complete) => void verifyCode(complete)}
      />

      {error ? (
        <p role="alert" className="text-center text-caption text-rose">
          {error}
          {attemptsRemaining !== null && attemptsRemaining > 0
            ? ` (${toPersianDigits(attemptsRemaining)} تلاش باقی مانده)`
            : ''}
        </p>
      ) : webOtp.listening ? (
        <p className="flex items-center justify-center gap-2 text-caption text-content-muted">
          <MessageSquareDot className="h-4 w-4 animate-pulse text-violet" aria-hidden />
          منتظر پیامک… کد به‌صورت خودکار وارد می‌شود.
        </p>
      ) : null}

      <Button
        size="block"
        onClick={() => void verifyCode(code)}
        disabled={code.length !== (challenge?.codeLength ?? 6) || isVerifying}
        isLoading={isVerifying}
      >
        ورود
      </Button>

      <div className="flex items-center justify-between text-caption">
        <button
          type="button"
          onClick={() => {
            webOtp.abort();
            setStep('phone');
            setCode('');
            setError(undefined);
          }}
          className="text-content-muted underline-offset-4 hover:underline"
        >
          تغییر شماره
        </button>

        {resendTimer.isRunning ? (
          <span className="tabular text-content-muted">
            ارسال دوباره تا {toPersianDigits(resendTimer.secondsRemaining)} ثانیه
          </span>
        ) : (
          <button
            type="button"
            onClick={sendCode}
            disabled={isSending}
            className="text-violet underline-offset-4 hover:underline"
          >
            ارسال دوبارهٔ کد
          </button>
        )}
      </div>
    </section>
  );
}
