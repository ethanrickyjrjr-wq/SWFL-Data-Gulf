# Project Marketing Hub — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` syntax for tracking.
> **Recommended model:** 🧠 Opus — 11 tasks, 23 files, keywords: migration, refactor, schema

**Goal:** Convert the project workspace into a property-level materials library — block-canvas emails saved as `deliverables` rows, a `MaterialsGrid` above `ItemsBoard`, filing sidebar, AI suggestion banner, and a Phase 7 scheduler lane that patches content ephemerally without touching the saved design.

**Architecture:** Extend `deliverables` with `doc JSONB` + `data_as_of TIMESTAMPTZ`. `template = 'block-canvas'` rows store a full `EmailDoc`; all other templates keep `narrative + items_snapshot` unchanged. Replace `DeliverableLanes`'s Built lane with `MaterialsGrid`; keep its Emailing lane as a collapsed "Scheduled sends" section. Phase 7 adds a `block-canvas` branch to `buildContent()` in `run-schedules.mts` — sends are ephemeral, never mutate the saved row.

**Tech Stack:** Next.js App Router, Supabase Postgres, Zod (`EmailDocSchema`), Claude Haiku via `/api/email-lab/ai`, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-06-24-project-marketing-hub-design.md`

## Global Constraints

- `template = 'block-canvas'` → `doc` non-null; all other templates → `doc` null
- `data_as_of` set on every create/update; drives "needs refresh" (> 30 days)
- Update Data (↻) always forks a new deliverable row with `supersedes_id`; never patches in place
- Nightly scheduler patches are ephemeral — `deliverable.doc` stays frozen
- Routes follow existing `/api/projects/[id]/...` plural convention
- `bunx next build` must stay clean after every task

---

## Pre-flight: verify exact import names

Before implementing any route, check `app/api/projects/[id]/build/route.ts` to confirm:
- Exact Supabase cookie-client factory name (likely `createCookieClient` or `createServerClient`)
- Exact `nanoid` import path used for deliverable IDs

---

## Task 1 — DB Migration + Type Extensions

**Files:**
- Create: `docs/sql/20260624_materials_hub.sql`
- Modify: `lib/deliverable/templates.ts` — add `'block-canvas'` to `TemplateId`
- Modify: `app/project/[id]/workspace/types.ts` — add `doc`, `data_as_of` to `DeliverableRow`
- 🔴 Modify: `app/project/[id]/page.tsx` — ensure `doc`, `data_as_of` in deliverables SELECT

**Produces:** Extended `DeliverableRow`, `'block-canvas'` in `TemplateId`

- [ ] **Step 1: Write migration**

```sql
-- docs/sql/20260624_materials_hub.sql
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS doc JSONB;
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS data_as_of TIMESTAMPTZ;
```

- [ ] **Step 2: Run migration** (creds in `.dlt/secrets.toml`)

```bash
# Use psql or supabase CLI with DATABASE_URL from secrets.toml
psql "$DATABASE_URL" < docs/sql/20260624_materials_hub.sql
```

- [ ] **Step 3: Verify columns added**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'deliverables' AND column_name IN ('doc', 'data_as_of');
-- Expected: 2 rows
```

- [ ] **Step 4: Add `'block-canvas'` to TemplateId in `lib/deliverable/templates.ts`**

```typescript
export type TemplateId =
  | "market-overview" | "bov-lite" | "client-email"
  | "one-pager" | "email" | "social"
  | "block-canvas";  // ← add this
```

- [ ] **Step 5: Extend DeliverableRow in `app/project/[id]/workspace/types.ts`**

Add to `DeliverableRow`:
```typescript
doc: import("@/lib/email/doc/types").EmailDoc | null;
data_as_of: string | null;
```

- [ ] **Step 6: Ensure page.tsx deliverables query includes new columns**

Open `app/project/[id]/page.tsx` and find the deliverables `.select(...)` call. If it uses explicit column lists rather than `*`, add `doc, data_as_of`. If it uses `select('*')`, no change needed.

- [ ] **Step 7: Verify build**

```bash
bunx next build
```

- [ ] **Step 8: Commit**

```bash
git add docs/sql/20260624_materials_hub.sql lib/deliverable/templates.ts "app/project/[id]/workspace/types.ts" "app/project/[id]/page.tsx"
git commit -m "feat(materials-hub): doc+data_as_of columns, extend DeliverableRow + TemplateId"
```

---

## Task 2 — Materials API (GET / POST / PATCH)

**Files:**
- Create: `app/api/projects/[id]/materials/route.ts`

**Produces:** `GET` returns `DeliverableRow[]`; `POST` saves new block-canvas material → `{ id }`; `PATCH` updates existing material doc in-place

- [ ] **Step 1: Write unit test for EmailDocSchema validation (no server needed)**

```typescript
// app/api/projects/[id]/materials/route.test.ts
import { describe, test, expect } from "bun:test";
import { EmailDocSchema } from "@/lib/email/doc/schema";

describe("EmailDocSchema validation", () => {
  test("rejects empty blocks array", () => {
    const result = EmailDocSchema.safeParse({
      globalStyle: { primaryColor: "#fff", accentColor: "#000", fontFamily: "MODERN_SANS", textColor: "#fff", backdropColor: "#000" },
      blocks: [],
    });
    expect(result.success).toBe(false);
  });

  test("accepts valid doc", () => {
    const result = EmailDocSchema.safeParse({
      globalStyle: { primaryColor: "#1BB8C9", accentColor: "#0d1e2b", fontFamily: "MODERN_SANS", textColor: "#fff", backdropColor: "#0d1e2b" },
      blocks: [{ type: "header", props: { companyName: "Acme" } }],
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test**

```bash
bun test "app/api/projects/[id]/materials/route.test.ts"
```

- [ ] **Step 3: Implement route**

```typescript
// app/api/projects/[id]/materials/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createCookieClient } from "@/lib/supabase/server";  // confirm exact name from build/route.ts
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { nanoid } from "nanoid";  // confirm exact import from build/route.ts

