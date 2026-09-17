import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';

/**
 * A minimal query engine over plain arrays.
 *
 * Every model, field, default, unique constraint and relation is read from
 * Prisma's own DMMF — the metadata the client generates from `schema.prisma` —
 * so this cannot drift from the schema the way a hand-written set of fixtures
 * would. Adding a column to `schema.prisma` and regenerating is enough.
 *
 * It implements the operations this application actually issues, and throws on
 * everything else rather than guessing. A mock that silently returns `[]` for a
 * query it does not understand is worse than no mock at all: the screen renders,
 * looks empty, and nobody can tell whether that is the data or the fake.
 */

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const MODELS = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));

type Model = (typeof Prisma.dmmf.datamodel.models)[number];
type Field = Model['fields'][number];

function modelOrThrow(name: string): Model {
  const model = MODELS.get(name);
  if (!model) throw new Error(`memory database: unknown model ${name}`);
  return model;
}

function fieldsOf(model: Model): Map<string, Field> {
  return new Map(model.fields.map((field) => [field.name, field]));
}

// --- comparison -------------------------------------------------------------

function normalise(value: unknown): unknown {
  if (value instanceof Date) return value.getTime();
  if (Prisma.Decimal.isDecimal(value)) return value.toNumber();
  if (typeof value === 'bigint') return Number(value);

  return value;
}

function equal(left: unknown, right: unknown): boolean {
  const a = normalise(left);
  const b = normalise(right);

  if (a === null || a === undefined) return b === null || b === undefined;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => equal(item, b[index]));
  }

  return a === b;
}

function compare(left: unknown, right: unknown): number {
  const a = normalise(left);
  const b = normalise(right);

  // Nulls sort last, matching Postgres's default for ascending order.
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;

  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);

  return String(a).localeCompare(String(b));
}

const SCALAR_OPERATORS = new Set([
  'equals',
  'not',
  'in',
  'notIn',
  'lt',
  'lte',
  'gt',
  'gte',
  'contains',
  'startsWith',
  'endsWith',
  'has',
  'hasSome',
  'hasEvery',
  'isEmpty',
  'mode',
]);

function isOperatorObject(condition: unknown): condition is Record<string, unknown> {
  return (
    typeof condition === 'object' &&
    condition !== null &&
    !(condition instanceof Date) &&
    !Array.isArray(condition) &&
    Object.keys(condition).every((key) => SCALAR_OPERATORS.has(key))
  );
}

function matchesScalar(value: unknown, condition: unknown): boolean {
  if (!isOperatorObject(condition)) return equal(value, condition);

  for (const [operator, operand] of Object.entries(condition)) {
    if (operand === undefined) continue;

    switch (operator) {
      case 'mode':
        break;
      case 'equals':
        if (!equal(value, operand)) return false;
        break;
      case 'not':
        if (isOperatorObject(operand) ? matchesScalar(value, operand) : equal(value, operand)) {
          return false;
        }
        break;
      case 'in':
        if (!(operand as unknown[]).some((item) => equal(value, item))) return false;
        break;
      case 'notIn':
        if ((operand as unknown[]).some((item) => equal(value, item))) return false;
        break;
      case 'lt':
        if (!(compare(value, operand) < 0)) return false;
        break;
      case 'lte':
        if (!(compare(value, operand) <= 0)) return false;
        break;
      case 'gt':
        if (!(compare(value, operand) > 0)) return false;
        break;
      case 'gte':
        if (!(compare(value, operand) >= 0)) return false;
        break;
      case 'contains':
        if (!String(value ?? '').includes(String(operand))) return false;
        break;
      case 'startsWith':
        if (!String(value ?? '').startsWith(String(operand))) return false;
        break;
      case 'endsWith':
        if (!String(value ?? '').endsWith(String(operand))) return false;
        break;
      case 'has':
        if (!((value as unknown[]) ?? []).some((item) => equal(item, operand))) return false;
        break;
      case 'hasSome':
        if (
          !(operand as unknown[]).some((wanted) =>
            ((value as unknown[]) ?? []).some((item) => equal(item, wanted)),
          )
        ) {
          return false;
        }
        break;
      case 'hasEvery':
        if (
          !(operand as unknown[]).every((wanted) =>
            ((value as unknown[]) ?? []).some((item) => equal(item, wanted)),
          )
        ) {
          return false;
        }
        break;
      case 'isEmpty':
        if ((((value as unknown[]) ?? []).length === 0) !== operand) return false;
        break;
      default:
        throw new Error(`memory database: unsupported filter "${operator}"`);
    }
  }

  return true;
}

