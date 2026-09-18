import { toUserBookDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { sortShelf } from '@/lib/domain/reading-plan';
import { ApiError } from '@/lib/errors';
import { createBookSchema, type CreateBookInput } from '@/lib/validation/schemas';
import type { UserBookDto } from '@/types/domain';

/** `GET|POST /api/v1/library/books` — the reader's own shelf. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** More than a shelf; enough that nobody hits it by reading. */
const MAX_BOOKS = 100;

export const GET = withAuthedRoute<undefined, undefined, { books: UserBookDto[] }>({
  rateLimit: 'read',
  handler: async ({ user, db }) => {
    const books = await db.userBook.findMany({ where: { userId: user.id } });

    return { books: sortShelf(books).map((book) => toUserBookDto(book)) };
  },
});

export const POST = withAuthedRoute<CreateBookInput, undefined, { book: UserBookDto }>({
  bodySchema: createBookSchema,
  rateLimit: 'mutation',
  handler: async ({ body, user, db }) => {
    if (body.currentPage > body.totalPages) {
      throw ApiError.unprocessable('صفحهٔ فعلی از تعداد کل صفحه‌ها بیشتر است.', {
        currentPage: ['صفحهٔ فعلی نمی‌تواند از کل صفحه‌ها بیشتر باشد.'],
      });
    }

    const existing = await db.userBook.count({ where: { userId: user.id } });
    if (existing >= MAX_BOOKS) {
      throw ApiError.unprocessable('قفسه پر است؛ چند کتاب تمام‌شده را حذف کنید.', {
        books: ['حداکثر ۱۰۰ کتاب در قفسه جا می‌شود.'],
      });
    }

    const book = await db.userBook.create({
      data: {
        userId: user.id,
        title: body.title,
        author: body.author || null,
        totalPages: body.totalPages,
        currentPage: body.currentPage,
        colorToken: body.colorToken,
        // A book added at its last page is a book somebody just finished, and
        // asking them to tap "تمامش کردم" afterwards is asking twice.
        finishedAt: body.currentPage >= body.totalPages ? new Date() : null,
      },
    });

    return { book: toUserBookDto(book) };
  },
});
