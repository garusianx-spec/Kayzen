-- ---------------------------------------------------------------------------
-- 0006 — Task detail, the daily vocabulary module, and the notification centre.
--
-- Three additions, and one rule they share: every new tenant-owned table is
-- scoped by `user_id` and carries the same RLS policy shape as the rest of the
-- schema. A table that holds a user's rows without that policy is not a missing
-- feature, it is a leak waiting for its first bug.
--
-- `vocabulary_words` is the exception, deliberately: it is a shared corpus in
-- the same category as `books_365` — readable by everyone, writable by nobody
-- at runtime.
-- ---------------------------------------------------------------------------

-- --- tasks: cost, place, reminder, category --------------------------------
create table if not exists public.task_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title varchar(40) not null,
  color_token text not null default 'violet',
  icon text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_categories_user_title_key unique (user_id, title)
);

create index if not exists task_categories_user_position_idx
  on public.task_categories (user_id, position);

alter table public.tasks
  add column if not exists cost_amount numeric(14, 0),
  add column if not exists location varchar(120),
  add column if not exists remind_at timestamptz,
  add column if not exists category_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_category_id_fkey'
  ) then
    alter table public.tasks
      add constraint tasks_category_id_fkey
      foreign key (category_id) references public.task_categories(id) on delete set null;
  end if;
end $$;

create index if not exists tasks_user_remind_at_idx on public.tasks (user_id, remind_at);

-- A cost is an amount of money, and there is no such thing as a negative one
-- here: an expense that gives money back is income, and lives in the finance
-- module.
alter table public.tasks drop constraint if exists tasks_cost_non_negative;
alter table public.tasks
  add constraint tasks_cost_non_negative check (cost_amount is null or cost_amount >= 0);

create table if not exists public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  -- Denormalised from the parent task so the RLS policy needs no join. The
  -- trigger below keeps it honest.
  user_id uuid not null references public.users(id) on delete cascade,
  title varchar(200) not null,
  position integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists task_checklist_items_task_position_idx
  on public.task_checklist_items (task_id, position);

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  object_path text not null unique,
  file_name varchar(200) not null,
  mime_type varchar(120) not null,
  size_bytes integer not null,
  created_at timestamptz not null default now()
);

create index if not exists task_attachments_task_idx on public.task_attachments (task_id);

-- --- vocabulary ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'learning_language') then
    create type public.learning_language as enum
      ('ENGLISH', 'TURKISH', 'FRENCH', 'GERMAN', 'SPANISH');
  end if;

  if not exists (select 1 from pg_type where typname = 'learning_level') then
    create type public.learning_level as enum ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');
  end if;

  if not exists (select 1 from pg_type where typname = 'vocabulary_status') then
    create type public.vocabulary_status as enum ('LEARNING', 'REVIEWING', 'MASTERED');
  end if;

  if not exists (select 1 from pg_type where typname = 'notification_category') then
    create type public.notification_category as enum
      ('TASK_REMINDER', 'HABIT_PROMPT', 'VOCABULARY', 'READING', 'FINANCIAL_MILESTONE', 'SYSTEM');
  end if;
end $$;

create table if not exists public.vocabulary_words (
  id uuid primary key default gen_random_uuid(),
  language public.learning_language not null,
  level public.learning_level not null,
  term varchar(80) not null,
  transliteration varchar(120),
  meaning_fa varchar(200) not null,
  part_of_speech varchar(40),
  example varchar(300),
  example_fa varchar(300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vocabulary_words_language_level_term_key unique (language, level, term)
);

create index if not exists vocabulary_words_language_level_idx
  on public.vocabulary_words (language, level);

create table if not exists public.language_courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  language public.learning_language not null,
  level public.learning_level not null default 'BEGINNER',
  words_per_day integer not null default 10,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint language_courses_user_language_key unique (user_id, language),
  constraint language_courses_words_per_day_range check (words_per_day between 1 and 10)
);

create index if not exists language_courses_user_archived_idx
  on public.language_courses (user_id, archived_at);

create table if not exists public.vocabulary_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  course_id uuid not null references public.language_courses(id) on delete cascade,
  word_id uuid not null references public.vocabulary_words(id) on delete cascade,
  day_key varchar(10) not null,
  created_at timestamptz not null default now(),
  constraint vocabulary_deliveries_course_day_word_key unique (course_id, day_key, word_id)
);

create index if not exists vocabulary_deliveries_user_day_idx
  on public.vocabulary_deliveries (user_id, day_key);

create table if not exists public.vocabulary_mastery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  word_id uuid not null references public.vocabulary_words(id) on delete cascade,
  status public.vocabulary_status not null default 'LEARNING',
  correct_runs integer not null default 0,
  review_count integer not null default 0,
  last_reviewed_at timestamptz,
  mastered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vocabulary_mastery_user_word_key unique (user_id, word_id)
);

create index if not exists vocabulary_mastery_user_status_idx
  on public.vocabulary_mastery (user_id, status);

-- --- notifications ---------------------------------------------------------
create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category public.notification_category not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint notification_preferences_user_category_key unique (user_id, category)
);

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category public.notification_category not null,
  title varchar(120) not null,
  body varchar(400) not null,
  deep_link varchar(300),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notification_logs_user_created_idx
  on public.notification_logs (user_id, created_at desc);
create index if not exists notification_logs_user_read_idx
  on public.notification_logs (user_id, read_at);

-- --- row-level security ----------------------------------------------------
do $$
declare
  scoped text;
begin
  foreach scoped in array array[
    'task_categories',
    'task_checklist_items',
    'task_attachments',
    'language_courses',
    'vocabulary_deliveries',
    'vocabulary_mastery',
    'notification_preferences',
    'notification_logs'
  ]
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

-- The corpus is shared reference data, like `books_365`: everyone reads it and
-- the runtime role never writes it. Seeding runs as the owner.
alter table public.vocabulary_words enable row level security;
alter table public.vocabulary_words force row level security;

drop policy if exists vocabulary_words_read_all on public.vocabulary_words;
create policy vocabulary_words_read_all on public.vocabulary_words for select using (true);

grant select on public.vocabulary_words to kayzen_app;

-- A checklist item's `user_id` must be the owner of its task. Enforced rather
-- than trusted, because the column exists only to let RLS skip a join — and a
-- denormalised key that can disagree with its source is a hole, not a shortcut.
create or replace function app.task_child_owner_matches()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner uuid;
begin
  select user_id into owner from public.tasks where id = new.task_id;

  if owner is null then
    raise exception 'task % does not exist', new.task_id;
  end if;

  if new.user_id is distinct from owner then
    raise exception 'user_id % does not own task %', new.user_id, new.task_id;
  end if;

  return new;
end $$;

drop trigger if exists task_checklist_items_owner on public.task_checklist_items;
create trigger task_checklist_items_owner
  before insert or update on public.task_checklist_items
  for each row execute function app.task_child_owner_matches();

drop trigger if exists task_attachments_owner on public.task_attachments;
create trigger task_attachments_owner
  before insert or update on public.task_attachments
  for each row execute function app.task_child_owner_matches();
