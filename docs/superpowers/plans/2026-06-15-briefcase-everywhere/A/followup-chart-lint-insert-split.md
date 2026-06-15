# Follow-up — split `buildChartItem` lint ⇆ insert (kill the orphan window properly)

**Status:** OPEN follow-up to commit `6ef8cb3` (Plan A triage #6). That commit shipped a
**best-effort cleanup** band-aid in `swfl_project_handoff` only. This brief replaces it with
the real fix and covers the call site the band-aid missed.

**Surface:** MCP write tools (`app/api/mcp/project-tools.ts`). RULE 1 → **diff-review before
push, no autonomous push.** Pure refactor — no schema/migration, no vendor surface.

---

## Why (the real bug, not the symptom)

`buildChartItem(db, input)` does **two things in one call**: it lints the chart block AND
eagerly `INSERT`s a `saved_charts` row. Because the insert happens before the rest of each
caller's validation, **any later failure orphans the inserted row** (it's never referenced by
a project, so it's dead storage). Two callers, both affected:

1. **`swfl_project_handoff`** (loop, ~line 459). A later item failing lint/schema, or the
   post-loop schema/256KB guards, orphans every chart already inserted this call.
   → `6ef8cb3` patched this with a tracked-ids `cleanupOrphanCharts()` delete. Works, but it's
   best-effort (a failing delete still orphans) and reactive.

2. **`swfl_project_add`** (~line 320-323). `buildChartItem` inserts at line 321, then the item
   schema check (330), duplicate check (334), set validation (342), and the project `UPDATE`
   (350) all run AFTER. Any of those failing orphans the row. **`6ef8cb3` did NOT touch this
   path — the orphan window is still open here.**

Root cause = the coupling. Fix = **never write to the DB until everything that can fail
cheaply has already passed.**

---

## Target design

Split `buildChartItem` into a **pure planner** and a **DB writer**:

```ts
// PURE — lint + pre-generate the id + build BOTH the ProjectItem and the saved_charts row.
// No DB. Returns an error on lint failure (nothing has been written, so no cleanup is possible
// or needed at any call site that bails here).
function planChartItem(
  input: Extract<AddItemInput, { kind: "chart_block" }>,
): { item: ProjectItem; row: SavedChartRow } | { error: string } {
  const lint = lintChartBlock(input.block, null, { requireAsOf: true });
  if (!lint.ok) return { error: `Chart rejected: ${lint.errors.join("; ")}` };
  const chart_id = crypto.randomUUID().slice(0, 8);
  const row = {
    id: chart_id,
    chart_block: input.block,
    source_meta: input.report ? { report_id: input.report } : null,
    freshness_token: null,
  };
  return { item: stamp({ kind: "chart" as const, chart_id, title: input.title }), row };
}

// DB — insert all planned rows in ONE statement (Postgres multi-row INSERT is statement-atomic:
// all rows or none, so NO partial orphan is possible from a failed insert).
async function insertChartRows(
  db: SupabaseClient,
  rows: SavedChartRow[],
): Promise<{ ok: true } | { error: string }> {
  if (rows.length === 0) return { ok: true };
  const { error } = await db.from("saved_charts").insert(rows);
  if (error) return { error: "Could not save the chart(s)." };
  return { ok: true };
}
```

`SavedChartRow` = the inline object `buildChartItem` inserts today
(`{ id, chart_block, source_meta, freshness_token }`). Give it a small local type/alias.

### `swfl_project_handoff` — new shape

```ts
const built: ProjectItem[] = [];
const chartRows: SavedChartRow[] = [];
for (const it of raw) {
  if (it.kind === "chart_block") {
    const r = planChartItem(it);        // PURE
    if ("error" in r) return errText(r.error);   // nothing written → no cleanup
    built.push(r.item);
    chartRows.push(r.row);
  } else {
    built.push(stamp({ ...it }));
  }
}
const parsed = projectItemsSchema.safeParse(built);
if (!parsed.success) return errText("Those items did not validate; nothing was handed off.");
const bytes = Buffer.byteLength(JSON.stringify(parsed.data), "utf8");
if (bytes > 256 * 1024) return errText("That's too much to hand off at once. Carry fewer items.");

// Everything validated → ONE atomic insert, then mint.
const ins = await insertChartRows(db, chartRows);
if ("error" in ins) return errText(ins.error);   // atomic: no partial orphan
let token: string;
try {
  token = await mintClaimToken(parsed.data, args.title ?? null);
} catch (e) {
  // Only residual window: mint failed AFTER the charts landed → clean those up.
  if (chartRows.length) {
    try { await db.from("saved_charts").delete().in("id", chartRows.map((r) => r.id)); } catch {}
  }
  throw e;
}
```

**Delete the `insertedChartIds` / `cleanupOrphanCharts()` block from `6ef8cb3`** — the
deferred-insert design makes it dead for the validation paths; the only cleanup left is the rare
mint-after-insert failure above.

### `swfl_project_add` — close its window too

```ts
let item: ProjectItem;
let chartRow: SavedChartRow | null = null;
if (args.item.kind === "chart_block") {
  const r = planChartItem(args.item);   // PURE — lint only
  if ("error" in r) return errText(r.error);
  item = r.item;
  chartRow = r.row;                      // defer the insert
} else {
  item = stamp({ ...args.item });
}

// ... item-schema check, duplicate check, set validation (all UNCHANGED, all still pre-DB) ...

// Insert the chart row ONLY once we're about to commit the project update.
if (chartRow) {
  const ins = await insertChartRows(db, [chartRow]);
  if ("error" in ins) return errText(ins.error);
}
const { error: upErr } = await db.from("projects").update({ ... }).eq("id", project.id);
if (upErr) {
  if (chartRow) { try { await db.from("saved_charts").delete().eq("id", chartRow.id); } catch {} }
  return errText("Could not file the item. Please try again.");
}
```

Net: the chart row is written only after the dup/schema/set checks pass, and is cleaned up if
the final `projects` UPDATE fails. No orphan on any validation path; tiny cleanup only on a
genuine post-insert DB failure.

---

## Tests (extend `app/api/mcp/project-tools.test.ts`)

Add cases that assert on the in-memory `saved_charts` store (mirror the existing mock):
1. **handoff, later item invalid** → response is the error, **zero `saved_charts` rows written**.
2. **handoff, over 256KB** → error, **zero rows** (proves the guard runs before the insert).
3. **handoff, all valid** → all chart rows written, token returned.
4. **add, project UPDATE fails** → error, the chart row is **deleted** (not left behind).
5. **add, valid** → one chart row written, item filed.

If the current mock can't fail an insert/update on demand, add a `scenario` flag like the claim
route test (`app/api/claim/route.test.ts` is the pattern).

---

## Done = all of:

- Both callers use `planChartItem` + `insertChartRows`; `buildChartItem` removed.
- The `6ef8cb3` `cleanupOrphanCharts` loop is gone.
- New tests above pass; **full `bun test`** green (subsets hit the `mock.module` footgun — run the
  whole suite); `bunx tsc --noEmit -p tsconfig.json` clean on touched files; `bunx eslint` clean.
- SESSION_LOG entry; **do not push** — hand the diff to the operator (MCP surface).
- Supersede this brief: note completion and that it replaces the `6ef8cb3` band-aid.
