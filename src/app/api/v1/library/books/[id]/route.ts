import { toUserBookDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { ApiError } from '@/lib/errors';
import { updateBookSchema, uuidSchema, type UpdateBookInput } from '@/lib/validation/schemas';
import type { UserBookDto } from '@/types/domain';

/** `PATCH|DELETE /api/v1/library/books/:id`. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = withAuthedRoute<UpdateBookInput, undefined, { book: UserBookDto }>({
  bodySchema: updateBookSchema,
  rateLimit: 'mutation',
  handler: async ({ body, params, db }) => {
    const id = uuidSchema.parse(params.id);

    // RLS would already hide another tenant's row; reading first turns a
    // cross-tenant write into a clean 404 instead of a Prisma exception.
    const existing = await db.userBook.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('این کتاب در قفسه‌ات نیست.');

    const totalPages = body.totalPages ?? existing.totalPages;
    const currentPage = body.currentPage ?? existing.currentPage;

    // Shrinking the page count under the bookmark is the one edit that can
    // produce an impossible book, so it is refused rather than clamped: the
    // reader mistyped one of two numbers and only they know which.
    if (currentPage > totalPages) {
      throw ApiError.unprocessable('صفحهٔ فعلی از تعداد کل صفحه‌ها بیشتر است.', {
        currentPage: ['صفحهٔ فعلی نمی‌تواند از کل صفحه‌ها بیشتر باشد.'],
      });
    }

    const reachedTheEnd = body.currentPage !== undefined && currentPage >= totalPages;
    const finished = body.finished ?? (reachedTheEnd ? true : undefined);

    const book = await db.userBook.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.author !== undefined ? { author: body.author || null } : {}),
        ...(body.totalPages !== undefined ? { totalPages } : {}),
        ...(body.currentPage !== undefined ? { currentPage } : {}),
        ...(body.colorToken !== undefined ? { colorToken: body.colorToken } : {}),
        // Reopening keeps the bookmark: "I marked this done too early" is a
        // different sentence from "I want to read it again from page one".
        ...(finished === true ? { finishedAt: existing.finishedAt ?? new Date() } : {}),
        ...(finished === false ? { finishedAt: null } : {}),
      },
    });

    return { book: toUserBookDto(book) };
  },
});

export const DELETE = withAuthedRoute<undefined, undefined, { id: string }>({
  rateLimit: 'mutation',
  handler: async ({ params, db }) => {
    const id = uuidSchema.parse(params.id);

    // The sessions survive with `bookId` set to null (see the schema): the
    // minutes were really read, and deleting a book should not rewrite the
    // reader's streak.
    const deleted = await db.userBook.deleteMany({ where: { id } });
    if (deleted.count === 0) throw ApiError.notFound('این کتاب در قفسه‌ات نیست.');

    return { id };
  },
});
