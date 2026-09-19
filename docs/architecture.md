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
├── tasks/                         + categories/, [id]/complete,
│                                   [id]/attachments (+ /sign)
├── habits/                        + [id]/log
├── notes/ · countdowns/ · finance/
├── library/                       the Reading Hub: today's summary, the
│                                   plan, the shelf and the sittings
│                                   (hub, plan, books/, sessions)
├── vocabulary/                    daily words; + courses/, review, vault
├── notifications/                 history; + preferences, read
├── tools/weather                  province → city forecast, via Open-Meteo
├── integrations/google            OAuth link, status, disconnect, force sync
├── pomodoro/ · preferences/ · push/subscribe
├── today                          the home screen's single snapshot query
└── cron/                          reminders, streaks, calendar sync
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
- **`GoogleAccount`** and **`CalendarSyncJob`** — one linked account per user
  (tokens sealed with AES-GCM, never in a DTO) and the durable outbox that
  carries Kayzen's changes to Google Calendar. `Task.googleEventId` and
  `CountdownEvent.googleEventId` are the mirror ids.
- **`ReadingPlan`**, **`UserBook`** and **`ReadingSession`** — how long you mean
  to read for and which half of the hub you are in; the shelf, tracked by page;
  and the sittings. `ReadingSession.bookId` is nullable so a summary and a novel
  land in the same streak.

Every tenant-owned table carries the same RLS policy shape
(`user_id = app.current_user_id()`), applied in `supabase/migrations/`. The two
child tables of `Task` denormalise `user_id` so the policy needs no join, and a
trigger refuses any row whose `user_id` does not own its task — a denormalised
key that can disagree with its source is a hole, not a shortcut.

## Attachments

Bytes never pass through the Next.js server. Objects live in a private Supabase
bucket with **no RLS policies at all** — Kayzen authenticates with its own
phone sessions, so `auth.uid()` inside Storage is always NULL and any policy
written against it would deny everything. Access is mediated entirely by the
service-role key held in `src/lib/storage/supabase.ts`, which makes
`assertOwnedObjectPath` the only thing standing between one tenant and
another's files. Keys are laid out `<user-uuid>/<parent-uuid>/<random>-<name>`,
so ownership is the first path segment and needs no database round trip.

An upload is three calls, and the order is the point:

1. `POST /tasks/:id/attachments/sign` — ownership is checked against the
   RLS-scoped client, then a one-shot signed URL comes back;
2. the browser `PUT`s the file straight to Supabase;
3. `POST /tasks/:id/attachments` records the object.

Step 3 is separate because a signed URL that is minted and never used costs
nothing and expires, whereas writing the row first would leave a task pointing
at an object that does not exist. On the way back in, the path the client hands
to step 3 is re-checked against _this_ task's folder as well as the caller's
namespace: both rows would belong to the same person, so RLS sees nothing
wrong, but a file registered against the wrong task would be deleted with it.

Notes differ only in where the record lands — a `text[]` column rather than a
table — which is why the note flow has no third endpoint.

Attachments are the one part of the app that is deliberately **not**
offline-capable: a signed URL expires, so queueing an upload for replay hours
later would fail anyway. The picker says so instead of failing silently.

## Google Calendar

One direction: Kayzen → Google. Tasks with a due date and countdowns become
events in a **dedicated "Kayzen Planner" calendar**, provisioned on connect, so
that a deleted task can never remove something the person put in their own
calendar. Nothing is read back.

Nothing in a request handler talks to Google. Every mutation writes a row to a
durable outbox (`calendar_sync_jobs`) inside its own transaction, and the drain
runs _after_ the response via Next's `after()`. Saving a task is therefore as
fast and as reliable as Postgres, not as fast and as reliable as a third party.
If the process dies before `after()` runs, the job is still in the database and
`POST /api/v1/cron/calendar-sync` picks it up — that is the difference between
an outbox and fire-and-forget.

**The queue holds desired end state, not history.** One row per object, by
unique constraint: five rapid edits of a task collapse into one job, and an
UPSERT followed by a DELETE overwrites to DELETE. That is not an optimisation —
it is what makes replaying the queue idempotent, which is what makes retrying
safe. Failures back off 1 → 5 → 15 → 60 → 240 minutes and give up after six
attempts, at which point the settings card asks the person to intervene.

What belongs on a calendar is decided in one pure place
(`src/lib/google/mapping.ts`), which is why it has tests. A task with no due
date, or one that is completed or archived, maps to `null` — and the drain
turns a `null` into a delete, so ticking a task off removes its event without
any route needing to know that.

