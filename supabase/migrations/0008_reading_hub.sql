-- Reading Hub: a daily commitment, a mode, a shelf, and a log of sittings.
--
-- The 365-day curriculum already existed (`books_365` / `user_reading_logs`).
-- What was missing is everything around it: how long the person means to read
-- for, whether they are reading summaries or a book of their own, and how much
-- of that book is behind them.
--
-- `reading_sessions.book_id` is nullable on purpose: a session logged against
-- the curriculum has no book row, and one streak should answer "did I read
-- today" for both halves rather than two that can disagree.

begin;

-- --- enum ------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'reading_mode') then
    create type public.reading_mode as enum ('SUMMARY', 'FULL_BOOK');
  end if;
end $$;

-- --- the plan --------------------------------------------------------------
create table if not exists public.reading_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  mode public.reading_mode not null default 'SUMMARY',
  daily_minutes integer not null default 15,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The three durations the UI offers. Enforced here as well as in zod so a
  -- stray write cannot leave a plan the picker has no chip for.
  constraint reading_plans_daily_minutes_allowed check (daily_minutes in (15, 30, 60))
);

-- --- the shelf -------------------------------------------------------------
create table if not exists public.user_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title varchar(200) not null,
  author varchar(160),
  total_pages integer not null,
  current_page integer not null default 0,
  color_token varchar(20) not null default 'violet',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_books_total_pages_positive check (total_pages between 1 and 20000),
  -- A bookmark past the last page is not a reading position, it is a bug that
  -- would render as 140% progress.
  constraint user_books_current_page_in_range check (current_page between 0 and total_pages)
);

create index if not exists user_books_user_finished_idx
  on public.user_books (user_id, finished_at);

-- --- the log ---------------------------------------------------------------
create table if not exists public.reading_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  book_id uuid references public.user_books(id) on delete set null,
  day_key varchar(10) not null,
  minutes integer not null,
  pages_read integer not null default 0,
  created_at timestamptz not null default now(),
  constraint reading_sessions_minutes_sane check (minutes between 1 and 1440),
  constraint reading_sessions_pages_sane check (pages_read between 0 and 20000)
);

create index if not exists reading_sessions_user_day_idx
  on public.reading_sessions (user_id, day_key);
create index if not exists reading_sessions_book_idx
  on public.reading_sessions (book_id);

-- --- row-level security ----------------------------------------------------
do $$
declare
  scoped text;
begin
  foreach scoped in array array['reading_plans', 'user_books', 'reading_sessions']
  loop
    execute format('alter table public.%I enable row level security', scoped);
    execute format('alter table public.%I force row level security', scoped);
    execute format('drop policy if exists %I on public.%I', scoped || '_tenant', scoped);
    execute format(
      'create policy %I on public.%I for all using (user_id = app.current_user_id())
         with check (user_id = app.current_user_id())',
      scoped || '_tenant', scoped
    );
    execute format(
      'grant select, insert, update, delete on public.%I to kayzen_app', scoped
    );
  end loop;
end $$;

-- A session's `user_id` must own the book it points at. Same reasoning as the
-- task children: the column exists so RLS can skip a join, and a denormalised
-- key that can disagree with its source is a hole, not a shortcut.
create or replace function app.reading_session_owner_matches()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner uuid;
begin
  if new.book_id is null then
    return new;
  end if;

  select user_id into owner from public.user_books where id = new.book_id;

  if owner is null then
    raise exception 'book % does not exist', new.book_id;
  end if;

  if new.user_id is distinct from owner then
    raise exception 'user_id % does not own book %', new.user_id, new.book_id;
  end if;

  return new;
end $$;

drop trigger if exists reading_sessions_owner on public.reading_sessions;
create trigger reading_sessions_owner
  before insert or update on public.reading_sessions
  for each row execute function app.reading_session_owner_matches();

commit;
