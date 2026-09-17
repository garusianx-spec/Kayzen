import { toTaskCategoryDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { ApiError } from '@/lib/errors';
import { taskCategorySchema, type TaskCategoryInput } from '@/lib/validation/schemas';
import type { TaskCategoryDto } from '@/types/domain';

/**
 * `GET|POST /api/v1/tasks/categories` — the user's own task labels.
 *
 * Their own table rather than a string on the task, so renaming "کار" to
 * "دفتر" is one update instead of a rewrite of every row that happens to carry
 * the old spelling — and so a colour can change without touching tasks at all.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuthedRoute<undefined, undefined, { categories: TaskCategoryDto[] }>({
  rateLimit: 'read',
  handler: async ({ user, db }) => {
    const categories = await db.taskCategory.findMany({
      where: { userId: user.id },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });

    return { categories: categories.map(toTaskCategoryDto) };
  },
});

export const POST = withAuthedRoute<TaskCategoryInput, undefined, { category: TaskCategoryDto }>({
  bodySchema: taskCategorySchema,
  rateLimit: 'mutation',
  handler: async ({ body, user, db }) => {
    const clash = await db.taskCategory.findFirst({
      where: { userId: user.id, title: body.title },
      select: { id: true },
    });

    // The unique index would catch this, but a 409 with the field named is a
    // form error the composer can render next to the input.
    if (clash) {
      throw ApiError.validation(
        { title: ['دسته‌ای با این نام دارید.'] },
        'این دسته از قبل وجود دارد.',
      );
    }

    const last = await db.taskCategory.findFirst({
      where: { userId: user.id },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    const category = await db.taskCategory.create({
      data: {
        userId: user.id,
        title: body.title,
        colorToken: body.colorToken,
        icon: body.icon ?? null,
        position: (last?.position ?? -1) + 1,
      },
    });

    return { category: toTaskCategoryDto(category) };
  },
});
