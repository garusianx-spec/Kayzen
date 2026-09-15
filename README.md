# کایزن — Kayzen

An offline-first Persian productivity planner. Next.js PWA, packaged for Google
Play as a **Trusted Web Activity**: daily task planning on a Jalali timeline,
habit streaks, a Pomodoro focus chamber with ambient audio, savings pots,
countdowns, and a 365-day micro-book library.

The name is the premise: **کایزن** — continuous one-percent improvement.

---

## What this is, architecturally

One codebase, two distribution channels. The web app _is_ the Android app: Play
installs a ~1 MB native shell that opens this origin in a Chrome Custom Tab with
the browser UI removed, verified as first-party through Digital Asset Links.
There is no WebView fork and no parallel native implementation to keep in sync.

That decision drives most of what follows — the manifest is a Play requirement
rather than a nicety, the service worker is the only offline story there is, and
haptics go through the Vibration API because inside the TWA that reaches
Android's real vibrator service.

|                   |                                                                 |
| ----------------- | --------------------------------------------------------------- |
| **Framework**     | Next.js 15 (App Router, React 19, RSC + client islands)         |
| **Styling**       | Tailwind CSS with CSS-variable design tokens, native RTL        |
| **Primitives**    | Radix UI, Framer Motion, `lucide-react`                         |
| **Calendar**      | `date-fns-jalali`, Persian digits throughout                    |
| **Client state**  | Zustand (timers, audio, sheets) · TanStack Query (server state) |
| **Offline**       | Service worker + IndexedDB outbox + Background Sync             |
| **API**           | Next Route Handlers under `/api/v1`, zod-validated              |
| **Database**      | PostgreSQL (Supabase) via Prisma, with Row-Level Security       |
| **Auth**          | Phone + SMS OTP, JWT access tokens, rotating refresh tokens     |
| **Push**          | Web Push (VAPID + RFC 8291), implemented on WebCrypto           |
| **Observability** | Sentry, `pino` structured logs                                  |

---

## Getting started

```bash
cp .env.example .env.local        # fill in DATABASE_URL and the two secrets
npm install
npm run db:generate               # Prisma client
npm run db:push                   # schema → database (or db:migrate in prod)
psql "$DIRECT_URL" -f supabase/migrations/0001_roles_and_helpers.sql
psql "$DIRECT_URL" -f supabase/migrations/0002_row_level_security.sql
psql "$DIRECT_URL" -f supabase/migrations/0003_domain_triggers.sql
psql "$DIRECT_URL" -f supabase/migrations/0004_storage.sql
npm run db:seed                   # the 365 library
npm run dev
```

The minimum to boot: `DATABASE_URL`, `AUTH_JWT_SECRET` (32+ chars),
`AUTH_OTP_PEPPER` (32+ chars). With `SMS_PROVIDER=console` — the default —
verification codes are printed to the server log instead of being sent, so you
can sign in locally with no gateway account. Production refuses to start that
way.

```bash
npm run verify        # format:check + lint + typecheck + test
npm test              # vitest
npm run test:e2e      # playwright, against a running build
npm run build
```

---

## Directory structure

