import pino, { type Logger } from 'pino';

import { isTest } from './env';

/**
 * Structured JSON logging.
 *
 * `redact` strips the fields that carry secrets or PII before serialisation —
 * `initData` in particular is a signed credential and must never be persisted.
 *
 * **No `transport` option, deliberately.** A pino transport runs in a worker
 * thread whose entry point (`thread-stream/lib/worker.js`) is resolved as a
 * filesystem path at runtime. Next.js bundles server code into
 * `.next/server/vendor-chunks/`, that path does not exist there, and the worker
 * exits before it ever starts:
 *
 *     Cannot find module '.next/server/vendor-chunks/lib/worker.js'
 *     Error: the worker thread exited
 *
 * Every later `logger.*` call then throws `the worker has exited`. Because the
 * first thing every route does is log, that surfaced as a 500 from whichever
 * endpoint the user happened to hit first — `POST /api/v1/auth/otp/send`, in
 * practice, since signing in is the first request a fresh dev server serves.
 *
 * Nothing is lost by leaving it out: pino's default destination is already file
 * descriptor 1, written from this thread. If pretty output is ever wanted, pipe
 * it — `next dev | npx pino-pretty` — rather than reaching for a transport.
 */
const baseLogger: Logger = pino({
  level: process.env.LOG_LEVEL ?? (isTest ? 'silent' : 'info'),
  base: {
    app: 'kayzen',
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'initData',
      'password',
      'token',
      'tokenHash',
      '*.initData',
      '*.token',
    ],
    censor: '[redacted]',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const logger = baseLogger;

/** Child logger bound to one request; `requestId` correlates it with Sentry. */
export function requestLogger(fields: {
  requestId: string;
  route: string;
  method: string;
  userId?: string;
}): Logger {
  return baseLogger.child(fields);
}