/**
 * Expands a composite-unique selector.
 *
 * Prisma addresses `@@unique([userId, bookId])` as `{ userId_bookId: {…} }`,
 * which is not a field name; the parts are lifted back out into ordinary
 * equality checks.
 */
function expandCompositeKey(model: Model, key: string, value: unknown): Where | null {
  const match = model.uniqueFields.find((group) => group.join('_') === key);
  if (!match) return null;

  const parts = value as Record<string, unknown>;
  return Object.fromEntries(match.map((name) => [name, parts[name]]));
}

function matchesWhere(row: Row, where: Where | undefined, model: Model): boolean {
  if (!where) return true;

  const fields = fieldsOf(model);

  for (const [key, condition] of Object.entries(where)) {
    if (condition === undefined) continue;

    if (key === 'AND') {
      const clauses = Array.isArray(condition) ? condition : [condition];
      if (!clauses.every((clause) => matchesWhere(row, clause as Where, model))) return false;
      continue;
    }

    if (key === 'OR') {
      const clauses = condition as Where[];
      if (!clauses.some((clause) => matchesWhere(row, clause, model))) return false;
      continue;
    }

    if (key === 'NOT') {
      const clauses = Array.isArray(condition) ? condition : [condition];
      if (clauses.some((clause) => matchesWhere(row, clause as Where, model))) return false;
      continue;
    }

    const field = fields.get(key);

    if (!field) {
      const expanded = expandCompositeKey(model, key, condition);
      if (!expanded) throw new Error(`memory database: unknown field ${model.name}.${key}`);
      if (!matchesWhere(row, expanded, model)) return false;
      continue;
    }

    if (field.kind === 'object') {
      throw new Error(
        `memory database: filtering by the relation ${model.name}.${key} is not implemented`,
      );
    }

    if (!matchesScalar(row[key], condition)) return false;
  }

  return true;
}

// --- writes -----------------------------------------------------------------

/**
 * Gives a written value the runtime type Prisma would hand back.
 *
 * A `@db.Decimal` column arrives from Postgres as a `Prisma.Decimal`, and the
 * DTOs call `.toNumber()` on it. Storing a plain JavaScript number here would
 * work right up until a screen rendered money — which is exactly the class of
 * difference a fake database must not have.
 */
function coerce(field: Field, value: unknown): unknown {
  if (value === null || value === undefined) return value;

  switch (field.type) {
    case 'Decimal':
      return Prisma.Decimal.isDecimal(value) ? value : new Prisma.Decimal(value as number);
    case 'BigInt':
      return typeof value === 'bigint' ? value : BigInt(value as number);
    case 'DateTime':
      return value instanceof Date ? value : new Date(value as string);
    default:
      return value;
  }
}

function defaultValue(field: Field): unknown {
  const specification = field.default;

  if (specification && typeof specification === 'object' && 'name' in specification) {
    switch (specification.name) {
      case 'uuid':
      case 'cuid':
        return randomUUID();
      case 'now':
        return new Date();
      case 'autoincrement':
        throw new Error('memory database: autoincrement columns are not implemented');
      default:
        throw new Error(`memory database: unsupported default ${String(specification.name)}`);
    }
  }

  return Array.isArray(specification) ? [...specification] : specification;
}

function applyDefaults(model: Model, data: Row): Row {
  const row: Row = { ...data };
  const known = fieldsOf(model);

  // Prisma rejects an unknown column outright; so does this, or a typo in a
  // seed would become a field that exists only in development.
  for (const key of Object.keys(data)) {
    if (!known.has(key)) throw new Error(`memory database: unknown field ${model.name}.${key}`);
  }

  for (const field of model.fields) {
    // Relation keys are lifted out by `splitNestedWrites` before this runs.
    if (field.kind === 'object') continue;

    if (field.isUpdatedAt) {
      row[field.name] = new Date();
      continue;
    }

    if (row[field.name] !== undefined) continue;

    if (field.hasDefaultValue) {
      row[field.name] = coerce(field, defaultValue(field));
      continue;
    }

    // Every column exists on every row, so a `select` cannot accidentally
    // distinguish "never set" from "set to null" the way `undefined` would.
    row[field.name] = field.isList ? [] : null;
  }

  for (const field of model.fields) {
    if (field.kind !== 'object' && !field.isList) {
      row[field.name] = coerce(field, row[field.name]);
    }
  }

  return row;
}

/** The wrappers Prisma uses for an in-place change to a column's value. */
const ATOMIC_OPERATIONS = new Set(['set', 'increment', 'decrement', 'multiply', 'divide', 'push']);

