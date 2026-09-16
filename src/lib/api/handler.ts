import { Prisma } from '@prisma/client';
import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { ZodError, type ZodType, type ZodTypeDef } from 'zod';
import type { Logger } from 'pino';

import { getSessionFromRequest, isSameOrigin, type SessionUser } from '../auth/session';
import { withUserContext, type ScopedPrisma } from '../db/rls';
import { EnvConfigError, isProduction } from '../env';
import { ApiError, isApiError } from '../errors';
import { requestLogger } from '../logger';
import { checkRateLimit, rateLimitIdentifier, type RateLimitScope } from '../ratelimit';
import { jsonError, jsonOk, type ApiResponseBody } from './response';

/**
 * Route handler composition.
 *
 * `withRoute()` is the only way a `/api/v1` endpoint is defined. It guarantees,
 * for every endpoint at once, that:
 *
 *   - a correlation id exists and is echoed back on the response,
 *   - rate limits are consumed before any work is done,
 *   - authenticated routes have a verified session,
 *   - bodies and query strings are zod-validated before the handler sees them,
 *   - tenant queries run inside an RLS-scoped transaction,
 *   - thrown errors become the standard envelope and never leak internals.
 */

export interface RouteContext<TBody, TQuery> {
  request: NextRequest;
  body: TBody;
  query: TQuery;
  params: Record<string, string>;
  requestId: string;
  /**
   * Request-scoped logger, already carrying `requestId`, `route` and `method`.
   *
   * Handed to the handler so that logging something is never a reason to reach
   * for the module-level logger and lose the correlation id.
   */
  log: Logger;
}

export interface AuthedRouteContext<TBody, TQuery> extends RouteContext<TBody, TQuery> {
  user: SessionUser;
  /** RLS-scoped client. Every tenant query in the handler must use this. */
  db: ScopedPrisma;
}

/**
 * A schema whose *output* is `TOut`, whatever it accepts as input.
 *
 * `ZodSchema<T>` pins input and output to the same type, which excludes every
 * schema that transforms — `.default()`, `.coerce`, the Persian-digit
 * normalisers — i.e. most of them. Declaring the input as `unknown` keeps the
 * handler's type parameter tied to what the handler actually receives.
 */
type OutputSchema<TOut> = ZodType<TOut, ZodTypeDef, unknown>;

interface RouteConfig<TBody, TQuery, TResult> {
  /** Zod schema for the JSON body. Omit for methods without one. */
  bodySchema?: OutputSchema<TBody>;
  /** Zod schema applied to the parsed search params. */
  querySchema?: OutputSchema<TQuery>;
  rateLimit?: RateLimitScope;
  handler: (context: RouteContext<TBody, TQuery>) => Promise<TResult | NextResponse>;
}

interface AuthedRouteConfig<TBody, TQuery, TResult>
  extends Omit<RouteConfig<TBody, TQuery, TResult>, 'handler'> {
  handler: (context: AuthedRouteContext<TBody, TQuery>) => Promise<TResult | NextResponse>;
}

type NextRouteHandler = (
  request: NextRequest,
  segmentData: { params: Promise<Record<string, string>> },
) => Promise<NextResponse>;

function zodToDetails(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    (details[key] ??= []).push(issue.message);
  }

  return details;
}

async function parseBody<T>(request: NextRequest, schema?: OutputSchema<T>): Promise<T> {
  if (!schema) return undefined as T;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw ApiError.badRequest('بدنهٔ درخواست باید JSON معتبر باشد.');
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw ApiError.validation(zodToDetails(parsed.error));

  return parsed.data;
}

