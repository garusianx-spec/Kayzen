import { z } from 'zod';

import { normalizeIranianPhone } from '../auth/phone';
import { parsePersianNumber, toLatinDigits } from '../date/digits';

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
// Tasks
// ---------------------------------------------------------------------------

export const taskStatusSchema = z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED']);
export const taskDifficultySchema = z.enum(['TRIVIAL', 'EASY', 'MEDIUM', 'HARD', 'EPIC']);

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
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'حداقل یک تنظیم برای به‌روزرسانی لازم است.',
  });

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
