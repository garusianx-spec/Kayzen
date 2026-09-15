import { redirect } from 'next/navigation';

import { getSession } from '@/lib/auth/session';

/**
 * Authentication shell.
 *
 * Signed-in users never see these screens: hitting `/login` with a live session
 * bounces straight to the app, which is what makes the home-screen icon open
 * the planner rather than a sign-in form.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (session) redirect('/');

  return (
    <div className="flex min-h-viewport flex-col justify-center px-6 pb-safe-bottom pt-safe-top">
      <div className="mx-auto w-full max-w-sm py-10">{children}</div>
    </div>
  );
}
