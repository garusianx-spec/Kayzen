import type { NextConfig } from 'next';

/**
 * Static security headers.
 *
 * The Content-Security-Policy is deliberately *not* here: it needs a fresh
 * nonce per response so that Next.js can stamp its inline hydration scripts,
 * which only middleware can produce. See `src/middleware.ts`.
 */
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
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

export default nextConfig;