/**
 * Distinguishes `{ increment: 5 }` from a value that merely happens to be an
 * object.
 *
 * A `Json` column holds arbitrary objects, and `{ visible: [...] }` — the home
 * layout — is one of them. Treating every object as an operation wrapper made
 * saving that layout throw, which is the memory database doing its job (it
 * refuses what it does not understand rather than writing something else) but
 * is still a hole in what it understands.
 *
 * Two conditions, both required: the field must not be `Json`, and every key
 * must be an operation name. Either alone would misfire — a `Json` column can
 * legitimately contain a key called `set`.
 */
function isAtomicUpdate(field: Field, value: unknown): boolean {
  if (field.type === 'Json') return false;
  if (typeof value !== 'object' || value === null) return false;
  if (value instanceof Date || Array.isArray(value)) return false;

  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => ATOMIC_OPERATIONS.has(key));
}

/**
 * The atomic number updates, preserving a Decimal column's type.
 *
 * `Number(decimal)` happens to work through `valueOf`, but relying on that would
 * turn a money column into a float on the first `increment` — the difference
 * only shows up once someone compares a balance against a real database.
 */
function arithmetic(current: unknown, operand: unknown, sign: 1 | -1): unknown {
  const result = Number(normalise(current) ?? 0) + sign * Number(normalise(operand) ?? 0);
  return Prisma.Decimal.isDecimal(current) ? new Prisma.Decimal(result) : result;
}

function scale(current: unknown, operand: unknown, mode: 'multiply' | 'divide'): unknown {
  const base = Number(normalise(current) ?? 0);
  const factor = Number(normalise(operand) ?? 1);
  const result = mode === 'multiply' ? base * factor : base / factor;

  return Prisma.Decimal.isDecimal(current) ? new Prisma.Decimal(result) : result;
}

function applyUpdate(model: Model, row: Row, data: Row): Row {
  const next: Row = { ...row };
  const fields = fieldsOf(model);

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;

    const field = fields.get(key);
    if (!field) throw new Error(`memory database: unknown field ${model.name}.${key}`);
    if (field.kind === 'object') continue;

    if (isAtomicUpdate(field, value)) {
      const operation = value as Record<string, unknown>;

      if ('set' in operation) next[key] = operation.set;
      else if ('increment' in operation) next[key] = arithmetic(next[key], operation.increment, 1);
      else if ('decrement' in operation) next[key] = arithmetic(next[key], operation.decrement, -1);
      else if ('multiply' in operation)
        next[key] = scale(next[key], operation.multiply, 'multiply');
      else if ('divide' in operation) next[key] = scale(next[key], operation.divide, 'divide');
      else if ('push' in operation) {
        next[key] = [
          ...((next[key] as unknown[]) ?? []),
          ...(Array.isArray(operation.push) ? operation.push : [operation.push]),
        ];
      } else throw new Error(`memory database: unsupported update on ${model.name}.${key}`);

      continue;
    }

    next[key] = value;
  }

  for (const field of model.fields) {
    if (field.isUpdatedAt) next[field.name] = new Date();
    else if (field.kind !== 'object' && !field.isList && field.name in data) {
      next[field.name] = coerce(field, next[field.name]);
    }
  }

  return next;
}

/**
 * Separates a write's own columns from writes through its relations.
 *
 * Prisma lets one call create a task and its checklist together. The store
 * keeps one array per model, so the nested half is applied as a second pass
 * once the parent exists and its id is known.
 */
function splitNestedWrites(
  model: Model,
  data: Row,
): { own: Row; nested: Array<{ field: Field; operations: Row }> } {
  const fields = fieldsOf(model);
  const own: Row = {};
  const nested: Array<{ field: Field; operations: Row }> = [];

  for (const [key, value] of Object.entries(data)) {
    const field = fields.get(key);

    if (field?.kind === 'object' && value !== undefined) {
      nested.push({ field, operations: value as Row });
      continue;
    }

    own[key] = value;
  }

  return { own, nested };
}

// --- reads ------------------------------------------------------------------

export interface FindArgs {
  where?: Where;
  orderBy?: Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>;
  take?: number;
  skip?: number;
  cursor?: Record<string, unknown>;
  select?: Record<string, unknown>;
  include?: Record<string, unknown>;
}

function sortRows(rows: Row[], orderBy: FindArgs['orderBy']): Row[] {
  if (!orderBy) return rows;

  const clauses = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((clause) =>
    Object.entries(clause),
  );

  return [...rows].sort((left, right) => {
    for (const [field, direction] of clauses) {
      const result = compare(left[field], right[field]);
      if (result !== 0) return direction === 'desc' ? -result : result;
    }

    return 0;
  });
}

