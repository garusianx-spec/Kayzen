'use client';

import { useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { PasswordField } from '@/components/ui/password-field';
import { useToast } from '@/components/ui/toast';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { ApiClientError, api } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/queries';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/password-policy';
import { toPersianDigits } from '@/lib/date/digits';
import type { SessionUserDto } from '@/types/domain';

/**
 * Set or change the account password.
 *
 * This is the intended path for an account that was created over SMS: sign in
 * with a code once, set a password here, and a gateway outage stops being able
 * to lock that user out.
 *
 * Changing an existing password asks for the current one. Setting the first
 * does not — the session in hand was minted by a code sent to the number, which
 * is the stronger proof of the two.
 */

interface SetPasswordResponse {
  user: SessionUserDto;
  revokedSessions: number;
  accessTokenExpiresAt: string;
}

export function PasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const queryClient = useQueryClient();
  const haptics = useHapticFeedback();
  const { success, error: errorToast } = useToast();

  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [currentError, setCurrentError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);

  const canSave =
    password.length >= PASSWORD_MIN_LENGTH &&
    (!hasPassword || currentPassword.length > 0) &&
    !isSaving;

  const reset = (): void => {
    setCurrentPassword('');
    setPassword('');
    setCurrentError(undefined);
    setPasswordError(undefined);
  };

  const save = async (): Promise<void> => {
    setIsSaving(true);
    setCurrentError(undefined);
    setPasswordError(undefined);

    try {
      const result = await api.post<SetPasswordResponse>('/auth/password', {
        password,
        ...(hasPassword ? { currentPassword } : {}),
      });

      haptics.impact('success');
      queryClient.setQueryData(queryKeys.session, result.user);

      reset();
      setOpen(false);
      success(
        hasPassword ? 'رمز عبور عوض شد' : 'رمز عبور تنظیم شد',
        'حالا می‌توانید بدون پیامک وارد شوید.',
      );
    } catch (caught) {
      haptics.error();

      if (caught instanceof ApiClientError) {
        setCurrentError(caught.fieldError('currentPassword'));
        setPasswordError(caught.fieldError('password') ?? caught.message);
      } else {
        errorToast('ذخیرهٔ رمز ممکن نشد');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="kz-card space-y-3" aria-label="رمز عبور">
      <h2 className="flex items-center gap-2 text-title text-content-primary">
        <KeyRound className="h-5 w-5 text-violet" aria-hidden />
        رمز عبور
      </h2>

      <p className="text-caption text-content-muted">
        {hasPassword
          ? 'برای این حساب رمز عبور تنظیم شده است؛ اگر پیامک نرسید با آن وارد شوید.'
          : 'با تنظیم رمز عبور، اگر پیامک نرسید هم می‌توانید وارد شوید.'}
      </p>

      {open ? (
        <div className="space-y-4">
          {hasPassword ? (
            <PasswordField
              label="رمز فعلی"
              value={currentPassword}
              onChange={(event) => {
                setCurrentPassword(event.target.value);
                setCurrentError(undefined);
              }}
              autoComplete="current-password"
              error={currentError}
            />
          ) : null}

          <PasswordField
            label={hasPassword ? 'رمز تازه' : 'رمز عبور'}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setPasswordError(undefined);
            }}
            autoComplete="new-password"
            error={passwordError}
            hint={`دست‌کم ${toPersianDigits(PASSWORD_MIN_LENGTH)} نویسه؛ طول از پیچیدگی مهم‌تر است.`}
          />

          <div className="flex gap-2">
            <Button className="flex-1" onClick={save} disabled={!canSave} isLoading={isSaving}>
              ذخیره
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              انصراف
            </Button>
          </div>

          <p className="text-caption-sm text-content-muted">
            با ذخیره، ورودهای دیگر از حساب خارج می‌شوند؛ همین دستگاه وارد می‌ماند.
          </p>
        </div>
      ) : (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => {
            haptics.selection();
            setOpen(true);
          }}
        >
          {hasPassword ? 'تغییر رمز عبور' : 'تنظیم رمز عبور'}
        </Button>
      )}
    </section>
  );
}
