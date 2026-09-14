-- ---------------------------------------------------------------------------
-- 0002 — Row-Level Security.
--
-- Policy shape, applied to every tenant-owned table:
--   * SELECT/UPDATE/DELETE  — USING (user_id = app.current_user_id())
--   * INSERT                — WITH CHECK (user_id = app.current_user_id())
--
-- `app.current_user_id()` returns NULL when the GUC is unset, and `user_id = NULL`
-- is NULL (never true), so an un-scoped connection reads and writes nothing.
-- `force row level security` makes the policies bind the table owner too, which
-- protects against a misconfigured deployment that connects as the owner.
-- ---------------------------------------------------------------------------

-- --- users -----------------------------------------------------------------
alter table public.users enable row level security;
alter table public.users force row level security;

drop policy if exists users_select_self on public.users;
create policy users_select_self on public.users
  for select using (id = app.current_user_id());

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update using (id = app.current_user_id())
  with check (id = app.current_user_id());

-- Two operations legitimately precede a tenant context and both live on the
-- `users` table: the OTP sign-in lookup ("is there an account for +98…?") and
-- the nightly reconciliation cron, which reads the id list and then re-enters
-- `withUserContext()` per user. Both are unscoped SELECT plus, for sign-up, a
-- single INSERT. The carve-out fires *only* while the context is unset, so an
-- authenticated session can never use it to reach another tenant's row.
drop policy if exists users_unscoped_auth_select on public.users;
create policy users_unscoped_auth_select on public.users
  for select using (app.current_user_id() is null);

drop policy if exists users_signup_insert on public.users;
create policy users_signup_insert on public.users
  for insert with check (app.current_user_id() is null);

comment on policy users_unscoped_auth_select on public.users is
  'OTP sign-in lookup and the reconciliation cron; both run before/without a tenant context.';
comment on policy users_signup_insert on public.users is
  'OTP sign-up path only: INSERT is permitted when no tenant context is set.';

-- --- otp_sessions ----------------------------------------------------------
-- Pre-authentication table. The caller has no identity while a challenge is in
-- flight, so tenant scoping is impossible by construction. What limits the blast
-- radius instead: rows hold an HMAC digest rather than a code, they are
-- single-use, they expire in minutes, and the cron sweep deletes the remains.
alter table public.otp_sessions enable row level security;
alter table public.otp_sessions force row level security;

drop policy if exists otp_sessions_unscoped on public.otp_sessions;
create policy otp_sessions_unscoped on public.otp_sessions
  for all using (app.current_user_id() is null)
  with check (app.current_user_id() is null);

comment on policy otp_sessions_unscoped on public.otp_sessions is
  'Reachable only from the unauthenticated OTP routes; an authenticated session cannot read challenges.';

-- --- refresh_tokens --------------------------------------------------------
-- Two access paths: the owner managing their own sessions (scoped), and the
-- refresh exchange, which looks a row up by token digest before any identity
-- exists (unscoped). The digest is the only selector the exchange ever accepts.
alter table public.refresh_tokens enable row level security;
alter table public.refresh_tokens force row level security;

drop policy if exists refresh_tokens_owner on public.refresh_tokens;
create policy refresh_tokens_owner on public.refresh_tokens
  for all using (user_id = app.current_user_id())
  with check (user_id = app.current_user_id());

drop policy if exists refresh_tokens_exchange on public.refresh_tokens;
create policy refresh_tokens_exchange on public.refresh_tokens
  for all using (app.current_user_id() is null)
  with check (app.current_user_id() is null);

comment on policy refresh_tokens_exchange on public.refresh_tokens is
  'Token rotation path: rows are addressed by SHA-256 digest, which an attacker cannot enumerate.';

-- --- tenant-owned tables ---------------------------------------------------
do $$
declare
  target text;
begin
  foreach target in array array[
    'tasks',
    'habits',
    'habit_logs',
    'financial_boxes',
    'financial_transactions',
    'countdown_events',
    'notes',
    'user_reading_logs',
    'pomodoro_sessions',
    'push_subscriptions'
  ]
  loop
    execute format('alter table public.%I enable row level security', target);
    execute format('alter table public.%I force row level security', target);

    execute format('drop policy if exists %I on public.%I', target || '_select', target);
    execute format(
      'create policy %I on public.%I for select using (user_id = app.current_user_id())',
      target || '_select', target);

    execute format('drop policy if exists %I on public.%I', target || '_insert', target);
    execute format(
      'create policy %I on public.%I for insert with check (user_id = app.current_user_id())',
      target || '_insert', target);

    execute format('drop policy if exists %I on public.%I', target || '_update', target);
    execute format(
      'create policy %I on public.%I for update using (user_id = app.current_user_id()) '
      'with check (user_id = app.current_user_id())',
      target || '_update', target);

    execute format('drop policy if exists %I on public.%I', target || '_delete', target);
    execute format(
      'create policy %I on public.%I for delete using (user_id = app.current_user_id())',
      target || '_delete', target);
  end loop;
end
$$;

-- --- books_365 -------------------------------------------------------------
-- Global curriculum: readable by any scoped session, writable only by the
-- migration/owner role (RLS is enabled but not forced here, so `prisma db seed`
-- running as the owner can populate it).
alter table public.books_365 enable row level security;

drop policy if exists books_365_read_all on public.books_365;
create policy books_365_read_all on public.books_365
  for select using (app.current_user_id() is not null);

-- ---------------------------------------------------------------------------
-- Cross-tenant integrity: a child row must not be able to point at a parent
-- owned by somebody else. RLS on the parent already hides foreign rows from
-- SELECT, but a forged `habit_id` in an INSERT would otherwise pass the child's
-- own WITH CHECK. These constraints close that hole at the schema level.
-- ---------------------------------------------------------------------------
alter table public.habits
  drop constraint if exists habits_id_user_id_key;
alter table public.habits
  add constraint habits_id_user_id_key unique (id, user_id);

alter table public.habit_logs
  drop constraint if exists habit_logs_habit_owner_fk;
alter table public.habit_logs
  add constraint habit_logs_habit_owner_fk
  foreign key (habit_id, user_id)
  references public.habits (id, user_id)
  on delete cascade;

alter table public.financial_boxes
  drop constraint if exists financial_boxes_id_user_id_key;
alter table public.financial_boxes
  add constraint financial_boxes_id_user_id_key unique (id, user_id);

alter table public.financial_transactions
  drop constraint if exists financial_transactions_box_owner_fk;
alter table public.financial_transactions
  add constraint financial_transactions_box_owner_fk
  foreign key (box_id, user_id)
  references public.financial_boxes (id, user_id)
  on delete cascade;

alter table public.tasks
  drop constraint if exists tasks_id_user_id_key;
alter table public.tasks
  add constraint tasks_id_user_id_key unique (id, user_id);

alter table public.pomodoro_sessions
  drop constraint if exists pomodoro_sessions_task_owner_fk;
alter table public.pomodoro_sessions
  add constraint pomodoro_sessions_task_owner_fk
  foreign key (task_id, user_id)
  references public.tasks (id, user_id)
  -- Column list on SET NULL (Postgres 15+) so that deleting a task clears the
  -- link without nulling `user_id`, which is NOT NULL.
  on delete set null (task_id);
