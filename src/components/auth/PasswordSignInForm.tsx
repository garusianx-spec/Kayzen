'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, KeyRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { FieldError, FieldLabel, Input } from '@/components/ui/input';
import { PasswordField } from '@/components/ui/password-field';
import { useToast } from '@/components/ui/toast';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { ApiClientError, api } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/password-policy';
import { toPersianDigits } from '@/lib/date/digits';
import { phoneSchema } from '@/lib/validation/schemas';
import type { SessionUserDto } from '@/types/domain';

/**
 * Phone + password sign-in.
 *
 * The alternative to the SMS code, for the case the code never arrives —
 * a gateway outage, an exhausted balance, a carrier filtering pattern messages.
 * Everything the server decides about this form (whether the number is known,
 * whether it has a password at all) comes back as one message, so the form does
 * not accidentally become a way to ask which numbers are registered.
 *
 * One field of nuance: a number with no account is *registered* here rather
 * than refused, because refusing would mean an SMS outage locks new users out
 * entirely. The account is created with its phone unverified; the first time a
 * code is confirmed, the OTP route promotes it.
 */

interface PasswordLoginResponse {
  user: SessionUserDto;
  isNewUser: boolean;
  accessTokenExpiresAt: string;
}

export function PasswordSignInForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const haptics = useHapticFeedback();
  const { success, error: errorToast } = useToast();

  const [phoneInput, setPhoneInput] = useState('');
  const [password, setPassword] = useState('');
  const [phoneError, setPhoneError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [hint, setHint] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalized = phoneSchema.safeParse(phoneInput);
  const canSubmit = normalized.success && password.length > 0 && !isSubmitting;

  const submit = async (): Promise<void> => {
    if (!normalized.success) {
      setPhoneError('شمارهٔ موبایل را درست وارد کنید.');
      haptics.error();
      return;
    }

    setIsSubmitting(true);
    setPhoneError(undefined);
    setPasswordError(undefined);
    setHint(undefined);

    try {
      const result = await api.post<PasswordLoginResponse>('/auth/password/login', {
        phone: normalized.data,
        password,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      haptics.impact('success');
      queryClient.setQueryData(queryKeys.session, result.user);

      success(result.isNewUser ? 'خوش آمدید 🌱' : 'خوش برگشتید');
      router.replace('/');
    } catch (caught) {
      haptics.error();
      setPassword('');

      if (caught instanceof ApiClientError) {
        setPasswordError(caught.message);
        // Attached to every rejection by the route, so it says nothing about
        // this particular number — but it is the sentence someone who signed up
        // over SMS and never set a password needs to read.
        setHint(caught.fieldError('hint'));
      } else {
        errorToast('ورود ممکن نشد');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="space-y-6">
      <header className="space-y-2 text-center">
        <h1 className="text-title-lg text-content-primary">ورود با رمز عبور</h1>
        <p className="text-body text-content-muted">
          اگر پیامک نرسید، با شماره و رمز عبور وارد شوید.
        </p>
      </header>

      <div>
        <FieldLabel htmlFor="password-phone">شمارهٔ موبایل</FieldLabel>
        <Input
          id="password-phone"
          value={phoneInput}
          onChange={(event) => {
            setPhoneInput(event.target.value);
            setPhoneError(undefined);
          }}
          type="tel"
          inputMode="numeric"
          autoComplete="username tel"
          enterKeyHint="next"
          dir="ltr"
          className="tabular text-center"
          placeholder="۰۹۱۲۳۴۵۶۷۸۹"
          hasError={Boolean(phoneError)}
          autoFocus
        />
        <FieldError message={phoneError} />
      </div>

      <PasswordField
        id="password-secret"
        label="رمز عبور"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
          setPasswordError(undefined);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && canSubmit) void submit();
        }}
        // `current-password` lets a password manager offer the saved one; on a
        // brand-new number this is also the sign-up field, and browsers handle
        // that gracefully where a `new-password` hint would suppress the offer.
        autoComplete="current-password"
        enterKeyHint="go"
        error={passwordError}
        hint={`دست‌کم ${toPersianDigits(PASSWORD_MIN_LENGTH)} نویسه`}
      />

      {hint ? (
        <p className="flex items-start gap-2 rounded-card bg-violet-soft p-3 text-caption text-content-secondary">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-violet" aria-hidden />
          {hint}
        </p>
      ) : null}

      <Button size="block" onClick={submit} disabled={!canSubmit} isLoading={isSubmitting}>
        ورود
        <ArrowRight className="h-5 w-5 rotate-180" aria-hidden />
      </Button>

      <p className="text-center text-caption-sm text-content-muted">
        شماره‌ای که تا حالا وارد نشده باشد، با همین رمز ثبت می‌شود.
      </p>
    </section>
  );
}
