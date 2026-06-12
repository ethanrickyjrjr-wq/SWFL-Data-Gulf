# HANDOFF — make the 3 fixture-only frames render LIVE brain data

**Created 2026-06-11. Audit + decomposition. Dispatch each task below to the named builder.**
Parent plan: `./README.md`. Frames live in `components/charts/registry/frames/`. The binder is
`lib/deliverable/bind-frame.ts`. Brain output type: `refinery/types/brain-output.mts`.

---

## WHY they are not live (root cause — read once, applies to all three)

The three frames (`storm-timeline`, `franchise-survival`, `seasonal-radial`) were built in Phase 2 and
**render correctly from fixtures**. They are NOT broken. They are not live for ONE reason, identical
across all three:

> **The data they draw exists in the brain, but NOT in the part of the brain a consumer is allowed to read.**

Every brain `.md` has two payloads:

- `--- SAVED FACTS ---` — rich, per-row, human-readable prose (per-brand survival, per-corridor
  seasonality, the storm list). This is the brain's **branch** data.
- `--- OUTPUT ---` — the structured `BrainOutput` (`key_metrics`, `detail_tables`, `conclusion`).
  This is the **thin pipe**.

**Brain Factory rule 1 (thin pipe):** a downstream consumer reads ONLY the `--- OUTPUT ---` block,
never the branches. `lib/deliverable/bind-frame.ts` obeys this — it binds from `key_metrics` /
`detail_tables` and is forbidden from scraping the prose facts.

And here is the gap, verified against the live brains on 2026-06-11:

| Frame | Brain | What `--- OUTPUT ---` actually holds today | What the frame needs |
|---|---|---|---|
| `franchise-survival` | `franchise-outcomes` v30 | **1** aggregate metric (`overall_survival_rate: 91.9`), **no `detail_tables`**. Per-brand rows are ONLY in SAVED FACTS prose (f003–f038). | per-brand ranked rows (name, survival %, paid/charged-off counts, gross approval) |
| `seasonal-radial` | `cre-swfl` v53 | **no `detail_tables` at all**; seasonality is one prose line (f004: "min 0.1, max 1, median 0.35"). | per-corridor seasonal index rows |
| `storm-timeline` | `env-swfl` v22 | `swfl_storm_year_claims_usd` = a single **combined** total across ALL storm years; no per-storm rows. | per-storm rows (storm, year, paid-$) |

So "fixture-only" is the **true** current state, not a mistake. To go live, each brain must **emit a
`detail_tables` entry** carrying the per-row data, and the binder must learn to map that table into the
frame's `spec.options`. That is a **brain-first PR** per frame (Brain Factory: the consuming bind-case
ships in the same PR as the emitting pack).

`detail_tables` emission is already an established pattern — copy it. Canonical reference:
`refinery/packs/housing-swfl.mts` (`housing_by_zip`, ~line 525). Others: `permits-swfl`,
`properties-collier-value`, `permits-commercial-swfl`.

---

## Already done (2026-06-11 — do NOT redo)

- `franchise-survival` was built but had **never been added to `CHART_REGISTRY`** (it lived only in a
  docstring example; README row 2b wrongly said "registered"). It is now registered as
  `franchise-survival` with **`fixtureOnly: true`** in `components/charts/registry/registry.ts`,
  matching `seasonal-radial`. Docstring + README row 2b corrected. 88 registry/binder tests green,
  tsc clean.
- Net: all three frames are now correctly flagged `fixtureOnly` (storm-timeline stays NOT fixtureOnly —
  see registry comment: a per-storm timeline is a normal live shape, merely unimplemented).

---

## The `detail_tables` contract (what every emitting pack must produce)

From `refinery/types/brain-output.mts:252`:

