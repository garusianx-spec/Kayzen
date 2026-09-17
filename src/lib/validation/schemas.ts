import { z } from 'zod';

import { normalizeIranianPhone } from '../auth/phone';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../auth/password-policy';
import { parsePersianNumber, toLatinDigits, toPersianDigits } from '../date/digits';

/**
 * The one place request shapes are defined.
 *
 * Route handlers, React Hook Form resolvers and the optimistic client mutations
 * all import from here, so a field can never drift between what the form allows
 * and what the API accepts.
 */

/** Trims, normalises Persian digits, and rejects whitespace-only input. */
const persianText = (max: number) =>
  z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, { message: 'این فیلد نمی‌تواند خالی باشد.' })
    .refine((value) => value.length <= max, {
      message: `حداکثر ${max} کاراکتر مجاز است.`,
    });

/**
 * Accepts every numeric form a Persian keyboard produces.
 *
 * `۲٬۵۰۰٬۰۰۰` is what a user types into the amount field, and `Number()` on it
 * — even after digit transliteration — is `NaN`, because of the `٬` group
 * separator and the `٫` decimal mark. `parsePersianNumber` strips both, so the
 * form and the API read the same value out of the same string.
 */
export const persianNumber = z
  .union([z.number(), z.string()])
  .transform((value, ctx) => {
    if (typeof value === 'number') return value;

    const parsed = parsePersianNumber(value);

    if (parsed === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'عدد واردشده معتبر نیست.' });
      return z.NEVER;
    }

    return parsed;
  })
  .pipe(z.number().finite());

export const uuidSchema = z.string().uuid({ message: 'شناسه نامعتبر است.' });

export const isoDateTime = z
  .string()
  .datetime({ offset: true, message: 'تاریخ باید در قالب ISO 8601 باشد.' })
  .transform((value) => new Date(value));

export const jalaliDayKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'قالب تاریخ باید ۱۴۰۳-۰۶-۲۴ باشد.' });

/** IANA timezone, validated against the runtime's own ICU database. */
export const timezoneSchema = z.string().refine(
  (value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'منطقهٔ زمانی نامعتبر است.' },
);

export const paginationSchema = z.object({
  cursor: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * Phone number as typed.
 *
 * The contract advertises `09XXXXXXXXX`, but the transform accepts every form a
 * Persian keyboard produces — `۰۹…`, `+۹۸…`, spaced, dashed — and emits the one
 * canonical E.164 string the rest of the system stores. Validation happens on
 * the *normalised* value, so "valid" means exactly one thing everywhere.
 */
export const phoneSchema = z
  .string()
  .min(10, 'شمارهٔ موبایل را وارد کنید.')
  .max(20, 'شمارهٔ موبایل نامعتبر است.')
  .transform((value, ctx) => {
    const normalised = normalizeIranianPhone(value);

    if (!normalised) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'شمارهٔ موبایل باید به شکل ۰۹۱۲۳۴۵۶۷۸۹ باشد.',
      });
      return z.NEVER;
    }

    return normalised;
  });

/** 4–8 ASCII digits after Persian-digit normalisation. */
export const otpCodeSchema = z
  .string()
  .min(1, 'کد تأیید را وارد کنید.')
  .max(16)
  .transform((value) => toLatinDigits(value).replace(/\D/g, ''))
  .refine((value) => /^[0-9]{4,8}$/.test(value), { message: 'کد تأیید باید فقط رقم باشد.' });

export const sendOtpSchema = z.object({
  phone: phoneSchema,
  /** Carried from the client so the session's day boundaries are right at once. */
  timezone: timezoneSchema.optional(),
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: otpCodeSchema,
  /** Opaque handle returned by `/auth/otp/send`; names one specific challenge. */
  challengeId: z.string().min(8).max(64),
  timezone: timezoneSchema.optional(),
  name: z.string().trim().max(80).optional(),
});

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

// ---------------------------------------------------------------------------
// Password sign-in
// ---------------------------------------------------------------------------

/**
 * No composition rules beyond a length floor.
 *
 * Character-class requirements measurably push people toward `Password1!` and
 * toward reuse; length is the property that actually costs an attacker work.
 * NIST 800-63B says the same, and the server-side cost of scrypt is what
 * carries the rest.
 */
export const passwordSchema = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `رمز عبور باید دست‌کم ${toPersianDigits(PASSWORD_MIN_LENGTH)} نویسه باشد.`,
  )
  .max(PASSWORD_MAX_LENGTH, 'رمز عبور بیش از حد طولانی است.');

