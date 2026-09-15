import type { Metadata } from 'next';

import { FocusScreen } from '@/components/screens/FocusScreen';

export const metadata: Metadata = { title: 'تمرکز' };

export default function FocusPage() {
  return <FocusScreen />;
}
