import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';

import { AppProviders } from '@/components/providers/AppProviders';
import { clientEnv } from '@/lib/env';
import { yekanBakh } from '@/lib/fonts';
import { THEME_BOOTSTRAP_SCRIPT } from '@/lib/theme-bootstrap';

import './globals.css';

/**
 * Root layout.
 *
 * Three things here exist specifically for the Android shell:
 *
 *  - `dir="rtl"` / `lang="fa"` on `<html>`, so the whole tree — including Radix
 *    portals, which mount outside the React root — inherits the right direction;
 *  - `viewportFit: 'cover'` plus the `env(safe-area-inset-*)` padding in the
 *    components, because the TWA draws edge to edge under the system bars;
 *  - the inline theme bootstrap, which paints the correct palette before the
 *    first frame instead of flashing white on every cold launch.
 */

export const metadata: Metadata = {
  metadataBase: new URL(clientEnv.appUrl),
  title: {
    default: 'کایزن — برنامه‌ریز روزانه',
    template: '%s | کایزن',
  },
  description:
    'کایزن؛ برنامه‌ریز شخصی آفلاین با تقویم جلالی، عادت‌های روزانه، اتاق تمرکز، صندوق پس‌انداز و کتابخانهٔ ۳۶۵ روزه.',
  applicationName: 'Kayzen',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'کایزن',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    // Persian dates and amounts are full of digit runs; left alone, Safari and
    // some Android WebViews turn them into phone-number links.
    telephone: false,
    date: false,
    address: false,
    email: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    locale: 'fa_IR',
    siteName: 'کایزن',
    title: 'کایزن — یک درصد بهتر از دیروز',
    description: 'برنامه‌ریز روزانهٔ فارسی با تقویم جلالی، عادت‌ها، تمرکز و پس‌انداز.',
  },
  robots: {
    // The app itself is behind a session; only the marketing surface is public.
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Pinch-zoom inside a standalone shell fights the fixed navigation bar.
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0B0B14' },
    { media: '(prefers-color-scheme: light)', color: '#F8F7FC' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Set by `src/middleware.ts`; the same nonce is on the response CSP, so this
  // is the one inline script the policy admits.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html
      lang="fa"
      dir="rtl"
      data-theme="dark"
      // `yekanBakh.variable` defines --font-yekan-bakh, which the Tailwind
      // `fontFamily` stack reads; next/font also injects the preload link.
      className={yekanBakh.variable}
      suppressHydrationWarning
    >
      <head>
        {/* `suppressHydrationWarning` because the mismatch is guaranteed and
            benign: browsers blank the `nonce` content attribute once the
            document is parsed, so React sees `nonce=""` on the client against
            the real value it server-rendered. Without this, every page logs a
            hydration error and the dev overlay shows a permanent error badge —
            which, on this app, sits over the sign-in screen. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
        />
      </head>
      <body className="min-h-viewport bg-background text-foreground">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
