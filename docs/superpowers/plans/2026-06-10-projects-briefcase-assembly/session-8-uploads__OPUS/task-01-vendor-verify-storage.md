# Task 01 — MANDATORY vendor-verify (Supabase Storage)

**This task is non-negotiable (CLAUDE.md RULE 1 Vendor-First).** Storage is a surface this repo has never used. Do not write a single line of bucket/RLS/upload code until you've read the live docs in-session.

- [ ] **Step 1: WebFetch** the current Supabase docs for:
  - Creating a **private** bucket (and how `public` defaults / file-size + MIME restrictions are set — `file_size_limit`, `allowed_mime_types` on the bucket).
  - **`storage.objects` RLS** policy syntax, specifically `storage.foldername(name)` and how to key a policy to `auth.uid()::text` as the first path segment.
  - **`createSignedUrl`** (server-side, expiry) and the browser **upload** call (`supabase.storage.from(bucket).upload(path, file)`) under a user JWT.
- [ ] **Step 2: Record** the verified API shapes + exact policy SQL in a short `FINDINGS-storage.md` in this folder (Task 02/03/04 code directly against it). Note the SDK version in `package.json` so the calls match.
- [ ] **Step 3: Commit the findings.** `git add docs/superpowers/plans/2026-06-10-projects-briefcase-assembly/session-8-uploads__OPUS/FINDINGS-storage.md && git commit -m "docs(uploads): verified Supabase Storage RLS + signed-URL API"`

> Why: an invented MIME restriction or a wrong `foldername` index ships and silently lets users read each other's files. Cost of one WebFetch ≪ cost of a leak.
