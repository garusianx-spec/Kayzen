'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { useNotifications } from '@/lib/api/queries';
import { toPersianDigits } from '@/lib/date/digits';
import { cn } from '@/lib/utils';

/**
 * The bell, and its count.
 *
 * The badge caps at ۹+ rather than growing. A number wider than two glyphs
 * pushes the bell off its own touch target, and past about nine the exact
 * figure has stopped being information and started being a reproach.
 */
export function NotificationBell() {
  const pathname = usePathname();
  const haptics = useHapticFeedback();
  const reduceMotion = useReducedMotion();
  const notifications = useNotifications('unread');

  const unread = notifications.data?.unread ?? 0;
  const label = unread > 9 ? '۹+' : toPersianDigits(unread);

  return (
    <Link
      href="/notifications"
      onClick={() => haptics.selection()}
      aria-label={unread > 0 ? `اعلان‌ها — ${label} خوانده‌نشده` : 'اعلان‌ها'}
      aria-current={pathname === '/notifications' ? 'page' : undefined}
      className={cn(
        'kz-pressable relative flex h-11 w-11 items-center justify-center rounded-full',
        'border border-border text-muted-foreground hover:text-foreground',
      )}
    >
      <Bell className="h-5 w-5" aria-hidden />

      {unread > 0 ? (
        <motion.span
          aria-hidden
          initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
          animate={reduceMotion ? undefined : { scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 520, damping: 24 }}
          className={cn(
            'tabular absolute -top-0.5 end-0 min-w-[18px] rounded-full bg-primary px-1',
            'text-center text-[10px] leading-[18px] text-primary-foreground',
          )}
        >
          {label}
        </motion.span>
      ) : null}
    </Link>
  );
}
