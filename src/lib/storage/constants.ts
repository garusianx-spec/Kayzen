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

/** Most attachments per note; mirrors the `max(10)` on the note schema. */
export const MAX_ATTACHMENTS_PER_NOTE = 10;

export function isAllowedAttachmentType(contentType: string): contentType is AttachmentMimeType {
  return (ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(contentType);
}

/** `1.4 مگابایت` — sizes in the picker, in Persian digits. */
export function formatBytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  const value = megabytes >= 1 ? megabytes.toFixed(1) : (bytes / 1024).toFixed(0);
  const unit = megabytes >= 1 ? 'مگابایت' : 'کیلوبایت';

  return `${value.replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)] ?? digit)} ${unit}`;
}
