import type { Metadata } from 'next';

import { CountdownsScreen } from '@/components/screens/CountdownsScreen';

export const metadata: Metadata = { title: 'شمارش معکوس' };

export default function CountdownsPage() {
  return <CountdownsScreen />;
}
