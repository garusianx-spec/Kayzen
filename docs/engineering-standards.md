# Kayzen — Engineering Standards

This document is the contract. `docs/architecture.md` describes what the system
_is_; this describes what any change to it must satisfy before it lands.

Two things make it useful rather than decorative. Every rule points at the place
in this repository where it is already enforced — by a compiler flag, a lint
rule, a database constraint or a test — because a rule nothing enforces is a
suggestion. And where the codebase does **not** yet meet a rule, the exception
is listed by name in a register at the end of that section, with what has to
happen. A standards document that quietly describes an imaginary codebase is
worse than none: it teaches people to ignore it.

One command decides whether a change is admissible:

```
npm run verify     # format:check → lint → typecheck → test
```

Nothing merges red. There is no "fix it in a follow-up" for any of those four.

---

## 1. Git workflow, branching and commits

### Branches

Trunk-based, with short-lived branches off `main`. A branch that has been alive
for more than a few days is a branch that is going to be painful to merge, and
the cure is to cut the work smaller, not to rebase harder.

| Prefix      | For                                              |
| ----------- | ------------------------------------------------ |
| `feat/`     | new user-visible capability                      |
| `fix/`      | a defect in shipped behaviour                    |
| `refactor/` | structure changes with no behavioural difference |
| `chore/`    | tooling, dependencies, CI, generated assets      |
| `docs/`     | documentation only                               |

Name the branch after the outcome, not the mechanism: `feat/google-calendar-sync`,
not `feat/add-google-files`.

Never rewrite history on a branch someone else may have checked out. On your
own, before review, rebase freely.

### Commits

