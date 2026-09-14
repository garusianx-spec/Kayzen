-- ---------------------------------------------------------------------------
-- 0003 — domain invariants enforced in the database.
--
-- The API validates with zod before it writes, but the database is the last
-- line of defence: a bad migration, a manual `psql` session or a future service
-- must not be able to persist an impossible row.
-- ---------------------------------------------------------------------------

-- --- updated_at ------------------------------------------------------------
do $$
declare
  target text;
begin
  foreach target in array array[
    'users', 'tasks', 'habits', 'financial_boxes', 'countdown_events',
    'notes', 'books_365', 'user_reading_logs'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', target || '_touch_updated_at', target);
    execute format(
      'create trigger %I before update on public.%I '
      'for each row execute function app.touch_updated_at()',
      target || '_touch_updated_at', target);
  end loop;
end
$$;

-- --- value ranges ----------------------------------------------------------
alter table public.tasks drop constraint if exists tasks_priority_range;
alter table public.tasks add constraint tasks_priority_range check (priority between 1 and 4);

alter table public.users drop constraint if exists users_day_start_hour_range;
alter table public.users add constraint users_day_start_hour_range check (day_start_hour between 0 and 23);

alter table public.users drop constraint if exists users_notify_hour_range;
alter table public.users add constraint users_notify_hour_range
  check (notify_at_hour between 0 and 23 and notify_at_minute between 0 and 59);

alter table public.habits drop constraint if exists habits_target_positive;
alter table public.habits add constraint habits_target_positive check (target_per_day > 0);

alter table public.habits drop constraint if exists habits_streaks_non_negative;
alter table public.habits add constraint habits_streaks_non_negative
  check (current_streak >= 0 and longest_streak >= current_streak);

alter table public.habit_logs drop constraint if exists habit_logs_count_positive;
alter table public.habit_logs add constraint habit_logs_count_positive check (count > 0);

alter table public.financial_boxes drop constraint if exists financial_boxes_target_positive;
alter table public.financial_boxes add constraint financial_boxes_target_positive
  check (target_amount > 0);

alter table public.financial_transactions drop constraint if exists financial_transactions_amount_positive;
alter table public.financial_transactions add constraint financial_transactions_amount_positive
  check (amount > 0);

alter table public.books_365 drop constraint if exists books_365_day_range;
alter table public.books_365 add constraint books_365_day_range check (day_number between 1 and 365);

alter table public.user_reading_logs drop constraint if exists user_reading_logs_rating_range;
alter table public.user_reading_logs add constraint user_reading_logs_rating_range
  check (rating is null or rating between 1 and 5);

-- --- financial box balance -------------------------------------------------
-- `current_amount` is a cached aggregate of the box's ledger. Maintaining it in
-- a trigger keeps it correct no matter which code path writes the transaction,
-- and keeps the progress-bar query off a SUM() over the ledger.
create or replace function app.sync_financial_box_balance() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  affected_box uuid := coalesce(new.box_id, old.box_id);
begin
  update public.financial_boxes b
  set current_amount = coalesce((
        select sum(case when t.type = 'DEPOSIT' then t.amount else -t.amount end)
        from public.financial_transactions t
        where t.box_id = affected_box
      ), 0),
      updated_at = now()
  where b.id = affected_box;

  return null;
end;
$$;

drop trigger if exists financial_transactions_sync_balance on public.financial_transactions;
create trigger financial_transactions_sync_balance
  after insert or update or delete on public.financial_transactions
  for each row execute function app.sync_financial_box_balance();

-- --- note word count -------------------------------------------------------
create or replace function app.sync_note_word_count() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.word_count := coalesce(
    array_length(regexp_split_to_array(btrim(new.body), '\s+'), 1), 0);
  return new;
end;
$$;

drop trigger if exists notes_sync_word_count on public.notes;
create trigger notes_sync_word_count
  before insert or update of body on public.notes
  for each row execute function app.sync_note_word_count();

-- --- hot-path indexes ------------------------------------------------------
create index if not exists tasks_user_open_due_idx
  on public.tasks (user_id, due_jalali)
  where status in ('PENDING', 'IN_PROGRESS');

create index if not exists notes_user_pinned_idx
  on public.notes (user_id, updated_at desc)
  where is_pinned;

create index if not exists countdown_events_upcoming_idx
  on public.countdown_events (user_id, event_at);

-- --- authentication tables -------------------------------------------------
alter table public.otp_sessions drop constraint if exists otp_sessions_attempts_non_negative;
alter table public.otp_sessions add constraint otp_sessions_attempts_non_negative
  check (attempts >= 0);

alter table public.otp_sessions drop constraint if exists otp_sessions_phone_e164;
alter table public.otp_sessions add constraint otp_sessions_phone_e164
  check (phone ~ '^\+[1-9][0-9]{7,14}$');

alter table public.users drop constraint if exists users_phone_e164;
alter table public.users add constraint users_phone_e164
  check (phone ~ '^\+[1-9][0-9]{7,14}$');

-- Only one challenge per number may be live at a time. A resend supersedes the
-- previous row by consuming it first (see `src/lib/auth/otp.ts`), and this
-- partial unique index makes that invariant the database's problem too.
create unique index if not exists otp_sessions_one_live_per_phone
  on public.otp_sessions (phone)
  where consumed_at is null;

create index if not exists refresh_tokens_live_idx
  on public.refresh_tokens (user_id)
  where revoked_at is null;

-- --- expired-credential sweep ----------------------------------------------
-- Called by the nightly cron. Challenges are worthless once expired, and a
-- revoked refresh token only has to outlive the audit window.
create or replace function app.purge_expired_credentials(refresh_grace interval default '30 days')
  returns table (otp_sessions_deleted bigint, refresh_tokens_deleted bigint)
  language plpgsql
  set search_path = ''
as $$
declare
  otp_count bigint;
  refresh_count bigint;
begin
  delete from public.otp_sessions
  where expires_at < now() - interval '1 day'
     or consumed_at < now() - interval '1 day';
  get diagnostics otp_count = row_count;

  delete from public.refresh_tokens
  where expires_at < now() - refresh_grace
     or revoked_at < now() - refresh_grace;
  get diagnostics refresh_count = row_count;

  return query select otp_count, refresh_count;
end;
$$;

-- --- countdown day key -----------------------------------------------------
create index if not exists countdown_events_jalali_idx
  on public.countdown_events (user_id, event_jalali);
