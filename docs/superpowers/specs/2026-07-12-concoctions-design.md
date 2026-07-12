# Concoction registry + data-bound grid blocks

**Date:** 2026-07-12 · **Check:** `concoctions_live_verify` · **Status:** approved design (operator, this session)

## Problem

Every surface that shows "data that goes together" carries its own welded copy of the load-and-render logic: the chart gallery has bespoke loaders per panel (`lib/charts/gallery-loaders.ts`), the chat dock has its own (`lib/build-chart-for-intent.mts`), the desk has its own (`lib/desk/loaders.ts`), the embed cards read `corridor_profiles` a third time, and the (now superseded in part) viz-archetypes plan would have added a fifth copy fused to HTML template shells. Because the knowledge about the data lives nowhere shared, every new surface rediscovers distribution traps by hand — the 07/12 plan review caught `cap_rate_pct` being effectively constant (6.7 for 22 of 27 verified corridors, 8.3 for 3, null for 2 — probed live this session), `sales_90d` near-zero at ZIP grain, a phantom SWFL-wide rollup row (`county IS NULL AND zip_code IS NULL`), and a view name copied from a SQL *filename* (`fema_nfip_county_year_view` — the real view is `data_lake.fema_nfip_county_year`). Separately, AI authoring fills rigid all-or-nothing templates: the model must produce every slot perfectly instead of composing only what the data supports.

## Goal

One registry of curated, parameterized data bundles — **concoctions** (internal name; user-facing label: **Datasets**) — that any surface can consume, rendered as ordinary grid blocks a user or the AI can load, keep, remove, splice across concoctions, re-shape, and re-parameterize. Data-first or design-first authoring on the Email Lab grid; export the same canvas to email HTML and social PNG in v1. The end state Ricky named: "create deliverables with data first, then add design behind it, or vice versa."

## Decisions locked (operator, 07/12/2026)

1. **V1 consumers: both, foundation-first.** Registry + bindings built once; a "load a Dataset" picker in the grid lab AND author-engine awareness ship on top of the same foundation.
2. **Authorship: curated + parameterized.** We author definitions in code; parameters (ZIP, corridor, county, window) give breadth. Nobody writes queries at runtime. Open composer (AI-defined concoctions behind a validation gate) is explicitly phase 2+.
3. **V1 exports: email + social image.** Both rails exist (`compile-grid` → email HTML; `lib/social/render-social-image.ts` rasterizer). PDF and web embeds are phase 2.
4. **Architecture: baked values + remembered bindings.** Block props carry real values (all existing renderers/exports untouched); an engine-owned `binding` field remembers where values came from so refresh/rebind/turn-into/provenance work. Live-resolve-at-render was considered and rejected (three render engines would each need data awareness — known divergence risk; breaks freeze-at-send). Whole-doc materialization without bindings was rejected (no refresh, no re-shape, no per-block provenance).

## Evidence (research pass, crawl4ai, 07/12/2026)

- **Evidence.dev components** (docs.evidence.dev/core-concepts/components): components take `data={query}` + mostly-optional props; unspecified props are inferred from the data (first column → x, unassigned numeric columns → y). Validates optional-first binding contracts — the AI never has to "use everything exactly."
- **Cube semantic layer** (docs.cube.dev/docs/data-modeling/overview): datasets declared as measures + dimensions over tables, with views as curated consumer facades; positioned as "shared context for AI agents, BI dashboards, and embedded analytics." Validates the registry shape. (Concept only — dbt itself was evaluated and rejected 2026; not re-proposed.)
- **Notion block model** (notion.com/blog/data-model-behind-notion): block type is decoupled from properties; "turn into" changes only the type attribute, unused properties are preserved, not destroyed. Validates non-destructive shape switching on a stable binding.
- **Unlayer blocks** (docs.unlayer.com/builder/blocks/custom): host-defined custom blocks with category + searchable tags; user-saved and *synced* blocks (edit once, propagate) are standard email-builder practice. Validates the browser-panel UX and refreshable-block semantics.
- **r/Emailmarketing community pull** (old.reddit search, 1y window): recurring complaints are rigid editors ("too rigid and the code it gives is heavy"), manual duplication ("I update the footer in 30 templates manually" → solved by reusable synced blocks), teams converging on "a wireframe + modular system rather than one-off designs," and robotic AI copy — users want AI assembling real substance with human control retained.
- **Freshness prior art** (support.google.com/docs/answer/7009814; support.airtable.com/docs/getting-started-with-airtable-sync): Google Docs linked charts do NOT silently auto-update — each stale object shows an "Update" chip, with a Linked-objects sidebar offering "Update all." Airtable sync frequency is a per-sync dial: automatic or manual. Our refresh model (below) composes both patterns and is stated in the operator's terms: sent = frozen (physics), scheduled = auto-fresh at every send, drafts = chips + Update-all + optional per-doc always-fresh toggle.

