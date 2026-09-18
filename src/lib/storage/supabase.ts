import { clientEnv, serverEnv } from '../env';
import { ApiError } from '../errors';
import { logger } from '../logger';
import { MAX_ATTACHMENT_BYTES, isAllowedAttachmentType } from './constants';

/**
 * Supabase Storage — attachments.
 *
 * Kayzen authenticates with its own phone/OTP sessions rather than Supabase
 * Auth, so `auth.uid()` is always NULL inside Storage and RLS policies written
 * against it would deny everything. The bucket is therefore private with no
 * policies at all (see `supabase/migrations/0004_storage.sql`), and every read
 * and write goes through this module, which holds the service-role key and
 * hands out short-lived signed URLs.
 *
 * That makes the service role the only thing standing between one tenant and
 * another's files, which is why {@link assertOwnedObjectPath} guards every call
 * that touches a client-supplied path. Objects are laid out as
 *
 *     <user-uuid>/<parent-uuid>/<random>-<filename>
 *
 * where the parent is the note or task the file hangs off. Ownership is the
 * first path segment and can be checked without a database round trip, and the
 * second segment is what makes one note's files distinguishable from another's
 * without a second index. The bytes never pass through the Next.js server: the browser
 * uploads straight to Supabase with a one-shot signed URL, which keeps a 10 MiB
 * photo out of a serverless function's request body.
 */

/** Download links live long enough to open, briefly enough to leak harmlessly. */
const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storageConfig(): { baseUrl: string; bucket: string; serviceRoleKey: string } {
  const env = serverEnv();

  if (!clientEnv.supabaseUrl || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw ApiError.unavailable('سرویس فایل پیکربندی نشده است.');
  }

  return {
    baseUrl: `${clientEnv.supabaseUrl.replace(/\/$/, '')}/storage/v1`,
    bucket: env.SUPABASE_STORAGE_BUCKET,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

/**
 * Strips a user-supplied filename down to something safe to put in a path.
 *
 * Separators and `..` are removed rather than escaped: the name is decoration
 * in the object key — the random prefix supplies uniqueness — so there is
 * nothing to lose by being aggressive. Non-Latin names survive, because a user
 * who names a file in Persian should still recognise it in the list.
 */
export function sanitizeAttachmentFilename(filename: string): string {
  const cleaned = Array.from(filename)
    // Control characters are filtered by code point rather than by a regex
    // range: a character class containing them would be invisible in the
    // source, and invisible source is how a sanitiser quietly stops working.
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    })
    .join('')
    .replace(/[/\\]/g, '')
    .replace(/\.{2,}/g, '.')
    .trim();

  const safe = cleaned.length > 0 ? cleaned : 'file';
  return safe.length > 100 ? safe.slice(-100) : safe;
}

/** `<user>/<parent>/<random>-<filename>` — the canonical object key. */
export function attachmentObjectPath(options: {
  userId: string;
  /** The note or task the file belongs to. */
  parentId: string;
  filename: string;
}): string {
  const prefix = crypto.randomUUID().slice(0, 8);
  return `${options.userId}/${options.parentId}/${prefix}-${sanitizeAttachmentFilename(options.filename)}`;
}

/**
 * Refuses any path that does not belong to `userId`.
 *
 * Clients supply object paths when downloading and deleting, and the
 * service-role key would happily sign a URL for *any* object in the bucket.
 * This check — first segment is the caller's own UUID, second is a real record
 * id, no traversal — is what stops "sign me a URL for someone else's file"
 * from working.
 *
 * `parentId` narrows it one step further, to a single note or task. The task
 * flow needs it: the client hands back an object key after uploading, and
 * without this a key minted for one task could be registered against another.
 * Both rows would be the caller's own, so nothing leaks across tenants — but a
 * file would appear on a task it was never uploaded to, and deleting that task
 * would take another task's object with it.
 */
export function assertOwnedObjectPath(path: string, userId: string, parentId?: string): void {
  const segments = path.split('/');

  const isOwned =
    segments.length === 3 &&
    segments[0] === userId &&
    UUID_PATTERN.test(segments[1] ?? '') &&
    (parentId === undefined || segments[1] === parentId) &&
    (segments[2]?.length ?? 0) > 0 &&
    !path.includes('..') &&
    !path.startsWith('/');

  if (!isOwned) {
    logger.warn({ userId, path }, 'rejected an attachment path outside the caller namespace');
    throw ApiError.forbidden('این فایل به شما تعلق ندارد.');
  }
}

