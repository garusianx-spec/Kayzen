-- Google Calendar: one linked account per user, and a durable outbox.
--
-- The outbox holds one row per *object*, not per edit. Five rapid edits of the
-- same task collapse into one job, because what the queue stores is the desired
-- end state rather than a log of how it got there — and an UPSERT followed by a
-- DELETE overwrites to DELETE for the same reason.
--
-- Tokens are sealed with AES-GCM in the application before they reach these
-- columns. A refresh token is a standing grant to somebody's calendar: a dump
-- that leaks one is worse than a dump that leaks a password hash, which at
-- least has to be cracked first.

begin;

-- --- enums -----------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'calendar_entity') then
    create type public.calendar_entity as enum ('TASK', 'COUNTDOWN');
  end if;

  if not exists (select 1 from pg_type where typname = 'calendar_operation') then
    create type public.calendar_operation as enum ('UPSERT', 'DELETE');
  end if;
end $$;

-- --- the mirror ids --------------------------------------------------------
alter table public.tasks
  add column if not exists google_event_id varchar(1024);

alter table public.countdown_events
  add column if not exists google_event_id varchar(1024);

-- --- the linked account ----------------------------------------------------
create table if not exists public.google_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  google_sub varchar(64) not null unique,
  email varchar(320) not null,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  scope text not null,
  calendar_id varchar(200),
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- --- the outbox ------------------------------------------------------------
create table if not exists public.calendar_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  entity public.calendar_entity not null,
  entity_id uuid not null,
  operation public.calendar_operation not null,
  google_event_id varchar(1024),
  attempts integer not null default 0,
  run_after timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_sync_jobs_attempts_sane check (attempts between 0 and 100)
);

-- One pending job per object — this constraint is the collapse.
create unique index if not exists calendar_sync_jobs_object_idx
  on public.calendar_sync_jobs (user_id, entity, entity_id);

create index if not exists calendar_sync_jobs_due_idx
  on public.calendar_sync_jobs (user_id, run_after);

-- --- row-level security ----------------------------------------------------
do $$
declare
  scoped text;
begin
  foreach scoped in array array['google_accounts', 'calendar_sync_jobs']
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

commit;
