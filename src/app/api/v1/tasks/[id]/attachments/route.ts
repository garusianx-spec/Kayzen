import { toTaskAttachmentLinkDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { ApiError } from '@/lib/errors';
import { MAX_ATTACHMENTS_PER_RECORD, isAllowedAttachmentType } from '@/lib/storage/constants';
import {
  assertOwnedObjectPath,
  createSignedDownloads,
  deleteAttachment,
} from '@/lib/storage/supabase';
import {
  confirmTaskAttachmentSchema,
  deleteTaskAttachmentSchema,
  uuidSchema,
  type ConfirmTaskAttachmentInput,
  type DeleteTaskAttachmentInput,
} from '@/lib/validation/schemas';
import type { TaskAttachmentDto, TaskAttachmentLinkDto } from '@/types/domain';

/**
 * `GET|POST|DELETE /api/v1/tasks/:id/attachments`.
 *
 * Bytes never touch this server. An upload is three steps:
 *
 *   1. `POST .../attachments/sign` — the task's ownership is checked against
 *      the RLS-scoped client and a one-shot signed URL comes back;
 *   2. the browser `PUT`s the file straight to Supabase Storage;
 *   3. `POST` here records the object as a `TaskAttachment` row.
 *
 * Step 3 is separate on purpose: a signed URL that is minted but never used
 * costs nothing and expires, whereas writing the row first would leave the task
 * pointing at an object that does not exist.
 *
 * `GET` signs a whole batch of download URLs in one round trip, because the
 * composer opens showing every file at once and one request per file would turn
 * a task with eight attachments into eight calls to Storage.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuthedRoute<undefined, undefined, { attachments: TaskAttachmentLinkDto[] }>({
  rateLimit: 'read',
  handler: async ({ params, user, db }) => {
    const id = uuidSchema.parse(params.id);

    const task = await db.task.findUnique({ where: { id }, select: { id: true } });
    if (!task) throw ApiError.notFound('کار موردنظر پیدا نشد.');

    const rows = await db.taskAttachment.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'asc' },
    });

    // Unsignable objects are dropped by the signer rather than failing the
    // request, so one file deleted out from under the app does not hide the
    // other seven.
    const signed = await createSignedDownloads(
      rows.map((row) => row.objectPath),
      user.id,
    );
    const urls = new Map(signed.map((entry) => [entry.path, entry]));

    return {
      attachments: rows.flatMap((row) => {
        const link = urls.get(row.objectPath);
        return link ? [toTaskAttachmentLinkDto(row, link.url, link.expiresAt)] : [];
      }),
    };
  },
});

export const POST = withAuthedRoute<
  ConfirmTaskAttachmentInput,
  undefined,
  { attachment: TaskAttachmentDto }
>({
  bodySchema: confirmTaskAttachmentSchema,
  rateLimit: 'mutation',
  handler: async ({ body, params, user, db }) => {
    const id = uuidSchema.parse(params.id);

    const task = await db.task.findUnique({ where: { id }, select: { id: true } });
    if (!task) throw ApiError.notFound('کار موردنظر پیدا نشد.');

    // The client chose this path, so it is re-checked here exactly as it is on
    // the read side — caller's namespace, and *this* task's folder.
    assertOwnedObjectPath(body.path, user.id, id);

    if (!isAllowedAttachmentType(body.mimeType)) {
      throw ApiError.unprocessable('این نوع فایل پشتیبانی نمی‌شود.', {
        mimeType: ['فقط تصویر یا PDF می‌توانید پیوست کنید.'],
      });
    }

    // Re-counted rather than trusted from the signing step: signatures can be
    // minted in parallel, and the row count is the thing the limit is about.
    const existing = await db.taskAttachment.count({ where: { taskId: id } });
    if (existing >= MAX_ATTACHMENTS_PER_RECORD) {
      throw ApiError.unprocessable('برای هر کار حداکثر ۱۰ فایل مجاز است.', {
        attachments: ['برای هر کار حداکثر ۱۰ فایل مجاز است.'],
      });
    }

    const attachment = await db.taskAttachment.create({
      data: {
        taskId: id,
        userId: user.id,
        objectPath: body.path,
        fileName: body.fileName,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
      },
    });

    return {
      attachment: {
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        createdAt: attachment.createdAt.toISOString(),
      },
    };
  },
});

export const DELETE = withAuthedRoute<DeleteTaskAttachmentInput, undefined, { id: string }>({
  bodySchema: deleteTaskAttachmentSchema,
  rateLimit: 'mutation',
  handler: async ({ body, params, user, db }) => {
    const taskId = uuidSchema.parse(params.id);

    // Scoped by task *and* id: an attachment id from another task — or another
    // tenant, which RLS already hides — finds nothing.
    const attachment = await db.taskAttachment.findFirst({
      where: { id: body.id, taskId },
      select: { id: true, objectPath: true },
    });
    if (!attachment) throw ApiError.notFound('این فایل در کار پیدا نشد.');

    // Object first: a row left behind by a failed delete is a broken link the
    // user can see and retry, while an orphaned object is invisible and billed
    // for forever.
    await deleteAttachment(attachment.objectPath, user.id);
    await db.taskAttachment.delete({ where: { id: attachment.id } });

    return { id: attachment.id };
  },
});
