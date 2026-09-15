-- ---------------------------------------------------------------------------
-- 0004 — Supabase Storage bucket for note attachments.
--
-- Objects are laid out as `<user-uuid>/<note-uuid>/<filename>`, so the owning
-- tenant is the first path segment.
--
-- Kayzen authenticates with its own phone/OTP sessions, not Supabase Auth, so
-- `auth.uid()` is always NULL here and a policy written against it would deny
-- everything. The bucket is therefore private with no anon/authenticated
-- policies at all: every read and write goes through the application, which
-- checks ownership against the tenant-scoped `notes` row and then mints a
-- short-lived signed URL with the service role (see `src/lib/storage/supabase.ts`).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kayzen-attachments',
  'kayzen-attachments',
  false,
  10485760, -- 10 MiB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Remove any policy a previous revision may have left behind: an anon-readable
-- attachment bucket would leak note contents to anyone with the object path.
drop policy if exists kayzen_attachments_read_own on storage.objects;
drop policy if exists kayzen_attachments_write_own on storage.objects;
drop policy if exists kayzen_attachments_delete_own on storage.objects;
