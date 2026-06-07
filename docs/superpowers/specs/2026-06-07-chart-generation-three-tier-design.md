# Chart generation — three-tier design (deterministic → intent-routed → NL)

**Date:** 2026-06-07
**Status:** Design — ready for an Opus build. Companion to `2026-06-07-highlighter-in-page-ask-chart-design.md` (the Highlighter is the UI that _triggers_ charts; this spec is how a fact _becomes_ a chart) and to `2026-06-07-boards-pdf-composed-export-design.md` (the `/c/` page + boards are where a generated chart is _saved_).
**Grounded by:** a 7-agent code audit on 2026-06-07 (`charts-boards-spec-audit`). Every file:line below was read in-session, not remembered.

---

## Why this spec exists

The Highlighter plan said "Chart this" would reuse `lib/route-chart.ts → ChartBlock → ChartBlockView`. The audit shows that is **half-true**, and the missing half is the whole job:

| Piece                                                                                                        | Reality (audited)                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The chart **contract** — `ChartBlock` type, `lintChartBlock`, `ChartBlockView`, `HBarChart`, `chart-adapter` | ✅ **real and reusable**                                                                                                                                                                                     |
| `routeChart(question)`                                                                                       | ✅ exists — but returns a **`ChartIntent`** (`{chart_type, scope}`), **NOT a `ChartBlock`**, and **no production code calls it** (`lib/route-chart.ts`; grep: only its own CLI test + two docs reference it) |
| A producer that turns a **brain** (its `key_metrics` / `detail_tables`) into a `ChartBlock`                  | ❌ **does not exist anywhere** (`refinery/**` grep for `computeChart*`/`toChartBlock`/`emitChart` = 0 hits; no stage references charts)                                                                      |
| `Dossier.chart?` reaching `/api/b` or MCP                                                                    | ❌ field exists (`lib/fetch-brain.ts:179`) but `buildDossier` **never sets it** — dead forward-proof slot                                                                                                    |
| The only live `ChartBlock` producer                                                                          | corridor `character_chart` — **LLM-synthesized** from a `CorridorFactPack`, stored in `corridor_profiles.character_chart`, rendered **only** on `/embed/charts`. Not a "compute from key_metrics" template.  |

So: we have a renderer and a classifier; we have **no producer**. This spec builds the producer in three tiers, each feeding the existing renderer, each independently shippable.

---

## The chart contract a builder MUST match (verified, do not re-derive)

- **`ChartBlock`** — `refinery/validate/chart-block-lint.mts:31-38` (NOT in `refinery/types/**`; import `type ChartBlock` from the lint file, as `ChartBlockView.tsx:3` does):
  ```ts
  export type ChartCell = string | number | null;
  export interface ChartBlock {
    title: string;
    columns: string[];
    rows: ChartCell[][]; // each row.length === columns.length
    chart_type?: "bar" | "area" | "scatter" | "table";
  }
  ```
- **`lintChartBlock(block, factPackNumbers = null)`** — `chart-block-lint.mts:50-138`. Two layers: **structural** (always: title non-empty, columns non-empty strings, every `row.length === columns.length`, every cell `string|number|null`) + **provenance** (opt-in, only when `factPackNumbers !== null`: every numeric cell must be within **5% relative or 0.05 absolute** of a fact-pack number; string/null cells bypass; anchor `0` ⇒ `abs(value) ≤ 0.05`). Keep aligned with `speculative-block-lint.isAnchored`.
- **`ChartBlockView`** — `components/charts/ChartBlockView.tsx:1,17,96`. `"use client"`, exports BOTH named + default, single prop `{ block: ChartBlock }`. **Only `chart_type: "bar"` renders a real chart** (→ `adaptToHBar` → `<HBarChart>`); `"area"`/`"scatter"`/`"table"`/unknown fall through to an inline HTML `<table>` stub (`chart-adapter.mts:191-202`).
- **`adaptToHBar(block)`** — `refinery/lib/chart-adapter.mts:46-77`. Assumes `columns[0]` = label, `columns[1]` = the numeric metric; **rows whose `row[1]` is not a number are silently dropped**. Tiers bars vs median (bullish ≥ median×1.2, bearish ≤ median×0.7).
- **`HBarChart`** — `components/charts/HBarChart.tsx`. **NOT responsive**: fixed grid `148px 1fr 76px`, `min-width:320px / max-width:620px`, zero `@media`/`clamp`/`minmax`; long labels ellipsis-truncate. Requires `gsap`, runs entrance animation in `useLayoutEffect` ⇒ inherently client-only. Function props can't cross the RSC boundary — server callers pass the serializable `valueFormat: 'currency'|'aal'` selector (documented `HBarChart.tsx:32-44`). **Making it fluid below 320px is NEW work** (shared with the Highlighter spec's mobile requirement).
- **`BrainOutputMetric`** — `refinery/types/brain-output.mts:103-137`: `{ metric, value: number|string, direction, label, variable_type: 'extensive'|'intensive'|'categorical', units?, display_format?: 'currency'|'percent'|'count'|'ratio'|'raw', source }`. **`value` is a single scalar — there is NO time series on a brain output.** `detail_tables` (`brain-output.mts:211-244`) are cross-sectional rows keyed by place (e.g. ZIP `33913`), not periods.

