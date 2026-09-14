import type { Metadata } from 'next';

import { NotesScreen } from '@/components/screens/NotesScreen';

export const metadata: Metadata = { title: 'یادداشت‌ها' };

export default function NotesPage() {
  return <NotesScreen />;
}
