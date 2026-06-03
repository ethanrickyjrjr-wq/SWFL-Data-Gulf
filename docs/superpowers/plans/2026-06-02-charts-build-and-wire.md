# Charts — Build & Wire

**Status:** DECISION-LOCKED — ready to execute\
**Audited:** 2026-06-02 (LB + CT joint review, two rounds)\
**Scope:** Web steps 1+2+3 only. MCP widget rebuild and flood chart deferred.

---

## Context

Four chart tracks exist; three render — but every one was built in isolation and never connected. Verified by reading live code on 2026-06-02:

- **Backend** `chart_block` (`{title, columns, rows}`, provenance-linted) is written to `corridor_profiles.character_chart` (JSONB) but has zero render consumers and is never serialized to `/api/b`. `refinery/render/speaker.mts` only knows `BrainOutput`, not corridor charts.
- **Frontend** (Track A `HBarChart`, Track B `components/viz/*` ECharts) is all prop-driven and fixture-fed. No viz component fetches live data — but a working live-fetch pattern already exists at `app/embed/footer-token/page.tsx`.
- **MCP widget** (Track C): the `swfl_fetch` tool response already carries live data in `_meta.dossier`, but the checked-in `Chat-Charts-Standalone.html` is a canned gallery with no postMessage listener — decorative until rebuilt.

The job is reconcile + render + go-live + route, not design. Nothing here needs a new chart designed from scratch.

---

## Verified file state (2026-06-02)

| File                                                         | Status                                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `refinery/validate/chart-block-lint.mts`                     | EXISTS — `ChartBlock {title, columns, rows}`, no `chart_type` yet            |
| `components/charts/HBarChart.tsx`                            | EXISTS — requires `{title, corridors, median, range, ...}`                   |
| `components/viz/CorridorRentChart.tsx`                       | EXISTS                                                                       |
| `components/viz/ZHVIAreaChart.tsx`                           | EXISTS                                                                       |
| `components/viz/CorridorMarketScatter.tsx`                   | EXISTS                                                                       |
| `app/embed/footer-token/page.tsx`                            | EXISTS — live-fetch pattern to copy                                          |
| `app/embed/cards/asking-rent/page.tsx`                       | EXISTS — fixture-only, `force-static`, `tierFor`/multipliers defined locally |
| `app/embed/charts/page.tsx`                                  | EXISTS — 100% fixture-fed (four `loadFixture` calls), `force-static`         |
| `lib/stats.ts`                                               | EXISTS — `medianOf` only                                                     |
| `refinery/lib/place-resolver.mts`                            | EXISTS — `resolvePlace()` 4-step chain (exact/pocket/alias/fuzzy)            |
| `refinery/lib/corridor-aliases.mts`                          | EXISTS — slug→slug identity map, NO human-name lookup                        |
| `refinery/tools/synthesize-corridor-character.mts`           | EXISTS — `TOOL_SCHEMA` is local const, no `chart_type` enum yet              |
| `refinery/render/corridor-character.mts`                     | DOES NOT EXIST — new file                                                    |
| `components/charts/ChartBlockView.tsx`                       | DOES NOT EXIST — new file                                                    |
| `refinery/lib/chart-adapter.mts`                             | DOES NOT EXIST — new file                                                    |
| `lib/route-chart.ts`                                         | DOES NOT EXIST — new file                                                    |
| `docs/superpowers/plans/2026-06-02-charts-build-and-wire.md` | THIS FILE                                                                    |

---

## Decisions locked (operator, 2026-06-02)

### DECISION 1 — Chart surface for this pass

**LOCKED: Option 3 — Embed surface only.**

Charts live at `app/embed/charts` and `app/embed/cards/*` for this pass. No `/r/[slug]` integration until surface-cleanup DECISION 1 is closed.

Follow-up queued: `/r/cre-swfl/[corridor]` (Option 1 — new corridor sub-route) is the designated next step after surface-cleanup settles the parent `/r/[slug]` skeleton. That route will be a clean new file, not a scoped-fetch hack on the brain report page.

Option 2 (slug-switching the brain report page data model) is rejected — code smell, not viable.

### DECISION 2 — Canonical wire format

**LOCKED:** Generic `ChartBlock {title, columns, rows}` + optional `chart_type` discriminator + shared adapters. Brain's `{title, columns, rows}` stays the ONE wire format. `chart_type` adds `"bar" | "area" | "scatter" | "table"` with `"table"` as fallback for unknown/absent. One shared adapter module maps block → each component's props. Provenance lint stays the gate.

