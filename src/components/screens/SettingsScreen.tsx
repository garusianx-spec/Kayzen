'use client';

import { Bell, LogOut, Moon, Smartphone, Sun, Vibrate } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { GoogleCalendarCard } from '@/components/settings/GoogleCalendarCard';
import { PasswordCard } from '@/components/settings/PasswordCard';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { api } from '@/lib/api/client';
import { useSession, useSignOut } from '@/lib/api/queries';
import { toPersianDigits } from '@/lib/date/digits';
import { cn } from '@/lib/utils';
import { usePreferencesStore, type ThemeSetting } from '@/stores/preferences-store';

/**
 * Settings.
 *
 * Theme and haptics apply locally the instant they are toggled and are then
 * persisted to the account in the background: a setting that waits for a round
 * trip before it takes effect feels broken on a slow connection, and these two
 * are cheap to reconcile if the write fails.
 */

const THEMES: Array<{ value: ThemeSetting; label: string; icon: typeof Sun }> = [
  { value: 'dark', label: 'تیره', icon: Moon },
  { value: 'light', label: 'روشن', icon: Sun },
  { value: 'system', label: 'سیستم', icon: Smartphone },
];

export function SettingsScreen() {
  const router = useRouter();
  const { data: user } = useSession();
  const signOut = useSignOut();
  const haptics = useHapticFeedback();
  const push = usePushNotifications();
  const { success, error } = useToast();

  const theme = usePreferencesStore((state) => state.theme);
  const setTheme = usePreferencesStore((state) => state.setTheme);
  const hapticsEnabled = usePreferencesStore((state) => state.hapticsEnabled);
  const setHapticsEnabled = usePreferencesStore((state) => state.setHapticsEnabled);

  const persist = (body: Record<string, unknown>): void => {
    void api.patch('/preferences', body).catch(() => error('ذخیرهٔ تنظیمات ممکن نشد'));
  };

  return (
    <div className="space-y-6 px-4 pt-4">
      <header className="space-y-1">
        <h1 className="text-display text-content-primary">تنظیمات</h1>
        {user ? (
          <p className="tabular text-caption text-content-muted" dir="ltr">
            {user.phoneMasked}
          </p>
        ) : null}
      </header>

      {user ? (
        <section className="kz-card" aria-label="حساب">
          <p className="text-caption text-content-muted">سطح شما</p>
          <p className="mt-1 text-title-lg text-content-primary">
            {user.levelTitle} · سطح {toPersianDigits(user.level)}
          </p>
          <p className="tabular mt-1 text-caption text-violet">
            {toPersianDigits(user.points)} امتیاز
          </p>
        </section>
      ) : null}

      <section className="kz-card space-y-3" aria-label="ظاهر">
        <h2 className="text-title text-content-primary">ظاهر</h2>

        <div className="grid grid-cols-3 gap-2">
          {THEMES.map((option) => {
            const Icon = option.icon;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  haptics.selection();
                  setTheme(option.value);
                  persist({ theme: option.value.toUpperCase() });
                }}
                className={cn(
                  'kz-pressable flex flex-col items-center gap-1 rounded-card border p-3 text-caption',
                  theme === option.value
                    ? 'border-violet bg-violet-soft text-violet'
                    : 'border-border text-content-muted',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {option.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="kz-card" aria-label="بازخورد لمسی">
        <Toggle
          id="haptics"
          checked={hapticsEnabled}
          onCheckedChange={(next) => {
            setHapticsEnabled(next);
            persist({ hapticsEnabled: next });
            if (next) haptics.impact('success');
          }}
          label="بازخورد لمسی"
          description={
            haptics.supported
              ? 'لرزش کوتاه هنگام تکمیل کار و ثبت عادت.'
              : 'این دستگاه از لرزش پشتیبانی نمی‌کند.'
          }
        />
        <p className="mt-2 flex items-center gap-2 text-caption-sm text-content-muted">
          <Vibrate className="h-4 w-4" aria-hidden />
          در نسخهٔ نصب‌شدهٔ اندروید، لرزش مانند یک برنامهٔ بومی عمل می‌کند.
        </p>
      </section>

      {user ? <PasswordCard hasPassword={user.hasPassword} /> : null}

      <GoogleCalendarCard timezone={user?.timezone} />

      <section className="kz-card space-y-3" aria-label="یادآورها">
        <h2 className="flex items-center gap-2 text-title text-content-primary">
          <Bell className="h-5 w-5 text-flame" aria-hidden />
          یادآور روزانه
        </h2>

        {push.permission === 'unsupported' ? (
          <p className="text-caption text-content-muted">
            این مرورگر از اعلان‌ها پشتیبانی نمی‌کند.
          </p>
        ) : push.permission === 'denied' ? (
          <p className="text-caption text-content-muted">
            اعلان‌ها در تنظیمات دستگاه مسدود شده‌اند.
          </p>
        ) : (
          <Button
            variant={push.isSubscribed ? 'outline' : 'secondary'}
            className="w-full"
            isLoading={push.isBusy}
            onClick={async () => {
              if (push.isSubscribed) {
                await push.unsubscribe();
                success('یادآور خاموش شد');
                return;
              }

              const enabled = await push.subscribe();
              if (enabled) success('یادآور روشن شد', 'هر روز صبح یادتان می‌اندازیم.');
              else error('اجازهٔ اعلان داده نشد');
            }}
          >
            {push.isSubscribed ? 'خاموش کردن یادآور' : 'روشن کردن یادآور'}
          </Button>
        )}
      </section>

      <Button
        variant="danger"
        size="block"
        isLoading={signOut.isPending}
        onClick={async () => {
          haptics.impact('heavy');
          await signOut.mutateAsync();
          router.replace('/login');
        }}
      >
        <LogOut className="h-5 w-5" aria-hidden />
        خروج از حساب
      </Button>
    </div>
  );
}
