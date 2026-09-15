import type { Metadata } from 'next';

import { HabitsScreen } from '@/components/screens/HabitsScreen';

export const metadata: Metadata = { title: 'عادت‌ها' };

export default function HabitsPage() {
  return <HabitsScreen />;
}
