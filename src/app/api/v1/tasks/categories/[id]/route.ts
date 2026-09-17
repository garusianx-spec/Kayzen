import { toTaskCategoryDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { ApiError } from '@/lib/errors';
import {
  updateTaskCategorySchema,
  uuidSchema,
  type UpdateTaskCategoryInput,
} from '@/lib/validation/schemas';
import type { TaskCategoryDto } from '@/types/domain';

/** `PATCH|DELETE /api/v1/tasks/categories/:id` — rename, recolour, remove. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = withAuthedRoute<
  UpdateTaskCategoryInput,
  undefined,
  { category: TaskCategoryDto }
>({
  bodySchema: updateTaskCategorySchema,
  rateLimit: 'mutation',
  handler: async ({ body, params, user, db }) => {
    const id = uuidSchema.parse(params.id);

    const existing = await db.taskCategory.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('دسته پیدا نشد.');

    if (body.title && body.title !== existing.title) {
      const clash = await db.taskCategory.findFirst({
        where: { userId: user.id, title: body.title, id: { not: id } },
        select: { id: true },
      });

      if (clash) {
        throw ApiError.validation(
          { title: ['دسته‌ای با این نام دارید.'] },
          'این دسته از قبل وجود دارد.',
        );
      }
    }

    const category = await db.taskCategory.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.colorToken !== undefined ? { colorToken: body.colorToken } : {}),
        ...(body.icon !== undefined ? { icon: body.icon } : {}),
      },
    });

    return { category: toTaskCategoryDto(category) };
  },
});

export const DELETE = withAuthedRoute<undefined, undefined, { id: string }>({
  rateLimit: 'mutation',
  handler: async ({ params, db }) => {
    const id = uuidSchema.parse(params.id);

    // `on delete set null` on the task's foreign key: deleting a label removes
    // the label, never the work filed under it.
    const deleted = await db.taskCategory.deleteMany({ where: { id } });
    if (deleted.count === 0) throw ApiError.notFound('دسته پیدا نشد.');

    return { id };
  },
});