const DELIVERABLE_COLS = "id, template, status, created_at, scope_kind, scope_value, exec_summary, branding, deleted_at, supersedes_id, doc, data_as_of";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = createCookieClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await db
    .from("deliverables")
    .select(DELIVERABLE_COLS)
    .eq("project_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = createCookieClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Prove ownership via RLS
  const { data: project } = await db.from("projects").select("id").eq("id", id).single();
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body?.doc) return NextResponse.json({ error: "missing doc" }, { status: 400 });

  const parsed = EmailDocSchema.safeParse(body.doc);
  if (!parsed.success) return NextResponse.json({ error: "invalid doc", details: parsed.error.issues }, { status: 400 });

  const newId = nanoid(21);
  const { error } = await db.from("deliverables").insert({
    id: newId,
    project_id: id,
    user_id: user.id,
    template: "block-canvas",
    doc: parsed.data,
    data_as_of: body.data_as_of ?? new Date().toISOString(),
    narrative: { exec_summary: "", sections: [], inference_notes: [] },
    items_snapshot: [],
    status: "ready",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: newId }, { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = createCookieClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.deliverable_id) return NextResponse.json({ error: "missing deliverable_id" }, { status: 400 });

  // Refile: move material to a different project
  if (body.refile_project_id) {
    const { data: targetProject } = await db.from("projects").select("id").eq("id", body.refile_project_id).single();
    if (!targetProject) return NextResponse.json({ error: "target project not found" }, { status: 404 });
    await db.from("deliverables")
      .update({ project_id: body.refile_project_id })
      .eq("id", body.deliverable_id)
      .eq("user_id", user.id);
    return NextResponse.json({ ok: true });
  }

  // Update doc in place
  if (!body.doc) return NextResponse.json({ error: "missing doc" }, { status: 400 });
  const parsed = EmailDocSchema.safeParse(body.doc);
  if (!parsed.success) return NextResponse.json({ error: "invalid doc" }, { status: 400 });

  const { error } = await db
    .from("deliverables")
    .update({ doc: parsed.data, data_as_of: new Date().toISOString() })
    .eq("id", body.deliverable_id)
    .eq("project_id", id)
    .eq("template", "block-canvas");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Verify build**

```bash
bunx next build
```

- [ ] **Step 5: Commit**

```bash
git add "app/api/projects/[id]/materials/route.ts" "app/api/projects/[id]/materials/route.test.ts"
git commit -m "feat(materials-hub): GET+POST+PATCH /api/projects/[id]/materials"
```

---

## Task 3 — Update Data API + AI Refresh Mode

**Files:**
- Create: `app/api/projects/[id]/materials/[did]/refresh/route.ts`
- Modify: `app/api/email-lab/ai/route.ts` — accept `mode: "refresh"` param (likely no-op if doc-present path already enforces content-only via ContentPatchSchema)

**Produces:** `POST /api/projects/[id]/materials/[did]/refresh` → `{ id }` (new version row)

- [ ] **Step 1: Read `app/api/email-lab/ai/route.ts`**

Verify: when `doc` is present, does the route already use `ContentPatchSchema` (text-only patch)? If yes, `mode: "refresh"` is just a label — add it to destructuring but no logic change needed.

- [ ] **Step 2: Add `mode` to ai route destructuring** (minimal change)

```typescript
// In app/api/email-lab/ai/route.ts, find body destructuring and add mode:
const { prompt, doc, scope, mode } = await req.json();
// mode is informational — ContentPatchSchema already enforces content-only when doc is present
```

- [ ] **Step 3: Implement refresh route**

```typescript
// app/api/projects/[id]/materials/[did]/refresh/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createCookieClient } from "@/lib/supabase/server";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { nanoid } from "nanoid";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; did: string }> }
): Promise<NextResponse> {
  const { id, did } = await params;
  const db = createCookieClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: existing } = await db
    .from("deliverables")
    .select("id, template, doc, scope_kind, scope_value")
    .eq("id", did)
    .eq("project_id", id)   // RLS ownership proof
    .single();

  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (existing.template === "block-canvas" && existing.doc) {
    const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const scope = existing.scope_kind && existing.scope_value
      ? `${existing.scope_kind}:${existing.scope_value}` : undefined;

    const aiRes = await fetch(`${origin}/api/email-lab/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: req.headers.get("cookie") ?? "" },
      body: JSON.stringify({
        doc: existing.doc,
        scope,
        mode: "refresh",
        prompt: "Refresh all statistics and data values with the latest available data for this scope. Keep layout, colors, block order, and structure identical.",
      }),
    });
    if (!aiRes.ok) return NextResponse.json({ error: "ai refresh failed" }, { status: 502 });
    const { doc: refreshedDoc } = await aiRes.json();
    const validated = EmailDocSchema.safeParse(refreshedDoc);
    if (!validated.success) return NextResponse.json({ error: "invalid refreshed doc" }, { status: 500 });

    const newId = nanoid(21);
    const { error } = await db.from("deliverables").insert({
      id: newId,
      project_id: id,
      user_id: user.id,
      template: "block-canvas",
      doc: validated.data,
      data_as_of: new Date().toISOString(),
      narrative: { exec_summary: "", sections: [], inference_notes: [] },
      items_snapshot: [],
      status: "ready",
      supersedes_id: existing.id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: newId }, { status: 201 });
  }

  // Report templates: delegate to existing refresh endpoint
  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const r = await fetch(`${origin}/api/deliverables/${did}/refresh`, {
    method: "POST",
    headers: { Cookie: req.headers.get("cookie") ?? "" },
  });
  return NextResponse.json(await r.json(), { status: r.status });
}
```

- [ ] **Step 4: Verify build**

```bash
bunx next build
```

- [ ] **Step 5: Commit**

```bash
git add "app/api/projects/[id]/materials/[did]/refresh/route.ts" app/api/email-lab/ai/route.ts
git commit -m "feat(materials-hub): Update Data API + mode:refresh on ai route"
```

---

## Task 4 — File Suggest + AI Material APIs

**Files:**
- Create: `app/api/projects/[id]/file-suggest/route.ts`
- Create: `app/api/projects/[id]/ai-material/route.ts`

- [ ] **Step 1: File suggest route**

```typescript
// app/api/projects/[id]/file-suggest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createCookieClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = createCookieClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const materialId = req.nextUrl.searchParams.get("material_id");

  const [{ data: material }, { data: projects }] = await Promise.all([
    materialId
      ? db.from("deliverables").select("scope_kind, scope_value").eq("id", materialId).single()
      : Promise.resolve({ data: null }),
    db.from("projects").select("id, title, items, updated_at").order("updated_at", { ascending: false }).limit(20),
  ]);

  if (!projects) return NextResponse.json({ matched: [], recent: [] });

  const recent = projects.slice(0, 5);
  let matched: typeof projects = [];

  if (material?.scope_kind && material?.scope_value) {
    const sv = material.scope_value.toLowerCase();
    matched = projects.filter(p => {
      const items = Array.isArray(p.items) ? p.items as Array<{ value?: string; label?: string }> : [];
      return items.some(item =>
        (item.value ?? "").toLowerCase().includes(sv) ||
        (item.label ?? "").toLowerCase().includes(sv)
      );
    }).slice(0, 3);
  }

  // Always include the current project as a fallback match
  if (matched.length === 0) {
    const cur = projects.find(p => p.id === id);
    if (cur) matched = [cur];
  }

  return NextResponse.json({ matched, recent });
}
```

- [ ] **Step 2: AI material route**

```typescript
// app/api/projects/[id]/ai-material/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createCookieClient } from "@/lib/supabase/server";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { nanoid } from "nanoid";

