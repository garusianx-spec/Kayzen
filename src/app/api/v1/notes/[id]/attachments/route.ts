import { withAuthedRoute } from '@/lib/api/handler';
import { ApiError } from '@/lib/errors';
import {
  createSignedDownloads,
  createSignedUpload,
  deleteAttachment,
} from '@/lib/storage/supabase';
import {
  deleteAttachmentSchema,
  signAttachmentSchema,
  uuidSchema,
  type DeleteAttachmentInput,
  type SignAttachmentInput,
} from '@/lib/validation/schemas';
import type { AttachmentDto } from '@/types/domain';

/**
 * `GET|POST|DELETE /api/v1/notes/:id/attachments`.
 *
 * Attachment bytes never touch this server. The upload is a three-step dance:
 *
 *   1. `POST` here — the note's ownership is checked against the RLS-scoped
 *      client, and a one-shot signed URL comes back;
 *   2. the browser `PUT`s the file straight to Supabase Storage;
 *   3. the client `PATCH`es the returned object key onto the note.
 *
 * Step 3 is separate on purpose: a signed URL that is minted but never used
 * costs nothing and expires, whereas recording the attachment before the upload
 * succeeds would leave the note pointing at an object that does not exist.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuthedRoute<undefined, undefined, { attachments: AttachmentDto[] }>({
  rateLimit: 'read',
  handler: async ({ params, user, db }) => {
    const id = uuidSchema.parse(params.id);

    // The scoped read is the authorisation: another tenant's note is invisible
    // here, so its attachment paths can never reach the signer.
    const note = await db.note.findUnique({ where: { id }, select: { attachments: true } });
    if (!note) throw ApiError.notFound('یادداشت موردنظر پیدا نشد.');

    return { attachments: await createSignedDownloads(note.attachments, user.id) };
  },
});

export const POST = withAuthedRoute<
  SignAttachmentInput,
  undefined,
  { uploadUrl: string; path: string }
>({
  bodySchema: signAttachmentSchema,
  rateLimit: 'mutation',
  handler: async ({ body, params, user, db }) => {
    const id = uuidSchema.parse(params.id);

    const note = await db.note.findUnique({ where: { id }, select: { attachments: true } });
    if (!note) throw ApiError.notFound('یادداشت موردنظر پیدا نشد.');

    // Mirrors the `max(10)` on the note schema: without it, repeated signing
    // would let a client fill the bucket with objects no note references.
    if (note.attachments.length >= 10) {
      throw ApiError.unprocessable('برای هر یادداشت حداکثر ۱۰ پیوست مجاز است.', {
        attachments: ['برای هر یادداشت حداکثر ۱۰ پیوست مجاز است.'],
      });
    }

    return createSignedUpload({
      userId: user.id,
      parentId: id,
      filename: body.filename,
      contentType: body.contentType,
      sizeBytes: body.sizeBytes,
    });
  },
});

export const DELETE = withAuthedRoute<DeleteAttachmentInput, undefined, { attachments: string[] }>({
  bodySchema: deleteAttachmentSchema,
  rateLimit: 'mutation',
  handler: async ({ body, params, user, db }) => {
    const id = uuidSchema.parse(params.id);

    const note = await db.note.findUnique({ where: { id }, select: { attachments: true } });
    if (!note) throw ApiError.notFound('یادداشت موردنظر پیدا نشد.');

    // Two independent checks: the path must be in *this* note's list, and
    // `deleteAttachment` re-verifies that it sits in the caller's namespace.
    if (!note.attachments.includes(body.path)) {
      throw ApiError.notFound('این پیوست در یادداشت پیدا نشد.');
    }

    await deleteAttachment(body.path, user.id);

    const attachments = note.attachments.filter((path) => path !== body.path);
    await db.note.update({ where: { id }, data: { attachments } });

    return { attachments };
  },
});