Probe findings (RULE 0.5, this session): grid = react-grid-layout v2, 12-col / 600px canvas (`lib/email/grid-schema.ts`); `EmailBlock` props are "options, never required" with AI-writable content separated from user-owned sticky fields via `ContentPatchSchema` (`lib/email/doc/types.ts`, `doc/schema.ts`); number-bearing fields (e.g. `MetricCardProps.metricValue`) already live OUTSIDE the AI patch allowlist; charts already have the one email-safe path (data → SVG → PNG via resvg → `email-media` bucket URL, `lib/email/chart-image.ts`); `upsertChartBlock` replaces a reserved image block in place; seed templates already encode slot semantics (empty = AI fills); scheduled sends already re-fetch fresh via the recipe-not-snapshot bridge (`lib/deliverable/schedule-recipe.ts`).

## What we're building

### 1. Concoction registry — `lib/concoctions/`

`ConcoctionDef` (typed, code-authored, server-only loader):

- `id` (kebab slug), `label`, `description` — label/description are product copy; the AI picker and lab browser read them verbatim. No system nouns.
- `category` + `tags` — the Unlayer browsing taxonomy.
- `params` — zod schema (e.g. `{ zip }`, `{ corridor }`, `{ county, window }`). Bad params fail loudly at materialize time, never render time.
- `load(params, deps)` — reads declared held tables via service-role client. All known traps are baked exclusions here, in exactly one place (e.g. `county IS NOT NULL AND zip_code IS NULL` for county rollups; `deleted_at IS NULL AND verification_status = 'verified'` for corridors).
- `columns` — the manifest. Every yielded column declares: `key`, human `label`, `kind` (`measure` | `dimension`), `format`, and **distribution guards** (`minDistinct`, `minSpreadRatio`, nullable-share ceiling — whichever apply). A guard-failing measure is unavailable to shapes that need spread; the cap-rate lesson becomes registry law, not tribal memory.
- `asOf(rows)` — derives MM/DD/YYYY from the data (`metrics_verified_date`, `latest_at`, `period`, max `year`); never a stamped constant (the `charts_vacancy_asof_fabricated` incident class).
- `sourceLine` — the real named source, rule-1 compliant.
- `defaultLayout` — the block set a fresh load materializes (types + slices + grid positions), i.e. the concoction's starting look before the user restyles or splices.

Starter definitions (v1, all probed-live this session): corridor profiles (rent PSF × vacancy has real spread — $16.04–$60.84 × 0.2–7.7% across all 27 verified corridors), ZIP listing activity (new listings × price cuts; `sales_90d` guard-fenced until the ingest gap check resolves), NFIP county storm years (`data_lake.fema_nfip_county_year` — correct name), daily-truth asking-price trend. Each carries the degenerate-data fixture that would have caught its trap.

### 2. Block binding — one field on `EmailBlock`

`binding?: BlockBinding`, engine-owned exactly like `layout` (ContentPatchSchema strip-listed; the AI can never write it — schema-test enforced):

- `lane`: `"lake" | "upload" | "web" | "user"` — the four-lane moat at block grain.
- Lane `lake`: `{ concoctionId, params, slice }` where `slice` = chosen measures/dimensions, row filter, topN. Lanes `upload`/`web`/`user`: a `bundleRef` to the extracted/cited/stated figures record (v1 ships `lake` fully + `user` minimally; `upload`/`web` extractors are phase 2 — the interface ships now so nothing is retrofitted).
- `version` — binding schema version, v1 from day one. A binding whose definition changed incompatibly degrades gracefully: baked values stay, block flags "can't refresh," doc never breaks.
- Cached `asOf` + `sourceLine` for the chip and the citation root.

### 3. Materializer — `lib/concoctions/materialize.ts`

`(def, params, shapeChoices) → EmailBlock[]` with values baked + bindings attached. Per-block-type mappers: metric-card ← one measure (verbatim restate, preformatted); stats ← 2–3 measures; list ← rows; image(kind:"chart") ← the existing `chart-image` path (hosted PNG); text/signal prose stays AI-authored and rides the existing no-invention lint. Three entry points, one engine:

- **load** — concoction → `defaultLayout` blocks (data-first authoring).
- **rebind** — same block, new params (swap the ZIP; values follow). Also the design-first path: bind a slice into an existing styled layout's blocks.
- **turn-into** — same binding, different block type (tile ↔ stats ↔ chart). Notion semantics: nothing lost when data the new shape doesn't use is set aside.

Deterministic given (def, params, rows); mapper tests pin the arithmetic on raw-row fixtures.

### 4. Refresh model (operator-corrected 07/12)

