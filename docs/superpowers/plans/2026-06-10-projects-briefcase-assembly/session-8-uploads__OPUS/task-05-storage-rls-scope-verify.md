# Task 05 — Two-account Storage RLS verify + close `storage_rls_scope_verify`

**Why:** path-prefix RLS is only proven by a real cross-user denial (`feedback_checks-prod-evidence-not-dev-attestation`).

- [ ] **Step 1: Ship** the session per `../shared/conventions.md`.
- [ ] **Step 2: Account A** uploads a file → note its `storage_path` (`A_uid/project/uuid.jpg`).
- [ ] **Step 3: Account B** — attempt to read A's object (request a signed URL for A's path while authed as B, and attempt a direct `download(path)`). **Expected: DENIED by RLS.** If B can read A's file, the policy is mis-scoped — STOP, fix, do not close.
- [ ] **Step 4: Anonymous** — no `auth.uid()` → cannot upload (login prompt) and cannot read private objects.
- [ ] **Step 5: Signed URL expiry** — a 1h signed URL 403s after expiry.
- [ ] **Step 6: Close** with evidence:

```bash
node scripts/check.mjs close storage_rls_scope_verify "prod: acct B cross-read of acct A upload DENIED; anon cannot upload/read; signed URL expires. project-uploads private."
```

Build-queue: append + mark uploads `[x]`.
