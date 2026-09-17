import type { Metadata } from 'next';

import { VocabularyVaultScreen } from '@/components/screens/VocabularyVaultScreen';

export const metadata: Metadata = { title: 'گنجینهٔ واژه‌ها' };

export const dynamic = 'force-dynamic';

export default function VocabularyVaultPage() {
  return <VocabularyVaultScreen />;
}
