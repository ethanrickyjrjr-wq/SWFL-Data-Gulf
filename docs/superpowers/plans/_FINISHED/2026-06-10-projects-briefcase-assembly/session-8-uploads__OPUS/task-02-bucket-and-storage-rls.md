# Task 02 — `project-uploads` bucket + path-prefix RLS

**Files:** Create `docs/sql/20260614_project_uploads_bucket.sql` (idempotent). Use the **verified** syntax from Task 01's `FINDINGS-storage.md` — the SQL below is the shape; reconcile it with what you verified.

- [ ] **Step 1: Bucket (private) + size/MIME limits:**

```sql
-- 20260614_project_uploads_bucket.sql — private uploads bucket + per-user RLS. Idempotent.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-uploads', 'project-uploads', false, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;
```

- [ ] **Step 2: `storage.objects` RLS** — INSERT/SELECT/DELETE only where the bucket matches AND the first path segment is the caller's uid:

```sql
do $$ begin
  create policy project_uploads_owner_rw on storage.objects
    for all
    using (bucket_id = 'project-uploads' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'project-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
exception when duplicate_object then null; end $$;
```

(Split into per-command policies if Task 01's findings say `FOR ALL` on `storage.objects` is discouraged — match the verified pattern.)

- [ ] **Step 3: Apply + verify** the bucket is `public=false` and the policy exists on `storage.objects`.
- [ ] **Step 4: Commit.** `git add docs/sql/20260614_project_uploads_bucket.sql && git commit -m "feat(uploads): private project-uploads bucket + auth.uid() path-prefix RLS"`
