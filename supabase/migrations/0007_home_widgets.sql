-- ---------------------------------------------------------------------------
-- 0007 — The home screen's widget layout.
--
-- One nullable JSON column rather than a table: this is a single document that
-- is always read and written whole, never queried across users, and never
-- joined. A `home_widgets` table would be five columns of ceremony around an
-- ordered list of strings.
--
-- NULL is meaningful and is not the same as `{"visible": []}`. NULL means the
-- account has never customised its home screen, so it follows whatever the
-- current default layout is; an empty list means the user deliberately turned
-- everything off. Collapsing the two would either pin every existing account to
-- the layout that shipped today, or make "hide everything" impossible.
-- ---------------------------------------------------------------------------

alter table public.users add column if not exists home_widgets jsonb;

comment on column public.users.home_widgets is
  'Home layout as {"visible": ["id", ...]}; NULL means the default layout.';
