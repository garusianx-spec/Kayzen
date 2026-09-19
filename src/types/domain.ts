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
  /** Visible home widgets, in order. Already resolved against the registry. */
  homeWidgets: string[];
}

export interface NotificationDto {
  id: string;
  category: string;
  categoryLabel: string;
  icon: string;
  colorToken: string;
  title: string;
  body: string;
  /** Always an in-app path; see `resolveDeepLink`. */
  href: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationPreferenceDto {
  category: string;
  label: string;
  description: string;
  icon: string;
  colorToken: string;
  enabled: boolean;
  /** False for categories the user may not switch off. */
  togglable: boolean;
}

export interface VocabularyWordDto {
  id: string;
  language: string;
  level: string;
  term: string;
  transliteration: string | null;
  meaningFa: string;
  partOfSpeech: string | null;
  example: string | null;
  exampleFa: string | null;
  /** This learner's standing with the word. */
  status: 'LEARNING' | 'REVIEWING' | 'MASTERED';
  correctRuns: number;
}

export interface LanguageCourseDto {
  id: string;
  language: string;
  languageLabel: string;
  flag: string;
  level: string;
  levelLabel: string;
  wordsPerDay: number;
  masteredCount: number;
  corpusSize: number;
  /** True when the level's corpus is exhausted and days now repeat. */
  wrapped: boolean;
  words: VocabularyWordDto[];
}

export interface VocabularyVaultGroup {
  language: string;
  languageLabel: string;
  flag: string;
  total: number;
  mastered: number;
  words: Array<VocabularyWordDto & { levelLabel: string }>;
}

export interface TaskChecklistItemDto {
  id: string;
  title: string;
  completed: boolean;
  position: number;
}

export interface TaskCategoryDto {
  id: string;
  title: string;
  colorToken: string;
  icon: string | null;
  position: number;
}

export interface TaskAttachmentDto {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

/**
 * An attachment plus a link to read it.
 *
 * Separate from {@link TaskAttachmentDto} because signing a URL is a round trip
 * to Storage: the task list carries the bare metadata, and only the composer —
 * which is showing one task, and might actually open a file — pays for links.
 */
export interface TaskAttachmentLinkDto extends TaskAttachmentDto {
  url: string;
  /** ISO instant the link stops working. Roughly fifteen minutes out. */
  expiresAt: string;
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
  /** Expected cost in Toman, whole units. */
  costAmount: number | null;
  location: string | null;
  remindAt: string | null;
  category: TaskCategoryDto | null;
  checklist: TaskChecklistItemDto[];
  attachments: TaskAttachmentDto[];
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

export type ReadingMode = 'SUMMARY' | 'FULL_BOOK';

export interface ReadingPlanDto {
  mode: ReadingMode;
  /** 15, 30 or 60. The picker has a chip for each. */
  dailyMinutes: number;
}

export interface UserBookDto {
  id: string;
  title: string;
  author: string | null;
  totalPages: number;
  currentPage: number;
  colorToken: ColorToken;
  startedAt: string;
  finishedAt: string | null;
  /** `0…1`, derived rather than stored so it cannot drift from the pages. */
  completion: number;
  pagesLeft: number;
  /**
   * How much further, at the pace this reader has actually kept.
   *
   * `sessionsLeft` is null when there is nothing to go on — a book just added,
   * or one whose sittings are all older than the rhythm window. The UI says so
   * rather than inventing a number.
   */
  pace: { pagesPerSession: number; sessionsLeft: number | null };
}

export interface ReadingDayDto {
  dayKey: string;
  /** 0 = شنبه … 6 = جمعه, resolved server-side from the day's own instant. */
  weekdayIndex: number;
  minutes: number;
  metGoal: boolean;
}

/** The header of the Reading Hub: one ring, one streak, one week. */
export interface ReadingRhythmDto {
  minutesToday: number;
  goalProgress: number;
  metGoalToday: boolean;
  streak: number;
  minutesThisWeek: number;
  /** Today first. */
  week: ReadingDayDto[];
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

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------

/**
 * What a weather code means, flattened onto the reading itself.
 *
 * Spread rather than nested (`reading.condition.label`) because every consumer
 * wants both halves at once, and one less level of indirection is one less
 * place for a row to render an empty string.
 */
export interface WeatherLook {
  /** The raw WMO code, kept so a future refinement is not a data migration. */
  code: number;
  label: string;
  /** Lucide icon name, resolved by the component. */
  icon: string;
  tone: 'violet' | 'flame' | 'emerald' | 'rose' | 'sky';
  isDay: boolean;
}

export interface CurrentWeatherDto extends WeatherLook {
  /** Local naive ISO, in the city's own timezone. */
  time: string;
  temperature: number;
  /** "Feels like" — the number that decides whether you take a coat. */
  apparentTemperature: number;
  /** Percent. */
  humidity: number;
  /** km/h. */
  windSpeed: number;
}

export interface HourlyWeatherDto extends WeatherLook {
  time: string;
  /** `"۱۴"` — the hour, already in Persian digits. */
  hourLabel: string;
  temperature: number;
  precipitationChance: number;
}

export interface DailyWeatherDto extends WeatherLook {
  /** Gregorian calendar date, `"2026-09-18"`. */
  date: string;
  /** `"۲۷ شهریور"`. */
  jalaliLabel: string;
  /** 0 = شنبه … 6 = جمعه. */
  weekdayIndex: number;
  high: number;
  low: number;
  precipitationChance: number;
}

export interface ForecastDto {
  city: { id: string; name: string; provinceId: string; provinceName: string };
  current: CurrentWeatherDto;
  /** The next twenty-four hours, starting with the current one. */
  hourly: HourlyWeatherDto[];
  daily: DailyWeatherDto[];
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Google Calendar
// ---------------------------------------------------------------------------

/**
 * The settings card's whole view of the integration.
 *
 * No token, no scope string, no calendar id, no event ids. The card has no use
 * for any of them, and a response shape is the last place to be generous —
 * this is the same allow-list discipline that keeps `passwordHash` off the
 * wire.
 */
export interface GoogleLinkDto {
  /** False when the deployment has no Google credentials at all. */
  configured: boolean;
  connected: boolean;
  /** The linked address, so somebody with two accounts can tell which. */
  email?: string;
  /** ISO instant of the last pass that finished with nothing failing. */
  lastSyncedAt?: string | null;
  /** Changes waiting to go out. Zero means everything is mirrored. */
  pending?: number;
  /** Changes that have exhausted their retries and need a nudge. */
  stalled?: number;
  /** Present when the grant itself is the problem and only re-linking fixes it. */
  needsReauth?: boolean;
}
