'use client';

import type { ApiErrorCode } from '../errors';
import { enqueue } from '../offline/outbox';
import type { ApiResponseBody } from './response';

/**
 * The browser's only door to `/api/v1`.
 *
 * Three behaviours are centralised here because getting any of them wrong in one
 * call site is a bug that only shows up on a bad connection:
 *
 *  1. **Envelope unwrapping.** Every response is `{ ok, data | error }`; callers
 *     receive `data` or a thrown `ApiClientError`.
 *  2. **Silent refresh.** A 401 triggers one refresh attempt, de-duplicated
 *     across concurrent requests, then the original call is retried once.
 *  3. **Offline queueing.** A mutation attempted with no connection goes to the
 *     outbox and resolves as `queued` instead of failing — the optimistic cache
 *     update stands and the write lands when the network returns.
 */

export const API_BASE = '/api/v1';

export class ApiClientError extends Error {
  readonly code: ApiErrorCode | 'NETWORK';
  readonly status: number;
  readonly details?: Record<string, string[]>;
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    options: {
      code?: ApiErrorCode | 'NETWORK';
      status?: number;
      details?: Record<string, string[]>;
      retryAfterSeconds?: number;
    } = {},
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.code = options.code ?? 'INTERNAL';
    this.status = options.status ?? 0;
    this.details = options.details;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  /** First message for `field`, for rendering under an input. */
  fieldError(field: string): string | undefined {
    return this.details?.[field]?.[0];
  }
}

/** Resolved instead of thrown when a mutation is parked in the outbox. */
export interface QueuedResult {
  queued: true;
  id: string;
}

export function isQueued(value: unknown): value is QueuedResult {
  return typeof value === 'object' && value !== null && (value as QueuedResult).queued === true;
}

type MutationMethod = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface RequestOptions {
  method?: 'GET' | MutationMethod;
  body?: unknown;
  signal?: AbortSignal;
  /** Skip the refresh-and-retry dance (used by the refresh call itself). */
  skipAuthRetry?: boolean;
  /** When offline: park the write instead of failing. */
  queueWhenOffline?: { label?: string; invalidate?: string[] } | false;
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Rotates the session, at most once at a time.
 *
 * Without the single-flight guard, a screen that fires five queries on mount
 * would send five refreshes on a cold start — and since rotation is single-use,
 * four of them would look like token reuse and revoke the session.
 */
async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      return response.ok;
    } catch {
      return false;
    } finally {
      // Cleared on the next microtask so every awaiting caller reads the same
      // result before a new attempt can start.
      queueMicrotask(() => {
        refreshInFlight = null;
      });
    }
  })();

  return refreshInFlight;
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

async function parseEnvelope<T>(response: Response): Promise<T> {
  let payload: ApiResponseBody<T> | null = null;

  try {
    payload = (await response.json()) as ApiResponseBody<T>;
  } catch {
    payload = null;
  }

  if (payload && payload.ok) return payload.data;

  if (payload && !payload.ok) {
    throw new ApiClientError(payload.error.message, {
      code: payload.error.code,
      status: response.status,
      details: payload.error.details,
      retryAfterSeconds: Number(response.headers.get('retry-after')) || undefined,
    });
  }

  throw new ApiClientError('پاسخ سرور قابل خواندن نبود.', {
    code: 'INTERNAL',
    status: response.status,
  });
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const url = path.startsWith('/api') ? path : `${API_BASE}${path}`;
  const body = options.body === undefined ? null : JSON.stringify(options.body);

  if (method !== 'GET' && options.queueWhenOffline && isOffline()) {
    const entry = await enqueue({
      url,
      method,
      body,
      label: options.queueWhenOffline.label,
      invalidate: options.queueWhenOffline.invalidate,
    });

    return { queued: true, id: entry.id } as T;
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: options.signal,
      cache: 'no-store',
    });
  } catch (error) {
    if (method !== 'GET' && options.queueWhenOffline) {
      const entry = await enqueue({
        url,
        method,
        body,
        label: options.queueWhenOffline.label,
        invalidate: options.queueWhenOffline.invalidate,
      });

      return { queued: true, id: entry.id } as T;
    }

    throw new ApiClientError('ارتباط با سرور برقرار نشد.', {
      code: 'NETWORK',
      status: 0,
      details: error instanceof Error ? { _: [error.message] } : undefined,
    });
  }

  if (response.status === 401 && !options.skipAuthRetry) {
    const refreshed = await refreshSession();

    if (refreshed) {
      return apiRequest<T>(path, { ...options, skipAuthRetry: true });
    }
  }

  return parseEnvelope<T>(response);
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),

  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),

  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),

  delete: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'DELETE', body }),
} as const;