[Conventional Commits](https://www.conventionalcommits.org), with the same
scope vocabulary as the branch prefixes:

```
feat(reading): a Reading Hub — a daily duration, and two ways to spend it
fix(auth): stop the OTP resend timer from surviving a sign-out
refactor(queries): split the task hooks out of the query module
```

A commit is **atomic**: it compiles, its tests pass, and reverting it removes
exactly one idea. A commit that needs the next one to work is not a commit, it
is a save point.

The body earns its place by answering _why_, not _what_ — the diff already says
what. Name the alternative you rejected and the reason. The most valuable line
in a commit message is usually the one explaining why the obvious approach was
wrong.

A commit that changes behaviour and carries no test is incomplete. See §6.

---

## 2. Architecture, modularity and file size

### The four layers

Dependencies point inwards. An inner layer never imports an outer one.

```
         ┌─────────────────────────────────────────┐
         │  UI Presentation                        │   src/components/, src/app/(app)/
         │  ┌───────────────────────────────────┐  │
         │  │  Application Services             │  │   src/app/api/v1/**/route.ts
         │  │  ┌─────────────────────────────┐  │  │   src/lib/api/, src/lib/google/
         │  │  │  Domain Core                │  │  │   src/lib/domain/
         │  │  │  pure, no I/O, no clock     │  │  │
         │  │  └─────────────────────────────┘  │  │
         │  └───────────────────────────────────┘  │
         └─────────────────────────────────────────┘
                          ↓ gateways
                 src/lib/db/, src/lib/storage/,
                 src/lib/sms/, src/lib/weather/
```

**Domain Core** (`src/lib/domain/`) is pure. Anything that needs a clock, a
database or a network takes it as an argument:

```ts
// src/lib/domain/reading-plan.ts
export function summariseRhythm(options: {
  sessions: readonly ReadingSessionLike[];
  dailyMinutes: number;
  now?: Date; // ← injected, never read from the ambient clock
  timezone?: string;
}): ReadingRhythm;
```

That injection is the whole reason `tests/` runs in seconds with no database.
It is not a testing trick — it is what makes the rule checkable.

**Application Services** orchestrate: they read the request, call the domain,
talk to gateways, and shape a response. Every endpoint goes through
`withRoute`/`withAuthedRoute` (`src/lib/api/handler.ts`). A bare exported
`GET`/`POST` that does its own session handling is a hole in every guarantee
below at once.

**Data Gateways** own one external system each and hide its vocabulary. Nothing
above `src/lib/google/calendar-api.ts` knows what a `colorId` is; nothing above
`src/lib/storage/supabase.ts` knows what a signed URL looks like.

**UI Presentation** renders. A component that computes a streak is a component
that has stolen work from the domain layer, where it could have been tested.

### File size

**A behavioural file is at most 250 lines.** Components, route handlers, hooks,
services, gateways. At 200 lines, start looking for the seam; at 250, take it.

Real splits from this repository, all of which made the code easier to read:

- `TaskComposer.tsx` → `task/ChecklistBuilder`, `task/PrioritySelector`,
  `task/AttachmentPicker`
- the Reading Hub → `RhythmHeader`, `BookshelfPanel`, `BookComposer`,
  `ReadingSessionSheet`
- Google Calendar → `oauth`, `tokens`, `calendar-api`, `mapping`, `sync-queue`,
  `drain`, `auto-sync`, `link-state`, `secret-box` — nine files, the largest
  225 lines, each nameable in one sentence

The limit exists because a file you cannot hold in your head is a file where
bugs hide behind the scroll. The seam to cut on is a _responsibility_, never a
line count: splitting one 400-line component into `Part1.tsx` and `Part2.tsx`
satisfies the letter of the rule and defeats its purpose entirely.

**Declaration files are exempt** and are a different kind of artifact: a dataset
(`iran-geo.ts` — 31 provinces), a schema registry (`validation/schemas.ts`), a
type manifest (`types/domain.ts`), a seed. They are long because the domain is
wide, not because a function grew. They are still expected to be _sectioned_,
with `// ---` banners and a docstring per group.

#### Exception register

Behavioural files currently over the limit, in the order they should be split:

| File                                    | Lines | Split                                                                   |
| --------------------------------------- | ----- | ----------------------------------------------------------------------- |
| `src/lib/api/queries.ts`                | ~984  | one module per feature (`queries/tasks`, `queries/reading`, …)          |
| `src/lib/db/memory/engine.ts`           | ~765  | `where`-matching, ordering, and nested writes are three separate ideas  |
| `src/components/composers/TaskComposer` | ~486  | the detail panel is its own component                                   |
| `src/components/auth/SignInFlow.tsx`    | ~365  | the OTP step and the password step barely share state                   |
| `src/components/screens/WeatherScreen`  | ~342  | `CurrentCard`, `HourlyStrip` and `DailyList` are already sub-components |
| `src/components/screens/TodayScreen`    | ~327  | each `widget()` case belongs in `widgets/home/`                         |

`iran-geo.ts`, `types/domain.ts`, `validation/schemas.ts`, `env.ts`,
`jalali.ts`, `dto.ts` and `memory/seed.ts` are declaration files and are not on
this list.

### Type safety

`tsconfig.json` is the enforcement, not this paragraph:

```jsonc
"strict": true,
"noUncheckedIndexedAccess": true,   // array[0] is T | undefined
"noImplicitOverride": true,
"noFallthroughCasesInSwitch": true
```

- **Zero `any`.** The codebase currently contains none. `unknown` plus a zod
  parse is the answer at every boundary; a cast is the answer at none.
- **`noUncheckedIndexedAccess` is not negotiable.** It is noisy and it has
  caught real bugs here — it is the reason the week strip cannot render
  `undefined` when a day is missing.
- **Parse, don't validate.** Every payload crossing a boundary is zod-parsed
  into a type, in both directions: request bodies and query strings
  (`src/lib/validation/schemas.ts`, applied by `withRoute`), _and_ third-party
  responses (`open-meteo.ts`, `calendar-api.ts`, `oauth.ts`). "It's Google, it
  will be fine" is how a schema change becomes a 500 in a cron job at 3am.
- **One schema, two consumers.** The composer and the route handler import the
  same object, so a form cannot accept what the API will reject. They cannot
  drift, because there is only one of them.

---

## 3. Security

### Row-level security is not optional

Every tenant-bound table carries the same policy shape, applied in
`supabase/migrations/`:

```sql
create policy <table>_tenant on public.<table>
  for all using (user_id = app.current_user_id())
  with check (user_id = app.current_user_id());
```

`force row level security` as well as `enable`, so the table owner does not
bypass it. The runtime role `kayzen_app` is `NOBYPASSRLS`.

Every tenant query runs through `withUserContext` (`src/lib/db/rls.ts`), which
opens one transaction, sets the `app.current_user_id` GUC and hands the
callback a scoped client. **A query on the bare `prisma` client sees nothing**,
because `user_id = NULL` is never true — the failure mode is an empty result,
not a cross-tenant leak. That is the property worth preserving.

RLS is defence in depth, not the only depth: handlers still filter by
`userId` themselves. Two independent checks, because one of them will
eventually be forgotten.

Where a child table denormalises `user_id` so a policy needs no join, a trigger
enforces that it matches its parent (`app.task_child_owner_matches`,
`app.reading_session_owner_matches`). A denormalised key that can disagree with
its source is a hole, not a shortcut.

**Adding a tenant table without a policy, a grant and a `withUserContext` path
is a defect, whatever else the pull request does.**

### Sessions and cookies

`src/lib/auth/session.ts`:

```ts
httpOnly: true,
secure: isProduction,
sameSite: 'strict',
path: '/',
// __Host- prefix in production: no Domain, Path=/, Secure — a subdomain
// cannot overwrite it.
```

Access tokens are short-lived JWTs; refresh tokens rotate on use and are
revocable per device. `SameSite=Strict` keeps them off cross-site requests, and
`withRoute` additionally rejects a foreign `Origin` on every non-GET — turning a
silently unauthenticated write into an explicit refusal.

That strictness has a consequence worth internalising: **the session cookie is
not sent on an inbound redirect from a third party.** The Google OAuth callback
cannot authenticate the ordinary way, which is why
`src/lib/google/link-state.ts` exists — a separate, signed, `SameSite=Lax`,
`HttpOnly` cookie carrying the user id, the `state` nonce and the PKCE verifier.
Any future third-party redirect needs the same treatment. Loosening the session
cookie to `Lax` to avoid writing one is not an option.

### OWASP, concretely

| Risk                  | What this codebase does                                                                                                                                                                                                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Injection             | Prisma parameterises everything. Raw SQL lives only in migrations, reviewed as SQL.                                                                                                                                                                                                                                                       |
| XSS                   | **No raw HTML reaches the DOM except through `renderMarkdown`** (`src/lib/sanitize.ts`): DOMPurify, an explicit tag allow-list, a URI-scheme allow-list that rejects `javascript:` and `data:`, and a hook forcing `rel="noopener noreferrer"`. Sanitising on _render_ means tightening the list later also protects rows already stored. |
| Broken access control | RLS + `withUserContext` + explicit `userId` filters. Object paths are re-checked against the caller's namespace _and_ the parent record (`assertOwnedObjectPath`).                                                                                                                                                                        |
| Timing side channels  | `constantTimeEqual` for OTP digests and cron secrets; `verifyPassword` runs a full scrypt derivation against a decoy hash when no password is set, so "no account" and "wrong password" take the same time.                                                                                                                               |
| Credential storage    | scrypt (N=2^15, r=8, p=3) for passwords — never reversible. AES-256-GCM (`secret-box.ts`) for the one secret that must be replayed, a Google refresh token, under its own key.                                                                                                                                                            |
| Rate limiting         | Upstash sliding window on every public endpoint, via the `rateLimit` scope on `withRoute`. In-process fallback in development; **refused in production**, where one process is not the deployment.                                                                                                                                        |
| Secrets in responses  | DTOs are explicit allow-lists (`src/lib/api/dto.ts`). This is why `passwordHash` cannot leak: nothing maps it.                                                                                                                                                                                                                            |
| Secrets in logs       | `EnvConfigError` logs variable _names_, never values. Token bodies are never logged.                                                                                                                                                                                                                                                      |

**A new endpoint declares a `rateLimit` scope.** Omitting it is not a default,
it is an unlimited endpoint.

### Third-party grants

- Request the narrowest scope that works. Kayzen asks for `calendar.events`,
  not `calendar`, because the wider one permits deleting a calendar and nothing
  here has any business doing that.
- Write into a namespace you own. The sync engine provisions a dedicated
  "Kayzen Planner" calendar so a deleted task can never remove something the
  person put there themselves.
- Verify what was actually _granted_, not what was asked for. The callback
  refuses a link whose returned scope is missing `calendar.events`, rather than
  succeeding and failing on every write afterwards.
- Disconnect must always work. Revocation is attempted, the local row is
  deleted either way: a person who cannot leave is in a worse state than one
  whose remote token outlives the link by an hour.

---

## 4. Performance and Core Web Vitals

### Targets

| Metric | Budget  | Why this number                                                    |
| ------ | ------- | ------------------------------------------------------------------ |
| LCP    | < 1.5 s | On a mid-range Android over Iranian mobile data, not on a laptop.  |
| CLS    | < 0.05  | A reflow under a thumb on a 44px target is a mis-tap.              |
| INP    | < 100ms | Below the threshold where a tap stops feeling like a button press. |

### Server-first

Heavy dependencies stay in Server Components. `/library` is the worked example:
the 365-day summary is plain server HTML, and only the genuinely interactive
parts — the reflection form, the rhythm header, the shelf — are client islands.
Switching reading mode calls `router.refresh()` rather than swapping a
client-side tab, precisely so the summary half is _never shipped to the browser
just to be hidden there_.

Client Components are interactive leaves. `'use client'` on a screen root drags
its whole subtree across the boundary; push it down to the widget that actually
needs state.

### Fonts and layout stability

`next/font/local` with the committed Yekan Bakh WOFF2 files (`src/lib/fonts.ts`)
— self-hosted, hashed, immutable URLs, a preload link in the head, and one CSS
variable that Tailwind's stack consumes so no component names the family. A
Persian webfont arriving late is not cosmetic: with `display: swap` the first
frame renders in a fallback whose glyph widths differ enough to reflow a whole
screen.

Other CLS rules, all already load-bearing here:

- Reserve space before data arrives. `Skeleton` blocks match the height of what
  replaces them.
- `tabular` (tabular numerals) on every number that ticks — timers, counters,
  temperatures — so a digit change never re-measures a line.
- Images and thumbnails get explicit box dimensions; the attachment picker's
  tiles are `h-11 w-11` whether or not the preview has loaded.

### Data fetching

- **One request per screen, not five.** The Today screen and the Reading Hub
  each resolve from a single endpoint. Five parallel calls are five chances at a
  half-rendered screen on a weak connection.
- **Cache what is shared.** Open-Meteo responses are keyed by URL in Next's data
  cache for fifteen minutes, so every reader looking at تهران in the same
  quarter-hour costs one upstream request.
- **Optimistic mutations follow the three-step contract**: snapshot in
  `onMutate`, restore in `onError`, reconcile in `onSettled`. Skipping the
  snapshot is what produces "the task un-ticks itself a second later".
- **Never make a person wait on a third party.** Work that can happen after the
  response happens after the response: the calendar engine enqueues inside the
  request transaction and drains in `after()`. Saving a task is as fast as
  Postgres, not as fast as Google.

---

## 5. Accessibility, RTL and Persian text

### WCAG 2.2 AAA

- **44×44 px minimum** for anything tappable. In practice: `min-h-[44px]`, or
  `h-11 w-11` for an icon button. A 32px icon button with generous padding is
  not compliant — the _target_ is what is measured.
- **Radix primitives** for anything with a role: dialogs, switches, progress,
  tabs. They bring focus management, escape handling and ARIA wiring that
  hand-rolled `div`s never get right.
- **Persian ARIA labels, always.** `aria-label="چیدمان صفحه"`, not
  `aria-label="layout"`. A screen-reader user of a Persian app is a Persian
  speaker.
- **Decorative icons are `aria-hidden`.** The accessible name lives on the
  control, so a screen reader announces "حذف photo.png" and not the icon.
- **Contrast is tested, not eyeballed.** `tests/contrast.test.ts` asserts every
  semantic token pair against AAA ratios, in both themes. `npm run contrast`
  checks the palette directly.
- **`useReducedMotion`** gates every spring and transition. Motion is a
  preference, not a decoration.

### RTL

**Logical properties, not physical ones.** `ms-`/`me-`, `ps-`/`pe-`,
`start-`/`end-`, `text-start`/`text-end`. A `ml-4` that looks right in review
puts a gap on the wrong side of every Persian screen.

The exceptions that are genuinely physical — an icon pinned inside an input, a
mirrored chevron — are exceptions and carry a comment saying so:

```tsx
{
  /* RTL: "back" points right, which `ChevronLeft` mirrored is not —
    so the glyph that reads as backwards here is the left one. */
}
<ChevronLeft className="h-4 w-4 rotate-180" aria-hidden />;
```

Direction of time follows direction of reading: the oldest item is rightmost.
Both the reading week strip and the hourly weather strip reverse their
today-first arrays for exactly this reason.

#### Exception register

Physical properties currently in the tree, to convert:
`ui/password-field.tsx` (`pr-12`, `right-0`), `layout/QuickActionFab.tsx`
(`right-5`), `screens/NotesScreen.tsx` (`right-3`, `pr-10`),
`brand/BrandMark.tsx` (`left-1`).

### Persian text

- **Digits.** Every number a person reads goes through `toPersianDigits`;
  every number a person types comes back through `parsePersianNumber`. Latin
  digits next to Persian ones on the same screen is the single most common
  polish failure in a Persian app.
- **ی/ي and ک/ك.** An Arabic keyboard produces `ي` (U+064A) and `ك` (U+0643);
  a Persian one produces `ی` (U+06CC) and `ک` (U+06A9). **Any comparison,
  search or dedupe over user-entered Persian must normalise first.**
  `normaliseQuery` in `src/lib/domain/iran-geo.ts` is the reference
  implementation — it also strips ZWNJ, direction marks and tatweel.

  _Gap:_ that helper lives in the geography module because it is currently the
  only consumer. The second consumer promotes it to `src/lib/text/persian.ts`;
  it must not be copied.

- **ZWNJ (`‌`) is a letter, not a space.** `می‌شود` is one word. Never
  collapse it into whitespace, never strip it from display text.
- **Jalali everywhere a date is shown.** Gregorian appears only where a third
  party demands it, and is converted at the boundary
  (`weather/open-meteo.ts`, `google/mapping.ts`).

### Copy

The Kaizen voice is 1% better than yesterday, never nagging. The empty state is
the test: not «هیچ تسکی وجود ندارد» but «امروز همه‌چیز مرتبه؛ آماده‌ای ۱٪ بهتر
از دیروز باشی؟». An error says what happened and what to do, and never implies
the person caused it — «شاید اینترنت قطع است، شاید سرویس هواشناسی شلوغ.
هیچ‌کدامش تقصیر تو نیست.»

---

## 6. The execution protocol

Every contribution — a route, a component, a domain function, a schema change —
lands with **all** of the following. Not most.

1. **Tests that would fail without the change.** Domain logic gets unit tests;
   a boundary gets a fixture-driven parse test; a constraint gets a test against
   the real query engine (`tests/google-calendar.test.ts` proves the sync
   queue's collapse against the in-memory Prisma substitute, because the
   collapse is enforced by a _unique index_ and a hand-rolled mock would keep
   passing if the index were dropped).

   Test the decision, not the mock. A test of a `fetch` stub asserts that the
   code does what it was written to do, which is never in doubt.

2. **Documentation updated in the same commit.** A schema change updates
   `prisma/schema.prisma`, a migration in `supabase/migrations/` _with RLS_, and
   the data-model section of `docs/architecture.md`. A new route updates the API
   surface and the tree. A new environment variable is documented in
   `.env.example` with what it is for and how to generate it.

3. **`npm run verify` clean.** Format, lint (`--max-warnings 0`), typecheck,
   tests. All four.

4. **Verified against the running app, not only against the test suite.** Start
   it, drive the path, look at it. Every feature in this repository was checked
   this way before it was committed, and it is how the difference between "the
   tests pass" and "it works" keeps getting caught.

5. **Honest about what is not done.** If a dependency could not be exercised —
   an egress-blocked third party, credentials you do not hold — say so plainly
   in the commit body and in the hand-off. "Verified with a fixture; the live
   call has not been made from this environment" is a useful sentence. Implying
   otherwise is not.

### Comments

Comment the _why_. The code says what it does; a comment that repeats it decays
into a lie the first time the code changes. Reserve them for the decision
behind the line:

```ts
// The streak skips an unmet *today* rather than breaking on it: the day is
// not over, and a counter that resets at midnight and un-resets when you
// read is a counter that spends most of the day lying.
```

Every module carries a docstring saying what it is for and what it deliberately
does not do. The second half is usually the more valuable one.

### Definition of done

A change is done when a competent stranger could read the diff, understand why
it was made this way rather than the obvious way, run one command to know it
works, and delete it cleanly if the feature is dropped.
