import type { Metadata } from 'next';

import { TodayScreen } from '@/components/screens/TodayScreen';

export const metadata: Metadata = {
  title: 'امروز',
};

export default function TodayPage() {
  return <TodayScreen />;
}