```ts
interface BrainOutputDetailTable {
  id: string;          // machine id, e.g. "storm_timeline"
  title: string;       // human title
  grain: string;       // what one row resolves, e.g. "storm" | "brand" | "corridor"
  columns: { id: string; label: string; display_format?: DisplayFormat; units?: string }[];
  rows: { key: string; label: string; cells: Record<string, number|string|boolean|null> }[];
  source: BrainOutputMetricSource;   // REQUIRED — same provenance receipt as a metric
  note?: string;
}
```

`source.citation` / `asOf` are **PROVENANCE** — never run through facts-only / smoothing lint.

---

## Dependency order

```
[OPUS] Task L0  (binder + per-frame detail_table column contracts)  ── FIRST, blocks L1–L3
   │
   ├── [SONNET] Task L1  storm-timeline   (env-swfl emits storm_timeline)        ┐
   ├── [SONNET] Task L2  franchise-survival (franchise-outcomes emits per-brand) ├ PARALLEL
   └── [SONNET] Task L3  seasonal-radial  (cre-swfl emits corridor_seasonality)  ┘  (lowest priority)
```

L0 must land first because it **defines** the exact column ids each pack must emit and writes the
binder cases that consume them. Once L0 documents the per-frame column contract, L1–L3 are independent
(different packs, different files) and can be dispatched in parallel.

---

## [OPUS] Task L0 — binder + column contracts  *(do first; blocks L1–L3)*

**Why Opus:** shared seam. All three frames route through the single `buildFrame` switch in
`lib/deliverable/bind-frame.ts`; doing this once, generically, avoids three sessions colliding on one
file. Requires designing the row→`spec.options` mapping for each frame and the per-frame column
contract the pack tasks will implement against.

**Files:** `lib/deliverable/bind-frame.ts`, `components/charts/registry/registry.ts`,
read the 3 frame components for their exact `spec.options` expectations:
- `frames/TimelineFrame.tsx` (+ its test) → what `options` shape it reads
- `frames/FranchiseSurvivalFrame.tsx` → `spec.options.data: FranchiseBrandRaw[]` (see
  `frames/franchise-survival-utils.ts` for the exact `FranchiseBrandRaw` fields)
- `frames/SeasonalRadialFrame.tsx` / `components/viz/SeasonalRadialChart.tsx` + `SeasonalRadialEntry`
  in `types/viz.ts`

**Do:**
1. Add a `detail_tables`-driven path to `bind-frame.ts`. Recommended: a helper
   `bindFromDetailTable(output, frameId, tableId)` that finds the named `detail_table` in
   `output.detail_tables`, maps its `rows`/`columns` into the frame's `spec.options`, stamps
   `asOf` from `output.refined_at`, and carries `source` verbatim from the table. Return `null` when
   the table is absent (caller drops the exhibit — never substitute geometry).
2. Wire three `buildFrame` cases (`storm-timeline`, `franchise-survival`, `seasonal-radial`) through it.
3. **Write down the exact column contract** each pack must emit (column `id`s + `display_format` +
   row `key`/`label` meaning) as a short table in this section — that spec is the input to L1–L3.
   Proposed (refine against the frame components):
   - `storm_timeline` — grain `storm`; columns `year` (count), `paid_usd` (currency); row key = storm name.
   - `franchise_survival` — grain `brand`; columns `survival_rate` (ratio|percent), `n_paid_in_full`,
     `n_charged_off`, `n_loans` (count), `total_gross_approval` (currency); row key = franchise name.
     Match `FranchiseBrandRaw` field names so the frame adapter needs no remap.
   - `corridor_seasonality` — grain `corridor`; column `seasonal_index` (ratio, 0–1); row key = corridor name.
4. Decide `fixtureOnly` semantics: keep the registry flag as the gate, but document that L1–L3 each flip
   their frame's `fixtureOnly` → `false` **in the same PR as the emitting pack** (so the binder will
   bind it). `storm-timeline` is already `false`.
