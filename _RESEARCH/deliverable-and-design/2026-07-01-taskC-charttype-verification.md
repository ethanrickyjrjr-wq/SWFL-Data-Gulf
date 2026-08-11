# Task C — chart-type-by-data-shape: research + code verification (2026-07-01)

**Target C** of the design-quality BCD handoff. crawl4ai-fresh (RULE 0.4) + code-anchor reconcile (RULE 0.5).

## Outside research — our ladder is already best-practice-aligned (no drift, no disagreement)

Fetched live via crawl4ai (undetected) this session:
- **Atlassian** `essential-chart-types-for-data-visualization` (200, 104 KB — the source doc's own §2.1
  source, re-fetched verbatim). Decision rules **unchanged**: bar = length per group (horizontal when many
  bars/long labels); **line = "changes in value across continuous measurements, such as those made over
  time"**; **scatter = "the relationship between two numeric variables"**; histogram = continuous numeric
  distribution; **stacked bar / area = totals + part contributions over time**; box plot = distribution.
- **FT Visual Vocabulary** (github repo, 200, 47 KB) — cross-check. Same taxonomy: Correlation→scatter,
  Ranking→bar, Change-over-time→line/area, Part-to-whole→stacked/pie, Distribution→histogram. **Agrees
  with Atlassian; nothing to reconcile (RULE 4).**
- (Datawrapper "what chart" URL is dead/404 now; FT SPA rendered thin — the two live sources above are
  sufficient and agree.)

**Mapping to our own ladder — exact 1:1:**

| Data shape | Best practice (Atlassian/FT) | Our `pickFramesForData` rung → frame |
|---|---|---|
| date + numeric (over time) | line / area | Priority 1 → `zhvi-area` |
| 2+ numeric (relationship) | scatter | Priority 2 → `corridor-scatter` |
| percents ~1.0 (part-to-whole) | stacked bar / pie | Priority 3 → `composition` |
| one numeric (single value) | single value / gauge | Priority 4 → `z-gauge` |
| 1 numeric per category (ranking) | bar | Priority 5 → `bar-table` (fallback) |

**Verdict:** the decision logic already exists AND matches current best practice. Task C is **wiring, not
new decision logic** — exactly as the handoff framed it.

## Code anchors reconciled (RULE 0.5)

- **The ladder exists, pure-ish:** `pickFramesForData(detail_tables, key_metrics)`
  (`components/charts/registry/pick-frames.ts:74`) — 5-priority mapper returning one `{frameId, reason}` or
  null; drops `fixtureOnly` frames via `isFixtureOnly`. Keys off **BrainOutput shapes** (detail_tables +
  key_metrics).
- **The chat gap is Layer 2, not "no shape matching anywhere":** `buildChartForQuestion`
  (`lib/assistant/chart-for-question.ts`) has 3 layers — L0 ranked-delta intent, L1 `routeChart` KEYWORD
  intent (already reaches `zhvi-area`/`corridor-scatter` for 4 fixture scopes), **L2 generic any-brain →
  `computeMetricChart` which "only ever stamps frame_id bar-table"** (`:110-116`). So a brain whose ACTUAL
  data shape is time-series / relationship / composition / single always renders as a bar in chat unless a
  keyword happened to match in L1. **L2 is where `pickFramesForData` belongs** — it already has `output`
  (detail_tables + key_metrics) in hand at `:100`.
- **THE BLOCKER (architectural):** `registry.ts` imports **all React frame components** as values
  (`:4-15`). `pick-frames.ts` imports `isFixtureOnly` FROM `registry.ts`, and `bind-frame.ts` imports
  `pickFramesForData` + `isFixtureOnly, getFrame` from the registry (`bind-frame.ts:34-35`). So **both the
  ladder and the binder transitively bundle React** — which is exactly why the chat SERVER path stays
  registry-free today ("no registry import on the server", `chart-for-question.ts:112-115`). Wiring them in
  naively would drag the React registry into the chat server bundle.
- **The coupling is pure metadata → cleanly extractable:** the only registry things pick/bind use are
  `isFixtureOnly(frameId)` and `getFrame(frameId)` — and `getFrame` is used ONLY as an existence check
  (`bind-frame.ts:182 if (!getFrame(frameId))`), never for the component. Both are frame METADATA
  (fixtureOnly flag + "does this frameId exist"). Extracting `{fixtureOnly, accepts, label}` per frame into
  a pure `frame-meta.ts` (which `registry.ts` then merges with the React `component`) makes `pick-frames`
  and `bind-frame` **React-free and safe to call server-side** in chat L2. This is a CLAUDE.md-C2 "extend
  the existing seam / break a spurious coupling" refactor, not a new gate.
- **bindFrameSpec is deterministic + moat-safe:** it pulls data from `key_metrics`/`detail_tables`, stamps
  `asOf` from `refined_at`, carries `source.citation` verbatim, returns null for un-bindable requests
  (`bind-frame.ts` header + `:205`). No LLM touches a number — wiring it preserves the moat.
- **compose-chart enum capped (the C2 half):** `compose-chart.ts:242` `chart_type: enum ["bar","table"]`.
  This is the USER-DIRECTED path; it plots **one value per label** (point_ids/external/upload/user_points,
  each a single number). Widening to line/scatter/composition needs richer point STRUCTURES (scatter = 2
  numeric/point; line = time; composition = parts summing to 1) + bind paths for them — a genuinely bigger,
  separable lift than the L2 auto-wiring.

## Scope split for the spec

- **C1 (core, high value, mostly reuse):** extract pure `frame-meta.ts` → make `pickFramesForData` +
  `bindFrameSpec` server-safe → call them in chat L2 before the bar-table fallback, so the auto chart
  matches the brain's real data shape. Moat-safe, deterministic. Fallback to bar-table always remains
  (FOCUS rule 4).
- **C2 (separable follow-on):** widen the compose-chart enum + add richer point structures/bind paths for
  the user-directed path. Bigger; recommend a SEPARATE spec, not folded into C1.

Fetched via crawl4ai only; no Firecrawl, no WebFetch, no memory.
