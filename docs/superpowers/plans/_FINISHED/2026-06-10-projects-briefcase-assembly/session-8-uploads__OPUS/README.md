# Session 8 — Uploads (images + PDFs, attach + caption)  ·  **OPUS**  ·  ~2 days

> Read `../shared/conventions.md`. **Why Opus:** this is the **only never-touched vendor surface** in the plan (no Storage buckets exist today — audit confirmed) AND it's security-scoped: a mis-scoped Storage RLS path-prefix leaks one user's uploads to another. Vendor-verify is **mandatory**, not optional.

**Goal:** Let a signed-in user attach images + PDFs to a project (10MB/file, 10/project, attach + caption only — no parsing/OCR), scoped per-user via Storage RLS, rendered as figures (images) / appendix links (PDFs) with signed URLs.

**Architecture:** private bucket `project-uploads`; object paths `{user_id}/{project_id}/{uuid}.{ext}`; `storage.objects` RLS keys INSERT/SELECT/DELETE to `(storage.foldername(name))[1] = auth.uid()::text`. Browser upload via the user-JWT client (`utils/supabase/client.ts`) so RLS applies — no new dependency. On success, file a `{kind:"file"}` item (`../shared/data-model.md`). Anonymous → login prompt (Storage needs `auth.uid()`).

**Tasks (in order):**
- [ ] `task-01-vendor-verify-storage.md` — **mandatory** WebFetch: Storage RLS syntax, `createSignedUrl`, size ceilings
- [ ] `task-02-bucket-and-storage-rls.md` — `project-uploads` bucket + `storage.objects` path-prefix RLS (idempotent SQL)
- [ ] `task-03-upload-drop-component.md` — `components/project/UploadDrop.tsx` (limits, HEIC reject)
- [ ] `task-04-render-signed-urls.md` — server-side 1h signed URLs; images as figures, PDFs as appendix
- [ ] `task-05-storage-rls-scope-verify.md` — two-account: cross-user object read DENIED; close `storage_rls_scope_verify`

**Files:** new `docs/sql/20260614_project_uploads_bucket.sql` · `components/project/UploadDrop.tsx` · `app/project/[id]/page.tsx` (mount + render files) · a server helper for signed URLs

**Depends on:** S4 (projects + auth).

**Limits:** 10MB/file, 10/project; `image/jpeg|png|webp` + `application/pdf`; HEIC rejected with a convert hint.

**Risk:** Storage RLS mis-scope → vendor-verified policies + `auth.uid()` path prefix + signed URLs only (never public bucket).

**Diff-review gate:** none beyond standard (no live API/MCP change). But the live two-account deny test gates the check.
