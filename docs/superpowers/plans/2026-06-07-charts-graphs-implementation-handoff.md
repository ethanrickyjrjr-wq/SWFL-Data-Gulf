# Charts / Graphs (Layer 3) — implementation handoff

**Date:** 2026-06-07 · **For:** the next Opus building "a fact becomes a chart."
**Design (read first, full detail):** `docs/superpowers/specs/2026-06-07-chart-generation-three-tier-design.md`
**Where it sits in the picture:** Layer 3 of `docs/superpowers/specs/2026-06-07-build-anything-with-real-data-MASTER.md`.

This is the **execution brief**, not the design — the three-tier spec is the design and its audited
file:line seams are still accurate (re-confirmed in-session today; see "Verified today"). Read this to know
exactly **where to start, what's already live, what plugs into what, and the first commit**. Open the spec when
you're building a tier.

---

## What changed today (why charts is now unblocked)

The **Highlighter popup is browser-verified and live-ready** (the blocker the charts layer was waiting on). A
real-browser pass (Playwright, desktop 1280×800 + mobile 320×700, against a live dev server) drove the full
motion: text-select → popup → suggestions → composer → **live grounded `/api/converse` answer** → close. Two
real bugs were fixed and two operator requirements landed:

- **Fixed — popup overflowed the viewport** on a long selection (header echoed the full selected text, unbounded →
  976px tall on an 800px screen). Now `max-h-[85vh]` + scroll on the popup root and `line-clamp-3` on the fact echo.
- **Fixed — popup vanished mid-compose.** Focusing the composer collapsed the page selection; the next
  `mouseup`/`keyup` cleared `fact` and unmounted the popup while the user was typing. `snapshot()` now only clears
  on a collapse in **page content**, never when focus is inside the popup/composer.
- **Added — number-snap:** selecting part of a figure grabs the whole token (drag across "525" in "$525,000" →
  `$525,000`; handles `%`, `/yr`, `bps`, `k/m/b`). `lib/highlighter/use-highlight.ts → expandRangeToNumber`.
- **Added — light, high-contrast popup** (white card, dark text) inverted from the dark site so it reads clearly.

**The charts hook is already in the popup, disabled, waiting for you:**
`components/highlighter/HighlightPopup.tsx` renders a **`<button disabled title="Charting is coming soon">Chart
this · soon</button>`**. Wiring Tier B is what flips that button on. That is the single integration point between
this layer and the Highlighter.

---

## Verified current state (audit re-confirmed in-session today)

