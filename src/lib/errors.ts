/**
 * The single error vocabulary shared by every route handler.
 *
 * Handlers throw these; `withRoute()` in `src/lib/api/handler.ts` turns them
 * into the JSON envelope. Anything else that escapes is a bug and is reported
 * as an opaque 500 so that internal details never reach the client.
 */

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'UNPROCESSABLE'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UNPROCESSABLE: 422,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

/** Persian copy shown to the user when the client has nothing better. */
const MESSAGE_BY_CODE: Record<ApiErrorCode, string> = {
  BAD_REQUEST: 'درخواست نامعتبر است.',
  VALIDATION_FAILED: 'اطلاعات واردشده معتبر نیست.',
  UNAUTHORIZED: 'برای ادامه باید وارد شوید.',
  FORBIDDEN: 'به این بخش دسترسی ندارید.',
  NOT_FOUND: 'موردی پیدا نشد.',
  CONFLICT: 'این مورد از قبل وجود دارد.',
  RATE_LIMITED: 'تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.',
  UNPROCESSABLE: 'درخواست قابل پردازش نیست.',
  SERVICE_UNAVAILABLE: 'سرویس موقتاً در دسترس نیست؛ کمی بعد دوباره تلاش کنید.',
  INTERNAL: 'خطای غیرمنتظره‌ای رخ داد.',
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  /** Field-level detail, safe to render next to form inputs. */
  readonly details?: Record<string, string[]>;
  /** Seconds the client should wait before retrying (429 only). */
  readonly retryAfter?: number;

  constructor(
    code: ApiErrorCode,
    message?: string,
    options?: { details?: Record<string, string[]>; retryAfter?: number; cause?: unknown },
  ) {
    super(message ?? MESSAGE_BY_CODE[code], { cause: options?.cause });
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = options?.details;
    this.retryAfter = options?.retryAfter;
  }

  static badRequest(message?: string) {
    return new ApiError('BAD_REQUEST', message);
  }
  static unauthorized(message?: string) {
    return new ApiError('UNAUTHORIZED', message);
  }
  static forbidden(message?: string) {
    return new ApiError('FORBIDDEN', message);
  }
  static notFound(message?: string) {
    return new ApiError('NOT_FOUND', message);
  }
  static conflict(message?: string) {
    return new ApiError('CONFLICT', message);
  }
  static rateLimited(retryAfter: number, message?: string) {
    return new ApiError('RATE_LIMITED', message, { retryAfter });
  }
  static validation(details: Record<string, string[]>, message?: string) {
    return new ApiError('VALIDATION_FAILED', message, { details });
  }
  static unavailable(message?: string, retryAfter?: number) {
    return new ApiError('SERVICE_UNAVAILABLE', message, { retryAfter });
  }
  static unprocessable(message?: string, details?: Record<string, string[]>) {
    return new ApiError('UNPROCESSABLE', message, { details });
  }
  static internal(cause?: unknown) {
    return new ApiError('INTERNAL', undefined, { cause });
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
