import { beforeEach, describe, expect, it } from 'vitest';

import { createMemoryClient } from '@/lib/db/memory/client';
import { MemoryStore } from '@/lib/db/memory/engine';
import { seedMemoryStore, DEMO_PHONE } from '@/lib/db/memory/seed';
import { usesMemoryDatabase } from '@/lib/env';

/**
 * The development database that needs no database.
 *
 * What is worth asserting here is not "does it store a row" — that much is
 * obvious the first time the app runs. It is the handful of places where a fake
 * usually diverges from Postgres quietly: unique constraints it does not
 * enforce, a Decimal column that comes back as a plain number, an `upsert` that
 * inserts a duplicate instead of updating. Every one of those looks fine in
 * development and fails on the first real deployment.
 */

describe('when the memory database is used', () => {
  it('never in production', () => {
    expect(usesMemoryDatabase({ NODE_ENV: 'production' })).toBe(false);
    expect(usesMemoryDatabase({ NODE_ENV: 'production', DEV_DATABASE: 'memory' })).toBe(false);
  });

  it('by default when there is no DATABASE_URL to connect to', () => {
    expect(usesMemoryDatabase({ NODE_ENV: 'development' })).toBe(true);
    expect(usesMemoryDatabase({ NODE_ENV: 'development', DATABASE_URL: '   ' })).toBe(true);
    expect(usesMemoryDatabase({ NODE_ENV: 'development', DATABASE_URL: 'postgresql://x/y' })).toBe(
      false,
    );
  });

  it('or when asked for explicitly, either way', () => {
    expect(
      usesMemoryDatabase({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://unreachable/db',
        DEV_DATABASE: 'memory',
      }),
    ).toBe(true);

    expect(usesMemoryDatabase({ NODE_ENV: 'development', DEV_DATABASE: 'postgres' })).toBe(false);
  });
});

describe('memory store', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it('applies the defaults declared in the schema', () => {
    const user = store.create('User', { data: { phone: '+989120000001' } });

    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(user.theme).toBe('DARK');
    expect(user.points).toBe(0);
    expect(user.createdAt).toBeInstanceOf(Date);
    // Absent columns are present and null rather than missing, so `select`
    // behaves the way it does against a real row.
    expect(user.name).toBeNull();
  });

  it('rejects an unknown column instead of inventing one', () => {
    expect(() => store.create('User', { data: { phone: '+989120000002', nickname: 'x' } })).toThrow(
      /unknown field User.nickname/,
    );
  });

  it('enforces unique and composite-unique constraints', () => {
    store.create('User', { data: { phone: '+989120000003' } });

    // Without this the fake would hold two accounts on one number, and the
    // sign-up path that leans on the constraint would only fail in production.
    expect(() => store.create('User', { data: { phone: '+989120000003' } })).toThrow(
      /P2002|Unique/,
    );

    const user = store.create('User', { data: { phone: '+989120000004' } });
    const book = store.create('Book365', {
      data: {
        dayNumber: 1,
        title: 't',
        titleFa: 't',
        author: 'a',
        authorFa: 'a',
        category: 'c',
        summaryFa: 's',
        reflectionPrompt: 'p',
      },
    });

    store.create('UserReadingLog', { data: { userId: user.id, bookId: book.id, dayNumber: 1 } });
    expect(() =>
      store.create('UserReadingLog', { data: { userId: user.id, bookId: book.id, dayNumber: 1 } }),
    ).toThrow(/P2002|Unique/);
  });

  it('gives a Decimal column the type Prisma would return', async () => {
    const user = store.create('User', { data: { phone: '+989120000005' } });
    const box = store.create('FinancialBox', {
      data: { userId: user.id, title: 'x', targetAmount: 1_000 },
    });

    // The DTOs call `.toNumber()`; a plain JavaScript number here would work
    // until the first screen that rendered money.
    expect(typeof (box.targetAmount as { toNumber?: unknown }).toNumber).toBe('function');
    expect((box.targetAmount as { toNumber: () => number }).toNumber()).toBe(1_000);
  });

  it('filters, orders and paginates', () => {
    const user = store.create('User', { data: { phone: '+989120000006' } });

    for (const [index, title] of ['aa', 'bb', 'cc', 'dd'].entries()) {
      store.create('Task', { data: { userId: user.id, title, position: index } });
    }

    const found = store.find('Task', {
      where: { userId: user.id, position: { gte: 1 } },
      orderBy: { position: 'desc' },
      take: 2,
    });

    expect(found.map((row) => row.title)).toEqual(['dd', 'cc']);
    expect(store.count('Task', { where: { title: { contains: 'a' } } })).toBe(1);
  });

  it('resolves both sides of a relation', () => {
    const user = store.create('User', { data: { phone: '+989120000007' } });
    store.create('Task', { data: { userId: user.id, title: 'one' } });
    store.create('Task', { data: { userId: user.id, title: 'two' } });

    const [withTasks] = store.find('User', {
      where: { id: user.id },
      include: { tasks: true },
    });
    expect((withTasks?.tasks as unknown[]).length).toBe(2);

    const [withOwner] = store.find('Task', { where: { title: 'one' }, include: { user: true } });
    expect((withOwner?.user as { phone: string }).phone).toBe('+989120000007');
  });

  it('applies atomic increments without losing a Decimal', () => {
    const user = store.create('User', { data: { phone: '+989120000008', points: 10 } });
    store.update('User', { where: { id: user.id }, data: { points: { increment: 5 } } });
    expect(store.find('User', { where: { id: user.id } })[0]?.points).toBe(15);

    const box = store.create('FinancialBox', {
      data: { userId: user.id, title: 'x', targetAmount: 100, currentAmount: 10 },
    });
    store.update('FinancialBox', {
      where: { id: box.id },
      data: { currentAmount: { increment: 15 } },
    });

    const updated = store.find('FinancialBox', { where: { id: box.id } })[0];
    expect((updated?.currentAmount as { toNumber: () => number }).toNumber()).toBe(25);
  });
});

