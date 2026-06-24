### Task 7: Photos bridge — promote filed photos into email image blocks

**Model:** Sonnet (copy mechanism verified, panel designed in spec) · **Depends on:** Task 1, Task 5. **Touches `EmailLabShell.tsx` — run after Task 5, never in parallel with it.**

**Files:**
- Create: `app/api/projects/[id]/email-media/route.ts`
- Modify: `components/email-lab/EmailLabShell.tsx` (add optional `projectPhotos` + a "Photos" panel)
- Modify: `app/project/[id]/email-lab/page.tsx` (load image `file` items + signed URLs)
- Modify: `app/project/[id]/email-lab/ProjectEmailLabClient.tsx` (pass `projectPhotos` through)

**Interfaces:**
- Consumes: `createServiceRoleClient`; the verified `copy(path, path, { destinationBucket })` (storage-js 2.106.1); the shell's existing block insert/update functions.
- Produces: `POST /api/projects/[id]/email-media { storage_path }` → `{ url }` (durable public); `PUT` (multipart) → `{ url }` for a fresh upload; a "Photos" panel that sets an `image` block's `url`.

---

- [ ] **Step 1: Implement the email-media route**

```typescript
// app/api/projects/[id]/email-media/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

const PRIVATE_BUCKET = "project-uploads";
const PUBLIC_BUCKET = "email-media";

// Promote an existing filed photo (private) to the public bucket and return its durable URL.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  await params;
  const db = createClient(await cookies());
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { storage_path } = await req.json().catch(() => ({}));
  if (!storage_path) return NextResponse.json({ error: "missing storage_path" }, { status: 400 });
  // project-uploads stores objects under the owner's uid — only let a user promote their own.
  if (!String(storage_path).startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createServiceRoleClient();
  const { error } = await admin.storage
    .from(PRIVATE_BUCKET)
    .copy(storage_path, storage_path, { destinationBucket: PUBLIC_BUCKET });
  // Treat an already-copied object as success (idempotent re-pick).
  if (error && !String(error.message).toLowerCase().includes("exists")) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const { data } = admin.storage.from(PUBLIC_BUCKET).getPublicUrl(storage_path);
  return NextResponse.json({ url: data.publicUrl });
}

// Upload a brand-new photo straight to the public bucket (the lab's previously-missing upload).
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  await params;
  const db = createClient(await cookies());
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "missing file" }, { status: 400 });
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const key = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const admin = createServiceRoleClient();
  const { error } = await admin.storage.from(PUBLIC_BUCKET)
    .upload(key, file, { contentType: file.type || "image/png", upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data } = admin.storage.from(PUBLIC_BUCKET).getPublicUrl(key);
  return NextResponse.json({ url: data.publicUrl });
}
```

- [ ] **Step 2: Pass the project's photos into the lab**

In `app/project/[id]/email-lab/page.tsx`, load the project's image `file` items and their 1-hour signed display URLs (reuse `signedUploadUrls` from `@/lib/project/signed-upload-url`, as `app/project/[id]/page.tsx:188` does). Shape each as `{ storage_path, signedUrl, caption }`. Pass as `projectPhotos` to `ProjectEmailLabClient`, which forwards it to `EmailLabShell`. Add `projectPhotos?: { storage_path: string; signedUrl: string; caption?: string }[]` to both prop interfaces (optional — standalone lab passes nothing).

- [ ] **Step 3: Add the "Photos" panel to the shell (only when `projectPhotos` is provided)**

Add a 5th left-panel state alongside Fill with AI / Brand / Start from / Classic. Build to the spec's **Visual design → Gap 5**: 2-col grid of ~72px square thumbs (signed URLs), a dashed "＋ Upload" first tile, 2px teal ring on hover/selected, empty state copy. On click:

```tsx
async function useFiledPhoto(storage_path: string) {
  const res = await fetch(`/api/projects/${projectId}/email-media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storage_path }),
  });
  if (!res.ok) return;
  const { url } = await res.json();
  applyPhotoUrl(url); // see below
}

async function uploadNewPhoto(file: File) {
  const fd = new FormData(); fd.append("file", file);
  const res = await fetch(`/api/projects/${projectId}/email-media`, { method: "PUT", body: fd });
  if (!res.ok) return;
  const { url } = await res.json();
  applyPhotoUrl(url);
}

// If an image block is selected, set its url; else insert a new image block at the end.
function applyPhotoUrl(url: string) {
  const sel = selectedId ? doc.blocks.find((b) => b.id === selectedId) : null;
  if (sel?.type === "image") updateBlock(sel.id, { ...sel.props, url });
  else insert("image", doc.blocks.length); // then set its url, or have insert accept initial props
}
```

Use the shell's real `updateBlock`/`insert` names (read the file). If `insert` can't take initial props, insert then `updateBlock` the new block's `url`. `projectId` must be threaded into the shell for these fetches — add it as an optional prop too (used only by the Photos panel).

- [ ] **Step 4: Verify build + standalone lab unaffected**

Run: `bunx next build`
Expected: clean; `app/email-lab/EmailLabClient.tsx` (no `projectPhotos`/`projectId`) shows no Photos panel.

- [ ] **Step 5: Manual verify (dev)**

File a photo into a project (existing UploadDrop). Open the project email-lab → Photos panel lists it → click → an image block gets a durable `https://…/email-media/…` URL that renders. Upload-new also works. Open the public URL directly in an incognito tab → 200.

- [ ] **Step 6: Commit**

```bash
git add "app/api/projects/[id]/email-media/route.ts" "components/email-lab/EmailLabShell.tsx" "app/project/[id]/email-lab/page.tsx" "app/project/[id]/email-lab/ProjectEmailLabClient.tsx"
git commit -m "feat(materials-hub): photos bridge — email-media route + lab Photos panel + upload"
```