5. (Optional) Decide whether `pickFramesForData` should auto-select any of these when the matching
   `detail_table` is present, or whether they stay explicit-`frame_id`-only (template recipes). MVP:
   explicit only — do not extend the picker unless there's a clear auto-pick win.
6. Tests: extend `lib/deliverable/bind-frame.test.ts` with mocked `BrainOutput`s carrying each
   `detail_table`; assert the bound `ChartSpec.options` matches what the frame reads, `asOf` =
   `refined_at`, `source` verbatim. `tsc` clean. `bun test components/charts/registry/ lib/deliverable/`.

**Acceptance:** a mocked brain with a `storm_timeline` / `franchise_survival` / `corridor_seasonality`
detail_table binds to a renderable `ChartSpec` via `bindFrameSpec({frame_id})`; absent table → `null`;
the column contract for all three is written into this doc for the Sonnet tasks. No push.

---

## [SONNET] Task L1 — storm-timeline live  *(env-swfl)*  — highest value

**Why Sonnet:** self-contained, single pack, deterministic grouping over data already in the lake;
column contract handed to you by L0.

**Files:** `refinery/packs/env-swfl.mts`, `refinery/sources/fema-nfip-source.mts` (holds the hardcoded
SWFL storm list — Charley 2004, Wilma 2005, Irma 2017, Ian 2022, Helene 2024, Milton 2024),
`refinery/vocab/brain-vocabulary.json`. Reference emission: `refinery/packs/housing-swfl.mts:525`.

**Do:**
1. In `env-swfl.mts`, emit a `detail_tables` entry `storm_timeline` per L0's column contract: one row
   per named storm year, `cells` = `{ year, paid_usd }`. Source the per-storm paid total (B+C+ICO) from
   `data_lake.fema_nfip_claims` (already queried in this pack via `fema-nfip-source.mts` — the combined
   total `swfl_storm_year_claims_usd` proves the data is in hand; here you break it out per storm rather
   than summing). Carry the same `source` receipt the storm metric uses.
2. Register any new metric/table slug in `brain-vocabulary.json` **in the same commit** (concept +
   `slug_index`). Then: `bun refinery/tools/check-vocab-coverage.mts --all` (must pass) and
   `bun test refinery/lib/corridor-aliases.test.mts`.
3. Flip `storm-timeline` is ALREADY `fixtureOnly:false` — no registry change needed; just confirm the
   binder (L0) now produces a spec from your table.
4. Rebuild env-swfl: `npm run refinery -- env-swfl --force`. Verify the `--- OUTPUT ---` block of
   `brains/env-swfl.md` now carries `storm_timeline` with 6 rows. Empty-tolerant: if a storm has 0 rows
   in window, omit that row, don't crash.
5. Update README row 2f + SESSION_LOG + build-queue. **No push — Ricky pushes.**

**Gotchas:** ZIP-column gates do NOT apply (grain is `storm`, not zip). Storm-list staleness caveat
already documented in the pack — keep it. Provenance: every value cites the OpenFEMA source URL.

**Acceptance:** `brains/env-swfl.md` OUTPUT carries a `storm_timeline` detail_table (6 storm rows with
year + paid-$); `bindFrameSpec(output, {frame_id:"storm-timeline"})` returns a renderable spec; vocab
`--all` green; tsc/tests green.

---

## [SONNET] Task L2 — franchise-survival live  *(franchise-outcomes)*

**Why Sonnet:** self-contained, single pack; the per-brand data is already enumerated (SAVED FACTS
f007–f038) and comes from the source RPC — you re-shape it into a `detail_table`.

**Files:** the franchise-outcomes pack + `refinery/sources/franchise-source.mts` (the RPC
`get_franchise_outcomes_aggregated` connector — **VERIFY in-session** whether it already returns
per-brand rows or only the aggregate; if aggregate-only, add/point to a per-brand RPC or query the
underlying `data_lake` table). `refinery/vocab/brain-vocabulary.json`. Reference:
`refinery/packs/housing-swfl.mts:525`.