- **Sent** — frozen forever (an inbox can't be edited). Unchanged platform law.
- **Scheduled/recurring** — auto: every occurrence re-materializes each binding at send time (extends the existing schedule-recipe lane). This is the "auto update like our current scheduled emails" behavior, preserved.
- **Drafts** — Google-pattern nudge is the default: on open, compare each binding's cached `asOf` to the source's current as-of (a metadata compare — no loaders re-run, no tokens spent); stale blocks wear an Update chip; canvas offers Update all. Airtable-pattern dial on top: per-doc "keep always fresh" toggle — and its trigger is the FIRST EDIT ACTION in a session, never the open (operator, 07/12: an accidental open must cost nothing). Numbers never move mid-edit without a user action or that armed toggle. Chart refresh re-renders the hosted PNG — visible progress, not per-keystroke.
- **Refresh spends no AI tokens.** Re-materialization is deterministic (loader re-run + chart PNG re-render). AI-written prose (commentary/read blocks) is NEVER auto-rewritten on refresh — a stale-commentary chip invites the user to regenerate it explicitly.

### 5. Guards + coherence (three structural layers)

- **Measure-level**: manifest distribution guards decide which measures a shape may use.
- **Shape-level**: each mapper declares minimums (scatter: two spread-bearing measures; trend: minimum points). On failure the materializer answers with the fallback shape (bar/table) — never a refusal, never an empty box (FOCUS rule 4).
- **Canvas-level**: dependent blocks travel together (a commentary block bound to a chart block dies with it); every bound block carries its own source + as-of; mixed-lane canvases merge citations through the existing single citation root. Extends the locked "every deliverable element ships with a coherence rule" pattern — no new gate class (RULE C2: this extends `BrainOutput`-style seams and the existing lint family).

### 6. Lab UX (paid tier via `capabilitiesFor`, grid lane)

Dataset browser panel (categories + tags) → load drops `defaultLayout` onto the canvas. Per bound block: source/as-of chip, shape switcher (turn-into), rebind control (parameter swap). Splice/keep/remove/restyle = the grid's native operations, unchanged. Grouping is non-destructive: group/ungroup freely; "flatten" exists only as the export step below.

### 7. AI wiring

The author engine receives the registry index (id/label/description/params) the way it already receives layout recipes (`author-recipes` pattern: advisory, digit-free). The model's job is selection + slicing; the materializer bakes every number through the existing fences (number fields outside the content-patch allowlist). Chat "build me a Cape Coral market email" = load path; "fill this layout with 34112 data" = rebind path. Registry `description` fields are the AI's routing signal — written as product copy.

### 8. Exports (v1)

- **Email** — untouched: compile-grid and the stacking renderer see ordinary blocks with baked values.
- **Social** — select blocks or a group → flatten renders THAT SELECTION through `render-social-image` into a platform-sized PNG, with source line + as-of burned into the image (provenance survives the screenshot economy). The canvas keeps its layers; flatten touches only the exported copy.

### 9. Testing

- Per-definition fixture tests including a mandatory **degenerate-data fixture** (constant column, near-zero column, phantom rollup row) proving guards fire and fallback shapes render — 07/12's traps become the permanent regression suite.
- Materializer determinism: load/rebind/turn-into round-trips on fixtures.
- Schema test: AI content-patch cannot write `binding` (extends the existing user-owned-strip tests).
- Binding-version degradation: an old-version binding renders baked values + "can't refresh," never throws.
- Export smoke: a mixed-lane canvas → email HTML (no residual placeholders) and → social PNG (rasterizes, carries source line).
- Vocab/coverage gates per RULE 1 where slugs are emitted; `bunx next build` as the verify (never `npx tsc`).

## Non-goals (v1)

- No PDF / web-embed export (phase 2; the binding + materializer are renderer-agnostic by construction).
- No open composer (AI-defined new concoctions) — phase 2+, behind a validation gate, on top of this registry.
- No upload/web bundle extractors (interface ships v1; extractors ride existing upload + web-citation machinery in phase 2).
- No forced migration of gallery/chat/desk loaders — they fold into registry definitions opportunistically as each surface is next touched (one authority per shared concept: extract on copy #2, not a big-bang refactor).

## Relationship to the 07/12 viz-archetypes plan

Superseded in part. Its five shell-generalization tasks (monolithic HTML templates with ~40-token strict contracts) are dropped — this design replaces form-filling with composition. Its registry/recipes concept is absorbed here as the concoction registry. Its four data corrections (axes with real spread; `fema_nfip_county_year`; rollup filter `county IS NOT NULL`; 27-not-7 corridors) carry forward as registry law. The `viz_archetypes_live_verify` check should be resolved/superseded in favor of `concoctions_live_verify` when the plan doc is retired.
