-- 20260614_project_uploads_bucket.sql
-- Session 8 (uploads): private `project-uploads` bucket + per-user Storage RLS.
--
-- Architecture: object paths are `{user_id}/{project_id}/{uuid}.{ext}`, so the
-- FIRST path segment (`(storage.foldername(name))[1]`) is the owner's uid. Every
-- policy keys to that segment → a user can only read/write/delete their own
-- objects. Private bucket: objects are reachable only via a server-minted signed
-- URL (createSignedUrl) — never a public URL.
--
-- Verified against live Supabase docs 2026-06-10 (see session-8 FINDINGS-storage.md):
-- separate policy per operation, TO authenticated, `(select auth.uid()::text)`
-- (= `auth.jwt()->>'sub'`), the auth call wrapped in (select …) for RLS perf.
--
-- Idempotent: `on conflict do nothing` for the bucket; `drop policy if exists`
-- before each `create policy`. Safe to re-run.

-- 1) Private bucket with 10 MiB ceiling + MIME allowlist (HEIC excluded → rejected
--    server-side). The bucket limits are the REAL gate; client checks are fail-fast UX.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-uploads',
  'project-uploads',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- 2) storage.objects RLS — one policy per operation, all keyed to bucket + owner uid.
--    (RLS is already enabled on storage.objects in Supabase by default.)

drop policy if exists "project_uploads_insert" on storage.objects;
create policy "project_uploads_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'project-uploads'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "project_uploads_select" on storage.objects;
create policy "project_uploads_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'project-uploads'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "project_uploads_update" on storage.objects;
create policy "project_uploads_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'project-uploads'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'project-uploads'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "project_uploads_delete" on storage.objects;
create policy "project_uploads_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'project-uploads'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
