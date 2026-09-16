-- ---------------------------------------------------------------------------
-- 0005 — Phone + password sign-in, alongside the SMS one-time code.
--
-- The OTP path stays the primary one. This exists because SMS delivery in Iran
-- is not something the application controls: a gateway outage, an exhausted
-- credit balance or a carrier filtering pattern messages all present to the
-- user as "the code never arrived", with nothing they or we can do about it.
-- A password is the door that stays open.
--
-- `password_hash` holds scrypt output in the self-describing encoding written
-- by `src/lib/auth/password.ts` — `scrypt$N=…,r=…,p=…$<salt>$<key>` — so the
-- work factor can be raised later without invalidating existing rows.
--
-- No index on it, deliberately. It is only ever read for a row already located
-- by `phone`, and an index on a secret is a second copy of that secret.
-- ---------------------------------------------------------------------------

alter table public.users
  add column if not exists password_hash text,
  add column if not exists password_updated_at timestamptz;

comment on column public.users.password_hash is
  'scrypt hash, encoded as scrypt$params$salt$key. Null when the account has no password.';
comment on column public.users.password_updated_at is
  'When the password was last set. Surfaced in settings; not used for expiry.';

-- The pre-authentication carve-out now serves three callers rather than two.
-- Unchanged in effect — restated so the comment does not describe a narrower
-- policy than the one in force.
comment on policy users_unscoped_auth_select on public.users is
  'Sign-in lookups (OTP and password) and the reconciliation cron; all run before/without a tenant context.';
comment on policy users_signup_insert on public.users is
  'Sign-up path only, for either credential; INSERT is permitted when no tenant context is set.';
