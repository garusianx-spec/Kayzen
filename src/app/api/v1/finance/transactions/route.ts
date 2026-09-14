import { toFinancialBoxDto, toTransactionDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { ApiError } from '@/lib/errors';
import {
  createTransactionSchema,
  uuidSchema,
  type CreateTransactionInput,
} from '@/lib/validation/schemas';
import type { FinancialBoxDto, FinancialTransactionDto } from '@/types/domain';
import { z } from 'zod';

/**
 * `POST /api/v1/finance/transactions` — deposit or withdraw.
 *
 * The box's `current_amount` is *not* written here: an `after insert` trigger
 * recomputes it from the ledger (see `0003_domain_triggers.sql`), so the cached
 * balance cannot drift from the transactions that produced it no matter which
 * code path writes one. The row is re-read afterwards to return the new balance.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const listQuerySchema = z.object({
  boxId: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

type ListQuery = z.infer<typeof listQuerySchema>;

export const GET = withAuthedRoute<
  undefined,
  ListQuery,
  { transactions: FinancialTransactionDto[] }
>({
  querySchema: listQuerySchema,
  rateLimit: 'read',
  handler: async ({ query, user, db }) => {
    const transactions = await db.financialTransaction.findMany({
      where: { userId: user.id, ...(query.boxId ? { boxId: query.boxId } : {}) },
      orderBy: { occurredAt: 'desc' },
      take: query.limit,
    });

    return { transactions: transactions.map(toTransactionDto) };
  },
});

export const POST = withAuthedRoute<
  CreateTransactionInput,
  undefined,
  { transaction: FinancialTransactionDto; box: FinancialBoxDto }
>({
  bodySchema: createTransactionSchema,
  rateLimit: 'mutation',
  handler: async ({ body, user, db }) => {
    const box = await db.financialBox.findUnique({ where: { id: body.boxId } });
    if (!box) throw ApiError.notFound('صندوق موردنظر پیدا نشد.');

    if (body.type === 'WITHDRAWAL' && box.currentAmount.toNumber() < body.amount) {
      throw ApiError.unprocessable('موجودی صندوق کافی نیست.', {
        amount: ['موجودی صندوق کافی نیست.'],
      });
    }

    const transaction = await db.financialTransaction.create({
      data: {
        boxId: body.boxId,
        userId: user.id,
        amount: body.amount,
        type: body.type,
        note: body.note ?? null,
        ...(body.occurredAt ? { occurredAt: body.occurredAt } : {}),
      },
    });

    const updatedBox = await db.financialBox.findUniqueOrThrow({ where: { id: body.boxId } });

    return {
      transaction: toTransactionDto(transaction),
      box: toFinancialBoxDto(updatedBox, { timezone: user.timezone }),
    };
  },
});