The session cookie is `SameSite=Strict` and so is **not** sent on Google's
inbound redirect. The callback therefore authenticates from a separate signed,
`SameSite=Lax`, `HttpOnly` cookie carrying the user id, the `state` nonce and
the PKCE verifier (`src/lib/google/link-state.ts`). Comparing that nonce with
the one Google echoes back is what stops an attacker pasting their own
authorization code into somebody else's browser.

Refresh tokens are sealed with AES-256-GCM under their own key before they
reach a column. A refresh token is a standing grant to somebody's calendar: a
database dump that leaks one is worse than a dump that leaks a password hash,
which at least has to be cracked first.

## Weather

Forecasts come from Open-Meteo, chosen because it needs no API key: a weather
tool that only works for whoever set up an account is a tool that rots in every
other clone of this repository.

The call is proxied through `/api/v1/tools/weather` rather than made from the
browser, and the city is resolved against a bundled index of Iran's 31
provinces and their cities (`src/lib/domain/iran-geo.ts`) rather than taken as
coordinates. That last part is the security-relevant half: forwarding a
client-supplied latitude would make the route an open proxy, and a way to use
the deployment's IP to geolocate anything at all.

`src/lib/weather/open-meteo.ts` splits deliberately into a half that touches
the network and a half that is pure. A response shape is the one part of this
feature a third party can change without telling anybody, so the parser is what
has tests: a fixture goes in, a DTO comes out, and no test needs an internet
connection to fail honestly.

Times arrive as _local naive_ ISO strings because the request pins `timezone` —
`"2026-09-18T14:00"`, already in the reader's own reckoning, so "the next
twenty-four hours" is a slice rather than a conversion. The cost is that they
must never reach `new Date()` without an explicit zone, or a server in another
hemisphere shifts the whole week by a day.

The chosen city lives in `localStorage`, not on the account. A weather city is
about where you _are_, not who you are: somebody spending a week in شیراز wants
شیراز on the phone in their pocket without changing a setting that follows them
home.

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
│   │   ├── weather/
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
│       │   ├── calendar-sync/
│       │   │   └── route.ts
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
│       ├── integrations/
│       │   └── google/
│       │       ├── callback/
│       │       │   └── route.ts
│       │       ├── start/
│       │       │   └── route.ts
│       │       ├── sync/
│       │       │   └── route.ts
│       │       └── route.ts
│       ├── library/
│       │   ├── [day]/
│       │   │   ├── log/
│       │   │   │   └── route.ts
│       │   │   └── route.ts
│       │   ├── books/
│       │   │   ├── [id]/
│       │   │   │   └── route.ts
│       │   │   └── route.ts
│       │   ├── hub/
│       │   │   └── route.ts
│       │   ├── plan/
│       │   │   └── route.ts
│       │   ├── sessions/
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
│       │   │   ├── attachments/
│       │   │   │   ├── sign/
│       │   │   │   │   └── route.ts
│       │   │   │   └── route.ts
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
│       ├── tools/
│       │   └── weather/
│       │       └── route.ts
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
│   │   ├── AttachmentPicker.tsx
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
├── reading/
│   ├── BookComposer.tsx
│   ├── BookshelfPanel.tsx
│   ├── ReadingSessionSheet.tsx
│   └── RhythmHeader.tsx
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
│   ├── VocabularyVaultScreen.tsx
│   └── WeatherScreen.tsx
├── settings/
│   ├── GoogleCalendarCard.tsx
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
├── weather/
│   ├── CityPicker.tsx
│   └── WeatherIcon.tsx
└── widgets/
    ├── home/
    │   ├── CustomizeSheet.tsx
    │   ├── DailyQuoteWidget.tsx
    │   ├── FinanceGoalWidget.tsx
    │   └── JalaliDateWidget.tsx
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
├── crypto/
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
│   ├── home-widgets.ts
│   ├── iran-geo.ts
│   ├── library.ts
│   ├── notifications.ts
│   ├── points.ts
│   ├── reading-plan.ts
│   ├── recurrence.ts
│   ├── streak-engine.ts
│   ├── task-detail.ts
│   └── vocabulary.ts
├── google/
│   ├── auto-sync.ts
│   ├── calendar-api.ts
│   ├── drain.ts
│   ├── link-state.ts
│   ├── mapping.ts
│   ├── oauth.ts
│   ├── secret-box.ts
│   ├── sync-queue.ts
│   └── tokens.ts
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
├── weather/
│   ├── conditions.ts
│   └── open-meteo.ts
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
├── use-task-attachments.ts
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