**Consequence for every tier:** a chart from a brain can only be (a) a **bar over the ≤6 current `key_metrics`** that share a unit, or (b) a **bar over a `detail_table`'s rows** (e.g. AAL-by-ZIP). A _trend/area_ line needs its own series source (only ZHVI has one, in `fixtures/zhvi-trend.json`).

---

## Tier A — deterministic "at a glance" chart from a brain (build-time, $0)

The foundation. Every brain that has a chartable shape gets one bar chart, computed in code at refinery build time, riding in both `/r/` and `/api/b`. This is also what gives the Highlighter a chart target on _every_ report.

**New: `refinery/lib/chart-from-metrics.mts` → `computeMetricChart(output: BrainOutput): ChartBlock | null`**

1. **Prefer a cross-sectional `detail_table`** whose rows carry a single comparable numeric column (e.g. env-swfl AAL-by-ZIP, housing median-sale-price-by-ZIP) → `{title, columns:[placeLabel, metricLabel], rows:[[zip, value], …], chart_type:'bar'}`. Most legible chart; real multi-bar comparison.
2. **Fallback to `key_metrics`:** group numeric metrics by `display_format` (so bars are comparable — never mix `$` and `%` in one chart), take the largest group with **≥3** metrics → bar with `columns:[label, '<format>']`. Skip `variable_type:'categorical'` (value is a string).
3. **If neither yields ≥3 comparable numeric points, return `null`.** Not every brain gets a chart — that is correct, not a failure.
4. Run `lintChartBlock(block, numericCellsFromStep)` — provenance is trivial here (the cells _are_ the audited values), so pass them and get belt-and-suspenders. Structural failure ⇒ return `null` (never ship a malformed block).

**Wiring (one source, two consumers):**

- **Persist at build:** in `refinery/stages/4-output.mts` (after the validator gate + `.md` write at line 649; mind the `dryRun`/`HOLD` early returns at 600/638, and the audit-flagged missing `rm` import if you touch fs), emit the computed `ChartBlock` into the brain `.md` as a fenced ` ```chart ` JSON block.
- **`/r/` render:** extend `parseBrainMarkdown` to parse the ` ```chart ` block into the parsed brain, and `toDisplayBrain` (`refinery/render/speaker.mts:605`) to pass it onto a new `DisplayBrain.chart?: ChartBlock`. **This widens the speaker projection** — do it as an _atomic_ change with the `display-leak.test.mts` guard (the chart carries only labels + already-public numbers, no `brain_id`/slug/tier, so it is customer-safe, but the test must be updated in the same commit — Brain Factory rule 3).
- **`/api/b` + MCP render:** in `buildDossier` (`lib/fetch-brain.ts:183-210`) set the dead `Dossier.chart` slot from the same parsed block. Now the dossier the Highlighter already carries includes a chart.
- **New child component `components/charts/ReportChart.tsx`** (`"use client"`, wraps `ChartBlockView`) — slotted into the **server** `/r/[slug]/page.tsx` at the clean insertion point line 136-138 (after the conclusion `</section>`, above the Key-metrics section). Reuse the **operator-locked metric hexes** from `metrics-table.tsx:23-38` (bullish `#5bc97a` / bearish `#e08158` / mixed `#d4b370` / neutral `#b8b4a8` / no-signal `#00d4aa`). `recharts ^3.8.1` is already installed (`package.json:54`) if a non-HBar visual is wanted.