| Surface                                        | State                                     | Note                                                                                                                                                                                                                         |
| ---------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChartBlock` type + `lintChartBlock`           | ✅ real                                   | `refinery/validate/chart-block-lint.mts:31-38` (type) / `:50+` (lint). Import `type ChartBlock` **from the lint file**, not `refinery/types`. Structural always; provenance opt-in (5% rel / 0.05 abs).                      |
| `ChartBlockView` / `adaptToHBar` / `HBarChart` | ✅ real renderer                          | `components/charts/ChartBlockView.tsx`, `refinery/lib/chart-adapter.mts`, `components/charts/HBarChart.tsx`. **Only `chart_type:"bar"` renders a real chart**; area/scatter/table fall to an HTML stub.                      |
| `routeChart(question) → ChartIntent`           | ✅ classifier, **no production consumer** | `lib/route-chart.ts`. Confirmed today: only the file itself + docs reference it — nothing renders from it. Returns an _intent_ (`{chart_type, scope}`), **not** a `ChartBlock`.                                              |
| brain → `ChartBlock` producer                  | ❌ greenfield                             | `computeMetricChart` / `buildChartForIntent` do not exist (grep = 0 hits in `refinery/**` and `lib/**`). This layer builds them.                                                                                             |
| `Dossier.chart?`                               | ⚠️ dead slot, real                        | Confirmed today `lib/fetch-brain.ts:155-179` — typed `chart?: ChartBlock`, `buildDossier` never sets it. The popup already carries the dossier, so wiring this lights a chart target on every report with zero popup change. |
| `HBarChart` < 320px                            | ⚠️ fixed-px                               | grid `148px 1fr 76px`, `min-width:320px`. Fluid-below-320 is **new** work — shared with the Highlighter's mobile case.                                                                                                       |
| `recharts ^3.8.1` + `echarts ^6.1.0`           | ✅ installed                              | `package.json`. Available for non-HBar visuals — **no lockfile change** needed to use them.                                                                                                                                  |
| `/api/converse` engine                         | ✅ live + verified                        | Tier C rides this (forced-tool `record_chart_block` variant). Re-verify model id + tool/streaming shape live at build (Vendor-First).                                                                                        |
| `usage_events` meter                           | ✅ live, enforcement OFF                  | Tier C counts 1 use; reuse as-is.                                                                                                                                                                                            |

There is also an **older** plan `docs/superpowers/plans/2026-06-02-charts-build-and-wire.md` — superseded by the
06-07 three-tier spec where they conflict; don't follow the older one as authority.

---

## Build order (TDD; each tier ships independently)

> Each tier: write the test first, build to green, then a top-of-file `SESSION_LOG.md` entry +
> `node scripts/safe-push.mjs` + a `checks` reconcile. Run `bun run lint` (eslint) **and** `npx tsc --noEmit`
> locally before every push — green `bun test` + tsc did NOT catch the eslint `no-explicit-any` error that turned
> PR #68's build red; CI treats it as an error. (Lint excludes a local-only `awesome-claude-code-toolkit/` dir
> absent from CI — `--ignore-pattern` it if it noises up your local run.)

### Tier A — deterministic "at a glance" (build-time, $0) — START HERE

Foundation. Gives every chartable brain one bar chart and lights the Highlighter's chart target everywhere.

1. **`refinery/lib/chart-from-metrics.mts → computeMetricChart(output): ChartBlock | null`** — prefer a
   cross-sectional `detail_table` with one comparable numeric column (AAL-by-ZIP, median-price-by-ZIP); else group
   `key_metrics` by `display_format`, take the largest group with **≥3** comparable numeric points; else `null`
   (not every brain charts — correct, not a failure). Skip `variable_type:"categorical"`. Lint with provenance ON.
2. **Persist at build:** emit the block as a fenced ` ```chart ` JSON block in the brain `.md`, in
   `refinery/stages/4-output.mts` after the validator gate + write (mind `dryRun`/`HOLD` early returns; add `rm`
   to the `node:fs/promises` import only if you touch fs).
3. **Read paths (two consumers, one block):** parse the ` ```chart ` block in `parseBrainMarkdown`; wire
   `buildDossier` to set the dead `Dossier.chart` slot (popup gets it for free).
4. **Render on `/r/`:** new `components/charts/ReportChart.tsx` (`"use client"`, wraps `ChartBlockView`), slotted
   into the **server** `app/r/[slug]/page.tsx` after the conclusion `</section>`, above Key metrics. Reuse the
   operator-locked metric hexes from `metrics-table.tsx`.

   ⚠️ **Atomic type-lift (Brain Factory rule 3):** widening `DisplayBrain` with `chart?: ChartBlock` in
   `refinery/render/speaker.mts` **widens the speaker projection** — ship the type change + the
   `display-leak.test.mts` update in the **same commit**. The chart carries only labels + already-public numbers
   (no `brain_id`/slug/tier), so it's customer-safe, but the leak guard must move with it.

### Tier B — intent-routed (deterministic, $0) — flips the "Chart this" button ON

1. **`lib/build-chart-for-intent.mts → buildChartForIntent(intent): ChartBlock | null`** — map each
   `intent.scope` to data → `ChartBlock` (see the spec's table: `asking-rent`, `flood-aal` (reuse
   `adaptFloodZipsToHBar`), `zhvi` → `ZHVIAreaChart`, `vacancy`, `vitals`). Honor the **first-match-wins code order
   `flood → rent → vacanc → zhvi → vitals`** (the docstring's order is stale — fix it in the same PR).
2. **Wire the popup:** in `HighlightPopup.tsx`, replace the disabled `Chart this · soon` button with a live one:
   `const intent = routeChart(fact.text); const block = intent ? buildChartForIntent(intent) : null;` — render the
   `ChartBlock` (reuse `ChartBlockView`) inline as a 4th popup stage, or fall through to Tier C / "can't chart that
   one" when `block === null`. **The popup's stage machine + light theme + positioning are already verified** — add
   a `"chart"` stage alongside `suggestions|ask|answer`.

### Tier C — natural-language "chart it this way" (LLM, metered)

Add a forced-tool `record_chart_block` variant to `/api/converse` that returns a `ChartBlock` grounded in the
report's dossier ONLY. `lintChartBlock(block, dossierNumbers)` **provenance ON** — reject any numeric cell not
anchored to a dossier number → "I can only chart figures already on this report." Counts 1 `usage_events` use.

### Cross-cutting sub-task — `HBarChart` responsive < 320px

Shared with the Highlighter's mobile requirement. Add `clamp()` + a fluid grid so bars don't clip below 320px.
Do once; Tier A render, Tier B popup chart, and the eventual PDF export all consume it.

---

## Verification (per tier — runtime, not just tests)

- **Tier A:** `npm run refinery -- master --force` produces a ` ```chart ` block in ≥1 brain `.md`; `/r/<brain>`
  renders a bar above Key metrics with the locked hexes; `/api/b/<slug>?format=json` and MCP `_meta.dossier` carry
  `chart`; `display-leak.test.mts` green.
- **Tier B:** in a browser with `HIGHLIGHTER_UI=1`, select a routable fact → "Chart this" → a real bar renders in
  the popup with verbatim fixture numbers; a non-routable fact falls through cleanly. (Reuse the verify harness in
  "Tooling" below.)
- **Tier C:** an NL request charts only dossier numbers; an out-of-dossier number is rejected by provenance lint;
  the call increments `usage_events`.
- Always: `bun test` + `bun run lint` + `npx tsc --noEmit` green; `npm run refinery:typecheck` shows only the ~18
  baseline strictness errors (no new ones).

## Tooling for browser verification (reuse it)

A throwaway Playwright harness already exists **outside the repo** (keeps the lockfile clean):
`C:\Users\ethan\hl-verify\driver.mjs` drives `/r/<slug>` against a local `PORT=3210 HIGHLIGHTER_UI=1 bun run dev`
and writes screenshots + a JSON verdict to `hl-verify/shots/`. Point it at a new ` "chart"` stage for Tier B.
Cloud browser tools (Spider) can't reach localhost — use this local harness, or a Vercel **preview** with the flag
on for a public URL.

---

## Guardrails (do not trip these)

- **No new mandatory pre-materialization gate (CLAUDE.md RULE 3 C2).** Tier A extends the existing Stage-4 write
  - `lintChartBlock`; it does not erect a new gate everything must pass through. Keep it that way.
- **Deterministic math, narrative prose (Brain Factory rule 2).** Tier A/B compute cells in code from audited
  numbers — no interpolation, no smoothing. Only Tier C uses the LLM, and only to _pick_ metrics/shape, never to
  invent values (provenance lint enforces).
- **Vendor-First for Tier C.** Re-verify `claude-haiku-4-5` + the tool-call/streaming shape against live Anthropic
  docs in-session before building `record_chart_block` — model surfaces drift.

## Open decisions / deferred

- `vitals` scope is the heaviest Tier B branch (needs a `CorridorFactPack`→`ChartBlock` producer) — may defer; a
  clean `null` is acceptable until then.
- Saving/sharing a chart (`/c/[id]`), boards, PDF → Layer 4 (`2026-06-07-boards-pdf-composed-export-design.md`),
  not this layer.
- Pricing/metering numbers stay deferred (`checks: highlighter_pricing_matrix`, `paid_path_wtp`).

## Pointers

| Thing                                | Where                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| Full three-tier design               | `docs/superpowers/specs/2026-06-07-chart-generation-three-tier-design.md`             |
| Master picture (all 4 layers)        | `docs/superpowers/specs/2026-06-07-build-anything-with-real-data-MASTER.md`           |
| Highlighter spec (the chart trigger) | `docs/superpowers/specs/2026-06-07-highlighter-in-page-ask-chart-design.md`           |
| Chart contract + lint                | `refinery/validate/chart-block-lint.mts`                                              |
| Renderer                             | `components/charts/{ChartBlockView,HBarChart}.tsx` + `refinery/lib/chart-adapter.mts` |
| Classifier (no consumer yet)         | `lib/route-chart.ts`                                                                  |
| Dossier slot to wire                 | `lib/fetch-brain.ts:155-179` (`chart?`)                                               |
| Popup integration point              | `components/highlighter/HighlightPopup.tsx` (the disabled "Chart this · soon" button) |
