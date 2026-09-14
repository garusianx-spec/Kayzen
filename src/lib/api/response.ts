import { NextResponse } from 'next/server';

import type { ApiError, ApiErrorCode } from '../errors';

/**
 * The single response envelope every `/api/v1` route returns.
 *
 * A discriminated union on `ok` lets the client narrow without inspecting the
 * HTTP status, which matters for the offline queue: a replayed mutation's stored
 * response is parsed the same way whether it came from the network or the cache.
 */
export type ApiResponseBody<T> =
  | { ok: true; data: T; meta?: Record<string, unknown> }
  | {
      ok: false;
      error: { code: ApiErrorCode; message: string; details?: Record<string, string[]> };
    };

export function jsonOk<T>(
  data: T,
  init: { status?: number; meta?: Record<string, unknown>; headers?: HeadersInit } = {},
): NextResponse<ApiResponseBody<T>> {
  return NextResponse.json<ApiResponseBody<T>>(
    init.meta ? { ok: true, data, meta: init.meta } : { ok: true, data },
    { status: init.status ?? 200, headers: init.headers },
  );
}

export function jsonError(
  error: ApiError,
  headers?: HeadersInit,
): NextResponse<ApiResponseBody<never>> {
  const responseHeaders = new Headers(headers);

  if (error.retryAfter !== undefined) {
    responseHeaders.set('Retry-After', String(error.retryAfter));
  }

  return NextResponse.json<ApiResponseBody<never>>(
    {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    },
    { status: error.status, headers: responseHeaders },
  );
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}
