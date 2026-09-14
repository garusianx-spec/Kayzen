import { toFinancialBoxDto, toTransactionDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { ApiError } from '@/lib/errors';
import { updateFinancialBoxSchema, uuidSchema } from '@/lib/validation/schemas';
import type { FinancialBoxDto, FinancialTransactionDto } from '@/types/domain';
import type { z } from 'zod';

/** `GET|PATCH|DELETE /api/v1/finance/boxes/:id`. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type UpdateBoxInput = z.infer<typeof updateFinancialBoxSchema>;

export const GET = withAuthedRoute<
  undefined,
  undefined,
  { box: FinancialBoxDto; transactions: FinancialTransactionDto[] }
>({
  rateLimit: 'read',
  handler: async ({ params, user, db }) => {
    const id = uuidSchema.parse(params.id);

    const box = await db.financialBox.findUnique({
      where: { id },
      include: { transactions: { orderBy: { occurredAt: 'desc' }, take: 50 } },
    });

    if (!box) throw ApiError.notFound('صندوق موردنظر پیدا نشد.');

    return {
      box: toFinancialBoxDto(box, { timezone: user.timezone }),
      transactions: box.transactions.map(toTransactionDto),
    };
  },
});

export const PATCH = withAuthedRoute<UpdateBoxInput, undefined, { box: FinancialBoxDto }>({
  bodySchema: updateFinancialBoxSchema,
  rateLimit: 'mutation',
  handler: async ({ body, params, user, db }) => {
    const id = uuidSchema.parse(params.id);

    const existing = await db.financialBox.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('صندوق موردنظر پیدا نشد.');

    const box = await db.financialBox.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.targetAmount !== undefined ? { targetAmount: body.targetAmount } : {}),
        ...(body.currency !== undefined ? { currency: body.currency } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.colorToken !== undefined ? { colorToken: body.colorToken } : {}),
        ...(body.icon !== undefined ? { icon: body.icon } : {}),
        ...(body.deadlineAt !== undefined ? { deadlineAt: body.deadlineAt } : {}),
        ...(body.archived !== undefined ? { archivedAt: body.archived ? new Date() : null } : {}),
      },
    });

    return { box: toFinancialBoxDto(box, { timezone: user.timezone }) };
  },
});

export const DELETE = withAuthedRoute<undefined, undefined, { id: string }>({
  rateLimit: 'mutation',
  handler: async ({ params, db }) => {
    const id = uuidSchema.parse(params.id);

    const deleted = await db.financialBox.deleteMany({ where: { id } });
    if (deleted.count === 0) throw ApiError.notFound('صندوق موردنظر پیدا نشد.');

    return { id };
  },
});
