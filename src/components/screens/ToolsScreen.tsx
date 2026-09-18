'use client';

import {
  BookOpen,
  CalendarClock,
  CloudSun,
  Flame,
  Languages,
  StickyNote,
  Timer,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';

import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { cn } from '@/lib/utils';

/**
 * مرکز ابزارها — the tools hub.
 *
 * The modules that do not belong on the daily surface, gathered in one place
 * instead of each claiming a tab. Home answers "what now?"; this answers "where
 * is the thing I use occasionally", and those are different questions that a
 * five-item bottom bar cannot hold at once.
 *
 * Only modules that exist are listed. A hub full of greyed-out "soon" cards
 * teaches people to stop reading it.
 */

interface Tool {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  tone: string;
}

const TOOLS: readonly Tool[] = [
  {
    href: '/focus',
    label: 'اتاق تمرکز',
    description: 'پومودورو با صدای محیطی',
    icon: Timer,
    tone: 'bg-violet-soft text-violet',
  },
  {
    href: '/habits',
    label: 'عادت‌ساز',
    description: 'زنجیره‌ها و ماتریس هفتگی',
    icon: Flame,
    tone: 'bg-flame-soft text-flame',
  },
  {
    href: '/tools/vocabulary',
    label: 'زبان روزانه',
    description: 'ده واژه در روز، پنج زبان',
    icon: Languages,
    tone: 'bg-sky-soft text-sky',
  },
  {
    href: '/library',
    label: 'مرکز مطالعه',
    description: 'خلاصهٔ روزانه یا کتاب خودت',
    icon: BookOpen,
    tone: 'bg-emerald-soft text-emerald',
  },
  {
    href: '/tools/weather',
    label: 'هوای شهر',
    description: 'استان و شهر، ساعتی و هفتگی',
    icon: CloudSun,
    tone: 'bg-sky-soft text-sky',
  },
  {
    href: '/countdowns',
    label: 'رویدادها',
    description: 'شمارش معکوس و سالگردها',
    icon: CalendarClock,
    tone: 'bg-sky-soft text-sky',
  },
  {
    href: '/notes',
    label: 'یادداشت‌ها',
    description: 'هرچه نباید فراموش شود',
    icon: StickyNote,
    tone: 'bg-violet-soft text-violet',
  },
  {
    href: '/finance',
    label: 'مدیریت مالی',
    description: 'صندوق‌ها و هدف‌های پس‌انداز',
    icon: Wallet,
    tone: 'bg-emerald-soft text-emerald',
  },
];

export function ToolsScreen() {
  const haptics = useHapticFeedback();

  return (
    <div className="space-y-5 px-4 pt-4">
      <header>
        <h1 className="text-display text-content-primary">ابزارها</h1>
        <p className="mt-1 text-caption text-content-muted">
          هرچه هر روز لازم نیست، ولی وقتی لازم شد باید دم دست باشد.
        </p>
      </header>

      <ul className="grid grid-cols-2 gap-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;

          return (
            <li key={tool.href}>
              <Link
                href={tool.href}
                onClick={() => haptics.selection()}
                className="kz-card flex min-h-[120px] flex-col justify-between gap-3 py-4 active:scale-[0.98]"
              >
                <span
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-card',
                    tool.tone,
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>

                <span>
                  <span className="block text-title text-content-primary">{tool.label}</span>
                  <span className="mt-0.5 block text-caption-sm text-content-muted">
                    {tool.description}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
