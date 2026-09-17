# Kayzen — architecture

The App Router tree, the component tree, and the handful of rules that decide
where a new file goes. Generated from the working tree and kept in step by
hand; if it disagrees with the repository, the repository is right.

## Route groups

Two, and the split is about the shell rather than about the URL:

- **`(app)`** — every signed-in screen. Its layout resolves the session and
  redirects to `/login` without one, then wraps the page in `AppShell`: the
  branded header, the floating bottom navigation, the offline banner, the
  composer host, and — on `/` only — the quick-action FAB.
- **`(auth)`** — sign-in. Its layout redirects _to_ the app when a session
  already exists, so the home-screen icon opens the planner rather than a form.

Neither group appears in a URL. `/login` is `(auth)/login`, `/habits` is
`(app)/habits`.

## Where a thing goes

| Kind of code                | Home                                         | Rule                                                                               |
| --------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| A screen                    | `src/components/screens/`                    | One component per route. The `page.tsx` beside it holds metadata and nothing else. |
| Something two screens share | `src/components/widgets/`                    | A card, a row, a chip. Owns its own layout, not its own data.                      |
| A creation sheet            | `src/components/composers/`                  | Opened through `ui-store`, rendered once by `ComposerHost`.                        |
| A primitive                 | `src/components/ui/`                         | No app vocabulary. A `Button` does not know what a habit is.                       |
| Business rules              | `src/lib/domain/`                            | Pure functions, no I/O, unit-tested. Streaks, recurrence, the vocabulary engine.   |
| An endpoint                 | `src/app/api/v1/…/route.ts`                  | Always through `withRoute`/`withAuthedRoute`; never a bare handler.                |
| A request shape             | `src/lib/validation/schemas.ts`              | One zod definition, used by both the form and the route.                           |
| A response shape            | `src/lib/api/dto.ts` + `src/types/domain.ts` | Explicit allow-lists. This is why `passwordHash` cannot leak.                      |

Three rules earn their keep more than the rest:

1. **Tenant queries go through `withUserContext`.** It opens one transaction,
   sets `app.current_user_id`, and hands the callback a scoped client. A query
   on the bare `prisma` client sees nothing, because `user_id = NULL` is never
   true — the failure mode is an empty result, not a cross-tenant leak.
2. **One zod schema per shape.** The composer and the route handler import the
   same object, so a form cannot accept what the API will reject.
3. **Domain logic is pure.** Anything that needs a clock or a database takes it
   as an argument. That is what makes `tests/` fast enough to run on every save.

## API surface

```
/api/v1
├── auth/
│   ├── otp/send · otp/verify      SMS one-time code
│   ├── password · password/login  phone + password, and setting one
│   ├── refresh · logout           rotating refresh tokens
│   └── session
├── tasks/                         + categories/, [id]/complete, [id]/attachments
├── habits/                        + [id]/log
├── notes/ · countdowns/ · finance/
├── library/                       365-day reading curriculum
├── vocabulary/                    daily words; + courses/, review, vault
├── notifications/                 history; + preferences, read
├── pomodoro/ · preferences/ · push/subscribe
├── today                          the home screen's single snapshot query
└── cron/                          reminders, streak reconciliation
```

## Data model

Fourteen models. The ones that carry the modules this document is about:

- **`Task`** — plus `TaskCategory` (renameable, recolourable), `TaskChecklistItem`
  (sub-tasks, replaced wholesale on write) and `TaskAttachment` (object paths in
  Supabase Storage; the bytes never touch the database). Cost is `numeric(14,0)`
  in Toman, location is free text, `remindAt` is the alarm.
- **`VocabularyWord`** — the shared corpus, keyed `(language, level, term)`.
  `LanguageCourse` is one learner in one language; `VocabularyDelivery` is what
  they were given on a day; `VocabularyMastery` is what they know.
- **`NotificationPreference`** and **`NotificationLog`** — one switch per
  category, and the history behind the bell.

Every tenant-owned table carries the same RLS policy shape
(`user_id = app.current_user_id()`), applied in `supabase/migrations/`. The two
child tables of `Task` denormalise `user_id` so the policy needs no join, and a
trigger refuses any row whose `user_id` does not own its task — a denormalised
key that can disagree with its source is a hole, not a shortcut.

