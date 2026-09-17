import type { Prisma } from '@prisma/client';

import type { ChecklistItemInput } from '../validation/schemas';

/**
 * The detail a task carries beyond its own columns.
 *
 * One definition of "loaded with everything", used by every route that returns
 * a task the composer can open. Without it, `include` drifts between the
 * create, update and list handlers and a field quietly stops arriving on one
 * of them.
 */
export const TASK_DETAIL_INCLUDE = {
  category: true,
  checklist: { orderBy: { position: 'asc' } },
  attachments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.TaskInclude;

/**
 * Turns the client's checklist into the rows that should exist.
 *
 * The whole list is replaced on every write. A checklist is a handful of short
 * lines that are always edited together, so per-item endpoints would buy
 * nothing but a reconciliation bug — and "delete the third line, rename the
 * first" is one intent, which should be one request.
 *
 * `completedAt` is preserved for lines that were already ticked: re-saving a
 * task must not quietly reset when its sub-tasks were finished.
 */
export function checklistWrite(
  items: ChecklistItemInput[],
  existing: Array<{ id: string; completedAt: Date | null }>,
  userId: string,
  now: Date = new Date(),
): Prisma.TaskChecklistItemCreateManyTaskInput[] {
  const previous = new Map(existing.map((item) => [item.id, item.completedAt]));

  return items.map((item, index) => ({
    userId,
    title: item.title,
    position: index,
    completedAt: item.completed ? (item.id ? (previous.get(item.id) ?? now) : now) : null,
  }));
}