```
kayzen/
├── android/
│   ├── README.md                 # keystore, asset links, Bubblewrap, Play checklist
│   └── twa-manifest.json         # Bubblewrap project config (package id, colours…)
├── e2e/                          # Playwright: installability + sign-in smoke tests
├── prisma/
│   ├── data/books-365.ts         # curated library catalogue
│   ├── schema.prisma             # data model
│   └── seed.ts                   # idempotent library seed
├── public/
│   ├── .well-known/              # generated assetlinks.json (optional static copy)
│   ├── audio/                    # ambient loops (not committed — see README)
│   ├── icons/                    # generated PNG icon set, incl. maskable
│   ├── manifest.json             # Web App Manifest (Play installability)
│   └── sw.js                     # service worker: cache, outbox replay, push
├── scripts/
│   ├── check-contrast.mjs        # WCAG audit of the design tokens
│   ├── generate-assetlinks.mjs   # static Digital Asset Links
│   ├── generate-icons.mjs        # draws the icon set (no image dependency)
│   └── generate-vapid-keys.mjs   # Web Push keys
├── src/
│   ├── app/
│   │   ├── (app)/                # authenticated shell: today, habits, focus,
│   │   │                         #   finance, library (+ /library/[day] catch-up),
│   │   │                         #   notes, countdowns, settings
│   │   ├── (auth)/login/         # phone + OTP sign-in
│   │   ├── api/assetlinks/       # /.well-known/assetlinks.json (via rewrite)
│   │   ├── api/v1/               # the API surface
│   │   │   ├── auth/otp/{send,verify}
│   │   │   ├── auth/{refresh,logout,session}
│   │   │   ├── tasks · habits · finance · countdowns · library
│   │   │   ├── notes (+ /notes/[id]/attachments — signed Storage URLs)
│   │   │   ├── pomodoro · preferences · today · push/subscribe
│   │   │   └── cron/{streaks,reminders}
│   │   ├── globals.css           # design tokens, RTL base, Yekan Bakh faces
│   │   ├── layout.tsx            # RTL root, metadata, theme bootstrap
│   │   └── offline/              # service-worker navigation fallback
│   ├── components/
│   │   ├── auth/                 # OtpInput, SignInFlow
│   │   ├── brand/                # KayzenLogo (mark + wordmark, inline SVG)
│   │   ├── composers/            # the six FAB actions
│   │   ├── layout/               # AppShell, AppHeader, BottomNav, QuickActionFab
│   │   ├── providers/            # query, theme, app providers
│   │   ├── pwa/                  # service-worker registrar, install prompt
│   │   ├── screens/              # one component per screen
│   │   ├── ui/                   # button, input, sheet, progress, toast, date picker
│   │   └── widgets/              # TaskItem, HabitCard, StreakFlame, NoteCard, AmbientPlayer
│   ├── hooks/                    # haptics, WebOTP, countdown, pomodoro, push, audio
│   ├── fonts/                    # Yekan Bakh WOFF2, loaded by next/font/local
│   ├── middleware.ts             # per-request CSP nonce
│   ├── lib/
│   │   ├── api/                  # route composition, DTOs, client, query hooks
│   │   ├── auth/                 # phone, otp, jwt, session cookies, token rotation
│   │   ├── fonts.ts              # next/font/local declaration
│   │   ├── date/                 # Jalali engine, Persian digit formatting
│   │   ├── db/                   # Prisma singleton, RLS-scoped transactions
│   │   ├── domain/               # streaks, recurrence, points, library, habits
│   │   ├── offline/outbox.ts     # IndexedDB mutation queue
│   │   ├── push/                 # VAPID signing, RFC 8291 encryption
│   │   ├── storage/              # Supabase Storage: signed URLs, path ownership
│   │   ├── sms/                  # gateway adapters + WebOTP message template
│   │   └── validation/schemas.ts # the one definition of every request shape
│   ├── stores/                   # zustand: ui, pomodoro, audio, preferences
│   └── types/                    # DTOs, WebOTP typings
├── supabase/migrations/          # roles, RLS policies, triggers, storage
├── tests/                        # vitest
├── Dockerfile · vercel.json      # containerised and serverless deployment
└── .github/workflows/            # ci · deploy · android (Bubblewrap)
```

---

## The Android shell

Everything Play-specific lives in [`android/README.md`](android/README.md) —
keystore creation, the two certificate fingerprints, Bubblewrap, and the
on-device verification checklist. The short version:

1. `public/manifest.json` satisfies the installability criteria: `standalone`,
   192 px and 512 px icons, a maskable icon, `start_url`, `name`/`short_name`.
   CI asserts all of that on every build.
2. `/.well-known/assetlinks.json` names the package and the SHA-256 fingerprints
   of **both** signing keys (upload key _and_ Play App Signing key). It is
   generated from `ANDROID_PACKAGE_NAME` and `ANDROID_SHA256_CERT_FINGERPRINTS`.
3. `npm run twa:build` produces the AAB; the tagged release workflow does the
   same on CI and refuses to build if the asset links are missing.

Native-feeling behaviour inside the shell:

- **Haptics** — `useHapticFeedback()` wraps `navigator.vibrate`, with
  `[15, 50, 15]` on task completion and an escalating pattern on a streak
  increment. Wired into `<Button>` so every tap is consistent.
- **WebOTP** — the SMS ends with `@kayzen.app #123456`; `useWebOtp()` calls
  `navigator.credentials.get({ otp: … })` and the code fills itself.
- **Push** — VAPID-signed, payload-encrypted notifications; the service worker
  shows them and focuses the running app on tap.
- **Edge-to-edge** — `viewport-fit=cover` plus `env(safe-area-inset-*)` padding
  on the floating navigation and FAB.