// Rotation order: prefer formats not yet used in this project
const ROTATION: string[] = ["block-canvas", "market-overview", "client-email", "one-pager"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = createCookieClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: project } = await db.from("projects").select("id").eq("id", id).single();
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: existing } = await db
    .from("deliverables").select("template").eq("project_id", id).is("deleted_at", null);
  const usedTemplates = new Set(existing?.map(m => m.template) ?? []);
  const chosenTemplate = ROTATION.find(t => !usedTemplates.has(t)) ?? "block-canvas";

  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";

  if (chosenTemplate === "block-canvas") {
    const aiRes = await fetch(`${origin}/api/email-lab/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: req.headers.get("cookie") ?? "" },
      body: JSON.stringify({ prompt: "Create a compelling listing spotlight email for this property project." }),
    });
    if (!aiRes.ok) return NextResponse.json({ error: "ai generation failed" }, { status: 502 });
    const { doc } = await aiRes.json();
    const validated = EmailDocSchema.safeParse(doc);
    if (!validated.success) return NextResponse.json({ error: "invalid generated doc" }, { status: 500 });
    const newId = nanoid(21);
    await db.from("deliverables").insert({
      id: newId, project_id: id, user_id: user.id, template: "block-canvas",
      doc: validated.data, data_as_of: new Date().toISOString(),
      narrative: { exec_summary: "", sections: [], inference_notes: [] },
      items_snapshot: [], status: "ready",
    });
    return NextResponse.json({ id: newId, template: "block-canvas" }, { status: 201 });
  }

  // Report template: delegate to existing build route
  const buildRes = await fetch(`${origin}/api/projects/${id}/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: req.headers.get("cookie") ?? "" },
    body: JSON.stringify({ template: chosenTemplate }),
  });
  return NextResponse.json({ ...(await buildRes.json()), template: chosenTemplate }, { status: buildRes.status });
}
```

- [ ] **Step 3: Verify build**

```bash
bunx next build
```

- [ ] **Step 4: Commit**

```bash
git add "app/api/projects/[id]/file-suggest/route.ts" "app/api/projects/[id]/ai-material/route.ts"
git commit -m "feat(materials-hub): file-suggest + ai-material APIs"
```

---

## Task 5 — Email Lab Save / Load

**Files:**
- Modify: `app/project/[id]/email-lab/page.tsx` — load existing deliverable when `?did=<id>`
- Modify: `app/project/[id]/email-lab/ProjectEmailLabClient.tsx` — add save/update logic
- Modify: `components/email-lab/EmailLabShell.tsx` — add `onSave` prop + Save button

**Produces:** Email lab saves to deliverables; navigating back via Edit loads the saved doc

- [ ] **Step 1: Update `page.tsx` to load existing deliverable**

In the server component, read `searchParams.did` and load the deliverable:

```typescript
const did = ((await searchParams).did as string | undefined) ?? null;
let initialDoc: import("@/lib/email/doc/types").EmailDoc | null = null;
let initialDeliverableId: string | null = null;

if (did) {
  const { data } = await db
    .from("deliverables")
    .select("id, doc")
    .eq("id", did)
    .eq("template", "block-canvas")
    .single();
  if (data?.doc) { initialDoc = data.doc as any; initialDeliverableId = data.id; }
}
```

Pass to client: `<ProjectEmailLabClient ... initialDoc={initialDoc} deliverableId={initialDeliverableId} />`

- [ ] **Step 2: Update `ProjectEmailLabClient.tsx`**

```typescript
"use client";
import { useState } from "react";
import { EmailLabShell } from "@/components/email-lab/EmailLabShell";
import { SEED_DOCS } from "@/lib/email/seeds";
import type { EmailDoc } from "@/lib/email/doc/types";

interface Props {
  projectId: string;
  branding: Record<string, string>;
  scope?: { kind: string; value: string } | null;
  initialDoc?: EmailDoc | null;
  deliverableId?: string | null;
}

export function ProjectEmailLabClient({ projectId, branding, scope, initialDoc, deliverableId }: Props) {
  const [savedId, setSavedId] = useState<string | null>(deliverableId ?? null);
  const [saving, setSaving] = useState(false);

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
      initialDoc={initialDoc ?? SEED_DOCS[0].build()}
      branding={branding}
      scope={scope}
      projectId={projectId}
      onSave={handleSave}
      saving={saving}
    />
  );
}
```

- [ ] **Step 3: Add `onSave` prop to `EmailLabShell`**

Read `components/email-lab/EmailLabShell.tsx` to find the current props interface and toolbar location. Add:

```typescript
// Add to EmailLabShell props:
onSave?: (doc: EmailDoc) => Promise<void>;
saving?: boolean;

// Add Save button to toolbar (alongside existing Export/PDF buttons):
<button
  className="px-3 py-1.5 text-sm rounded-lg bg-[#1BB8C9]/20 text-[#1BB8C9] border border-[#1BB8C9]/30 hover:bg-[#1BB8C9]/30 disabled:opacity-40 transition-colors"
  onClick={() => onSave?.(doc)}   // doc = current doc state variable in EmailLabShell
  disabled={saving || !onSave}
>
  {saving ? "Saving…" : "Save"}