async function storageFetch(
  path: string,
  init: RequestInit & { method: string },
): Promise<Response> {
  const { baseUrl, serviceRoleKey } = storageConfig();

  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
}

export interface SignedUpload {
  /** Absolute URL the browser PUTs the file to. Single use. */
  uploadUrl: string;
  /** The object key to record once the upload succeeds. */
  path: string;
}

/**
 * Mints a one-shot upload URL.
 *
 * The caller must already have established that the parent record belongs to
 * the user; this function trusts `userId` and builds the key from it.
 */
export async function createSignedUpload(options: {
  userId: string;
  parentId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}): Promise<SignedUpload> {
  if (!isAllowedAttachmentType(options.contentType)) {
    throw ApiError.unprocessable('این نوع فایل پشتیبانی نمی‌شود.', {
      contentType: ['فقط تصویر یا PDF می‌توانید پیوست کنید.'],
    });
  }

  if (options.sizeBytes > MAX_ATTACHMENT_BYTES) {
    throw ApiError.unprocessable('حجم فایل بیش از حد مجاز است.', {
      size: ['حداکثر حجم مجاز ۱۰ مگابایت است.'],
    });
  }

  const { bucket, baseUrl } = storageConfig();
  const path = attachmentObjectPath(options);

  const response = await storageFetch(`/object/upload/sign/${bucket}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    logger.error({ status: response.status }, 'supabase storage refused to sign an upload');
    throw ApiError.unavailable('آماده‌سازی بارگذاری ممکن نشد.');
  }

  const payload = (await response.json()) as { url?: string };
  if (!payload.url) throw ApiError.unavailable('آماده‌سازی بارگذاری ممکن نشد.');

  return { uploadUrl: `${baseUrl}${payload.url}`, path };
}

export interface SignedDownload {
  path: string;
  url: string;
  expiresAt: string;
  filename: string;
}

/** Signs a batch of object paths for reading. Unsignable entries are dropped. */
export async function createSignedDownloads(
  paths: readonly string[],
  userId: string,
): Promise<SignedDownload[]> {
  if (paths.length === 0) return [];

  for (const path of paths) assertOwnedObjectPath(path, userId);

  const { bucket, baseUrl } = storageConfig();

  const response = await storageFetch(`/object/sign/${bucket}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: DOWNLOAD_URL_TTL_SECONDS, paths: [...paths] }),
  });

  if (!response.ok) {
    logger.error({ status: response.status }, 'supabase storage refused to sign downloads');
    throw ApiError.unavailable('دسترسی به فایل‌ها ممکن نشد.');
  }

  const payload = (await response.json()) as Array<{
    path?: string | null;
    signedURL?: string | null;
    error?: string | null;
  }>;

  const expiresAt = new Date(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000).toISOString();

  return payload
    .filter((entry): entry is { path: string; signedURL: string } =>
      Boolean(entry.path && entry.signedURL && !entry.error),
    )
    .map((entry) => ({
      path: entry.path,
      url: `${baseUrl}${entry.signedURL}`,
      expiresAt,
      filename: attachmentDisplayName(entry.path),
    }));
}

/** Everything after the random prefix is the name the user chose. */
export function attachmentDisplayName(path: string): string {
  const objectName = path.split('/').pop() ?? '';
  return objectName.replace(/^[0-9a-f]{8}-/, '') || 'file';
}

/** Removes an object. Idempotent: a missing object is not an error. */
export async function deleteAttachment(path: string, userId: string): Promise<void> {
  assertOwnedObjectPath(path, userId);

  const { bucket } = storageConfig();
  const response = await storageFetch(`/object/${bucket}/${path}`, { method: 'DELETE' });

  if (!response.ok && response.status !== 404) {
    logger.error({ status: response.status }, 'supabase storage refused a delete');
    throw ApiError.unavailable('حذف فایل ممکن نشد.');
  }
}