No-smoothing / deterministic-math rule (CLAUDE.md protocol rule 8) applies: plot the audited numbers verbatim, no interpolation.

---

## Tier B — intent-routed comparison charts (deterministic, $0)

This is what the Highlighter's **"Chart this"** calls when a user points at a routable fact. It wires the **missing glue** behind `routeChart`.

**Reuse:** `routeChart(question): ChartIntent | null` (`lib/route-chart.ts:51`) as the classifier, and `resolvePlace` (`refinery/lib/place-resolver.mts:133`) for name→`corridor_slug`. **Build new:** `lib/build-chart-for-intent.mts → buildChartForIntent(intent: ChartIntent): ChartBlock | null` mapping each scope to data → `ChartBlock`:

| `intent.scope` | Data source (audited)                                                                         | Output                                                                                                               | Status                                                           |
| -------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `asking-rent`  | `fixtures/corridor-rents.json` (`nnn_asking_rent_per_sqft`)                                   | bar (corridor, rent)                                                                                                 | data ✅, glue NEW                                                |
| `flood-aal`    | env-swfl brain detail_table / `adaptFloodZipsToHBar` already exists (`chart-adapter.mts:130`) | bar (ZIP, AAL)                                                                                                       | mostly ✅                                                        |
| `zhvi`         | `fixtures/zhvi-trend.json` (month series)                                                     | **area** — render via the existing `components/viz/ZHVIAreaChart.tsx` (`ChartBlockView`'s area path is a table stub) | data ✅, route NEW                                               |
| `vacancy`      | `vacancy_pct` in `fixtures/corridor-rents.json`                                               | bar (corridor, vacancy%)                                                                                             | data ✅ but **no renderer today** — build the bar                |
| `vitals`       | per-corridor `CorridorFactPack` (`refinery/tools/build-corridor-fact-pack.mts`)               | bar of corridor vitals                                                                                               | **heaviest** — needs a new vitals→ChartBlock producer; may defer |

Caller (the Highlighter "Chart this" action):

```ts
const intent = routeChart(factOrQuestion);
const block = intent ? buildChartForIntent(intent) : null;
// block === null ⇒ fall back to Tier C (NL) or show "can't chart that one"
```

**Honor the audited gotchas:** first-match-wins code order is `flood → rent → vacanc → zhvi → vitals` (the docstring's order is stale); the `vitals` branch returns `null` when `resolvePlace` matches a pocket but yields no `corridor_id`. Fix the misleading `route-chart.ts` docstring in the same PR.

---

## Tier C — natural-language "chart it _this_ way" (LLM, metered)

When the fact isn't routable (Tier B `null`) or the user types a specific request ("chart median price for these three ZIPs"), an LLM picks the metrics + shape **from the dossier only** and emits a `ChartBlock`.

- **Engine = the Highlighter's `/api/converse` server route** (our Anthropic key, model `claude-haiku-4-5` — **re-verify the model id + streaming/tool shape live at build time** per Vendor-First; verified once on 2026-06-07). Add a forced-tool variant (`record_chart_block`) that returns a `ChartBlock`. Context = the current report's dossier + rules-of-engagement; **no web, no tools** beyond the dossier.
- **Lint hard:** `lintChartBlock(block, dossierNumbers)` with provenance ON — every numeric cell must anchor to a dossier number (5%/0.05). Reject ⇒ "I can only chart figures already on this report."
- **Metered:** counts as **1 use** in `usage_events` (same mechanism the Highlighter spec defines). This is the only chart tier that costs us money; it's ~cents.

---

## Build sequencing & dependencies

```
Tier A (deterministic at-a-glance)  ──► foundation; also lights the Highlighter's chart target everywhere
   └─► Tier B (intent glue)         ──► powers Highlighter "Chart this" on routable facts
          └─► Tier C (NL chart)     ──► depends on the Highlighter /api/converse engine; metered
HBarChart responsive fix            ──► shared sub-task with the Highlighter spec (do once, both consume)
```

Each tier ends with a top-of-file `SESSION_LOG.md` entry + `node scripts/safe-push.mjs` + a `checks` reconcile.

---

## Verification

- **Tier A:** `npm run refinery -- master --force` produces a ` ```chart ` block in ≥1 brain `.md`; `/r/<that-brain>` renders a bar above Key metrics with the locked hexes; `/api/b/<slug>?format=json` and the MCP `_meta.dossier` now carry `chart`; `display-leak.test.mts` passes (no id/tier/slug leak).
- **Tier B:** `routeChart("how are asking rents on US-41")` → intent → `buildChartForIntent` → a real `ChartBlock` with verbatim fixture numbers; `lintChartBlock` structural passes; `vacancy` and `vitals` each render or return a clean `null`.
- **Tier C:** a NL request charts only dossier numbers; an out-of-dossier number is rejected by provenance lint; the call increments `usage_events`.
- `bun test` + `npm run refinery:typecheck` (expect only the ~18 baseline strictness errors; no new ones).

---

## Reused seams (audited) + corrections to honor

| Surface                      | Status                                                                      | Builder note                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `ChartBlock` type            | ✅ in `refinery/validate/chart-block-lint.mts:31-38` (NOT `refinery/types`) | import `type ChartBlock` from the lint file                                                                     |
| `lintChartBlock`             | ✅ structural always; provenance opt-in (5%/0.05)                           | Tier A/C pass `factPackNumbers`; Tier B structural-only                                                         |
| `ChartBlockView`             | ✅ named+default, `"use client"`, `{block}`                                 | only `bar` is a real chart; area/scatter are table stubs                                                        |
| `adaptToHBar`                | ✅                                                                          | `columns[0]`=label, `columns[1]`=numeric, else row dropped                                                      |
| `HBarChart`                  | ⚠️ **fixed-px, not responsive**                                             | add `clamp()` + fluid grid for <320px (shared sub-task)                                                         |
| `routeChart` / `ChartIntent` | ✅ classifier, **no consumer**                                              | returns an _intent_; build `buildChartForIntent`; fix stale docstring + code-order note                         |
| `resolvePlace`               | ✅                                                                          | name→`corridor_slug`; returns no `corridor_id` for pocket-only matches                                          |
| corridor `character_chart`   | ✅ LLM-synth, `corridor_profiles` → `/embed/charts` only                    | NOT a compute-from-key_metrics template; do not reuse as one                                                    |
| `Dossier.chart?`             | ⚠️ dead slot (`fetch-brain.ts:179`)                                         | Tier A wires it in `buildDossier`                                                                               |
| `BrainOutputMetric`          | ✅ scalar value, no series                                                  | chart = bar over key_metrics or a detail_table; no trend from a brain                                           |
| `/r/[slug]/page.tsx`         | ✅ Node **server** component                                                | chart must be a `"use client"` child; slot at line 136-138                                                      |
| `DisplayMetric`              | ✅ value is a **formatted string**                                          | speaker drops the numeric value; widen `DisplayBrain.chart` atomically w/ leak test                             |
| `4-output.mts`               | ✅ gate 537-590, write 649                                                  | persist the chart block; add `rm` to the `node:fs/promises` import if touching fs; mind `dryRun`/`HOLD` returns |
| `recharts`                   | ✅ `^3.8.1` installed                                                       | reuse for non-HBar visuals; don't reuse `ZHVIAreaChart` shape-as-is                                             |

---

## Out of scope

- Saving / sharing a generated chart, the `/c/[id]` hosted-chart page, composed boards, PDF export → `2026-06-07-boards-pdf-composed-export-design.md`.
- Real area/scatter renderers inside `ChartBlockView` (today table stubs) — only build if a tier needs them; `zhvi` routes to `ZHVIAreaChart` instead.
- The cross-feature pricing matrix (which caps, what counts) → the deferred pricing talk (`checks: highlighter_pricing_matrix`).