### DECISION 3 — Value column convention for `adaptToHBar`

**LOCKED:** `columns[0]` = label (string, e.g. corridor name). `columns[1]` = primary numeric value (the bar metric). The adapter derives `median` and `range` by extracting the numeric column from `rows` and computing `medianOf` (from `lib/stats.ts`) + `Math.min/max`. Multi-column blocks (3+ columns) render additional columns in the table fallback only until multi-series adapters land. This convention must be documented in `TOOL_SCHEMA` in `synthesize-corridor-character.mts` so the generator always emits column-1 as the primary metric.

### DECISION 4 — Phase 3 live-swap read path

**LOCKED:** `asking-rent/page.tsx` live swap reads directly from Supabase `corridor_profiles` via a server component query (same pattern as `cre-source.mts`), not from `/api/b/cre-swfl`. The `/api/b` route is a pure disk-read path with no access to `corridor_profiles` rows. `dynamic = "force-static"` must change to `revalidate: 3600` (ISR) on that page. `fixtures/corridor-rents.json` stays as the SSR/offline fallback.

### DECISION 5 — Place resolution in Phase 4

**LOCKED:** `routeChart` uses `resolvePlace()` from `refinery/lib/place-resolver.mts` for human-name → corridor slug resolution. `GEOGRAPHY_GAZETTEER` / `geography-gazetteer.mts` are NOT used here — that module is a payload struct for API responses with no reverse lookup and no exported functions. `CORRIDOR_ALIASES` is also NOT used — it is a slug→slug identity map with no display-name lookup.

### DECISION 6 — `buildDossier` chart field