The navigation is five tabs by design — امروز, عادت‌ها, تمرکز, مالی, کتابخانه.
Notes and countdowns are written from the FAB and read from linked screens
(`/notes`, `/countdowns`) rather than a sixth tab, because a six-tab bar on a
phone puts every target under the comfortable thumb width.

---

## Authentication

Passwordless phone + SMS OTP, tuned for Iranian mobile numbers.

```
POST /api/v1/auth/otp/send     { phone }          → { challengeId, expiresAt, … }
POST /api/v1/auth/otp/verify   { phone, code, challengeId } → session cookies
POST /api/v1/auth/refresh                          → rotated pair
POST /api/v1/auth/logout                           → revoked
GET  /api/v1/auth/session                          → the signed-in user
```

- **Input** — `09xxxxxxxxx`, `+98…`, `00989…`, spaced, dashed, or in Persian
  digits; all normalise to one canonical E.164 string before anything compares
  them.
- **Storage** — only `HMAC-SHA256(pepper, "<phone>:<code>")` is persisted, with
  the phone bound into the digest so a stolen hash cannot be replayed against
  another number.
- **Comparison** — constant-time, with a dummy HMAC on the "no such challenge"
  path so failure modes are indistinguishable by timing.
- **Rate limits** — 1 SMS per number per 120 s, 1 per IP per 120 s, 5 per number
  per day, 5 wrong codes then a 15-minute lock. Enforced in Upstash Redis _and_
  in the database, because the Redis limiter fails open by design.
- **Sessions** — 15-minute JWT access tokens plus single-use refresh tokens in
  `HttpOnly; Secure; SameSite=Strict` cookies. Re-presenting a rotated refresh
  token is treated as theft and revokes the whole family.
- **Enumeration** — the send endpoint answers identically for registered and
  unregistered numbers.

## Data privacy

Every tenant query runs inside `withUserContext()`, which opens a transaction,
sets `app.current_user_id` as a transaction-local GUC, and hands the handler a
scoped client. The RLS policies in
`supabase/migrations/0002_row_level_security.sql` match that GUC, so a query
issued without it returns nothing rather than everything. Composite foreign keys
(`(habit_id, user_id) → habits(id, user_id)`) stop a forged parent id from
crossing tenants even on insert.

The runtime connects as `kayzen_app`, a `NOBYPASSRLS` role that owns nothing;
migrations use the owner role over `DIRECT_URL`.

## Brand and theming

The typeface is **Yekan Bakh**, loaded through `next/font/local`
(`src/lib/fonts.ts`) as WOFF2 — 46 KiB per weight, down from 135 KiB of TTF.
Self-hosting through `next/font` rather than hand-written `@font-face` buys
hashed immutable URLs, an automatic preload link, and one CSS variable for the
Tailwind stack. Only 400 and 700 ship, so the type scale states those two
weights rather than implying four the family cannot produce.

The mark is drawn as inline SVG (`src/components/brand/KayzenLogo.tsx`) from the
same three-bar geometry `scripts/generate-icons.mjs` rasterises into the app
icons, so one definition drives the header, the home screen and the Play
listing. It inherits the theme through CSS variables instead of needing a
second file per mode.

Colour is two layers. `--kz-*` holds the palette and is the only thing a theme
restates; semantic aliases (`--background`, `--foreground`, `--muted-foreground`,
`--primary`) sit on top and are what components should reach for —
`bg-background text-foreground`. Because they are aliases rather than copies, a
semantic name cannot drift from the palette it names.

One distinction is load-bearing: **ink and fill are different roles.**
`--kz-violet` has to be light to read as a link on a `#0B0B14` page, which means
a button filled with it cannot carry white text (2.0:1). The fill tokens are
therefore fixed at the deep end of each ramp, identical in both themes, and
always carry white. `npm run contrast` measures all 54 pairs; introducing the
semantic layer surfaced twelve genuine failures, including white-on-rose button
labels at 3.4:1 and a light-mode border at 1.24:1.

## Attachments

Note attachments live in a **private** Supabase Storage bucket. Kayzen does not
use Supabase Auth, so `auth.uid()` inside Storage is always NULL and a policy
written against it would deny everything; the bucket therefore has no policies
at all and the application mediates every access with the service-role key.