**Do:**
1. **Vendor-First (Rule 1):** open `franchise-source.mts` and confirm the actual RPC response shape
   before writing the emit — do not assume per-brand availability. Read survival rates **as written
   over resolved loans** (data-protocol rule 4) — never recompute from raw counts.
2. Emit a `detail_tables` entry `franchise_survival` per L0's contract: one row per brand, `cells` =
   `{ survival_rate, n_paid_in_full, n_charged_off, n_loans, total_gross_approval }`. Field names must
   match `FranchiseBrandRaw` in `frames/franchise-survival-utils.ts` so the frame adapter
   (`prepareBrands`) consumes it with no remap. `survival_rate: null` for not-yet-assessable brands.
3. Register the slug in `brain-vocabulary.json` (same commit) + `check-vocab-coverage.mts --all`.
4. Flip `franchise-survival` `fixtureOnly: true → false` in `components/charts/registry/registry.ts`
   (and update its comment) **in this same PR**.
5. Rebuild: `npm run refinery -- franchise-outcomes --force`. Verify the OUTPUT block now carries
   `franchise_survival` rows. Update README row 2b + SESSION_LOG + build-queue. **No push.**

**Acceptance:** `brains/franchise-outcomes.md` OUTPUT carries a `franchise_survival` detail_table with
per-brand rows; `bindFrameSpec(output,{frame_id:"franchise-survival"})` renders; the frame's KPI tiles +
ranked bars populate from live rows; vocab `--all` green; tsc/tests green.

---

## [SONNET] Task L3 — seasonal-radial live  *(cre-swfl)* — lowest priority

**Why Sonnet:** self-contained, single pack. Lowest value — the "seasonal index" is a single 0–1 scalar
per corridor (how seasonal the corridor is), NOT a 12-point monthly cycle, so the radial is decorative.
Do L1/L2 first; only build this if the operator still wants it.

**Files:** `refinery/packs/cre-swfl.mts` (+ the `corridor_profiles` source it reads — the
`seasonal_index` column already exists; f004 computes its distribution across 27 corridors).
`refinery/vocab/brain-vocabulary.json`. Reference: `refinery/packs/housing-swfl.mts:525`.

**Do:**
1. Emit a `detail_tables` entry `corridor_seasonality` per L0's contract: one row per verified
   corridor, `cells = { seasonal_index }` (0–1 ratio), row key/label = corridor name. Pull from the
   same `corridor_profiles` query the pack already runs (verified, non-deleted).
2. Register the slug (same commit) + `check-vocab-coverage.mts --all`.
3. Flip `seasonal-radial` `fixtureOnly: true → false` in `registry.ts` (same PR).
4. Rebuild — **cre-swfl hangs at stage 3 without LLM egress on a full rebuild.** Use the documented
   workaround: `npm run refinery -- cre-swfl --target-only` (or build locally with egress). Verify the
   OUTPUT block carries `corridor_seasonality` rows. Update README row 2e + SESSION_LOG + build-queue.
   **No push.**

**Acceptance:** `brains/cre-swfl.md` OUTPUT carries a `corridor_seasonality` detail_table (one row per
corridor); the radial renders per-corridor rings from live rows; vocab `--all` green; tsc/tests green.

---

## Cross-cutting rules every task inherits

- **Brain-first gate:** the pack emit + the binder consume + the registry flip ship in the SAME PR.
- **Vocab:** every new metric/table slug registered in `brain-vocabulary.json` in the same commit;
  `bun refinery/tools/check-vocab-coverage.mts --all` MUST pass (the bare check misses leaf orphans).
- **Provenance:** `detail_table.source` + per-frame `asOf` carry verbatim; never prose-policed.
- **No push.** Local only — Ricky pushes. Each session: commit + top-of-file SESSION_LOG entry +
  reconcile build-queue.
- **Lockfile:** no dep changes expected; if any, `bun install` + `git add bun.lock` same push.
