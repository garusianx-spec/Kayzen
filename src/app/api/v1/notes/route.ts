import { toNoteDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { countWords } from '@/lib/sanitize';
import { createNoteSchema, type CreateNoteInput } from '@/lib/validation/schemas';
import type { NoteDto } from '@/types/domain';
import { z } from 'zod';

/**
 * `GET /api/v1/notes` — pinned first, `POST` — create.
 *
 * Note bodies are stored as raw markdown. Sanitisation happens on render (see
 * `src/lib/sanitize.ts`), not on write, so tightening the allow-list later
 * protects existing rows too.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const listQuerySchema = z.object({
  search: z.string().max(120).optional(),
  tag: z.string().max(32).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

type ListQuery = z.infer<typeof listQuerySchema>;

export const GET = withAuthedRoute<undefined, ListQuery, { notes: NoteDto[] }>({
  querySchema: listQuerySchema,
  rateLimit: 'read',
  handler: async ({ query, user, db }) => {
    const notes = await db.note.findMany({
      where: {
        userId: user.id,
        ...(query.tag ? { tags: { has: query.tag } } : {}),
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' } },
                { body: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
      take: query.limit,
    });

    return { notes: notes.map(toNoteDto) };
  },
});

export const POST = withAuthedRoute<CreateNoteInput, undefined, { note: NoteDto }>({
  bodySchema: createNoteSchema,
  rateLimit: 'mutation',
  handler: async ({ body, user, db }) => {
    const note = await db.note.create({
      data: {
        userId: user.id,
        title: body.title,
        body: body.body,
        isPinned: body.isPinned,
        colorToken: body.colorToken,
        tags: body.tags,
        attachments: body.attachments,
        // The database trigger recomputes this on write; seeding it here keeps
        // the optimistic client value and the stored one identical.
        wordCount: countWords(body.body),
      },
    });

    return { note: toNoteDto(note) };
  },
});
