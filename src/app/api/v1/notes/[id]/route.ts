import { toNoteDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { ApiError } from '@/lib/errors';
import { countWords } from '@/lib/sanitize';
import { updateNoteSchema, uuidSchema } from '@/lib/validation/schemas';
import type { NoteDto } from '@/types/domain';
import type { z } from 'zod';

/** `GET|PATCH|DELETE /api/v1/notes/:id`. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export const GET = withAuthedRoute<undefined, undefined, { note: NoteDto }>({
  rateLimit: 'read',
  handler: async ({ params, db }) => {
    const id = uuidSchema.parse(params.id);

    const note = await db.note.findUnique({ where: { id } });
    if (!note) throw ApiError.notFound('یادداشت موردنظر پیدا نشد.');

    return { note: toNoteDto(note) };
  },
});

export const PATCH = withAuthedRoute<UpdateNoteInput, undefined, { note: NoteDto }>({
  bodySchema: updateNoteSchema,
  rateLimit: 'mutation',
  handler: async ({ body, params, db }) => {
    const id = uuidSchema.parse(params.id);

    const existing = await db.note.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('یادداشت موردنظر پیدا نشد.');

    const note = await db.note.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.body !== undefined ? { body: body.body, wordCount: countWords(body.body) } : {}),
        ...(body.isPinned !== undefined ? { isPinned: body.isPinned } : {}),
        ...(body.colorToken !== undefined ? { colorToken: body.colorToken } : {}),
        ...(body.tags !== undefined ? { tags: body.tags } : {}),
        ...(body.attachments !== undefined ? { attachments: body.attachments } : {}),
      },
    });

    return { note: toNoteDto(note) };
  },
});

export const DELETE = withAuthedRoute<undefined, undefined, { id: string }>({
  rateLimit: 'mutation',
  handler: async ({ params, db }) => {
    const id = uuidSchema.parse(params.id);

    const deleted = await db.note.deleteMany({ where: { id } });
    if (deleted.count === 0) throw ApiError.notFound('یادداشت موردنظر پیدا نشد.');

    return { id };
  },
});
