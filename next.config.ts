import type { NextConfig } from 'next';

/**
 * Content-Security-Policy.
 *
 * The app renders inside a Trusted Web Activity — a Chrome Custom Tab with the
 * URL bar removed — so it is a first-party origin with no embedding story at
 * all: `frame-ancestors 'none'` is correct and closes clickjacking outright.
 *
 * `'unsafe-inline'` on styles is required by Next.js's runtime style injection.
 * Scripts stay on `'self'`; the inline bootstrap that applies the stored theme
 * before first paint is allow-listed by its own SHA-256 hash instead (see
 * `src/app/layout.tsx` and `THEME_BOOTSTRAP_HASH`).
 */
const THEME_BOOTSTRAP_HASH = "'sha256-TQMTCPYov8Y9/6qiKlHRbwxwnvlfUcGQo149QPsAn7M='";

const CSP_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    THEME_BOOTSTRAP_HASH,
    ...(process.env.NODE_ENV === 'development' ? ["'unsafe-eval'", "'unsafe-inline'"] : []),
  ],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:', 'https:'],
  'font-src': ["'self'", 'data:'],
  'media-src': ["'self'", 'data:', 'blob:'],
  'worker-src': ["'self'"],
  'manifest-src': ["'self'"],
  'connect-src': [
    "'self'",
    'https://*.supabase.co',
    'https://*.upstash.io',
    'https://*.ingest.sentry.io',
  ],
  // A TWA is never framed. Neither is the browser-tab fallback.
  'frame-ancestors': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'object-src': ["'none'"],
  'upgrade-insecure-requests': [],
};

const contentSecurityPolicy = Object.entries(CSP_DIRECTIVES)
  .map(([directive, values]) => (values.length ? `${directive} ${values.join(' ')}` : directive))
  .join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `DOCKER_BUILD=1 next build` emits the self-contained server bundle the
  // Dockerfile copies; Vercel builds stay on the default output.
  ...(process.env.DOCKER_BUILD ? { output: 'standalone' as const } : {}),
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns-jalali', 'framer-motion'],
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**.supabase.co' }],
  },
  async rewrites() {
    return [
      {
        // Digital Asset Links. Chrome fetches this exact path to verify the
        // Trusted Web Activity; the handler builds it from the environment so
        // fingerprints are configuration, not code. A static
        // `public/.well-known/assetlinks.json` — see `npm run
        // assetlinks:generate` — is served ahead of this rewrite when present.
        source: '/.well-known/assetlinks.json',
        destination: '/api/assetlinks',
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            // `otp-credentials` must stay enabled: it is what lets the WebOTP
            // API read the verification SMS inside the Android shell.
            value:
              'camera=(), microphone=(), geolocation=(), interest-cohort=(), otp-credentials=(self)',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
      {
        // Digital Asset Links: Play's verifier fetches this over plain HTTPS
        // with no redirects and expects `application/json`.
        source: '/.well-known/assetlinks.json',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Cache-Control', value: 'public, max-age=300, must-revalidate' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json; charset=utf-8' },
          { key: 'Cache-Control', value: 'public, max-age=3600, must-revalidate' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          // A cached service worker cannot ship its own replacement.
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/fonts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

export default nextConfig;
