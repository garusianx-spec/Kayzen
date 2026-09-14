import type { Metadata, Viewport } from 'next';

import { AppProviders } from '@/components/providers/AppProviders';
import { clientEnv } from '@/lib/env';
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          // Allow-listed in the CSP by SHA-256; see `src/lib/theme-bootstrap.ts`.
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
        />
      </head>
      <body className="min-h-viewport bg-surface text-content-primary">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
