import { toFinancialBoxDto } from '@/lib/api/dto';
import { withAuthedRoute } from '@/lib/api/handler';
import { createFinancialBoxSchema, type CreateFinancialBoxInput } from '@/lib/validation/schemas';
import type { FinancialBoxDto } from '@/types/domain';

/** `GET /api/v1/finance/boxes` — savings pots, `POST` — create one. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuthedRoute<undefined, undefined, { boxes: FinancialBoxDto[] }>({
  rateLimit: 'read',
  handler: async ({ user, db }) => {
    const boxes = await db.financialBox.findMany({
      where: { userId: user.id, archivedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return {
      boxes: boxes.map((box) => toFinancialBoxDto(box, { timezone: user.timezone })),
    };
  },
});

export const POST = withAuthedRoute<CreateFinancialBoxInput, undefined, { box: FinancialBoxDto }>({
  bodySchema: createFinancialBoxSchema,
  rateLimit: 'mutation',
  handler: async ({ body, user, db }) => {
    const box = await db.financialBox.create({
      data: {
        userId: user.id,
        title: body.title,
        description: body.description ?? null,
        targetAmount: body.targetAmount,
        currency: body.currency,
        category: body.category,
        colorToken: body.colorToken,
        icon: body.icon,
        deadlineAt: body.deadlineAt ?? null,
      },
    });

    return { box: toFinancialBoxDto(box, { timezone: user.timezone }) };
  },
});
