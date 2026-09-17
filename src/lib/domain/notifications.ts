import type { NotificationCategory } from '@prisma/client';

/**
 * Notification categories, as the user meets them.
 *
 * Every category is a switch somebody owns. That is the whole design: an app
 * that cannot be told to stop talking about one thing gets told to stop
 * talking entirely, at the operating-system level, and then the reminder that
 * mattered never arrives either.
 *
 * `SYSTEM` is the exception and is deliberately not switchable — it carries
 * "your session expired" and "the backup failed", which are not marketing.
 */

export interface CategoryMeta {
  category: NotificationCategory;
  label: string;
  description: string;
  /** Lucide icon name, resolved by the component. */
  icon: string;
  colorToken: string;
  /** Where an item of this category usually points. */
  defaultLink: string;
  /** False for categories the user may not turn off. */
  togglable: boolean;
}

export const NOTIFICATION_CATEGORIES: readonly CategoryMeta[] = [
  {
    category: 'TASK_REMINDER',
    label: 'یادآور کارها',
    description: 'کمی پیش از موعد هر کار، یک تلنگر کوتاه.',
    icon: 'CheckCircle2',
    colorToken: 'violet',
    defaultLink: '/',
    togglable: true,
  },
  {
    category: 'HABIT_PROMPT',
    label: 'عادت‌های روزانه',
    description: 'اگر تا شب ثبت نشده باشد، یادت می‌اندازیم.',
    icon: 'Flame',
    colorToken: 'flame',
    defaultLink: '/habits',
    togglable: true,
  },
  {
    category: 'VOCABULARY',
    label: 'واژه‌های روز',
    description: 'ده واژهٔ تازه، هر روز صبح.',
    icon: 'Languages',
    colorToken: 'sky',
    defaultLink: '/tools/vocabulary',
    togglable: true,
  },
  {
    category: 'READING',
    label: 'مطالعهٔ روزانه',
    description: 'خلاصهٔ امروز کتابخانهٔ ۳۶۵.',
    icon: 'BookOpen',
    colorToken: 'emerald',
    defaultLink: '/library',
    togglable: true,
  },
  {
    category: 'FINANCIAL_MILESTONE',
    label: 'قدم‌های مالی',
    description: 'وقتی به یک پله از هدف پس‌اندازت می‌رسی.',
    icon: 'Wallet',
    colorToken: 'emerald',
    defaultLink: '/finance',
    togglable: true,
  },
  {
    category: 'SYSTEM',
    label: 'پیام‌های سامانه',
    description: 'ورود، پشتیبان‌گیری و چیزهایی که نباید از دستشان داد.',
    icon: 'Bell',
    colorToken: 'violet',
    defaultLink: '/settings',
    togglable: false,
  },
] as const;

const BY_CATEGORY = new Map(NOTIFICATION_CATEGORIES.map((meta) => [meta.category, meta]));

export function categoryMeta(category: NotificationCategory): CategoryMeta {
  const meta = BY_CATEGORY.get(category);
  if (!meta) throw new Error(`unknown notification category ${category}`);
  return meta;
}

/**
 * Whether this category may be delivered.
 *
 * Absence of a preference row means "the default", which is on. That keeps a
 * new account from needing six inserts before it can be told anything, and it
 * means adding a category later does not leave every existing user silently
 * opted out of it.
 */
export function isEnabled(
  category: NotificationCategory,
  preferences: ReadonlyMap<NotificationCategory, boolean>,
): boolean {
  if (!categoryMeta(category).togglable) return true;
  return preferences.get(category) ?? true;
}

/**
 * Where tapping a notification should land.
 *
 * A path, never a record id resolved at tap time: the history outlives the
 * thing it points at, and a 404 inside the app is a better outcome than a tap
 * that does nothing at all.
 */
export function resolveDeepLink(category: NotificationCategory, deepLink: string | null): string {
  if (!deepLink) return categoryMeta(category).defaultLink;

  // Anything absolute is not ours. A notification row is written by the server
  // today, but this is the one place a stored string becomes navigation, and
  // that is worth closing now rather than after someone finds it.
  if (!deepLink.startsWith('/') || deepLink.startsWith('//')) {
    return categoryMeta(category).defaultLink;
  }

  return deepLink;
}