export class MemoryStore {
  /** One array per model, keyed by model name. */
  private readonly tables = new Map<string, Row[]>();

  rows(modelName: string): Row[] {
    const existing = this.tables.get(modelName);
    if (existing) return existing;

    const created: Row[] = [];
    this.tables.set(modelName, created);
    return created;
  }

  /** Every row of every model, for the seed helper and for tests. */
  clear(): void {
    this.tables.clear();
  }

  find(modelName: string, args: FindArgs = {}): Row[] {
    const model = modelOrThrow(modelName);
    let rows = this.rows(modelName).filter((row) => matchesWhere(row, args.where, model));

    rows = sortRows(rows, args.orderBy);

    if (args.cursor) {
      const [cursorField, cursorValue] = Object.entries(args.cursor)[0] as [string, unknown];
      const index = rows.findIndex((row) => equal(row[cursorField], cursorValue));
      if (index >= 0) rows = rows.slice(index);
    }

    if (args.skip) rows = rows.slice(args.skip);
    if (args.take !== undefined) rows = rows.slice(0, args.take);

    return rows.map((row) => this.project(modelName, row, args));
  }

  /**
   * Applies `select` and `include`.
   *
   * Relations are resolved from the DMMF: a to-one relation reads the foreign
   * key off this row, a to-many finds the back-relation field on the other model
   * and matches against it.
   */
  project(
    modelName: string,
    row: Row,
    args: { select?: Record<string, unknown>; include?: Record<string, unknown> },
  ): Row {
    const model = modelOrThrow(modelName);
    const fields = fieldsOf(model);

    const relationArgs = { ...(args.include ?? {}), ...(args.select ?? {}) };
    let result: Row;

    if (args.select) {
      result = {};
      for (const [key, wanted] of Object.entries(args.select)) {
        if (!wanted) continue;
        const field = fields.get(key);
        if (field && field.kind !== 'object') result[key] = row[key];
      }
    } else {
      result = { ...row };
      for (const field of model.fields) {
        if (field.kind === 'object') delete result[field.name];
      }
    }

    for (const [key, wanted] of Object.entries(relationArgs)) {
      if (!wanted) continue;
      const field = fields.get(key);
      if (!field || field.kind !== 'object') continue;

      const nested = typeof wanted === 'object' ? (wanted as FindArgs) : {};
      result[key] = this.resolveRelation(model, field, row, nested);
    }

    return result;
  }

  private resolveRelation(model: Model, field: Field, row: Row, nested: FindArgs): unknown {
    const target = modelOrThrow(field.type);

    // The side that holds the foreign key names it in `relationFromFields`.
    if (field.relationFromFields && field.relationFromFields.length > 0) {
      const where = Object.fromEntries(
        field.relationFromFields.map((local, index) => [
          (field.relationToFields ?? [])[index] as string,
          row[local],
        ]),
      );

      const [found] = this.find(target.name, { ...nested, where: { ...where, ...nested.where } });
      return found ?? null;
    }

    const back = target.fields.find(
      (candidate) =>
        candidate.relationName === field.relationName &&
        candidate.relationFromFields &&
        candidate.relationFromFields.length > 0,
    );

    if (!back) {
      throw new Error(
        `memory database: cannot resolve ${model.name}.${field.name} — no owning side found`,
      );
    }

    const where = Object.fromEntries(
      (back.relationFromFields ?? []).map((foreign, index) => [
        foreign,
        row[(back.relationToFields ?? [])[index] as string],
      ]),
    );

    const matches = this.find(target.name, { ...nested, where: { ...where, ...nested.where } });
    return field.isList ? matches : (matches[0] ?? null);
  }

  // --- mutations ------------------------------------------------------------

  create(
    modelName: string,
    args: { data: Row; select?: Record<string, unknown>; include?: Record<string, unknown> },
  ): Row {
    const model = modelOrThrow(modelName);
    const { own, nested } = splitNestedWrites(model, args.data);
    const row = applyDefaults(model, own);

    this.assertUnique(model, row, null);
    this.rows(modelName).push(row);

    for (const write of nested) this.applyNested(model, row, write.field, write.operations);

    return this.project(modelName, row, args);
  }

