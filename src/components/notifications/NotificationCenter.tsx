'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Bell,
  BookOpen,
  CheckCheck,
  CheckCircle2,
  Flame,
  Languages,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Toggle } from '@/components/ui/switch';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import {
  useMarkNotificationsRead,
  useNotificationPreferences,
  useNotifications,
  useSetNotificationPreference,
} from '@/lib/api/queries';
import { toPersianDigits } from '@/lib/date/digits';
import { formatRelativeJalali } from '@/lib/date/jalali';
import { cn } from '@/lib/utils';

/**
 * مرکز اعلان‌ها — the notification centre.
 *
 * Two halves that belong together and are usually built apart: the switches
 * that decide what arrives, and the log of what already did. Separating them
 * means the person who wants one fewer interruption has to go looking for
 * where to say so, and the most reliable place they find is the operating
 * system's own "turn off notifications for this app".
 *
 * Every row is a link. A notification that cannot be tapped back to the thing
 * it was about is a nag, not a reminder — and the path is resolved server-side
 * through `resolveDeepLink`, which falls back to the category's home rather
 * than leaving a dead tap when the underlying record is gone.
 */

const ICONS: Record<string, LucideIcon> = {
  CheckCircle2,
  Flame,
  Languages,
  BookOpen,
  Wallet,
  Bell,
};

const TONES: Record<string, string> = {
  violet: 'bg-violet-soft text-violet',
  flame: 'bg-flame-soft text-flame',
  emerald: 'bg-emerald-soft text-emerald',
  sky: 'bg-sky-soft text-sky',
  rose: 'bg-rose-soft text-rose',
};

type Tab = 'history' | 'settings';

export function NotificationCenter() {
  const [tab, setTab] = useState<Tab>('history');
  const [onlyUnread, setOnlyUnread] = useState(false);

  const notifications = useNotifications(onlyUnread ? 'unread' : 'all');
  const preferences = useNotificationPreferences();
  const setPreference = useSetNotificationPreference();
  const markRead = useMarkNotificationsRead();
  const haptics = useHapticFeedback();
  const reduceMotion = useReducedMotion();

  const unread = notifications.data?.unread ?? 0;
  const rows = notifications.data?.notifications ?? [];

  return (
    <div className="space-y-5 px-4 pt-4">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-display text-content-primary">اعلان‌ها</h1>
            <p className="mt-1 text-caption text-content-muted">
              {unread > 0
                ? `${toPersianDigits(unread)} پیام خوانده‌نشده`
                : 'همه‌چیز خوانده شده — دستت درد نکنه.'}
            </p>
          </div>

          {unread > 0 ? (
            <button
              type="button"
              onClick={() => {
                haptics.impact('light');
                void markRead.mutateAsync(undefined);
              }}
              className="flex min-h-[44px] items-center gap-1.5 rounded-pill border border-border px-4 text-caption text-content-secondary active:scale-95"
            >
              <CheckCheck className="h-4 w-4 text-emerald" aria-hidden />
              همه را خواندم
            </button>
          ) : null}
        </div>

        <div role="tablist" aria-label="بخش‌های اعلان" className="grid grid-cols-2 gap-2">
          {(
            [
              { value: 'history', label: 'تاریخچه' },
              { value: 'settings', label: 'تنظیم دسته‌ها' },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={tab === option.value}
              onClick={() => {
                haptics.selection();
                setTab(option.value);
              }}
              className={cn(
                'min-h-[44px] rounded-card border text-caption transition-colors',
                tab === option.value
                  ? 'border-violet bg-violet-soft text-violet'
                  : 'border-border text-content-muted',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {tab === 'history' ? (
        <section className="space-y-3" aria-label="تاریخچهٔ اعلان‌ها">
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setOnlyUnread((previous) => !previous);
            }}
            aria-pressed={onlyUnread}
            className={cn(
              'min-h-[40px] rounded-pill border px-4 text-caption-sm',
              onlyUnread
                ? 'border-violet bg-violet-soft text-violet'
                : 'border-border text-content-muted',
            )}
          >
            فقط خوانده‌نشده‌ها
          </button>

          {rows.length === 0 ? (
            <p className="kz-card py-10 text-center text-caption text-content-muted">
              {onlyUnread
                ? 'چیز خوانده‌نشده‌ای نمانده.'
                : 'هنوز خبری نیست؛ اولین یادآور که برسد، همین‌جا می‌ماند.'}
            </p>
          ) : (
            <AnimatePresence initial={false}>
              {rows.map((notification) => {
                const Icon = ICONS[notification.icon] ?? Bell;

                return (
                  <motion.div
                    key={notification.id}
                    layout={!reduceMotion}
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  >
                    <Link
                      href={notification.href}
                      onClick={() => {
                        haptics.selection();
                        if (!notification.read) void markRead.mutateAsync([notification.id]);
                      }}
                      className={cn(
                        'kz-card flex items-start gap-3 py-3 active:scale-[0.99]',
                        notification.read ? 'opacity-70' : undefined,
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-card',
                          TONES[notification.colorToken] ?? TONES.violet,
                        )}
                      >
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-body text-content-primary">
                            {notification.title}
                          </span>
                          {notification.read ? null : (
                            <span
                              className="h-2 w-2 shrink-0 rounded-full bg-violet"
                              aria-label="خوانده‌نشده"
                            />
                          )}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-caption text-content-muted">
                          {notification.body}
                        </span>
                        <span className="mt-1 block text-caption-sm text-content-muted">
                          {notification.categoryLabel} ·{' '}
                          {formatRelativeJalali(new Date(notification.createdAt))}
                        </span>
                      </span>
                    </Link>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </section>
      ) : (
        <section className="space-y-3" aria-label="دسته‌های اعلان">
          {(preferences.data ?? []).map((preference) => {
            const Icon = ICONS[preference.icon] ?? Bell;

            return (
              <div key={preference.category} className="kz-card flex items-start gap-3 py-3">
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-card',
                    TONES[preference.colorToken] ?? TONES.violet,
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>

                <div className="min-w-0 flex-1">
                  <Toggle
                    id={`notify-${preference.category}`}
                    checked={preference.enabled}
                    disabled={!preference.togglable}
                    onCheckedChange={(next) => {
                      haptics.selection();
                      void setPreference.mutateAsync({
                        category: preference.category,
                        enabled: next,
                      });
                    }}
                    label={preference.label}
                    description={
                      preference.togglable
                        ? preference.description
                        : `${preference.description} (همیشه روشن)`
                    }
                  />
                </div>
              </div>
            );
          })}

          <p className="px-1 text-caption-sm text-content-muted">
            خاموش‌کردن یک دسته فقط جلوی اعلانش را می‌گیرد؛ خودِ یادآورها سر جایشان می‌مانند.
          </p>
        </section>
      )}
    </div>
  );
}
