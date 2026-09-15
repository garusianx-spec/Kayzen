import { redirect } from 'next/navigation';

import { AppShell } from '@/components/layout/AppShell';
import { getSession } from '@/lib/auth/session';

/**
 * Authenticated shell.
 *
 * The guard runs on the server, so an unauthenticated request never receives
 * the app's markup at all — no flash of a skeleton that then redirects.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  return <AppShell>{children}</AppShell>;
}
