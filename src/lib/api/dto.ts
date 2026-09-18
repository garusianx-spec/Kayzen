import type {
  Book365,
  CountdownEvent,
  FinancialBox,
  FinancialTransaction,
  Habit,
  Note,
  PomodoroSession,
  Task,
  TaskAttachment,
  TaskCategory,
  TaskChecklistItem,
  User,
  UserReadingLog,
} from '@prisma/client';

import { maskPhone } from '../auth/phone';
import { daysUntil, formatRelativeJalali } from '../date/jalali';
import { parseLayout } from '../domain/home-widgets';
import { levelFromPoints } from '../domain/points';
import type { StreakResult } from '../domain/streak-engine';
import type {
  BookDto,
  ColorToken,
  CountdownDto,
  FinancialBoxDto,
  FinancialTransactionDto,
  HabitDto,
  NoteDto,
  PomodoroSessionDto,
  ReadingLogDto,
  SessionUserDto,
  TaskAttachmentLinkDto,
  TaskCategoryDto,
  TaskDto,
} from '@/types/domain';

/** A task row, optionally joined with the detail the composer edits. */
export type TaskWithDetail = Task & {
  category?: TaskCategory | null;
  checklist?: TaskChecklistItem[];
  attachments?: TaskAttachment[];
};

/**
 * Prisma row → wire shape.
 *
 * One conversion layer, used by every route, so that a column rename cannot
 * silently change the API contract and a `Decimal` never reaches `JSON.stringify`
 * (which would serialise it as an object and break every client arithmetic).
 */

const COLOR_TOKENS = new Set<ColorToken>(['violet', 'flame', 'emerald', 'rose', 'sky']);

/** Column values are free text; anything unrecognised falls back to violet. */
function asColorToken(value: string): ColorToken {
  return COLOR_TOKENS.has(value as ColorToken) ? (value as ColorToken) : 'violet';
}

export function toSessionUserDto(user: User): SessionUserDto {
  const level = levelFromPoints(user.points);

  return {
    id: user.id,
    phone: user.phone,
    phoneMasked: maskPhone(user.phone),
    name: user.name,
    avatarUrl: user.avatarUrl,
    timezone: user.timezone,
    dayStartHour: user.dayStartHour,
    theme: user.theme,
    points: user.points,
    level: level.level,
    levelTitle: level.title,
    levelProgress: level.progress,
    ambientEnabled: user.ambientEnabled,
    hapticsEnabled: user.hapticsEnabled,
    notifyAtHour: user.notifyAtHour,
    notifyAtMinute: user.notifyAtMinute,
    onboardedAt: user.onboardedAt?.toISOString() ?? null,
    enrolledAt: user.enrolledAt.toISOString(),
    // A boolean, not the hash: the settings screen needs to say "set" or
    // "change", and the login screen needs to explain why a password failed on
    // an account that has none.
    hasPassword: user.passwordHash !== null,
    // Resolved here rather than on the client, so a layout saved by an older
    // release is cleaned up once, server-side, instead of in every component
    // that reads it.
    homeWidgets: parseLayout(user.homeWidgets),
  };
}

/**
 * A task, with whatever detail was loaded alongside it.
 *
 * The relations are optional on the input because most screens list tasks
 * without them: a day view that eagerly joined every checklist and attachment
 * would pay for detail nobody is looking at. When they are absent the DTO
 * reports empty rather than undefined, so the client never has to distinguish
 * "no sub-tasks" from "not loaded" — the only two states a list renders the
 * same way anyway.
 */
export function toTaskDto(task: TaskWithDetail, now: Date = new Date()): TaskDto {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    dueAt: task.dueAt?.toISOString() ?? null,
    dueJalali: task.dueJalali,
    priority: task.priority,
    difficulty: task.difficulty,
    status: task.status,
    recurrence: task.recurrence,
    estimatedPomodoros: task.estimatedPomodoros,
    tags: task.tags,
    position: task.position,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    isOverdue:
      task.dueAt !== null &&
      task.dueAt < now &&
      task.status !== 'COMPLETED' &&
      task.status !== 'ARCHIVED',
    costAmount: task.costAmount === null ? null : Number(task.costAmount),
    location: task.location,
    remindAt: task.remindAt?.toISOString() ?? null,
    category: task.category ? toTaskCategoryDto(task.category) : null,
    checklist: (task.checklist ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      completed: item.completedAt !== null,
      position: item.position,
    })),
    attachments: (task.attachments ?? []).map((file) => ({
      id: file.id,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      createdAt: file.createdAt.toISOString(),
    })),
  };
}

/**
 * An attachment row plus the freshly signed link to read it.
 *
 * The signature is passed in rather than fetched here: signing is a batch call
 * to Storage for a whole task's files at once, and a DTO mapper that reached
 * out to the network would turn one round trip into one per row.
 */
