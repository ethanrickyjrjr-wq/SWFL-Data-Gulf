### Task 6: Material status + format badge (pure logic, tested)

**Model:** Sonnet (pure functions, fully specified, TDD) · **Depends on:** nothing structural (can run any time after Task 1; independent files).

**Files:**
- Create: `lib/deliverable/material-status.ts`
- Create: `lib/deliverable/material-status.test.ts`

**Interfaces:**
- Produces: `getMaterialStatus(d) → "draft" | "needs_update" | "archived"`; `getFormatBadge(template) → { label, color, bg }`. Consumed by Tasks 7/8 (cards/rows). No `scheduled`/`sent` in v2 (scheduler deferred).

---

- [ ] **Step 1: Write the tests (TDD)**

```typescript
// lib/deliverable/material-status.test.ts
import { describe, test, expect } from "bun:test";
import { getMaterialStatus, getFormatBadge } from "./material-status";

const fresh = { deleted_at: null, data_as_of: new Date().toISOString() };

describe("getMaterialStatus", () => {
  test("archived when deleted_at set", () => {
    expect(getMaterialStatus({ ...fresh, deleted_at: "2026-01-01" })).toBe("archived");
  });
  test("needs_update when data_as_of > 30 days", () => {
    const old = new Date(); old.setDate(old.getDate() - 31);
    expect(getMaterialStatus({ ...fresh, data_as_of: old.toISOString() })).toBe("needs_update");
  });
  test("archived beats needs_update", () => {
    const old = new Date(); old.setDate(old.getDate() - 31);
    expect(getMaterialStatus({ deleted_at: "2026-01-01", data_as_of: old.toISOString() })).toBe("archived");
  });
  test("draft when fresh", () => {
    expect(getMaterialStatus(fresh)).toBe("draft");
  });
  test("draft when data_as_of null (report templates)", () => {
    expect(getMaterialStatus({ deleted_at: null, data_as_of: null })).toBe("draft");
  });
});

describe("getFormatBadge", () => {
  test("block-canvas → email / teal", () => {
    expect(getFormatBadge("block-canvas")).toMatchObject({ label: "email", color: "#1BB8C9" });
  });
  test("market-overview → overview", () => {
    expect(getFormatBadge("market-overview").label).toBe("overview");
  });
  test("bov-lite → BOV / rose", () => {
    expect(getFormatBadge("bov-lite").color).toBe("#f43f5e");
  });
  test("unknown → passthrough label, white", () => {
    expect(getFormatBadge("mystery")).toMatchObject({ label: "mystery", color: "#ffffff" });
  });
});
```

- [ ] **Step 2: Run (fails — module not found)**

Run: `bun test lib/deliverable/material-status.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// lib/deliverable/material-status.ts
export type MaterialStatus = "draft" | "needs_update" | "archived";

/** Age beyond which a material's data is flagged for refresh. */
const STALE_MS = 30 * 86_400_000;

export function getMaterialStatus(d: {
  deleted_at: string | null;
  data_as_of: string | null;
}): MaterialStatus {
  if (d.deleted_at) return "archived";
  if (d.data_as_of && Date.now() - new Date(d.data_as_of).getTime() > STALE_MS) return "needs_update";
  return "draft";
}

export interface FormatBadge { label: string; color: string; bg: string; }

const FORMAT_BADGES: Record<string, FormatBadge> = {
  "block-canvas":    { label: "email",     color: "#1BB8C9", bg: "bg-[#1BB8C9]/15" },
  "client-email":    { label: "email",     color: "#1BB8C9", bg: "bg-[#1BB8C9]/15" },
  "email":           { label: "digest",    color: "#f97316", bg: "bg-[#f97316]/15" },
  "market-overview": { label: "overview",  color: "#f97316", bg: "bg-[#f97316]/15" },
  "one-pager":       { label: "one-pager", color: "#8b5cf6", bg: "bg-[#8b5cf6]/15" },
  "bov-lite":        { label: "BOV",       color: "#f43f5e", bg: "bg-[#f43f5e]/15" },
  "social":          { label: "social",    color: "#22c55e", bg: "bg-[#22c55e]/15" },
};

export function getFormatBadge(template: string): FormatBadge {
  return FORMAT_BADGES[template] ?? { label: template, color: "#ffffff", bg: "bg-white/10" };
}
```

- [ ] **Step 4: Run (passes)**

Run: `bun test lib/deliverable/material-status.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/deliverable/material-status.ts lib/deliverable/material-status.test.ts
git commit -m "feat(materials-hub): getMaterialStatus + getFormatBadge (pure, tested)"
```