## Tree

```
src/app/
├── (app)/
│   ├── countdowns/
│   │   └── page.tsx
│   ├── finance/
│   │   └── page.tsx
│   ├── focus/
│   │   └── page.tsx
│   ├── habits/
│   │   └── page.tsx
│   ├── library/
│   │   ├── [day]/
│   │   │   └── page.tsx
│   │   └── page.tsx
│   ├── notes/
│   │   └── page.tsx
│   ├── notifications/
│   │   └── page.tsx
│   ├── settings/
│   │   └── page.tsx
│   ├── tools/
│   │   ├── vocabulary/
│   │   │   ├── vault/
│   │   │   │   └── page.tsx
│   │   │   └── page.tsx
│   │   └── page.tsx
│   ├── layout.tsx
│   └── page.tsx
├── (auth)/
│   ├── login/
│   │   └── page.tsx
│   └── layout.tsx
├── api/
│   ├── assetlinks/
│   │   └── route.ts
│   └── v1/
│       ├── auth/
│       │   ├── logout/
│       │   │   └── route.ts
│       │   ├── otp/
│       │   │   ├── send/
│       │   │   │   └── route.ts
│       │   │   └── verify/
│       │   │       └── route.ts
│       │   ├── password/
│       │   │   ├── login/
│       │   │   │   └── route.ts
│       │   │   └── route.ts
│       │   ├── refresh/
│       │   │   └── route.ts
│       │   └── session/
│       │       └── route.ts
│       ├── countdowns/
│       │   ├── [id]/
│       │   │   └── route.ts
│       │   └── route.ts
│       ├── cron/
│       │   ├── reminders/
│       │   │   └── route.ts
│       │   └── streaks/
│       │       └── route.ts
│       ├── finance/
│       │   ├── boxes/
│       │   │   ├── [id]/
│       │   │   │   └── route.ts
│       │   │   └── route.ts
│       │   └── transactions/
│       │       └── route.ts
│       ├── habits/
│       │   ├── [id]/
│       │   │   ├── log/
│       │   │   │   └── route.ts
│       │   │   └── route.ts
│       │   └── route.ts
│       ├── health/
│       │   └── route.ts
│       ├── library/
│       │   ├── [day]/
│       │   │   ├── log/
│       │   │   │   └── route.ts
│       │   │   └── route.ts
│       │   └── today/
│       │       └── route.ts
│       ├── notes/
│       │   ├── [id]/
│       │   │   ├── attachments/
│       │   │   │   └── route.ts
│       │   │   └── route.ts
│       │   └── route.ts
│       ├── notifications/
│       │   ├── preferences/
│       │   │   └── route.ts
│       │   ├── read/
│       │   │   └── route.ts
│       │   └── route.ts
│       ├── pomodoro/
│       │   └── route.ts
│       ├── preferences/
│       │   └── route.ts
│       ├── push/
│       │   └── subscribe/
│       │       └── route.ts
│       ├── tasks/
│       │   ├── [id]/
│       │   │   ├── complete/
│       │   │   │   └── route.ts
│       │   │   └── route.ts
│       │   ├── categories/
│       │   │   ├── [id]/
│       │   │   │   └── route.ts
│       │   │   └── route.ts
│       │   └── route.ts
│       ├── today/
│       │   └── route.ts
│       └── vocabulary/
│           ├── courses/
│           │   ├── [id]/
│           │   │   └── route.ts
│           │   └── route.ts
│           ├── review/
│           │   └── route.ts
│           ├── vault/
│           │   └── route.ts
│           └── route.ts
├── offline/
│   └── page.tsx
├── error.tsx
├── globals.css
├── layout.tsx
└── not-found.tsx

src/components/
├── auth/
│   ├── OtpInput.tsx
│   ├── PasswordSignInForm.tsx
│   └── SignInFlow.tsx
├── brand/
│   ├── BrandMark.tsx
│   ├── KayzenLogo.tsx
│   ├── logo-geometry.d.mts
│   └── logo-geometry.mjs
├── composers/
│   ├── task/
│   │   ├── ChecklistBuilder.tsx
│   │   └── PrioritySelector.tsx
│   ├── BookReflectionComposer.tsx
│   ├── ComposerHost.tsx
│   ├── CountdownComposer.tsx
│   ├── FinancialBoxComposer.tsx
│   ├── HabitComposer.tsx
│   ├── NoteComposer.tsx
│   └── TaskComposer.tsx
├── layout/
│   ├── AppHeader.tsx
│   ├── AppShell.tsx
│   ├── BottomNav.tsx
│   ├── NotificationBell.tsx
│   ├── OfflineBanner.tsx
│   ├── QuickActionFab.tsx
│   └── ScreenAddButton.tsx
├── notifications/
│   └── NotificationCenter.tsx
├── providers/
│   ├── AppProviders.tsx
│   ├── QueryProvider.tsx
│   └── ThemeProvider.tsx
├── pwa/
│   ├── InstallPrompt.tsx
│   └── ServiceWorkerRegistrar.tsx
├── screens/
│   ├── CountdownsScreen.tsx
│   ├── FinanceScreen.tsx
│   ├── FocusScreen.tsx
│   ├── HabitsScreen.tsx
│   ├── LibraryReflection.tsx
│   ├── NotesScreen.tsx
│   ├── SettingsScreen.tsx
│   ├── TodayScreen.tsx
│   ├── ToolsScreen.tsx
│   ├── VocabularyScreen.tsx
│   └── VocabularyVaultScreen.tsx
├── settings/
│   └── PasswordCard.tsx
├── ui/
│   ├── badge.tsx
│   ├── button.tsx
│   ├── card.tsx
│   ├── input.tsx
│   ├── jalali-date-picker.tsx
│   ├── password-field.tsx
│   ├── progress.tsx
│   ├── sheet.tsx
│   ├── skeleton.tsx
│   ├── switch.tsx
│   └── toast.tsx
├── vocabulary/
│   └── Flashcard.tsx
└── widgets/
    ├── AmbientPlayer.tsx
    ├── HabitCard.tsx
    ├── NoteCard.tsx
    ├── StreakFlame.tsx
    ├── TaskCheckbox.tsx
    └── TaskItem.tsx

src/lib/
├── api/
│   ├── client.ts
│   ├── cron.ts
│   ├── dto.ts
│   ├── handler.ts
│   ├── queries.ts
│   └── response.ts
├── auth/
│   ├── jwt.ts
│   ├── otp.ts
│   ├── password-policy.ts
│   ├── password.ts
│   ├── phone.ts
│   ├── session.ts
│   └── tokens.ts
├── date/
│   ├── digits.ts
│   └── jalali.ts
├── db/
│   ├── memory/
│   │   ├── client.ts
│   │   ├── engine.ts
│   │   ├── index.ts
│   │   └── seed.ts
│   ├── prisma.ts
│   └── rls.ts
├── domain/
│   ├── books-365.ts
│   ├── habits.ts
│   ├── library.ts
│   ├── notifications.ts
│   ├── points.ts
│   ├── recurrence.ts
│   ├── streak-engine.ts
│   ├── task-detail.ts
│   └── vocabulary.ts
├── observability/
│   └── sentry.ts
├── offline/
│   └── outbox.ts
├── push/
│   ├── vapid.ts
│   └── webpush.ts
├── sms/
│   ├── providers/
│   │   ├── console.ts
│   │   ├── farazsms.ts
│   │   ├── kavenegar.ts
│   │   └── twilio.ts
│   ├── index.ts
│   ├── template.ts
│   └── types.ts
├── storage/
│   ├── constants.ts
│   └── supabase.ts
├── validation/
│   └── schemas.ts
├── crypto.ts
├── env.ts
├── errors.ts
├── fonts.ts
├── logger.ts
├── ratelimit.ts
├── sanitize.ts
├── theme-bootstrap.ts
└── utils.ts

src/hooks/
├── use-ambient-audio.ts
├── use-countdown.ts
├── use-haptic-feedback.ts
├── use-media-query.ts
├── use-note-attachments.ts
├── use-online-status.ts
├── use-pomodoro-timer.ts
├── use-push-notifications.ts
└── use-web-otp.ts

src/stores/
├── audio-store.ts
├── pomodoro-store.ts
├── preferences-store.ts
└── ui-store.ts

src/types/
├── domain.ts
└── webotp.d.ts
```
