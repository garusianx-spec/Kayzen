import { withAuthedRoute } from '@/lib/api/handler';
import { ApiError } from '@/lib/errors';
import { MAX_ATTACHMENTS_PER_RECORD } from '@/lib/storage/constants';
import { createSignedUpload } from '@/lib/storage/supabase';
import {
  signAttachmentSchema,
  uuidSchema,
  type SignAttachmentInput,
} from '@/lib/validation/schemas';

/**
 * `POST /api/v1/tasks/:id/attachments/sign` — step one of an upload.
 *
 * Signing is its own endpoint rather than a mode of the collection route
 * because the two calls mean opposite things: this one promises nothing and
 * writes nothing, while `POST .../attachments` records a file that already
 * exists. Collapsing them would leave one endpoint whose effect depended on
 * which fields the body happened to carry.
 *
 * The signed URL is one-shot and expires on its own, so a client that asks for
 * one and walks away costs a row nowhere and a little entropy.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuthedRoute<
  SignAttachmentInput,
  undefined,
  { uploadUrl: string; path: string }
>({
  bodySchema: signAttachmentSchema,
  rateLimit: 'mutation',
  handler: async ({ body, params, user, db }) => {
    const id = uuidSchema.parse(params.id);

    // The scoped read is the authorisation: another tenant's task is invisible
    // here, so its id can never reach the signer.
    const task = await db.task.findUnique({ where: { id }, select: { id: true } });
    if (!task) throw ApiError.notFound('کار موردنظر پیدا نشد.');

    const existing = await db.taskAttachment.count({ where: { taskId: id } });

    if (existing >= MAX_ATTACHMENTS_PER_RECORD) {
      throw ApiError.unprocessable('برای هر کار حداکثر ۱۰ فایل مجاز است.', {
        attachments: ['برای هر کار حداکثر ۱۰ فایل مجاز است.'],
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
