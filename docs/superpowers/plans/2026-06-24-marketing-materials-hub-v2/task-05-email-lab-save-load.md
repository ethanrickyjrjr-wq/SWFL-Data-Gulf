### Task 5: Email-lab save / load

**Model:** Opus (shared-component integration + brand-bridge + autoGenerate trap — v1's worst breakage zone) · **Depends on:** Task 2. **Touches `EmailLabShell.tsx` — conflicts with Task 7, run before it.**

**Files:**
- Modify: `components/email-lab/EmailLabShell.tsx` (props ~111-119; toolbar ~488-511)
- Modify: `app/project/[id]/email-lab/ProjectEmailLabClient.tsx` (props ~8-16; doc seed ~21)
- Modify: `app/project/[id]/email-lab/page.tsx` (~26-92)

**Interfaces:**
- Consumes: `POST`/`PATCH /api/projects/[id]/materials` (Task 2); `SEED_DOCS`/`seedById` from `@/lib/email/doc/default-docs`; `EmailDoc` from `@/lib/email/doc/types`.
- Produces: a Save button in the lab that POSTs (first save) / PATCHes (subsequent); `?did=<id>` loads a saved material; `?seed=<id>` opens a chosen template.

---

- [ ] **Step 1: Read the shell to confirm names**

Open `components/email-lab/EmailLabShell.tsx`. Confirm: `EmailLabShellProps` (~111-119) has `initialDoc, brandTokens?, scope?, initialAiPrompt?, autoGenerate?, headerSlot, aiPlaceholder?`; the live doc is `const doc = history.present` (~130-133); the toolbar holds Export/PDF/Copy (~488-511). All additions below must be **optional** so the standalone `app/email-lab/EmailLabClient.tsx` is unaffected.

- [ ] **Step 2: Add optional `onSave`/`saving` to the shell props**

In `EmailLabShellProps`:

```typescript
  /** When provided, renders a Save button that calls back with the current doc. */
  onSave?: (doc: EmailDoc) => Promise<void>;
  saving?: boolean;
```

Destructure `onSave, saving` alongside the existing props.

- [ ] **Step 3: Add the Save button to the toolbar (only when `onSave` is set)**

Next to the existing Export/PDF/Copy buttons (~488-511):

```tsx
{onSave && (
  <button
    type="button"
    onClick={() => onSave(doc)}
    disabled={saving}
    className="px-3 py-1.5 text-sm rounded-lg bg-[#1BB8C9]/20 text-[#1BB8C9] border border-[#1BB8C9]/30 hover:bg-[#1BB8C9]/30 disabled:opacity-40 transition-colors focus-visible:ring-2 focus-visible:ring-[#1BB8C9]/40"
  >
    {saving ? "Saving…" : "Save"}
  </button>
)}
```

- [ ] **Step 4: Verify the standalone lab still builds**

Run: `bunx next build`
Expected: clean — `app/email-lab/EmailLabClient.tsx` passes no `onSave`, so no Save button, no behavior change.

- [ ] **Step 5: Rewrite `ProjectEmailLabClient` to add save + load (KEEP existing props)**

Add props `initialDoc?: EmailDoc | null` and `deliverableId?: string | null`. **Keep** `brandTokens`/`headerSlot`/`autoGenerate`/`initialAiPrompt`/`aiPlaceholder` passthrough (do not drop the brand bridge). Set `autoGenerate = !deliverableId` (never auto-fill a loaded doc).

```tsx
"use client";
import { useState } from "react";
import { EmailLabShell } from "@/components/email-lab/EmailLabShell";
import { defaultDoc } from "@/lib/email/doc/default-docs";
import type { EmailDoc } from "@/lib/email/doc/types";

interface Props {
  projectId: string;
  projectTitle: string;
  initialTokens: Record<string, string>;
  scope?: { kind: string; value: string } | null;
  initialDoc?: EmailDoc | null;
  deliverableId?: string | null;
}

export function ProjectEmailLabClient({ projectId, projectTitle, initialTokens, scope, initialDoc, deliverableId }: Props) {
  const [savedId, setSavedId] = useState<string | null>(deliverableId ?? null);
  const [saving, setSaving] = useState(false);
  const [doc0] = useState<EmailDoc>(() => initialDoc ?? defaultDoc());

  async function handleSave(doc: EmailDoc) {
    setSaving(true);
    try {
      if (savedId) {
        await fetch(`/api/projects/${projectId}/materials`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliverable_id: savedId, doc }),
        });
      } else {
        const res = await fetch(`/api/projects/${projectId}/materials`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doc }),
        });
        if (res.ok) {
          const { id } = await res.json();
          setSavedId(id);
          window.history.replaceState({}, "", `/project/${projectId}/email-lab?did=${id}`);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <EmailLabShell
      initialDoc={doc0}
      brandTokens={initialTokens}
      scope={scope ?? undefined}
      autoGenerate={!deliverableId}
      headerSlot={<h1 className="text-sm text-white/70 truncate">{projectTitle}</h1>}
      onSave={handleSave}
      saving={saving}
    />
  );
}
```

> Keep whatever `headerSlot`/`initialAiPrompt`/`aiPlaceholder` the current file passes — the snippet shows the minimum; match the existing values so nothing regresses.

- [ ] **Step 6: Load the doc / seed in the email-lab page**

In `app/project/[id]/email-lab/page.tsx`, accept `searchParams` (async, like `params`), and for `?did` load the saved block-canvas doc; for `?seed` pass that seed. Keep `createClient(cookieStore)` from `@/utils/supabase/server` and the existing `branding → initialTokens` map.

```typescript
// signature: add searchParams
{ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }

const sp = await searchParams;
const did = sp.did ?? null;
const seedId = sp.seed ?? null;

let initialDoc: import("@/lib/email/doc/types").EmailDoc | null = null;
if (did) {
  const { data } = await supabase
    .from("deliverables").select("id, doc")
    .eq("id", did).eq("project_id", id).eq("template", "block-canvas").single();
  if (data?.doc) initialDoc = data.doc as import("@/lib/email/doc/types").EmailDoc;
} else if (seedId) {
  const { seedById } = await import("@/lib/email/doc/default-docs");
  initialDoc = seedById(seedId)?.build() ?? null;
}
```

Pass `initialDoc={initialDoc}` and `deliverableId={did}` to `<ProjectEmailLabClient .../>`.

- [ ] **Step 7: Verify build**

Run: `bunx next build`
Expected: clean.

- [ ] **Step 8: Manual verify (dev)**

Start dev. `/project/<id>/email-lab` → edit a block → Save → URL gains `?did=<id>`. Reload → the doc loads back and does NOT auto-regenerate. `/project/<id>/email-lab?seed=just-sold` → opens the Just Sold template.

- [ ] **Step 9: Commit**

```bash
git add "components/email-lab/EmailLabShell.tsx" "app/project/[id]/email-lab/ProjectEmailLabClient.tsx" "app/project/[id]/email-lab/page.tsx"
git commit -m "feat(materials-hub): email-lab save/load via deliverables (autoGenerate=!did, brand bridge kept)"
```