</button>
```

- [ ] **Step 4: Verify build**

```bash
bunx next build
```

- [ ] **Step 5: Manual verify in dev**

1. Navigate to `/project/<id>/email-lab`, edit a block, click Save → URL updates to `?did=<id>`
2. Reload → doc loads back with saved content

- [ ] **Step 6: Commit**

```bash
git add "app/project/[id]/email-lab/page.tsx" "app/project/[id]/email-lab/ProjectEmailLabClient.tsx" components/email-lab/EmailLabShell.tsx
git commit -m "feat(materials-hub): email lab save/load via deliverables"
```

---

## Task 6 — Status + Badge Logic (pure, tested)

**Files:**
- Create: `lib/deliverable/material-status.ts`
- Create: `lib/deliverable/material-status.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// lib/deliverable/material-status.test.ts
import { describe, test, expect } from "bun:test";
import { getMaterialStatus, getFormatBadge } from "./material-status";

const base = { template: "block-canvas", deleted_at: null, data_as_of: new Date().toISOString() };

describe("getMaterialStatus", () => {
  test("archived when deleted_at non-null", () => {
    expect(getMaterialStatus({ ...base, deleted_at: "2026-01-01" }, [])).toBe("archived");
  });

  test("needs_refresh when data_as_of > 30 days", () => {
    const old = new Date(); old.setDate(old.getDate() - 31);
    expect(getMaterialStatus({ ...base, data_as_of: old.toISOString() }, [])).toBe("needs_refresh");
  });

  test("needs_refresh beats scheduled", () => {
    const old = new Date(); old.setDate(old.getDate() - 31);
    expect(getMaterialStatus({ ...base, data_as_of: old.toISOString() }, [{ status: "active" }])).toBe("needs_refresh");
  });

  test("scheduled when active schedule exists", () => {
    expect(getMaterialStatus(base, [{ status: "active" }])).toBe("scheduled");
  });

  test("draft when fresh, no active schedule", () => {
    expect(getMaterialStatus(base, [])).toBe("draft");
  });
});

describe("getFormatBadge", () => {
  test("block-canvas → email / teal", () => {
    const b = getFormatBadge("block-canvas");
    expect(b.label).toBe("email");
    expect(b.color).toBe("#1BB8C9");
  });
  test("market-overview → overview / orange", () => {
    expect(getFormatBadge("market-overview").label).toBe("overview");
  });
  test("bov-lite → BOV / rose", () => {
    expect(getFormatBadge("bov-lite").color).toBe("#f43f5e");
  });
});
```

- [ ] **Step 2: Run tests (fail)**

```bash
bun test lib/deliverable/material-status.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// lib/deliverable/material-status.ts
export type MaterialStatus = "draft" | "scheduled" | "sent" | "needs_refresh" | "archived";

export function getMaterialStatus(
  d: { deleted_at: string | null; data_as_of: string | null; template: string },
  schedules: { status: string }[]
): MaterialStatus {
  if (d.deleted_at) return "archived";
  if (d.data_as_of) {
    const ageDays = (Date.now() - new Date(d.data_as_of).getTime()) / 86_400_000;
    if (ageDays > 30) return "needs_refresh";
  }
  if (schedules.some(s => s.status === "active")) return "scheduled";
  return "draft";
}

export interface FormatBadge { label: string; color: string; bg: string; }

const FORMAT_BADGES: Record<string, FormatBadge> = {
  "block-canvas":    { label: "email",     color: "#1BB8C9", bg: "bg-[#1BB8C9]/15" },
  "client-email":    { label: "email",     color: "#1BB8C9", bg: "bg-[#1BB8C9]/15" },
  "one-pager":       { label: "one-pager", color: "#8b5cf6", bg: "bg-[#8b5cf6]/15" },
  "market-overview": { label: "overview",  color: "#f97316", bg: "bg-[#f97316]/15" },
  "email":           { label: "digest",    color: "#f97316", bg: "bg-[#f97316]/15" },
  "bov-lite":        { label: "BOV",       color: "#f43f5e", bg: "bg-[#f43f5e]/15" },
};