  /**
   * The nested write forms this application issues, and no others.
   *
   * `createMany` and `deleteMany` are what "replace this child list" compiles
   * to; `create` is the single-child form. Anything else throws, for the same
   * reason an unknown filter does: a nested write that is quietly ignored looks
   * exactly like one that worked.
   */
  private applyNested(parent: Model, row: Row, field: Field, operations: Row): void {
    const target = modelOrThrow(field.type);
    const back = target.fields.find(
      (candidate) =>
        candidate.relationName === field.relationName &&
        candidate.relationFromFields &&
        candidate.relationFromFields.length > 0,
    );

    if (!back) {
      throw new Error(
        `memory database: cannot write ${parent.name}.${field.name} — no owning side found`,
      );
    }

    const link = Object.fromEntries(
      (back.relationFromFields ?? []).map((foreign, index) => [
        foreign,
        row[(back.relationToFields ?? [])[index] as string],
      ]),
    );

    for (const [operation, payload] of Object.entries(operations)) {
      if (payload === undefined) continue;

      switch (operation) {
        case 'deleteMany':
          this.deleteMany(target.name, {
            where: { ...link, ...(payload as { where?: Where }).where },
          });
          break;
        case 'createMany': {
          const rows = (payload as { data?: Row | Row[] }).data ?? [];
          for (const child of Array.isArray(rows) ? rows : [rows]) {
            this.create(target.name, { data: { ...child, ...link } });
          }
          break;
        }
        case 'create': {
          const rows = payload as Row | Row[];
          for (const child of Array.isArray(rows) ? rows : [rows]) {
            this.create(target.name, { data: { ...child, ...link } });
          }
          break;
        }
        default:
          throw new Error(
            `memory database: nested "${operation}" on ${parent.name}.${field.name} is not implemented`,
          );
      }
    }
  }

  update(
    modelName: string,
    args: {
      where: Where;
      data: Row;
      select?: Record<string, unknown>;
      include?: Record<string, unknown>;
    },
  ): Row | null {
    const model = modelOrThrow(modelName);
    const rows = this.rows(modelName);
    const index = rows.findIndex((row) => matchesWhere(row, args.where, model));
    if (index < 0) return null;

    const { own, nested } = splitNestedWrites(model, args.data);
    const next = applyUpdate(model, rows[index] as Row, own);
    this.assertUnique(model, next, rows[index] as Row);
    rows[index] = next;

    for (const write of nested) this.applyNested(model, next, write.field, write.operations);

    return this.project(modelName, next, args);
  }

  updateMany(modelName: string, args: { where?: Where; data: Row }): number {
    const model = modelOrThrow(modelName);
    const rows = this.rows(modelName);
    let count = 0;

    for (let index = 0; index < rows.length; index += 1) {
      if (!matchesWhere(rows[index] as Row, args.where, model)) continue;
      rows[index] = applyUpdate(model, rows[index] as Row, args.data);
      count += 1;
    }

    return count;
  }

  delete(modelName: string, args: { where: Where }): Row | null {
    const model = modelOrThrow(modelName);
    const rows = this.rows(modelName);
    const index = rows.findIndex((row) => matchesWhere(row, args.where, model));
    if (index < 0) return null;

    const [removed] = rows.splice(index, 1);
    return removed ?? null;
  }

  deleteMany(modelName: string, args: { where?: Where } = {}): number {
    const model = modelOrThrow(modelName);
    const rows = this.rows(modelName);
    const kept = rows.filter((row) => !matchesWhere(row, args.where, model));
    const removed = rows.length - kept.length;

    rows.length = 0;
    rows.push(...kept);

    return removed;
  }

  count(modelName: string, args: { where?: Where } = {}): number {
    const model = modelOrThrow(modelName);
    return this.rows(modelName).filter((row) => matchesWhere(row, args.where, model)).length;
  }

  /**
   * Enforces `@unique` and `@@unique`.
   *
   * Without this the fake would happily hold two accounts on one phone number,
   * and the sign-up path — which relies on the constraint — would look correct
   * in development and fail the first time it met a real database.
   */
  private assertUnique(model: Model, candidate: Row, replacing: Row | null): void {
    const groups: string[][] = [
      ...model.fields.filter((field) => field.isUnique || field.isId).map((field) => [field.name]),
      ...model.uniqueFields.map((group) => [...group]),
    ];

    for (const group of groups) {
      if (group.some((name) => candidate[name] === null || candidate[name] === undefined)) continue;

      const clash = this.rows(model.name).some(
        (row) => row !== replacing && group.every((name) => equal(row[name], candidate[name])),
      );

      if (clash) {
        throw new Prisma.PrismaClientKnownRequestError(
          `Unique constraint failed on the fields: (\`${group.join('`, `')}\`)`,
          { code: 'P2002', clientVersion: Prisma.prismaVersion.client, meta: { target: group } },
        );
      }
    }
  }
}
