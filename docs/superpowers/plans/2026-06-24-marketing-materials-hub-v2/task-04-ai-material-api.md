### Task 4: AI new-material — steerable intent → seed pick + fill

**Model:** Sonnet (reuses Task 3's AI-orchestration pattern; bounded) · **Depends on:** Task 3 (pattern), Task 1.

**Files:**
- Create: `app/api/projects/[id]/ai-material/route.ts`
- Create: `app/api/projects/[id]/ai-material/pick-seed.ts` (pure keyword→seed heuristic)
- Create: `app/api/projects/[id]/ai-material/pick-seed.test.ts`

**Interfaces:**
- Consumes: `SEED_DOCS`, `seedById` from `@/lib/email/doc/default-docs`; the AI route; `EmailDocSchema`; service-role client.
- Produces: `POST /api/projects/[id]/ai-material { intent }` → `201 { id, template: { id, name } }`. Never a dead end: if the AI can't fill, it still saves the seeded template.

---

- [ ] **Step 1: Write the pick-seed test (TDD)**

```typescript
// app/api/projects/[id]/ai-material/pick-seed.test.ts
import { describe, test, expect } from "bun:test";
import { pickSeedId } from "./pick-seed";

describe("pickSeedId", () => {
  test("'just sold on 5th st' → just-sold", () => expect(pickSeedId("just sold on 5th st")).toBe("just-sold"));
  test("'new listing 123 Gulf Blvd' → listing-feature", () => expect(pickSeedId("new listing 123 Gulf Blvd")).toBe("listing-feature"));
  test("'welcome new subscribers' → welcome", () => expect(pickSeedId("welcome new subscribers")).toBe("welcome"));
  test("'april market update' → market-letter", () => expect(pickSeedId("april market update")).toBe("market-letter"));
  test("unknown → market-spotlight (default)", () => expect(pickSeedId("asdf")).toBe("market-spotlight"));
});
```

- [ ] **Step 2: Run it (fails — pickSeedId not defined)**

Run: `bun test "app/api/projects/[id]/ai-material/pick-seed.test.ts"`
Expected: FAIL.

- [ ] **Step 3: Implement the heuristic**

```typescript
// app/api/projects/[id]/ai-material/pick-seed.ts
// Maps a free-text intent to a SEED_DOCS id. First match wins; default market-spotlight.
const RULES: { id: string; words: string[] }[] = [
  { id: "just-sold", words: ["sold", "closed", "under contract"] },
  { id: "listing-feature", words: ["listing", "listed", "for sale", "open house", "new on market"] },
  { id: "welcome", words: ["welcome", "subscribe", "subscriber", "onboard"] },
  { id: "market-letter", words: ["update", "letter", "this month", "newsletter", "monthly"] },
  { id: "market-spotlight", words: ["spotlight", "stats", "numbers", "snapshot"] },
];

export function pickSeedId(intent: string): string {
  const t = (intent ?? "").toLowerCase();
  for (const r of RULES) if (r.words.some((w) => t.includes(w))) return r.id;
  return "market-spotlight";
}
```

- [ ] **Step 4: Run it (passes)**

Run: `bun test "app/api/projects/[id]/ai-material/pick-seed.test.ts"`
Expected: 5 pass.

- [ ] **Step 5: Implement the route**

```typescript
// app/api/projects/[id]/ai-material/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { seedById } from "@/lib/email/doc/default-docs";
import { pickSeedId } from "./pick-seed";

const EMPTY_NARRATIVE = { exec_summary: "", sections: [], inference_notes: [] };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const db = createClient(await cookies());
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Ownership + scope for lake context.
  const { data: project } = await db.from("projects").select("id, scope_kind, scope_value").eq("id", id).single();
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { intent } = await req.json().catch(() => ({ intent: "" }));
  const seed = seedById(pickSeedId(intent ?? ""))!; // pickSeedId always returns a real id
  const seededDoc = seed.build();

  // Try to fill with lake data. If the AI applies nothing, fall back to the seeded doc (never a dead end).
  let finalDoc = seededDoc;
  const aiRes = await fetch(`${req.nextUrl.origin}/api/email-lab/ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      doc: seededDoc,
      scope: { kind: project.scope_kind ?? undefined, value: project.scope_value ?? undefined },
      prompt: intent || "Fill this template with the latest data for this project.",
    }),
  });
  if (aiRes.ok) {
    const result = await aiRes.json();
    if (result.applied === true) {
      const validated = EmailDocSchema.safeParse(result.doc);
      if (validated.success) finalDoc = validated.data;
    }
  }

  const newId = crypto.randomUUID();
  const admin = createServiceRoleClient();
  const { error } = await admin.from("deliverables").insert({
    id: newId, project_id: id, user_id: user.id, template: "block-canvas",
    doc: finalDoc, data_as_of: new Date().toISOString(),
    narrative: EMPTY_NARRATIVE, items_snapshot: [], status: "ready",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: newId, template: { id: seed.id, name: seed.name } }, { status: 201 });
}
```

- [ ] **Step 6: Verify build + tests**

Run: `bunx next build && bun test "app/api/projects/[id]/ai-material/"`
Expected: clean build; 5 tests pass.

- [ ] **Step 7: Commit**

```bash
git add "app/api/projects/[id]/ai-material/"
git commit -m "feat(materials-hub): AI new-material API (steerable intent → seed pick + fill)"
```
