# Task 03 — `components/project/UploadDrop.tsx`

**Files:** Create `components/project/UploadDrop.tsx`. Mount on `app/project/[id]/page.tsx`.

- [ ] **Step 1: Client upload via user JWT** (`utils/supabase/client.ts` — RLS applies; no new dep). Path = `${user.id}/${projectId}/${crypto.randomUUID()}.${ext}`. Use the verified `supabase.storage.from('project-uploads').upload(path, file)`.
- [ ] **Step 2: Client-side limits** (server bucket limit is the real gate, but fail fast): reject >10MB; reject if the project already has 10 file items; allow only `image/jpeg|png|webp`, `application/pdf`; **reject HEIC** with a "convert to JPG/PNG first" hint.
- [ ] **Step 3: On success** → file a `{kind:"file", storage_path, mime, size, caption}` item (caption input in the UI) via the project PATCH (or the draft if anonymous → but Storage needs auth, so anonymous shows a login prompt instead).
- [ ] **Step 4: Meter `upload`** (`/api/meter`).
- [ ] **Step 5: Verify** — upload a JPG + a PDF to a project (signed in) → both appear as file items with captions; HEIC rejected; 11th file blocked; 11MB blocked.
- [ ] **Step 6: Commit.** `git add components/project/UploadDrop.tsx "app/project/[id]/page.tsx" && git commit -m "feat(uploads): UploadDrop (images+PDF, caption, limits, HEIC reject)"`
