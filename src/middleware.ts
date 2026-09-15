import { NextResponse, type NextRequest } from 'next/server';

/**
 * Per-request Content-Security-Policy, built around a nonce.
 *
 * This has to be middleware rather than a static header in `next.config.ts`,
 * and the reason is a sharp edge in the CSP spec: **when `script-src` contains
 * a hash or nonce source, `'unsafe-inline'` is ignored entirely.** A policy of
 * `script-src 'self' 'sha256-…' 'unsafe-inline'` therefore blocks every inline
 * script, including the ones the App Router streams the RSC payload through
 * (`<script>self.__next_f.push(…)</script>`). The page server-renders, React
 * never hydrates, and the user sees a correctly themed blank screen — which is
 * exactly what happened before this file existed.
 *
 * The fix is one nonce per response, which Next.js picks up automatically: it
 * reads the CSP from the *request* headers set below and stamps the same nonce
 * onto its own inline scripts. `src/app/layout.tsx` reads `x-nonce` to stamp the
 * theme bootstrap the same way.
 *
 * `'strict-dynamic'` lets the nonced bootstrap load the chunk graph without
 * every chunk URL needing to be enumerated; modern browsers ignore `'self'` for
 * scripts once it is present, and older ones fall back to `'self'`.
 */

function buildCsp(nonce: string, isDevelopment: boolean): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      // The dev server compiles and evaluates modules in the browser.
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
    ],
    // Next.js injects critical CSS inline; there is no nonce plumbing for it,
    // and style injection is not a script-execution vector.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'media-src': ["'self'", 'data:', 'blob:'],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'connect-src': [
      "'self'",
      'https://*.supabase.co',
      'https://*.upstash.io',
      'https://*.ingest.sentry.io',
      // The dev server's HMR socket.
      ...(isDevelopment ? ['ws:', 'wss:'] : []),
    ],
    // A Trusted Web Activity is a first-party origin with no embedding story.
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'object-src': ["'none'"],
  };

  const serialised = Object.entries(directives)
    .map(([directive, values]) => `${directive} ${values.join(' ')}`)
    .join('; ');

  // Only in production: on a plain-HTTP local origin this would upgrade every
  // request to https and break the dev server.
  return isDevelopment ? serialised : `${serialised}; upgrade-insecure-requests`;
}

export function middleware(request: NextRequest): NextResponse {
  const isDevelopment = process.env.NODE_ENV === 'development';

  // 16 bytes of CSPRNG output, base64. A nonce must be unguessable and must
  // never repeat across responses, or it stops being a control at all.
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const csp = buildCsp(nonce, isDevelopment);

  // Next.js reads the policy off the *request* to discover the nonce, then
  // applies it to the inline scripts it emits.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);

  return response;
}

export const config = {
  matcher: [
    /*
     * Documents only. Static assets, images and API responses gain nothing from
     * a CSP, and running middleware for each of them would add latency to every
     * chunk the page loads.
     *
     * `_next/static` also must be excluded for a second reason: those responses
     * are immutable and shared between users, so a per-request nonce in their
     * headers would be meaningless.
     */
    {
      source:
        '/((?!api|_next/static|_next/image|icons|audio|sw\\.js|manifest\\.json|favicon\\.ico|\\.well-known).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