export function getFormatBadge(template: string): FormatBadge {
  return FORMAT_BADGES[template] ?? { label: template, color: "#ffffff", bg: "bg-white/10" };
}
```

- [ ] **Step 4: Run tests (pass)**

```bash
bun test lib/deliverable/material-status.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/deliverable/material-status.ts lib/deliverable/material-status.test.ts
git commit -m "feat(materials-hub): getMaterialStatus + getFormatBadge with tests"
```

---

## Task 7 — MaterialThumbnail + MaterialCard

**Files:**
- Create: `components/project/MaterialThumbnail.tsx`
- Create: `components/project/MaterialCard.tsx`

**Design tokens (from spec):**
- Card base: `bg-[#0d1e2b]/80 border border-white/8 rounded-xl overflow-hidden transition-all duration-150`
- Hover: `hover:ring-1 hover:ring-[#1BB8C9]/40 hover:bg-[#0d1e2b] cursor-pointer`
- Thumbnail area: `bg-[#0d2030]`, height `180px`
- Iframe: `width:600 scale(0.3) transformOrigin:top left pointer-events:none`

- [ ] **Step 1: MaterialThumbnail**

```typescript
// components/project/MaterialThumbnail.tsx
"use client";
import { useEffect, useState } from "react";
import type { EmailDoc } from "@/lib/email/doc/types";

interface Props {
  doc?: EmailDoc | null;
  execSummary?: string | null;
}

export function MaterialThumbnail({ doc, execSummary }: Props) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    fetch("/api/email-lab/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc }),
    })
      .then(r => r.json())
      .then(d => { if (!cancelled && d.html) setHtml(d.html); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [doc]);

  if (doc && html) {
    return (
      <div className="relative overflow-hidden bg-[#0d2030]" style={{ height: 180 }}>
        <iframe
          srcDoc={html}
          title="material preview"
          className="pointer-events-none absolute top-0 left-0 border-0"
          style={{ width: 600, height: 600, transform: "scale(0.3)", transformOrigin: "top left" }}
          sandbox="allow-same-origin"
        />
      </div>
    );
  }

  return (
    <div className="flex items-start p-3 bg-[#0d2030]" style={{ height: 180 }}>
      <p className="text-xs leading-snug text-white/30 line-clamp-6">
        {execSummary ?? "No preview available"}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: MaterialCard**

```typescript
// components/project/MaterialCard.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MaterialThumbnail } from "./MaterialThumbnail";
import { getMaterialStatus, getFormatBadge, type MaterialStatus } from "@/lib/deliverable/material-status";
import type { DeliverableRow, EmailScheduleRow } from "@/app/project/[id]/workspace/types";

const STATUS_CHIP: Record<MaterialStatus, { dot: string; text: string; label: string }> = {
  draft:         { dot: "bg-white/20",  text: "text-white/40",  label: "draft" },
  scheduled:     { dot: "bg-[#4f46e5]", text: "text-[#818cf8]", label: "scheduled" },
  sent:          { dot: "bg-[#10b981]", text: "text-[#34d399]", label: "sent" },
  needs_refresh: { dot: "bg-[#f59e0b]", text: "text-[#fbbf24]", label: "needs refresh" },
  archived:      { dot: "bg-white/10",  text: "text-white/20",  label: "archived" },
};

interface Props {
  deliverable: DeliverableRow;
  projectId: string;
  schedules: EmailScheduleRow[];
  onRefresh: (id: string) => Promise<void>;
  onFile: (id: string) => void;
}

export function MaterialCard({ deliverable: d, projectId, schedules, onRefresh, onFile }: Props) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const status = getMaterialStatus(d, schedules);
  const badge = getFormatBadge(d.template);
  const chip = STATUS_CHIP[status];

  const createdDate = new Date(d.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const dataAsOf = d.data_as_of
    ? new Date(d.data_as_of).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : null;

  const title = d.exec_summary?.slice(0, 50)
    || `${badge.label} · ${new Date(d.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;

  function open() {
    if (d.template === "block-canvas") router.push(`/project/${projectId}/email-lab?did=${d.id}`);
    else router.push(`/p/${d.id}`);
  }

  async function handleRefresh(e: React.MouseEvent) {
    e.stopPropagation();
    setRefreshing(true);
    await onRefresh(d.id);
    setRefreshing(false);
  }

  return (
    <li
      className="group relative bg-[#0d1e2b]/80 border border-white/8 rounded-xl overflow-hidden transition-all duration-150 hover:ring-1 hover:ring-[#1BB8C9]/40 hover:bg-[#0d1e2b] cursor-pointer"
      onClick={open}
    >
      <div className="relative">
        <MaterialThumbnail doc={d.doc} execSummary={d.exec_summary} />
        {/* Format badge — use className for Tailwind bg, style for dynamic color */}
        <span
          className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${badge.bg}`}
          style={{ color: badge.color }}
        >
          {badge.label}
        </span>
      </div>

      <div className="px-3 pt-2 pb-3">
        <p className="text-sm font-medium text-white/85 truncate">{title}</p>
        <p className="text-[10px] text-white/35 mt-0.5">
          {createdDate}{dataAsOf ? ` · data: ${dataAsOf}` : ""}
        </p>

        <div className="flex items-center justify-between mt-2">
          <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${chip.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${chip.dot}`} />
            {chip.label}
          </span>

          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <button
              className="px-2 py-1 text-[11px] text-white/60 hover:text-white rounded"
              onClick={e => { e.stopPropagation(); open(); }}
            >Edit</button>
            <button
              className="px-2 py-1 text-[11px] text-white/60 hover:text-white rounded disabled:opacity-40"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Update Data"
            >{refreshing ? "…" : "↻"}</button>
            <button
              className="px-2 py-1 text-[11px] text-white/60 hover:text-white rounded"
              onClick={e => { e.stopPropagation(); onFile(d.id); }}
              title="More"
            >⋯</button>
          </div>
        </div>
      </div>
    </li>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
bunx next build
```

- [ ] **Step 4: Commit**

```bash
git add components/project/MaterialThumbnail.tsx components/project/MaterialCard.tsx
git commit -m "feat(materials-hub): MaterialThumbnail + MaterialCard components"
```

---

## Task 8 — MaterialsGrid + NewMaterialPicker

**Files:**
- Create: `components/project/MaterialsGrid.tsx`
- Create: `components/project/NewMaterialPicker.tsx`

- [ ] **Step 1: NewMaterialPicker**

```typescript
// components/project/NewMaterialPicker.tsx
"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface Props {
  projectId: string;
  onClose: () => void;
  onAiSurprise: () => void;
}

export function NewMaterialPicker({ projectId, onClose, onAiSurprise }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [onClose]);

  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 z-50 w-52 rounded-xl border border-white/10 bg-[#0d1920] shadow-xl overflow-hidden">
      {[
        { icon: "✉", label: "Email", action: () => { router.push(`/project/${projectId}/email-lab`); onClose(); } },
        { icon: "□", label: "One-pager", action: () => { /* deliverable builder — use existing seed route */ onClose(); } },
        { icon: "📊", label: "Market overview", action: () => { /* deliverable builder */ onClose(); } },
      ].map(o => (
        <button key={o.label} onClick={o.action}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-white/80 hover:bg-white/5 transition-colors">
          <span>{o.icon}</span>{o.label}
        </button>
      ))}
      <div className="border-t border-white/8" />
      <button onClick={() => { onAiSurprise(); onClose(); }}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-[#1BB8C9] hover:bg-[#1BB8C9]/5 transition-colors">
        <span>✦</span>AI, surprise me
      </button>
    </div>
  );
}
```

- [ ] **Step 2: MaterialsGrid**

```typescript
// components/project/MaterialsGrid.tsx
"use client";
import { useState } from "react";
import { MaterialCard } from "./MaterialCard";
import { NewMaterialPicker } from "./NewMaterialPicker";
import type { DeliverableRow, EmailScheduleRow } from "@/app/project/[id]/workspace/types";

type View = "grid" | "list";

interface Props {
  projectId: string;
  materials: DeliverableRow[];
  schedules: EmailScheduleRow[];
  onRefresh: (id: string) => Promise<void>;
  onFile: (id: string) => void;
  onAiSurprise: () => Promise<void>;
}

export function MaterialsGrid({ projectId, materials, schedules, onRefresh, onFile, onAiSurprise }: Props) {
  const [view, setView] = useState<View>("grid");
  const [showPicker, setShowPicker] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);

  async function handleAiSurprise() {
    setAiRunning(true);
    await onAiSurprise();
    setAiRunning(false);
  }

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wide">
          Materials{materials.length > 0 && <span className="ml-1.5 font-normal text-white/25">· {materials.length}</span>}
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md overflow-hidden border border-white/8 text-xs">
            {(["grid", "list"] as View[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-2 py-1 ${view === v ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"}`}
              >{v === "grid" ? "⊞" : "≡"}</button>
            ))}
          </div>
          <div className="relative">
            <button
              onClick={() => setShowPicker(p => !p)}
              disabled={aiRunning}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-[#1BB8C9] bg-[#1BB8C9]/10 hover:bg-[#1BB8C9]/20 rounded-lg border border-[#1BB8C9]/20 transition-colors disabled:opacity-50"
            >
              {aiRunning ? "Generating…" : "+ New Material ▾"}
            </button>
            {showPicker && <NewMaterialPicker projectId={projectId} onClose={() => setShowPicker(false)} onAiSurprise={handleAiSurprise} />}
          </div>
        </div>
      </div>

      {materials.length === 0 ? (
        <div className="flex items-center justify-center h-28 rounded-xl border border-dashed border-white/10 text-white/25 text-sm">
          No materials yet — click New Material to start
        </div>
      ) : (
        <ul className={view === "grid"
          ? "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
          : "flex flex-col gap-2"
        }>
          {materials.map(d => (
            <MaterialCard key={d.id} deliverable={d} projectId={projectId} schedules={schedules}
              onRefresh={onRefresh} onFile={onFile} />
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
bunx next build
```

- [ ] **Step 4: Commit**

```bash
git add components/project/MaterialsGrid.tsx components/project/NewMaterialPicker.tsx
git commit -m "feat(materials-hub): MaterialsGrid + NewMaterialPicker"
```

---

## Task 9 — FilingSidebar + AiSuggestionBanner

**Files:**
- Create: `components/project/FilingSidebar.tsx`
- Create: `components/project/AiSuggestionBanner.tsx`

- [ ] **Step 1: Write AiSuggestionBanner test**

```typescript
// components/project/AiSuggestionBanner.test.tsx
import { render, screen } from "@testing-library/react";
import { AiSuggestionBanner } from "./AiSuggestionBanner";
import { describe, test, expect } from "bun:test";

describe("AiSuggestionBanner", () => {
  test("renders scope label", () => {
    render(<AiSuggestionBanner scopeLabel="a 33931 listing" onYes={() => {}} onSkip={() => {}} />);
    expect(screen.getByText(/a 33931 listing/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Implement AiSuggestionBanner**

```typescript
// components/project/AiSuggestionBanner.tsx
"use client";
import { useEffect } from "react";

interface Props {
  scopeLabel: string;
  onYes: () => void;
  onSkip: () => void;
}

export function AiSuggestionBanner({ scopeLabel, onYes, onSkip }: Props) {
  useEffect(() => {
    const t = setTimeout(onSkip, 15_000);
    return () => clearTimeout(t);
  }, [onSkip]);

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-[#1BB8C9]/20 bg-[#1BB8C9]/8 px-4 py-2.5 text-sm mb-4">
      <span>
        <span className="text-[#1BB8C9] mr-2">◈</span>
        Looks like <span className="text-white/80">{scopeLabel}</span> — file it here?
      </span>
      <div className="flex gap-2 shrink-0">
        <button onClick={onYes}
          className="px-3 py-1 rounded-md bg-[#1BB8C9]/20 text-[#1BB8C9] text-xs hover:bg-[#1BB8C9]/30 transition-colors">
          Yes
        </button>
        <button onClick={onSkip}
          className="px-3 py-1 text-white/40 text-xs hover:text-white/60 transition-colors">
          Skip
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement FilingSidebar**

```typescript
// components/project/FilingSidebar.tsx
"use client";
import { useEffect, useState } from "react";

interface Project { id: string; title: string | null; }

interface Props {
  materialId: string;
  projectId: string;
  onClose: () => void;
}

export function FilingSidebar({ materialId, projectId, onClose }: Props) {
  const [matched, setMatched] = useState<Project[]>([]);
  const [recent, setRecent] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [filing, setFiling] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/file-suggest?material_id=${materialId}`)
      .then(r => r.json())
      .then(({ matched = [], recent = [] }) => { setMatched(matched); setRecent(recent); })
      .catch(() => {});
  }, [materialId, projectId]);

  const allProjects = [...matched, ...recent.filter(r => !matched.some(m => m.id === r.id))];
  const filtered = search
    ? allProjects.filter(p => (p.title ?? "").toLowerCase().includes(search.toLowerCase()))
    : allProjects;

  async function file(targetId: string) {
    setFiling(targetId);
    await fetch(`/api/projects/${projectId}/materials`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliverable_id: materialId, refile_project_id: targetId }),
    });
    setFiling(null);
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-72 bg-[#0d1920] border-l border-white/8 z-50 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
          <span className="text-sm font-medium text-white/80">File to project</span>
          <button className="text-white/40 hover:text-white" onClick={onClose}>✕</button>
        </div>
        <div className="px-4 py-3">
          <input
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#1BB8C9]/40"
            placeholder="🔍 Search address…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">
          {matched.length > 0 && (
            <>
              <p className="text-[10px] text-white/30 uppercase tracking-wide mb-1">AI Match</p>
              {matched.map(p => (
                <button key={p.id} onClick={() => file(p.id)} disabled={!!filing}
                  className="w-full text-left px-3 py-2 rounded-lg border-l-2 border-[#1BB8C9] bg-[#1BB8C9]/5 text-sm text-white/80 hover:bg-[#1BB8C9]/10 transition-colors">
                  {filing === p.id ? "Filing…" : (p.title ?? p.id)}
                </button>
              ))}
            </>
          )}
          {filtered.filter(p => !matched.some(m => m.id === p.id)).length > 0 && (
            <>
              <p className="text-[10px] text-white/30 uppercase tracking-wide mb-1 mt-3">Your Projects</p>
              {filtered.filter(p => !matched.some(m => m.id === p.id)).map(p => (
                <button key={p.id} onClick={() => file(p.id)} disabled={!!filing}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/60 hover:bg-white/5 hover:text-white/80 transition-colors flex items-center gap-2">
                  <span className="text-white/20">○</span>
                  {filing === p.id ? "Filing…" : (p.title ?? p.id)}
                </button>
              ))}
            </>
          )}
        </div>
        <div className="px-4 py-3 border-t border-white/8">
          <button className="text-sm text-[#1BB8C9]/70 hover:text-[#1BB8C9] transition-colors">
            + Create new project
          </button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
bunx next build
```

- [ ] **Step 5: Commit**

```bash
git add components/project/FilingSidebar.tsx components/project/AiSuggestionBanner.tsx components/project/AiSuggestionBanner.test.tsx
git commit -m "feat(materials-hub): FilingSidebar + AiSuggestionBanner"
```

---

## Task 10 — Wire ProjectWorkspace + Refactor DeliverableLanes

**Files:**
- Modify: `app/project/[id]/ProjectWorkspace.tsx`
- Modify: `app/project/[id]/workspace/DeliverableLanes.tsx`
- 🔴 Modify: `app/project/[id]/page.tsx` (pass initial materials from server)

**Layout order (per spec):**
1. Project header + title (existing)
2. `AiSuggestionBanner` (if post-build match, not yet dismissed)
3. `MaterialsGrid` (above the fold)
4. Scheduled sends section (email schedules lane, kept from DeliverableLanes)
5. Filed data — `<details open={materials.length < 3}>` wrapping `ItemsBoard` + `UploadDrop`

- [ ] **Step 1: Add materials state + handlers to ProjectWorkspace**

Read `ProjectWorkspace.tsx` to find where `runBuild` returns and where `DeliverableLanes` is currently rendered. Then add:

```typescript
// New state:
const [materials, setMaterials] = useState<DeliverableRow[]>(initialDeliverables);
const [filingMaterialId, setFilingMaterialId] = useState<string | null>(null);
const [suggestion, setSuggestion] = useState<{ scopeLabel: string } | null>(null);

async function refreshMaterials() {
  const res = await fetch(`/api/projects/${id}/materials`);
  if (res.ok) setMaterials(await res.json());
}

async function handleAiSurprise() {
  const res = await fetch(`/api/projects/${id}/ai-material`, { method: "POST" });
  if (res.ok) await refreshMaterials();
}

async function handleRefreshMaterial(did: string) {
  const res = await fetch(`/api/projects/${id}/materials/${did}/refresh`, { method: "POST" });
  if (res.ok) await refreshMaterials();
}
```

- [ ] **Step 2: Update `runBuild` to check for AI suggestion after build**

After a successful build, add:

```typescript
await refreshMaterials();
// Check newest material for suggestion banner
const newest = materials[0];
if (newest?.scope_kind && newest?.scope_value) {
  const r = await fetch(`/api/projects/${id}/file-suggest?material_id=${newest.id}`);
  if (r.ok) {
    const { matched } = await r.json();
    if (matched.length > 0) {
      const scopeLabel = /^\d{5}$/.test(newest.scope_value)
        ? `a ${newest.scope_value} listing`
        : `a ${newest.scope_value} property`;
      setSuggestion({ scopeLabel });
    }
  }
}
```

- [ ] **Step 3: Update render structure in ProjectWorkspace**

Replace the current `<ItemsBoard>` + `<DeliverableLanes>` + `<BuildActions>` block with:

```tsx
{/* Post-build AI suggestion */}
{suggestion && (
  <AiSuggestionBanner
    scopeLabel={suggestion.scopeLabel}
    onYes={() => { setFilingMaterialId(materials[0]?.id ?? null); setSuggestion(null); }}
    onSkip={() => setSuggestion(null)}
  />
)}

{/* Materials grid — above fold */}
<MaterialsGrid
  projectId={id}
  materials={materials}
  schedules={emailSchedules}
  onRefresh={handleRefreshMaterial}
  onFile={setFilingMaterialId}
  onAiSurprise={handleAiSurprise}
/>

{/* Scheduled sends — email schedules section from DeliverableLanes */}
<DeliverableLanes emailSchedules={emailSchedules} />

{/* Filed data — collapsed by default when ≥3 materials */}
<details open={materials.length < 3} className="mt-6">
  <summary className="cursor-pointer select-none text-sm text-white/40 hover:text-white/60 mb-3">
    Filed data · {items.length} items
  </summary>
  <ItemsBoard items={items} charts={charts} ... />
  <UploadDrop projectId={id} />
</details>

<BuildActions template={template} onTemplate={setTemplate} onBuild={() => runBuild()} building={building} />

{filingMaterialId && (
  <FilingSidebar
    materialId={filingMaterialId}
    projectId={id}
    onClose={() => setFilingMaterialId(null)}
  />
)}
```

- [ ] **Step 4: Refactor DeliverableLanes — remove Built lane**

In `DeliverableLanes.tsx`, remove the entire `{deliverables.length > 0 && <section>...</section>}` block that renders the built deliverables thumbnail grid. Keep only the `{emailSchedules.length > 0 && <section>...</section>}` emailing lane. Update props to remove `deliverables`/`trashedDeliverables`/`onToggleRevoke`/`onRefresh`/`onEdit`/`onTrash` (no longer needed). Keep `emailSchedules`.

Update `ProjectWorkspace.tsx` call site to match the simplified props.

- [ ] **Step 5: Verify build**

```bash
bunx next build
```

- [ ] **Step 6: Manual smoke test**

1. `/project/<id>` — MaterialsGrid visible, ItemsBoard collapsed when ≥3 materials
2. `+ New Material ▾` → picker opens
3. Email → email lab, Save → card appears
4. ↻ on card → new version in grid
5. ⋯ → FilingSidebar, AI match highlighted teal
6. Build a report → AI suggestion banner appears, auto-dismisses at 15s

- [ ] **Step 7: Commit**

```bash
git add "app/project/[id]/ProjectWorkspace.tsx" "app/project/[id]/workspace/DeliverableLanes.tsx" "app/project/[id]/page.tsx"
git commit -m "feat(materials-hub): wire ProjectWorkspace — MaterialsGrid + filing + ItemsBoard collapse"
```

---

## Task 11 — Phase 7: Scheduler Block-Canvas Lane

**Files:**
- Modify: `scripts/email/run-schedules.mts` — add block-canvas branch to `buildContent()`

**Constraint:** Nightly send patches content ephemerally — never mutates `deliverable.doc`. Saved design row stays frozen.

- [ ] **Step 1: Extract `firstBlockHeading` to a testable file**

```typescript
// lib/email/first-block-heading.mts
import type { EmailDoc } from "@/lib/email/doc/types";

export function firstBlockHeading(doc: EmailDoc): string | null {
  const block = doc.blocks.find(b => b.type === "header" || b.type === "hero");
  if (!block) return null;
  if (block.type === "header") return (block.props as any).tagline ?? null;
  if (block.type === "hero") return (block.props as any).label ?? (block.props as any).kicker ?? null;
  return null;
}
```

- [ ] **Step 2: Write unit tests**

```typescript
// lib/email/first-block-heading.test.mts
import { describe, test, expect } from "bun:test";
import { firstBlockHeading } from "./first-block-heading.mts";

const gs = { primaryColor: "#0", accentColor: "#0", fontFamily: "MODERN_SANS" as const, textColor: "#0", backdropColor: "#0" };

describe("firstBlockHeading", () => {
  test("returns header tagline", () => {
    expect(firstBlockHeading({ globalStyle: gs, blocks: [{ id: "b1", type: "header", props: { tagline: "Listing Spotlight" } }] })).toBe("Listing Spotlight");
  });
  test("returns hero label", () => {
    expect(firstBlockHeading({ globalStyle: gs, blocks: [{ id: "b1", type: "hero", props: { label: "Market Update" } }] })).toBe("Market Update");
  });
  test("falls back to hero kicker", () => {
    expect(firstBlockHeading({ globalStyle: gs, blocks: [{ id: "b1", type: "hero", props: { kicker: "Fort Myers Beach" } }] })).toBe("Fort Myers Beach");
  });
  test("returns null when no heading block", () => {
    expect(firstBlockHeading({ globalStyle: gs, blocks: [{ id: "b1", type: "text", props: { body: "hi" } }] })).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests (fail → pass)**

```bash
bun test lib/email/first-block-heading.test.mts
```

- [ ] **Step 4: Add block-canvas branch to `buildContent()` in `run-schedules.mts`**

Read the file first to confirm exact: function signature, return type, `deps` interface fields (`deps.db`, `deps.siteUrl`, `deps.dryRun`, `deps.log` or equivalent).

Then add at the top of `buildContent()`, before existing `template_id` routing:

```typescript
import { firstBlockHeading } from "@/lib/email/first-block-heading.mts";
import { EmailDocSchema } from "@/lib/email/doc/schema";

// Inside buildContent():
if (row.template_id === "block-canvas" && row.project_id) {
  const { data: savedDesign } = await deps.db
    .from("deliverables")
    .select("id, doc, scope_kind, scope_value")
    .eq("project_id", row.project_id)
    .eq("template", "block-canvas")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!savedDesign?.doc) {
    // No saved design → fall through to existing digest behavior
    deps.log?.(`[block-canvas] no saved design for project ${row.project_id}, falling back`);
  } else {
    const scope = savedDesign.scope_kind && savedDesign.scope_value
      ? `${savedDesign.scope_kind}:${savedDesign.scope_value}` : undefined;

    // AI patch — ephemeral, never writes back to savedDesign.doc
    const aiRes = await fetch(`${deps.siteUrl}/api/email-lab/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doc: savedDesign.doc,
        scope,
        mode: "refresh",
        prompt: "Refresh all data values and statistics with the latest lake data for this scope. Keep layout, colors, and block structure identical.",
      }),
    });
    if (!aiRes.ok) throw new Error(`block-canvas AI refresh failed: ${aiRes.status}`);
    const { doc: patchedDoc } = await aiRes.json();

    const validated = EmailDocSchema.safeParse(patchedDoc);
    if (!validated.success) throw new Error("block-canvas AI returned invalid doc");

    const renderRes = await fetch(`${deps.siteUrl}/api/email-lab/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc: validated.data }),
    });
    if (!renderRes.ok) throw new Error(`block-canvas render failed: ${renderRes.status}`);
    const { html } = await renderRes.json();

    const subject = firstBlockHeading(validated.data)
      ?? (scope ? `${scope} Update` : "Your Market Update");

    if (deps.dryRun) {
      deps.log?.(`[DRY_RUN block-canvas] subject: ${subject}`);
      deps.log?.(`[DRY_RUN block-canvas] patched doc blocks: ${validated.data.blocks.length}`);
      deps.log?.(`[DRY_RUN block-canvas] rendered html length: ${html.length}`);
      return null;
    }

    return { subject, body: "", html };
  }
}
```

- [ ] **Step 5: Run scheduler tests**

```bash
bun test scripts/email/
```

- [ ] **Step 6: Verify build**

```bash
bunx next build
```

- [ ] **Step 7: Dry-run smoke test**

In the DB, find or create an `email_schedules` row with `template_id = 'block-canvas'` and `project_id` pointing to a project with a saved block-canvas deliverable. Then:

```bash
DRY_RUN=true bun scripts/email/run-schedules.mts
# Expected: [DRY_RUN block-canvas] subject: ... lines in stdout
# Expected: savedDesign.doc unchanged after run
```

- [ ] **Step 8: Commit**

```bash
git add scripts/email/run-schedules.mts lib/email/first-block-heading.mts lib/email/first-block-heading.test.mts
git commit -m "feat(materials-hub): Phase 7 — block-canvas scheduler lane + firstBlockHeading"
```

---

## Verification

### Phase 6 acceptance checklist (from spec §15)

```bash
# After Task 10 complete:
bunx next build   # must be clean

# Manual:
# [x] block-canvas email saved to deliverables with template='block-canvas', doc=EmailDoc JSON
# [x] Materials grid renders above ItemsBoard
# [x] Cards show: format badge (correct color), status chip, date, "data as of" date
# [x] Click block-canvas card → email lab with saved doc; click report card → /p/[id]
# [x] ↻ on card → patches content, saves new row with supersedes_id → card refreshes
# [x] "Needs refresh" chip fires when data_as_of > 30 days (set manually in DB to test)
# [x] FilingSidebar: AI match row has teal left border, "Yes" refiles
# [x] AI suggestion banner appears after build if scope matches project, auto-dismisses 15s
# [x] "+ New Material ▾" picker: Email → email-lab, report types → builder, AI surprise → generates+saves
# [x] ItemsBoard inside <details>, closed by default when ≥3 materials
```

### Phase 7 checklist (from spec §15)

```bash
DRY_RUN=true bun scripts/email/run-schedules.mts
# [x] block-canvas row with project_id fires scheduler lane
# [x] DRY_RUN logs patched doc + HTML, does NOT send, does NOT mutate saved deliverable.doc
# [x] No new GHA workflow file needed
```

### Full test suite

```bash
bun test
# New passing tests: getMaterialStatus (5), getFormatBadge (3), firstBlockHeading (4), AiSuggestionBanner (1)
# All existing tests unchanged
```

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 10 | `app/project/[id]/page.tsx` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