export function toTaskAttachmentLinkDto(
  attachment: TaskAttachment,
  url: string,
  expiresAt: string,
): TaskAttachmentLinkDto {
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt.toISOString(),
    url,
    expiresAt,
  };
}

export function toTaskCategoryDto(category: TaskCategory): TaskCategoryDto {
  return {
    id: category.id,
    title: category.title,
    colorToken: category.colorToken,
    icon: category.icon,
    position: category.position,
  };
}

export function toHabitDto(habit: Habit, streak: StreakResult): HabitDto {
  return {
    id: habit.id,
    title: habit.title,
    description: habit.description,
    icon: habit.icon,
    colorToken: asColorToken(habit.colorToken),
    frequency: habit.frequency,
    targetPerDay: habit.targetPerDay,
    // The stored counters are a cache the cron maintains; the evaluated values
    // are authoritative the moment a log lands.
    currentStreak: streak.currentStreak,
    longestStreak: Math.max(habit.longestStreak, streak.longestStreak),
    graceDaysAllowed: habit.graceDaysAllowed,
    graceDaysUsed: streak.graceDaysUsed,
    isDueToday: streak.isDueToday,
    isCompletedToday: streak.isCompletedToday,
    todayCount: streak.todayCount,
    completionRate: streak.completionRate,
    archivedAt: habit.archivedAt?.toISOString() ?? null,
  };
}

export function toFinancialBoxDto(
  box: FinancialBox,
  options: { now?: Date; timezone?: string } = {},
): FinancialBoxDto {
  const target = box.targetAmount.toNumber();
  const current = box.currentAmount.toNumber();

  return {
    id: box.id,
    title: box.title,
    description: box.description,
    targetAmount: target,
    currentAmount: current,
    currency: box.currency,
    category: box.category,
    colorToken: asColorToken(box.colorToken),
    icon: box.icon,
    deadlineAt: box.deadlineAt?.toISOString() ?? null,
    progress: target > 0 ? Math.min(1, Math.max(0, current / target)) : 0,
    remaining: Math.max(0, target - current),
    daysRemaining: box.deadlineAt ? daysUntil(box.deadlineAt, options) : null,
    archivedAt: box.archivedAt?.toISOString() ?? null,
  };
}

export function toTransactionDto(transaction: FinancialTransaction): FinancialTransactionDto {
  return {
    id: transaction.id,
    boxId: transaction.boxId,
    amount: transaction.amount.toNumber(),
    type: transaction.type,
    note: transaction.note,
    occurredAt: transaction.occurredAt.toISOString(),
  };
}

export function toCountdownDto(
  event: CountdownEvent,
  options: { now?: Date; timezone?: string; dayStartHour?: number } = {},
): CountdownDto {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    eventAt: event.eventAt.toISOString(),
    eventJalali: event.eventJalali,
    isAllDay: event.isAllDay,
    colorToken: asColorToken(event.colorToken),
    icon: event.icon,
    notifyBeforeMinutes: event.notifyBeforeMinutes,
    daysRemaining: daysUntil(event.eventAt, options),
    relativeLabel: formatRelativeJalali(event.eventAt, options),
  };
}

export function toNoteDto(note: Note): NoteDto {
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    isPinned: note.isPinned,
    wordCount: note.wordCount,
    colorToken: asColorToken(note.colorToken),
    tags: note.tags,
    attachments: note.attachments,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

export function toBookDto(book: Book365, options: { isReviewDay?: boolean } = {}): BookDto {
  return {
    id: book.id,
    dayNumber: book.dayNumber,
    title: book.title,
    titleFa: book.titleFa,
    author: book.author,
    authorFa: book.authorFa,
    category: book.category,
    coverUrl: book.coverUrl,
    summaryFa: book.summaryFa,
    keyTakeaways: book.keyTakeaways,
    reflectionPrompt: book.reflectionPrompt,
    readingMinutes: book.readingMinutes,
    isReviewDay: options.isReviewDay ?? false,
  };
}

export function toReadingLogDto(log: UserReadingLog): ReadingLogDto {
  return {
    bookId: log.bookId,
    dayNumber: log.dayNumber,
    readAt: log.readAt?.toISOString() ?? null,
    reflection: log.reflection,
    highlights: log.highlights,
    rating: log.rating,
  };
}

export function toPomodoroDto(session: PomodoroSession): PomodoroSessionDto {
  return {
    id: session.id,
    taskId: session.taskId,
    mode: session.mode,
    durationSeconds: session.durationSeconds,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    completed: session.completed,
    ambientTrack: session.ambientTrack,
  };
}
