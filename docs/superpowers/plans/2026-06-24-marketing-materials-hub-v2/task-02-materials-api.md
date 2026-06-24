### Task 2: Materials API — POST (save new) + PATCH (manual save in place)

**Model:** Opus (auth correctness — v1 failed exactly here) · **Depends on:** Task 1.

**Files:**
- Create: `app/api/projects/[id]/materials/route.ts`
- Create: `app/api/projects/[id]/materials/route.test.ts`

**Interfaces:**
- Consumes: `EmailDocSchema` from `@/lib/email/doc/schema`; `createClient` from `@/utils/supabase/server`; `createServiceRoleClient` from `@/utils/supabase/service-role`.
- Produces: `POST /api/projects/[id]/materials { doc, data_as_of? }` → `201 { id }`; `PATCH /api/projects/[id]/materials { deliverable_id, doc }` → `200 { ok: true }`. No `GET` (hub uses server props + `router.refresh()`).

---

- [ ] **Step 1: Write the schema contract test**

```typescript
// app/api/projects/[id]/materials/route.test.ts
import { describe, test, expect } from "bun:test";
import { EmailDocSchema } from "@/lib/email/doc/schema";

const validDoc = {
  globalStyle: { primaryColor: "#0f1d24", accentColor: "#1BB8C9", fontFamily: "MODERN_SANS", textColor: "#242424", backdropColor: "#F8F8F8" },
  blocks: [{ type: "header", props: { companyName: "Acme" } }],
};

describe("materials POST contract", () => {
  test("EmailDocSchema accepts a valid doc (block id minted)", () => {
    expect(EmailDocSchema.safeParse(validDoc).success).toBe(true);
  });
  test("EmailDocSchema rejects empty blocks", () => {
    expect(EmailDocSchema.safeParse({ ...validDoc, blocks: [] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it (passes — it's a contract check)**

Run: `bun test "app/api/projects/[id]/materials/route.test.ts"`
Expected: 2 pass.

- [ ] **Step 3: Confirm the verified imports against the build route**

Open `app/api/projects/[id]/build/route.ts` and confirm lines ~3-4 import `createClient` from `@/utils/supabase/server` and `createServiceRoleClient` from `@/utils/supabase/service-role`, and that it ownership-checks on the cookie client then writes via service-role (~18-20, 65). Use that exact pattern below.

- [ ] **Step 4: Implement the route**

```typescript
// app/api/projects/[id]/materials/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { EmailDocSchema } from "@/lib/email/doc/schema";

const EMPTY_NARRATIVE = { exec_summary: "", sections: [], inference_notes: [] };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const db = createClient(await cookies());
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Ownership: projects has owner RLS, so this select only succeeds for the owner.
  const { data: project } = await db.from("projects").select("id").eq("id", id).single();
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = EmailDocSchema.safeParse(body?.doc);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid doc", details: parsed.error.issues }, { status: 400 });
  }

  const newId = crypto.randomUUID();
  const admin = createServiceRoleClient(); // deliverables has no owner INSERT policy — write via service-role
  const { error } = await admin.from("deliverables").insert({
    id: newId,
    project_id: id,
    user_id: user.id,
    template: "block-canvas",
    doc: parsed.data,
    data_as_of: body?.data_as_of ?? new Date().toISOString(),
    narrative: EMPTY_NARRATIVE,
    items_snapshot: [],
    status: "ready",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: newId }, { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const db = createClient(await cookies());
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.deliverable_id) return NextResponse.json({ error: "missing deliverable_id" }, { status: 400 });
  const parsed = EmailDocSchema.safeParse(body?.doc);
  if (!parsed.success) return NextResponse.json({ error: "invalid doc" }, { status: 400 });

  // Ownership proof on the RLS client: this row is visible only if the user owns the project.
  const { data: owned } = await db
    .from("deliverables").select("id")
    .eq("id", body.deliverable_id).eq("project_id", id).eq("template", "block-canvas").single();
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("deliverables")
    .update({ doc: parsed.data, data_as_of: new Date().toISOString() })
    .eq("id", body.deliverable_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

> Note: manual Save PATCHes in place (no new version). The data-refresh *fork* is Task 3.

- [ ] **Step 5: Verify build**

Run: `bunx next build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add "app/api/projects/[id]/materials/route.ts" "app/api/projects/[id]/materials/route.test.ts"
git commit -m "feat(materials-hub): materials API POST+PATCH (service-role after ownership)"
```
