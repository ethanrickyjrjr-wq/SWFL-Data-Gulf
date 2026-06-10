# Task 01 — Create `lib/project/items.ts` (the shared `ProjectItem` union)

**This is the spine.** S2, S4, S6, S9 all import this exact type + schema. Build it pure, zod-validated, unit-tested. Full canonical shape: `../shared/data-model.md`.

**Files:**
- Create: `lib/project/items.ts`
- Test: `lib/project/items.test.ts`

- [ ] **Step 1: Write the failing test** (`lib/project/items.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { projectItemSchema, projectItemsSchema, type ProjectItem } from "./items";

describe("projectItemSchema", () => {
  it("accepts a valid metric item", () => {
    const item: ProjectItem = {
      id: "x", added_at: "2026-06-10T00:00:00Z", origin: "web",
      kind: "metric", report_id: "env-swfl", label: "Annual flood loss",
      value: "$30,074/yr", source_url: "https://…", source_label: "FEMA NFIP",
      freshness_token: "SWFL-7421-v5-20260610",
    };
    expect(projectItemSchema.parse(item).kind).toBe("metric");
  });
  it("rejects an unknown kind", () => {
    expect(() => projectItemSchema.parse({ id: "x", added_at: "t", origin: "web", kind: "bogus" })).toThrow();
  });
  it("requires freshness_token on metric", () => {
    expect(() => projectItemSchema.parse({ id: "x", added_at: "t", origin: "web", kind: "metric", report_id: "r", label: "l", value: "v" })).toThrow();
  });
  it("parses an array", () => {
    expect(projectItemsSchema.parse([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`bun test lib/project/items.test.ts`).

- [ ] **Step 3: Implement `lib/project/items.ts`.** Define the discriminated union + zod. Use `z.discriminatedUnion("kind", [...])` for the kind-specific part and intersect the common fields:

```ts
import { z } from "zod";

const base = z.object({
  id: z.string(),
  added_at: z.string(),
  origin: z.enum(["web", "mcp"]),
});

const kinds = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("qa"), report_id: z.string(), question: z.string(), answer: z.string(),
    fact: z.string().optional(), selection_type: z.string().optional(),
    reach: z.array(z.string()).optional(), freshness_token: z.string().optional() }),
  z.object({ kind: z.literal("chart"), chart_id: z.string(), title: z.string() }),
  z.object({ kind: z.literal("metric"), report_id: z.string(), label: z.string(), value: z.string(),
    source_url: z.string().optional(), source_label: z.string().optional(), freshness_token: z.string() }),
  z.object({ kind: z.literal("source"), table: z.string(), url: z.string(), label: z.string() }),
  z.object({ kind: z.literal("note"), text: z.string() }),
  z.object({ kind: z.literal("report"), slug: z.string(), title: z.string().optional(), freshness_token: z.string().optional() }),
  z.object({ kind: z.literal("file"), storage_path: z.string(), mime: z.string(), size: z.number(), caption: z.string().optional() }),
  z.object({ kind: z.literal("table_slice"), report_id: z.string(), title: z.string(), columns: z.array(z.string()),
    rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))), source_url: z.string().optional(), freshness_token: z.string() }),
]);

export const projectItemSchema = z.intersection(base, kinds);
export const projectItemsSchema = z.array(projectItemSchema);
export type ProjectItem = z.infer<typeof projectItemSchema>;
```

> Verify zod is already a dependency (`grep '"zod"' package.json`). It is widely used in this repo; if absent, that's a lockfile-gated `bun add zod` + `git add bun.lock` (RULE 1 breaker #1) — but expect it present.

- [ ] **Step 4: Run — expect PASS.** `bun test lib/project/items.test.ts`

- [ ] **Step 5: Commit.**

```bash
git add lib/project/items.ts lib/project/items.test.ts
git commit -m "feat(project): ProjectItem discriminated union + zod (shared spine)"
```
