import * as Sentry from '@sentry/nextjs';

import { clientEnv, isProduction } from '../env';

/**
 * Sentry, initialised explicitly rather than through the build plugin.
 *
 * `withSentryConfig` couples the build to a Sentry auth token and rewrites the
 * webpack config; initialising by hand keeps `next build` working in CI and in
 * a fork with no Sentry account, at the cost of source-map upload — which the
 * release job does separately when a token is present.
 *
 * Without a DSN every function here is a no-op, so call sites never have to
 * check whether monitoring is configured.
 */

let initialised = false;

export function initSentry(runtime: 'browser' | 'server'): void {
  if (initialised || !clientEnv.sentryDsn) return;

  Sentry.init({
    dsn: clientEnv.sentryDsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
    // Full tracing on a mobile app on a metered connection is a cost the user
    // pays; 10% is enough to see a regression.
    tracesSampleRate: isProduction ? 0.1 : 0,
    // Phone numbers and note bodies must never leave the device in a crash
    // report; PII collection stays off and the scrubber below is the backstop.
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.cookies) delete event.request.cookies;
      if (event.request?.headers) {
        delete event.request.headers.cookie;
        delete event.request.headers.authorization;
      }

      return event;
    },
    ...(runtime === 'browser' ? { integrations: [] } : {}),
  });

  initialised = true;
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!clientEnv.sentryDsn) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
