import type { Metadata } from 'next';

import { VocabularyScreen } from '@/components/screens/VocabularyScreen';

export const metadata: Metadata = {
  title: 'زبان روزانه',
  description: 'هر روز ده واژهٔ تازه، در سه سطح و پنج زبان.',
};

export const dynamic = 'force-dynamic';

export default function VocabularyPage() {
  return <VocabularyScreen />;
}