That key can read any object in the bucket, which makes one function —
`assertOwnedObjectPath` — the entire boundary between tenants. Objects are keyed
`<user-uuid>/<note-uuid>/<random>-<filename>`, so ownership is the first path
segment and is checked before anything is signed. It has 17 tests, including the
case a `startsWith` check would wave through (`<user>-evil/...`).

Bytes never pass through the app server:

1. `POST /api/v1/notes/:id/attachments` — note ownership is checked against the
   RLS-scoped client, and a one-shot signed upload URL comes back;
2. the browser `PUT`s the file straight to Supabase;
3. the client records the object key on the note.

Step 3 is separate deliberately: an unused signed URL expires harmlessly,
whereas recording the attachment first would leave the note pointing at an
object that never arrived. Downloads are signed in batches with a 15-minute TTL.

Attachments are the one feature that is _not_ offline-capable, which is a limit
rather than an oversight — a signed URL would expire long before a queued
upload replayed — so the picker says so instead of failing silently.

## Offline

- Reads: network-first with a cache fallback, so the Today screen still renders
  in a tunnel.
- Writes: parked in an IndexedDB outbox and replayed — by the page on `online`,
  or by the service worker through Background Sync if the app was closed.
  Optimistic cache updates stay on screen meanwhile.
- A 4xx on replay drops the entry: a refusal will not become an acceptance, and
  one bad row must not wedge the queue.

---

## Domain engines

- **Streaks** (`src/lib/domain/streak-engine.ts`) — a pure function over a log
  window, so the nightly cron, the optimistic client update and the API response
  cannot disagree. Only scheduled weekdays count, an unfinished _today_ is never
  a miss, and grace days absorb one lapse without extending the streak.
- **Recurrence** — an RRULE subset that advances by _Jalali_ months and years.
- **365 library** — the day number is a function of enrolment, not the calendar,
  so everyone starts at day ۱. Days past the curated catalogue become review
  days that re-surface an earlier summary.
- **Financial ledger** — `current_amount` is maintained by a database trigger
  over the transaction ledger, so the cached balance cannot drift from the rows
  that produced it.

## Scheduled work

`vercel.json` runs both jobs hourly (Upstash QStash works identically — same
bearer secret, same endpoints):

- `/api/v1/cron/streaks` — reconciles streaks per user, inside each user's own
  RLS context, and purges expired OTP challenges and refresh tokens.
- `/api/v1/cron/reminders` — sends the daily nudge to users whose _local_ clock
  just reached their chosen hour, which is how one UTC cron serves every
  timezone without a 3 a.m. notification.

---

## Testing

181 unit tests over the parts where a subtle bug is expensive and a browser is
not required: Jalali day-boundary maths, Persian digit parsing, the streak
rules, phone normalisation, OTP hashing and constant-time comparison, the WebOTP
message format, request schemas, the OTP input's autofill attributes, the
markdown sanitiser that guards note rendering (script tags, `javascript:` and
`data:` URLs, event handlers, link hardening), attachment path ownership, WCAG contrast for
every token pair in both themes, and a full round-trip of the Web Push
encryption against a decryptor written from RFC 8291.

Playwright covers what unit tests structurally cannot: that the manifest, the
service worker and the asset links are served correctly by the running server.

## Deployment

**Vercel** — `.github/workflows/deploy.yml` migrates, seeds, builds, deploys,
then verifies that `/.well-known/assetlinks.json` still carries fingerprints (a
deployment that breaks it silently puts the URL bar back in the installed app).

**Docker** — multi-stage build on `output: 'standalone'`, non-root runtime, with
a health check against `/api/v1/health`:

```bash
docker build --build-arg NEXT_PUBLIC_APP_URL=https://kayzen.app -t kayzen .
docker run -p 3000:3000 --env-file .env.production kayzen
```

## Contributing notes

- `npm run verify` is what CI runs; run it before pushing.
- The CSP carries a per-request nonce from `src/middleware.ts`; inline scripts
  need `nonce={nonce}` rather than a hash. Adding _any_ hash to `script-src`
  makes browsers ignore `'unsafe-inline'`, which silently blocks the inline
  scripts Next.js streams the RSC payload through — the page renders and then
  never hydrates.
- `npm run contrast` audits every token pair against WCAG; `npm test` asserts
  the same table, so a palette edit cannot quietly drop text below threshold.
- Adding a library entry: append to `prisma/data/books-365.ts`, `npm run db:seed`.
- Request shapes live only in `src/lib/validation/schemas.ts`; forms and route
  handlers both import from there so they cannot drift.