export const passwordLoginSchema = z.object({
  phone: phoneSchema,
  // Deliberately *not* `passwordSchema`: a length rule on the way in would
  // reject an existing password that predates the rule, and would tell an
  // attacker where the boundary is. Wrong is wrong.
  password: z.string().min(1, 'رمز عبور را وارد کنید.').max(PASSWORD_MAX_LENGTH),
  timezone: timezoneSchema.optional(),
  name: z.string().trim().max(80).optional(),
});

export const setPasswordSchema = z
  .object({
    password: passwordSchema,
    /** Required when the account already has a password; ignored otherwise. */
    currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.currentPassword && value.currentPassword === value.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: 'رمز تازه باید با رمز فعلی فرق داشته باشد.',
      });
    }
  });

export type PasswordLoginInput = z.infer<typeof passwordLoginSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

// ---------------------------------------------------------------------------
// Daily vocabulary
// ---------------------------------------------------------------------------

export const learningLanguageSchema = z.enum(['ENGLISH', 'TURKISH', 'FRENCH', 'GERMAN', 'SPANISH']);

export const learningLevelSchema = z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);

export const languageCourseSchema = z.object({
  language: learningLanguageSchema,
  level: learningLevelSchema.default('BEGINNER'),
  wordsPerDay: z.coerce.number().int().min(1).max(10).default(10),
});

export const updateLanguageCourseSchema = z
  .object({
    level: learningLevelSchema.optional(),
    wordsPerDay: z.coerce.number().int().min(1).max(10).optional(),
    /** `true` retires the course without deleting what was learned from it. */
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'حداقل یک فیلد برای به‌روزرسانی لازم است.',
  });

export const reviewWordSchema = z.object({
  wordId: z.string().uuid(),
  correct: z.boolean(),
});

