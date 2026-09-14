import type { Metadata } from 'next';

import { SignInFlow } from '@/components/auth/SignInFlow';

export const metadata: Metadata = {
  title: 'ورود',
  description: 'ورود به کایزن با شمارهٔ موبایل و کد پیامکی.',
};

/**
 * Dynamic because the layout above reads the session cookie; a statically
 * rendered sign-in page would serve a cached "please sign in" to somebody who
 * already is.
 */
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return <SignInFlow />;
}
