import type { Metadata } from 'next';

import { FinanceScreen } from '@/components/screens/FinanceScreen';

export const metadata: Metadata = { title: 'صندوق‌ها' };

export default function FinancePage() {
  return <FinanceScreen />;
}