export const vaultQuerySchema = z.object({
  language: learningLanguageSchema.optional(),
  level: learningLevelSchema.optional(),
  /** Matches the term or the Persian meaning. */
  search: z.string().trim().max(60).optional(),
  status: z.enum(['LEARNING', 'REVIEWING', 'MASTERED', 'ALL']).default('ALL'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type LanguageCourseInput = z.infer<typeof languageCourseSchema>;
export type UpdateLanguageCourseInput = z.infer<typeof updateLanguageCourseSchema>;
export type ReviewWordInput = z.infer<typeof reviewWordSchema>;
export type VaultQuery = z.infer<typeof vaultQuerySchema>;

// ---------------------------------------------------------------------------
// Notification centre
// ---------------------------------------------------------------------------

export const notificationCategorySchema = z.enum([
  'TASK_REMINDER',
  'HABIT_PROMPT',
  'VOCABULARY',
  'READING',
  'FINANCIAL_MILESTONE',
  'SYSTEM',
]);

export const notificationPreferenceSchema = z.object({
  category: notificationCategorySchema,
  enabled: z.boolean(),
});

export const listNotificationsSchema = z.object({
  /** `unread` is the badge's query; `all` is the history. */
  filter: z.enum(['all', 'unread']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const markReadSchema = z.object({
  /** Omit to mark everything read — the "mark all" button. */
  ids: z.array(z.string().uuid()).max(100).optional(),
});

export type NotificationPreferenceInput = z.infer<typeof notificationPreferenceSchema>;
export type ListNotificationsQuery = z.infer<typeof listNotificationsSchema>;
export type MarkReadInput = z.infer<typeof markReadSchema>;

// ---------------------------------------------------------------------------
// Web Push
// ---------------------------------------------------------------------------

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(32).max(200),
    auth: z.string().min(16).max(64),
  }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

// ---------------------------------------------------------------------------
// Note attachments
// ---------------------------------------------------------------------------

/**
 * The browser uploads straight to Supabase Storage, so the server never sees
 * the bytes — only this description of them. Type and size are re-checked
 * against the bucket's own limits in `src/lib/storage/supabase.ts`; declaring a
 * small size here buys an attacker nothing, because the signed URL inherits the
 * bucket's ceiling.
 */
export const signAttachmentSchema = z.object({
  filename: z.string().trim().min(1, 'نام فایل لازم است.').max(200),
  contentType: z.string().min(3).max(100),
  sizeBytes: z.coerce
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
});

export const deleteAttachmentSchema = z.object({
  /** Object key, always `<user>/<note>/<file>`. Ownership is verified server-side. */
  path: z.string().min(3).max(500),
});

export type SignAttachmentInput = z.infer<typeof signAttachmentSchema>;
export type DeleteAttachmentInput = z.infer<typeof deleteAttachmentSchema>;

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const taskStatusSchema = z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED']);
export const taskDifficultySchema = z.enum(['TRIVIAL', 'EASY', 'MEDIUM', 'HARD', 'EPIC']);

/**
 * One sub-task.
 *
 * `id` is present when the client is editing a line it already knows about, so
 * that ticking one off does not orphan the rest. The API replaces the whole
 * list on every write — a checklist is short, it is always edited as a unit,
 * and per-item endpoints would buy nothing but a reconciliation bug.
 */
export const checklistItemSchema = z.object({
  id: z.string().uuid().optional(),
  title: persianText(200),
  completed: z.boolean().default(false),
});

export const createTaskSchema = z.object({
  title: persianText(200),
  description: z.string().max(4000).optional(),
  dueAt: isoDateTime.optional(),
  priority: z.coerce.number().int().min(1).max(4).default(3),
  difficulty: taskDifficultySchema.default('MEDIUM'),
  recurrence: z
    .string()
    .max(200)
    .regex(/^RRULE:FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/i, { message: 'قاعدهٔ تکرار نامعتبر است.' })
    .optional(),
  estimatedPomodoros: z.coerce.number().int().min(1).max(24).optional(),
  tags: z.array(z.string().max(32)).max(10).default([]),
  categoryId: z.string().uuid().nullish(),
  /**
   * Expected cost in Toman, whole units.
   *
   * Through `persianNumber`, so `۲٬۵۰۰٬۰۰۰` typed on a Persian keyboard is the
   * same value as `2500000` — the separator and the digits both normalise.
   */
  costAmount: persianNumber
    .pipe(z.number().int().min(0, 'هزینه نمی‌تواند منفی باشد.').max(1e13))
    .nullish(),
  location: z.string().trim().max(120).nullish(),
  remindAt: isoDateTime.nullish(),
  checklist: z.array(checklistItemSchema).max(30).optional(),
});

export const updateTaskSchema = createTaskSchema
  .partial()
  .extend({ status: taskStatusSchema.optional(), position: z.coerce.number().int().optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'حداقل یک فیلد برای به‌روزرسانی لازم است.',
  });

export const listTasksSchema = z.object({
  status: taskStatusSchema.optional(),
  dueJalali: jalaliDayKeySchema.optional(),
  /** `today` resolves server-side against the caller's timezone. */
  scope: z.enum(['today', 'upcoming', 'overdue', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const taskCategorySchema = z.object({
  title: persianText(40),
  colorToken: z.enum(['violet', 'flame', 'emerald', 'rose', 'sky']).default('violet'),
  icon: z.string().max(40).optional(),
});

export const updateTaskCategorySchema = taskCategorySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'حداقل یک فیلد برای به‌روزرسانی لازم است.',
  });

export type TaskCategoryInput = z.infer<typeof taskCategorySchema>;
export type UpdateTaskCategoryInput = z.infer<typeof updateTaskCategorySchema>;
export type ChecklistItemInput = z.infer<typeof checklistItemSchema>;

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ListTasksQuery = z.infer<typeof listTasksSchema>;

// ---------------------------------------------------------------------------
// Habits
// ---------------------------------------------------------------------------

export const createHabitSchema = z.object({
  title: persianText(120),
  description: z.string().max(1000).optional(),
  icon: z.string().max(48).default('sparkles'),
  colorToken: z.enum(['flame', 'violet', 'emerald', 'rose', 'sky']).default('flame'),
  frequency: z
    .array(z.coerce.number().int().min(0).max(6))
    .min(1, 'حداقل یک روز هفته را انتخاب کنید.')
    .max(7)
    .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
  targetPerDay: z.coerce.number().int().min(1).max(50).default(1),
  graceDaysAllowed: z.coerce.number().int().min(0).max(7).default(1),
});

export const updateHabitSchema = createHabitSchema
  .partial()
  .extend({ archived: z.boolean().optional() });

export const logHabitSchema = z.object({
  /** Defaults to now; supplied when back-filling a missed day. */
  loggedAt: isoDateTime.optional(),
  count: z.coerce.number().int().min(1).max(50).default(1),
  note: z.string().max(500).optional(),
});

export type CreateHabitInput = z.infer<typeof createHabitSchema>;
export type LogHabitInput = z.infer<typeof logHabitSchema>;

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------

export const financialCategorySchema = z.enum([
  'SAVINGS',
  'TRAVEL',
  'EDUCATION',
  'GADGET',
  'EMERGENCY',
  'DEBT',
  'GIFT',
  'OTHER',
]);

export const createFinancialBoxSchema = z.object({
  title: persianText(120),
  description: z.string().max(1000).optional(),
  targetAmount: persianNumber.pipe(
    z.number().positive('مبلغ هدف باید بزرگ‌تر از صفر باشد.').max(1e15),
  ),
  currency: z.enum(['IRT', 'IRR', 'USD', 'EUR']).default('IRT'),
  category: financialCategorySchema.default('SAVINGS'),
  colorToken: z.enum(['emerald', 'violet', 'flame', 'rose', 'sky']).default('emerald'),
  icon: z.string().max(48).default('piggy-bank'),
  deadlineAt: isoDateTime.optional(),
});

export const updateFinancialBoxSchema = createFinancialBoxSchema
  .partial()
  .extend({ archived: z.boolean().optional() });

export const createTransactionSchema = z.object({
  boxId: uuidSchema,
  amount: persianNumber.pipe(z.number().positive('مبلغ باید بزرگ‌تر از صفر باشد.').max(1e15)),
  type: z.enum(['DEPOSIT', 'WITHDRAWAL']),
  note: z.string().max(280).optional(),
  occurredAt: isoDateTime.optional(),
});

export type CreateFinancialBoxInput = z.infer<typeof createFinancialBoxSchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

// ---------------------------------------------------------------------------
// Countdowns
// ---------------------------------------------------------------------------

export const createCountdownSchema = z.object({
  title: persianText(120),
  description: z.string().max(1000).optional(),
  eventAt: isoDateTime,
  isAllDay: z.boolean().default(false),
  colorToken: z.enum(['violet', 'flame', 'emerald', 'rose', 'sky']).default('violet'),
  icon: z.string().max(48).default('calendar-heart'),
  notifyBeforeMinutes: z
    .array(z.coerce.number().int().min(0).max(43_200))
    .max(5)
    .default([1440, 60]),
});

export const updateCountdownSchema = createCountdownSchema.partial();

export type CreateCountdownInput = z.infer<typeof createCountdownSchema>;

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export const createNoteSchema = z.object({
  title: persianText(160),
  body: z.string().max(50_000).default(''),
  isPinned: z.boolean().default(false),
  colorToken: z.enum(['violet', 'flame', 'emerald', 'rose', 'sky']).default('violet'),
  tags: z.array(z.string().max(32)).max(10).default([]),
  /** Supabase Storage object paths, not URLs. */
  attachments: z.array(z.string().max(500)).max(10).default([]),
});

export const updateNoteSchema = createNoteSchema.partial();

export type CreateNoteInput = z.infer<typeof createNoteSchema>;

// ---------------------------------------------------------------------------
// 365 library
// ---------------------------------------------------------------------------

export const upsertReadingLogSchema = z.object({
  dayNumber: z.coerce.number().int().min(1).max(365),
  reflection: z.string().max(2000).optional(),
  highlights: z.array(z.string().max(500)).max(10).default([]),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  markRead: z.boolean().default(true),
});

export type UpsertReadingLogInput = z.infer<typeof upsertReadingLogSchema>;

// ---------------------------------------------------------------------------
// Pomodoro & preferences
// ---------------------------------------------------------------------------

export const recordPomodoroSchema = z.object({
  taskId: uuidSchema.optional(),
  mode: z.enum(['FOCUS', 'SHORT_BREAK', 'LONG_BREAK']).default('FOCUS'),
  durationSeconds: z.coerce.number().int().min(60).max(7200),
  startedAt: isoDateTime,
  completed: z.boolean().default(true),
  ambientTrack: z.string().max(48).optional(),
});

export const updatePreferencesSchema = z
  .object({
    timezone: timezoneSchema.optional(),
    dayStartHour: z.coerce.number().int().min(0).max(23).optional(),
    theme: z.enum(['SYSTEM', 'LIGHT', 'DARK']).optional(),
    name: z.string().trim().max(80).optional(),
    ambientEnabled: z.boolean().optional(),
    hapticsEnabled: z.boolean().optional(),
    notifyAtHour: z.coerce.number().int().min(0).max(23).optional(),
    notifyAtMinute: z.coerce.number().int().min(0).max(59).optional(),
    /**
     * The home layout, as an ordered list of visible widget ids.
     *
     * Validated only for shape here: which ids exist is the registry's
     * business, and `parseLayout` already drops the ones this version does not
     * know about. Rejecting an unknown id at the door would mean a client one
     * release ahead could not save its own layout back.
     */
    homeWidgets: z.array(z.string().max(40)).max(40).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'حداقل یک تنظیم برای به‌روزرسانی لازم است.',
  });

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
