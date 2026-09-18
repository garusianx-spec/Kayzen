/**
 * Attachment limits, shared by the browser and the server.
 *
 * Kept in their own module with no imports so the file picker can read them
 * without dragging `supabase.ts` — and with it the service-role key handling,
 * `serverEnv()` and the logger — into the client bundle.
 *
 * These mirror the bucket's own `allowed_mime_types` and `file_size_limit` in
 * `supabase/migrations/0004_storage.sql`. Storage is the real enforcement point;
 * checking here as well just turns a rejected upload into a useful message
 * before the user waits for one.
 */

export const ALLOWED_ATTACHMENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
] as const;

export type AttachmentMimeType = (typeof ALLOWED_ATTACHMENT_TYPES)[number];

/** 10 MiB, matching the bucket. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * Most attachments per parent record, note or task alike.
 *
 * Mirrors the `max(10)` on the note schema. Without a ceiling, a client could
 * sign an upload per tap forever and fill the bucket with objects no record
 * references — the limit is enforced server-side, and shown here so the picker
 * can stop offering the button instead of letting the request fail.
 */
export const MAX_ATTACHMENTS_PER_RECORD = 10;

export function isAllowedAttachmentType(contentType: string): contentType is AttachmentMimeType {
  return (ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(contentType);
}

/**
 * `1.4 مگابایت` — sizes in the picker, in Persian digits.
 *
 * Bytes get their own branch rather than rounding into kilobytes: a small icon
 * shown as `۰ کیلوبایت` reads as a broken file, which is the one thing a size
 * label exists to rule out.
 */
export function formatBytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);

  const [value, unit] =
    megabytes >= 1
      ? [megabytes.toFixed(1), 'مگابایت']
      : bytes >= 1024
        ? [(bytes / 1024).toFixed(0), 'کیلوبایت']
        : [String(Math.max(0, Math.round(bytes))), 'بایت'];

  return `${value.replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)] ?? digit)} ${unit}`;
}