/**
 * The client's index signature is `unknown`, because a generated Prisma client's
 * shape cannot be expressed for models the DMMF only knows at runtime. These
 * two aliases narrow it for the tests without reaching for `Function`.
 */
interface Delegate {
  create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  upsert: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  findMany: (args?: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
  count: (args?: Record<string, unknown>) => Promise<number>;
}

interface Client {
  user: Delegate;
  book365: Delegate;
  userReadingLog: Delegate;
  $transaction: (work: unknown) => Promise<unknown>;
}

describe('memory client', () => {
  it('upserts on a composite key rather than inserting twice', async () => {
    const client = createMemoryClient() as unknown as Client;

    const user = await client.user.create({ data: { phone: '+989120000009' } });
    const book = await client.book365.create({
      data: {
        dayNumber: 2,
        title: 't',
        titleFa: 't',
        author: 'a',
        authorFa: 'a',
        category: 'c',
        summaryFa: 's',
        reflectionPrompt: 'p',
      },
    });

    const where = { userId_bookId: { userId: user.id, bookId: book.id } };

    await client.userReadingLog.upsert({
      where,
      create: { dayNumber: 2, rating: 3 },
      update: { rating: 3 },
    });
    await client.userReadingLog.upsert({
      where,
      create: { dayNumber: 2, rating: 5 },
      update: { rating: 5 },
    });

    expect(await client.userReadingLog.count({})).toBe(1);
    const [log] = await client.userReadingLog.findMany({});
    expect(log?.rating).toBe(5);
  });

  it('runs $transaction in both of the shapes the app uses', async () => {
    const client = createMemoryClient() as unknown as Client;

    await client.$transaction(async (tx: Client) => {
      await tx.user.create({ data: { phone: '+989120000010' } });
    });

    await client.$transaction([client.user.create({ data: { phone: '+989120000011' } })]);

    expect(await client.user.count({})).toBe(2);
  });

  it('seeds a demo account that can actually sign in', async () => {
    const store = new MemoryStore();
    await seedMemoryStore(store);

    const [demo] = store.find('User', { where: { phone: DEMO_PHONE } });
    expect(demo).toBeDefined();
    // Hashed, never stored in the clear, exactly as the real sign-up path does.
    expect(String(demo?.passwordHash)).toMatch(/^scrypt\$/);
    expect(demo?.phoneVerifiedAt).toBeInstanceOf(Date);

    // The library is global reference data; without it the library screens have
    // nothing to render and look broken rather than empty.
    expect(store.count('Book365')).toBeGreaterThan(0);
    expect(store.count('Task', { where: { userId: demo?.id } })).toBeGreaterThan(0);
  });
});
