import type { Metadata } from 'next';

import { NotificationCenter } from '@/components/notifications/NotificationCenter';

export const metadata: Metadata = {
  title: 'اعلان‌ها',
  description: 'تاریخچهٔ اعلان‌ها و تنظیم دسته‌ها.',
};

export const dynamic = 'force-dynamic';

export default function NotificationsPage() {
  return <NotificationCenter />;
}
