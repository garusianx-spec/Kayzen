import type {
  FinancialBoxCategory,
  PomodoroMode,
  TaskDifficulty,
  TaskStatus,
  ThemePreference,
  TransactionType,
} from '@prisma/client';

/**
 * The client-facing shape of every domain object.
 *
 * These are not the Prisma rows: dates are ISO strings (JSON has no Date),
 * `Decimal` columns are numbers, and derived fields the UI needs on every render
 * — streak tier, progress ratio, days remaining — are computed once on the
 * server instead of in each component.
 */

/**
 * The enums are re-exported from the generated Prisma client rather than
 * re-declared: one definition, and a value added to the database schema cannot
 * silently fall out of the client union. `export type` keeps the client bundle
 * free of any Prisma runtime import.
 */
export type {
  FinancialBoxCategory,
  PomodoroMode,
  TaskDifficulty,
  TaskStatus,
  ThemePreference,
  TransactionType,
} from '@prisma/client';

export type ColorToken = 'violet' | 'flame' | 'emerald' | 'rose' | 'sky';

/** The six entries on the FAB's action sheet. */
export type QuickActionKind =
  | 'task'
  | 'habit'
  | 'countdown'
  | 'note'
  | 'financial-box'
  | 'book-reflection';

export interface SessionUserDto {
  id: string;
  phone: string;
  /** `۰۹۱۲***۶۷۸۹` — never the full number outside the account screen. */
  phoneMasked: string;
  name: string | null;
  avatarUrl: string | null;
  timezone: string;
  dayStartHour: number;
  theme: ThemePreference;
  points: number;
  level: number;
  levelTitle: string;
  levelProgress: number;
  ambientEnabled: boolean;
  hapticsEnabled: boolean;
  notifyAtHour: number;
  notifyAtMinute: number;
  onboardedAt: string | null;
  enrolledAt: string;
  /** Whether a password is set. The hash itself never leaves the server. */
  hasPassword: boolean;
}

export interface TaskDto {
  id: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  dueJalali: string | null;
  priority: number;
  difficulty: TaskDifficulty;
  status: TaskStatus;
  recurrence: string | null;
  estimatedPomodoros: number | null;
  tags: string[];
  position: number;
  completedAt: string | null;
  createdAt: string;
  /** True when `dueAt` is in the past and the task is still open. */
  isOverdue: boolean;
}

export interface HabitDto {
  id: string;
  title: string;
  description: string | null;
  icon: string;
  colorToken: ColorToken;
  frequency: number[];
  targetPerDay: number;
  currentStreak: number;
  longestStreak: number;
  graceDaysAllowed: number;
  graceDaysUsed: number;
  isDueToday: boolean;
  isCompletedToday: boolean;
  todayCount: number;
  /** Scheduled days met over the trailing 30 days, `0…1`. */
  completionRate: number;
  archivedAt: string | null;
}

export interface FinancialBoxDto {
  id: string;
  title: string;
  description: string | null;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  category: FinancialBoxCategory;
  colorToken: ColorToken;
  icon: string;
  deadlineAt: string | null;
  /** `currentAmount / targetAmount`, clamped to `0…1`. */
  progress: number;
  /** Remaining to target; never negative. */
  remaining: number;
  daysRemaining: number | null;
  archivedAt: string | null;
}

export interface FinancialTransactionDto {
  id: string;
  boxId: string;
  amount: number;
  type: TransactionType;
  note: string | null;
  occurredAt: string;
}

export interface CountdownDto {
  id: string;
  title: string;
  description: string | null;
  eventAt: string;
  eventJalali: string | null;
  isAllDay: boolean;
  colorToken: ColorToken;
  icon: string;
  notifyBeforeMinutes: number[];
  /** Whole days until the event in the user's calendar; negative once past. */
  daysRemaining: number;
  /** `"۱۱ روز دیگر"` */
  relativeLabel: string;
}

export interface NoteDto {
  id: string;
  title: string;
  body: string;
  isPinned: boolean;
  wordCount: number;
  colorToken: ColorToken;
  tags: string[];
  attachments: string[];
  createdAt: string;
  updatedAt: string;
}

/** A note attachment, with a short-lived signed URL the client can open. */
export interface AttachmentDto {
  /** Object key, `<user>/<note>/<file>`. Opaque to the client. */
  path: string;
  url: string;
  expiresAt: string;
  filename: string;
}

export interface BookDto {
  id: string;
  dayNumber: number;
  title: string;
  titleFa: string;
  author: string;
  authorFa: string;
  category: string;
  coverUrl: string | null;
  summaryFa: string;
  keyTakeaways: string[];
  reflectionPrompt: string;
  readingMinutes: number;
  /** True when this day has no curated entry and a past one is being revisited. */
  isReviewDay: boolean;
}

export interface ReadingLogDto {
  bookId: string;
  dayNumber: number;
  readAt: string | null;
  reflection: string | null;
  highlights: string[];
  rating: number | null;
}

export interface PomodoroSessionDto {
  id: string;
  taskId: string | null;
  mode: PomodoroMode;
  durationSeconds: number;
  startedAt: string;
  endedAt: string | null;
  completed: boolean;
  ambientTrack: string | null;
}

/** Everything the Today screen needs, in one request. */
export interface TodaySnapshotDto {
  jalaliDayKey: string;
  jalaliLabel: string;
  tasks: TaskDto[];
  habits: HabitDto[];
  countdowns: CountdownDto[];
  book: BookDto | null;
  readingLog: ReadingLogDto | null;
  stats: {
    tasksCompleted: number;
    tasksTotal: number;
    habitsCompleted: number;
    habitsDue: number;
    focusMinutes: number;
    points: number;
  };
}
