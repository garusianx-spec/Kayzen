import type { Metadata } from 'next';

import { ToolsScreen } from '@/components/screens/ToolsScreen';

export const metadata: Metadata = {
  title: 'ابزارها',
  description: 'اتاق تمرکز، عادت‌ساز، زبان روزانه، کتابخانه و بقیهٔ ابزارهای کایزن.',
};

export const dynamic = 'force-dynamic';

export default function ToolsPage() {
  return <ToolsScreen />;
}
