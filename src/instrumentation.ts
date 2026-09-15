/**
 * Next.js instrumentation hook.
 *
 * Runs once per server runtime before any request is handled, which is the
 * right moment to stand up error reporting — a crash during boot is exactly the
 * one you most want reported.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    const { initSentry } = await import('./lib/observability/sentry');
    initSentry('server');
  }
}
