# Task 04 — Render uploads via signed URLs

**Files:** A server helper (e.g. `lib/project/signed-upload-url.ts`) + render in `app/project/[id]/page.tsx` and `app/p/[id]/page.tsx` (deliverable exhibits/appendix).

- [ ] **Step 1: Server-side signed URLs (1h).** Never expose the private object directly. Generate `createSignedUrl(path, 3600)` on the server for each `{kind:"file"}` item the current viewer is allowed to see.
- [ ] **Step 2: Render.** Images → `<figure>` with the signed URL + caption + a **"Provided by agent"** source line (so user-supplied media is clearly distinguished from cited lake data — provenance honesty). PDFs → an appendix link.
- [ ] **Step 3: Deliverable inclusion.** When `/p/[id]` renders a `file` item from `items_snapshot`, it also uses a fresh server signed URL (the snapshot stores `storage_path`, not a URL — URLs expire).
- [ ] **Step 4: Verify** — image renders inline with "Provided by agent"; PDF opens via the signed link; the link 403s after expiry / for a non-owner.
- [ ] **Step 5: Commit.** `git add lib/project/signed-upload-url.ts "app/project/[id]/page.tsx" "app/p/[id]/page.tsx" && git commit -m "feat(uploads): signed-URL render (images as figures, PDFs as appendix, 'Provided by agent')"`