**LOCKED:** Add `chart?: ChartBlock` as an optional shape-only field to `Dossier` in `lib/fetch-brain.ts`. The call site in `app/api/b/[slug]/route.ts` passes `undefined`. This forward-proofs the Track C MCP widget contract without pretending `/api/b` has access to corridor data (it doesn't). Actual chart render on the embed surface goes through the corridor composer (Phase 2), not through `buildDossier`.

### DECISION 7 — Sequencing with surface-cleanup

**LOCKED:** surface-cleanup DECISION 1 executes **before** any chart mount on `/r/[slug]`. These two workstreams MUST NOT run on `app/r/[slug]/page.tsx` in parallel. Chart work on that file is deferred to post-surface-cleanup. The embed surface in this plan has no dependency on surface-cleanup.

---

## Phase 0 — Extend the contract (additive, backward-compatible)

**File:** `refinery/validate/chart-block-lint.mts`

Extend `ChartBlock` with optional `chart_type?: "bar" | "area" | "scatter" | "table"`. Default (absent) is treated as `"table"` — no DB backfill required. Existing rows stay valid. Keep both lint layers (structural + provenance) exactly as they are.

**File:** `refinery/tools/synthesize-corridor-character.mts`

Add `chart_type` to `TOOL_SCHEMA` (optional, enum: `"bar" | "area" | "scatter" | "table"`). Also document the column convention: `columns[0]` = label string, `columns[1]` = primary numeric metric. Absent `chart_type` = table. Do not force a regen; tagging is opportunistic.

---

## Phase 1 — Shared adapter module

**File:** `refinery/lib/chart-adapter.mts` (NEW — `.mts` so both refinery/Node and Next server/client can import it, same pattern as `refinery/lib/corridor-aliases.mts`)

Exports:

```ts
// Extract tierFor + constants from asking-rent/page.tsx — this is their new canonical home.
// Update asking-rent/page.tsx to import from here.
export const BULLISH_MULTIPLIER = 1.2;
export const BEARISH_MULTIPLIER = 0.7;
export function tierFor(value: number, median: number): HBarTier { ... }

// Column[0] = label, column[1] = numeric value. Derives median + range from the value column.
export function adaptToHBar(block: ChartBlock): HBarChartProps { ... }

// Trivial pass-through for table fallback.
export function adaptToTable(block: ChartBlock) { ... }

// Returns block.chart_type ?? "table"; unknown/unsupported → "table". Never throws.
export function pickRenderer(block: ChartBlock): "bar" | "area" | "scatter" | "table" { ... }

// Stubs that route to table until producers emit the matching chart_type.
// The switch exists and never throws — that's the point.
export function adaptToArea(block: ChartBlock) { ... }
export function adaptToScatter(block: ChartBlock) { ... }
```

`medianOf` is imported from `lib/stats.ts` (not duplicated).

`tierFor` and the multiplier constants are extracted from `app/embed/cards/asking-rent/page.tsx` into this adapter. Update `asking-rent/page.tsx` to import them from here afterward.

**Note on `HBarChartProps`:** `HBarChart.tsx` exports `HBarCorridor` and `HBarTier` but may not export a named `HBarChartProps`. If not exported, either add the export to `HBarChart.tsx` or type the return as `React.ComponentProps<typeof HBarChart>`.

---

## Phase 2 — Render the backend chart_block on the embed surface

### Step 2a — Dispatch renderer

**File:** `components/charts/ChartBlockView.tsx` (NEW — `"use client"`)

Takes a `ChartBlock`, calls `pickRenderer`, dispatches:

- `"bar"` → `HBarChart` (Track A) via `adaptToHBar`
- `"table"` → clean `<table>`
- `"area"` → `components/viz/ZHVIAreaChart` via `adaptToArea` (stub → table until wired)
- `"scatter"` → `components/viz/CorridorMarketScatter` via `adaptToScatter` (stub → table until wired)
- unknown → table

### Step 2b — Corridor composer

**File:** `refinery/render/corridor-character.mts` (NEW)

Reference `composeCharacterRender` in `cre-source.mts` (exported, four-arg) for the composition pattern:

```ts
export function composeCharacterRender(
  character: string | null,
  narrative: CorridorBrokerNarrative | null,
  factsBlock: string | null = null,
  speculativeBlock: string | null = null,
): string | null;
```

The new composer follows the same layering order: `factsBlock` → `character` fallback → broker narrative → speculative section. It reads `character_chart` from a `CorridorNormalized` record and emits the `ChartBlock` alongside `facts`/`speculative` for the embed surface to render via `<ChartBlockView>`.

**Cast note:** `CorridorNormalized.character_chart` is typed `unknown`. Before passing to the adapter, call `lintChartBlock(character_chart)` for structural validation (the same lint already used by the synthesizer — reuse, don't bypass). Cast to `ChartBlock` only when `ok === true`. A `null` or structurally-invalid `character_chart` means no chart renders — degrade silently, no crash.

### Step 2c — Wire to embed surface

Mount `<ChartBlockView>` on `app/embed/charts/page.tsx`.

**Data path note:** this page is currently 100% fixture-fed (`force-static`, four `loadFixture` calls). Mounting `<ChartBlockView>` requires adding a live Supabase `corridor_profiles` read to this page — same pattern as Phase 3's Supabase query (select `corridor_name`, `character_chart`, and any metric columns needed). The corridor composer produces a `ChartBlock` from that live read; `<ChartBlockView>` renders it. This read is additive alongside the existing fixture-fed Track B components — it does not replace them.

Do NOT mount on `/r/[slug]` — deferred to post-surface-cleanup (DECISION 7).

### Step 2d — Dossier shape (no-op for now)

In `lib/fetch-brain.ts`: add `chart?: ChartBlock` to the `Dossier` interface. In `app/api/b/[slug]/route.ts`: pass `undefined` at the `buildDossier` call site. No behavior change. Forward-proofs Track C. (DECISION 6)

---

## Phase 3 — One route fixture → live

**File:** `app/embed/cards/asking-rent/page.tsx`

Swap from `fixtures/corridor-rents.json` to a live Supabase `corridor_profiles` read. Copy the fetch pattern from `app/embed/footer-token/page.tsx` (try/catch → fixture fallback).

**Critical constraints:**

- Read path: direct Supabase query to `corridor_profiles` (select `corridor_name`, `nnn_asking_rent_per_sqft`, etc.) — NOT `/api/b/cre-swfl` (which is a brain disk-read with no access to corridor row data).
- Change `dynamic = "force-static"` → `revalidate: 3600` (ISR). The page cannot remain force-static once it has a live Supabase dependency.
- Keep `fixtures/corridor-rents.json` as the SSR/offline fallback — do not delete it.
- Leave `/demo` on fixtures (marketing, intentional).

`tierFor`, `BULLISH_MULTIPLIER`, `BEARISH_MULTIPLIER` are now imported from `refinery/lib/chart-adapter.mts` (Phase 1 extracted them — update the import here).

---

## Phase 4 — Question → chart router

**File:** `lib/route-chart.ts` (NEW — pure function, no side effects)

```ts
export function routeChart(question: string): ChartIntent | null;
```

`ChartIntent` = discriminated union `{ chart_type, scope }` (scope = corridor slug / metric).

Place resolution uses `resolvePlace()` from `refinery/lib/place-resolver.mts` (4-step chain: exact → pocket → alias → fuzzy Levenshtein). Do NOT use `GEOGRAPHY_GAZETTEER` (payload struct, no functions) or `CORRIDOR_ALIASES` (slug→slug map, no display-name lookup).

Heuristic keyword table:

- `rents` / `asking rent` → `{ chart_type: "bar", scope: "asking-rent" }`
- `how's [place]` / `vitals` → per-corridor `chart_block` via `resolvePlace`
- `vacancy` → `{ chart_type: "bar", scope: "vacancy" }`
- `valuation` / `home values` / `ZHVI` → `{ chart_type: "area", scope: "zhvi" }`

Returns `null` on no match — charts are additive, never required, never throws. Pluggable for an LLM classifier later without changing callers.

Start with rent + per-corridor vitals. Add vacancy/valuation after.

---

## Files index

| Action                                      | Path                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Extend `ChartBlock` + `chart_type`          | `refinery/validate/chart-block-lint.mts`                                                 |
| Tag producer + document column convention   | `refinery/tools/synthesize-corridor-character.mts`                                       |
| NEW shared adapter (tierFor canonical home) | `refinery/lib/chart-adapter.mts`                                                         |
| Update tierFor import                       | `app/embed/cards/asking-rent/page.tsx`                                                   |
| NEW dispatch renderer                       | `components/charts/ChartBlockView.tsx`                                                   |
| NEW corridor composer                       | `refinery/render/corridor-character.mts`                                                 |
| Dossier chart? shape-only                   | `lib/fetch-brain.ts` + `app/api/b/[slug]/route.ts`                                       |
| One route → live (Supabase read + ISR)      | `app/embed/cards/asking-rent/page.tsx`                                                   |
| NEW question→chart router                   | `lib/route-chart.ts`                                                                     |
| Track A component (reused)                  | `components/charts/HBarChart.tsx`                                                        |
| Track B components (reused)                 | `components/viz/CorridorRentChart.tsx`, `ZHVIAreaChart.tsx`, `CorridorMarketScatter.tsx` |
| medianOf helper (reused, not moved)         | `lib/stats.ts`                                                                           |

---

## Deferred — tracked, NOT in this pass

- **MCP widget rebuild (Track C).** Data already travels in `_meta.dossier`. Once Phase 2 adds `chart?` to `Dossier`, the only remaining work is a widget HTML that listens for the MCP-Apps `ui/notifications/tool-result` notification and hydrates from `_meta`. Same contract, separate build.
- **Flood chart.** New component (bar/area over ZIP AAL — data exists: e.g. FMB 33931 $30,074/yr NFIP AAL). Slots into `chart_type: "bar"` with no contract change. That's the payoff of Phase 0.
- `/r/cre-swfl/[corridor]` **route (Option 1 corridor sub-route).** Queued after surface-cleanup DECISION 1. New route file, no slug-switching of the brain report page.

---

## Verification (before any "done")

1. `bun test refinery/validate/chart-block-lint.test.mts` — add two cases:
   - Block with no `chart_type` is still valid (backward compat)
   - Unknown `chart_type` → `pickRenderer` returns `"table"`, renderer falls back cleanly
     Run `refinery/lib/corridor-aliases.test.mts` too if aliases touched.
2. `refinery:typecheck` run alone — ~18 baseline errors exit non-zero by design; don't batch.
3. Render check: load the embed charts surface locally. Confirm a real `chart_block` draws (bar for rent, table fallback for an untyped block). Per `superpowers:verification-before-completion`, paste the actual rendered output, not an assertion.
4. Live path: hit the swapped `asking-rent` route, kill the network, confirm it falls back to `fixtures/corridor-rents.json` cleanly (no crash).
5. Router: `routeChart("how is Vanderbilt Beach looking")` → vitals intent with `resolvePlace` returning a matched corridor slug; `routeChart("what are rents doing")` → `{ chart_type: "bar", scope: "asking-rent" }`; `routeChart("what's the weather")` → `null`.
6. `SESSION_LOG.md` top entry; `node scripts/safe-push.mjs` (never raw push). If `package.json` changed, `bun install` + stage `bun.lock` in the same push.
7. Fold these locked decisions into this file's DECISION blocks on execution (they are already here — mark each `[EXECUTED]` with commit SHA when done).
