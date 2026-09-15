import pino, { type Logger } from 'pino';

import { isProduction, isTest } from './env';

/**
 * Structured JSON logging.
 *
 * `redact` strips the fields that carry secrets or PII before serialisation —
 * `initData` in particular is a signed credential and must never be persisted.
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
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino/file',
          options: { destination: 1 },
        },
      }),
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