function parseQuery<T>(request: NextRequest, schema?: OutputSchema<T>): T {
  if (!schema) return undefined as T;

  const raw: Record<string, string | string[]> = {};

  for (const key of new Set(request.nextUrl.searchParams.keys())) {
    const values = request.nextUrl.searchParams.getAll(key);
    raw[key] = values.length > 1 ? values : (values[0] as string);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw ApiError.validation(zodToDetails(parsed.error));

  return parsed.data;
}

function isNextResponse(value: unknown): value is NextResponse {
  return typeof value === 'object' && value !== null && 'headers' in value && 'status' in value;
}

export interface Misconfiguration {
  /** Message shown to the client; Persian, and free of internal detail. */
  message: string;
  /** What the log line says happened. */
  summary: string;
  logFields: Record<string, unknown>;
  /** Field-level detail, attached to the response outside production only. */
  details: Record<string, string[]>;
}

/**
 * Recognises the two failures that mean "this deployment is not set up", as
 * opposed to "this request is bad".
 *
 * Both used to arrive as an opaque 500. They are the first two things a new
 * clone hits, and neither is diagnosable from the response:
 *
 *   - a variable missing from `.env.local`, and
 *   - a database that is not running, or is running somewhere else.
 */
export function describeMisconfiguration(error: unknown): Misconfiguration | null {
  if (error instanceof EnvConfigError) {
    return {
      message: 'پیکربندی سرور کامل نیست؛ با پشتیبانی تماس بگیرید.',
      summary: 'server environment is incomplete',
      // Names only. A value here would put a signing key in the log.
      logFields: { missingEnv: error.variables },
      details: Object.fromEntries(error.issues.map((issue) => [issue.variable, [issue.message]])),
    };
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return {
      message: 'اتصال به پایگاه داده برقرار نشد؛ کمی بعد دوباره تلاش کنید.',
      summary: 'database is unreachable',
      logFields: { prismaErrorCode: error.errorCode, clientVersion: error.clientVersion },
      details: {
        DATABASE_URL: [
          'the database refused the connection — check that it is running and that DATABASE_URL points at it',
        ],
      },
    };
  }

  return null;
}

function buildRoute<TBody, TQuery, TResult>(
  config: RouteConfig<TBody, TQuery, TResult> & { requireAuth: boolean },
  authedHandler?: AuthedRouteConfig<TBody, TQuery, TResult>['handler'],
): NextRouteHandler {
  return async (request, segmentData) => {
    const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
    const route = request.nextUrl.pathname;
    const startedAt = Date.now();

    const log = requestLogger({ requestId, route, method: request.method });
    const responseHeaders = { 'x-request-id': requestId };

    try {
      const params = await segmentData.params;

      // `SameSite=Strict` already keeps the session cookie off cross-site
      // requests; rejecting a foreign `Origin` outright turns a silently
      // unauthenticated write into an explicit refusal.
      if (request.method !== 'GET' && request.method !== 'HEAD' && !isSameOrigin(request)) {
        throw ApiError.forbidden('درخواست از مبدأ نامعتبر رد شد.');
      }

      const user = config.requireAuth ? await getSessionFromRequest(request) : null;
      if (config.requireAuth && !user) throw ApiError.unauthorized();

      if (config.rateLimit) {
        const limit = await checkRateLimit(
          config.rateLimit,
          rateLimitIdentifier(request, user?.id),
        );

        if (!limit.success) {
          log.warn({ scope: config.rateLimit, userId: user?.id }, 'rate limit exceeded');
          throw ApiError.rateLimited(limit.retryAfterSeconds);
        }
      }

      const body = await parseBody(request, config.bodySchema);
      const query = parseQuery(request, config.querySchema);
      const base: RouteContext<TBody, TQuery> = { request, body, query, params, requestId, log };

      const result =
        user && authedHandler
          ? await withUserContext(user.id, (db) => authedHandler({ ...base, user, db }))
          : await config.handler(base);

      log.info({ userId: user?.id, durationMs: Date.now() - startedAt }, 'request completed');

      return isNextResponse(result)
        ? (result as NextResponse)
        : (jsonOk(result, { headers: responseHeaders }) as NextResponse<ApiResponseBody<TResult>>);
    } catch (error) {
      if (isApiError(error)) {
        const level = error.status >= 500 ? 'error' : 'warn';
        log[level]({ code: error.code, durationMs: Date.now() - startedAt }, error.message);
        return jsonError(error, responseHeaders);
      }

      if (error instanceof ZodError) {
        return jsonError(ApiError.validation(zodToDetails(error)), responseHeaders);
      }

      const misconfigured = describeMisconfiguration(error);
      if (misconfigured) {
        // Not a bug in the request — the server cannot read its own setup, and
        // every request will fail the same way until someone edits a file. It
        // is logged at error level with the variable names (never the values),
        // and outside production the same names go back in the response, where
        // whoever is running `next dev` will actually see them.
        log.error(
          { ...misconfigured.logFields, durationMs: Date.now() - startedAt },
          misconfigured.summary,
        );

        return jsonError(
          new ApiError('SERVICE_UNAVAILABLE', misconfigured.message, {
            details: isProduction ? undefined : misconfigured.details,
            cause: error,
          }),
          responseHeaders,
        );
      }

      // Anything reaching here is unexpected: log it in full, return nothing.
      log.error({ err: error, durationMs: Date.now() - startedAt }, 'unhandled route error');
      return jsonError(ApiError.internal(error), responseHeaders);
    }
  };
}

/** Defines a public (unauthenticated) route. */
export function withRoute<TBody = undefined, TQuery = undefined, TResult = unknown>(
  config: RouteConfig<TBody, TQuery, TResult>,
): NextRouteHandler {
  return buildRoute({ ...config, requireAuth: false });
}

/** Defines an authenticated route; the handler receives an RLS-scoped client. */
export function withAuthedRoute<TBody = undefined, TQuery = undefined, TResult = unknown>(
  config: AuthedRouteConfig<TBody, TQuery, TResult>,
): NextRouteHandler {
  return buildRoute(
    {
      ...config,
      requireAuth: true,
      handler: async () => {
        throw ApiError.unauthorized();
      },
    },
    config.handler,
  );
}
