-- ---------------------------------------------------------------------------
-- 0001 — application role, tenant helper function, shared triggers.
--
-- Run order:
--   1. `prisma migrate deploy`  (creates tables/enums/indexes)
--   2. this file
--   3. 0002_row_level_security.sql
--   4. 0003_domain_triggers.sql
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";
create extension if not exists "pg_stat_statements";

-- ---------------------------------------------------------------------------
-- Application role.
--
-- RLS is skipped for table owners and for BYPASSRLS roles, so the runtime
-- connection MUST NOT be the migration/owner role. `kayzen_app` owns nothing
-- and cannot bypass policies; `DATABASE_URL` connects as it, while `DIRECT_URL`
-- keeps the owner role for migrations.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'kayzen_app') then
    -- Password is rotated out-of-band; the placeholder below is replaced by the
    -- provisioning script before this file is applied.
    execute format('create role kayzen_app login nobypassrls password %L',
                   coalesce(current_setting('kayzen.app_role_password', true), gen_random_uuid()::text));
  end if;
end
$$;

grant usage on schema public to kayzen_app;
grant select, insert, update, delete on all tables in schema public to kayzen_app;
grant usage, select on all sequences in schema public to kayzen_app;
alter default privileges in schema public
  grant select, insert, update, delete on tables to kayzen_app;
alter default privileges in schema public
  grant usage, select on sequences to kayzen_app;

-- ---------------------------------------------------------------------------
-- Tenant context.
--
-- `withUserContext()` in the application issues
-- `select set_config('app.current_user_id', $1, true)` as the first statement
-- of every transaction. `true` scopes it to the transaction, so a pooled
-- connection can never leak one user's context into the next request.
-- ---------------------------------------------------------------------------
create schema if not exists app;
grant usage on schema app to kayzen_app;

create or replace function app.current_user_id() returns uuid
  language sql
  stable
  -- Empty search_path: the body must not resolve through a caller-controlled path.
  set search_path = ''
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;

comment on function app.current_user_id() is
  'UUID of the tenant owning the current transaction, or NULL when unset. Every RLS policy is written against this.';

-- ---------------------------------------------------------------------------
-- `updated_at` maintenance. Prisma sets it on writes it issues, but triggers,
-- cron jobs and manual SQL must not be able to skip it.
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
