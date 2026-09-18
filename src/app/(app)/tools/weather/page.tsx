import type { Metadata } from 'next';

import { WeatherScreen } from '@/components/screens/WeatherScreen';

export const metadata: Metadata = {
  title: 'هوای شهر',
  description: 'پیش‌بینی ساعتی و هفتگی برای شهرهای ۳۱ استان ایران.',
};

export const dynamic = 'force-dynamic';

export default function WeatherPage() {
  return <WeatherScreen />;
}
