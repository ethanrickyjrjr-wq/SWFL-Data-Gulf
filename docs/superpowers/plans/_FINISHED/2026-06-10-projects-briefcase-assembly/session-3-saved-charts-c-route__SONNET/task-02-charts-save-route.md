# Task 02 — `POST /api/charts/save`

**Files:** Create `app/api/charts/save/route.ts`. Test: `app/api/charts/save/route.test.ts`.

**Contract:** body `{ block: ChartBlock; source_meta?: object; freshness_token?: string }` → lint the block; **422 if structural lint fails (never persist malformed)**; else insert via service-role with id `crypto.randomUUID().slice(0,8)`; meter `chart_save`; return `{ id }`.

- [ ] **Step 1: Failing test** — a malformed block → 422; a valid block → 200 `{id}` of length 8.

- [ ] **Step 2: Implement.**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { lintChartBlock, type ChartBlock } from "@/refinery/validate/chart-block-lint.mts"; // [AUDIT-FIX C4]
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { recordUse } from "@/lib/highlighter/meter";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.block) return NextResponse.json({ error: "no block" }, { status: 400 });
  const lint = lintChartBlock(body.block as ChartBlock);  // structural; provenance optional
  if (!lint.ok) return NextResponse.json({ error: "invalid chart", detail: lint.errors }, { status: 422 });
  const id = crypto.randomUUID().slice(0, 8);
  const db = createServiceRoleClient();
  const { error } = await db.from("saved_charts").insert({
    id, chart_block: body.block, source_meta: body.source_meta ?? null, freshness_token: body.freshness_token ?? null,
  });
  if (error) return NextResponse.json({ error: "save failed" }, { status: 500 });
  await recordUse(req, { report_id: body.source_meta?.report_id ?? "", reach: [], action: "chart_save" });
  return NextResponse.json({ id });
}
```

> Confirm `lintChartBlock`'s real return shape (`{ok, errors}` vs throw) against `refinery/validate/chart-block-lint.mts` and adapt — the audit confirmed the function exists; verify its signature in-session.

- [ ] **Step 3: Tests green; commit.** `git add app/api/charts/save/route.ts app/api/charts/save/route.test.ts && git commit -m "feat(charts): POST /api/charts/save (lint->422, meter chart_save)"`
