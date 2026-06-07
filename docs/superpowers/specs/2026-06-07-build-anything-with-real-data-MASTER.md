# Build Anything in Seconds — With Real, Cited Data (master picture)

**Date:** 2026-06-07 · **Status:** the single-file north star that unifies four design docs into one story.
**This file is the map, not the territory** — each layer below has its own detailed, build-ready spec/plan
(linked inline). Read this to understand _what the whole thing does for a user and how the pieces connect_;
open the linked doc when you're building that layer.

**Grounded by** the 2026-06-07 `charts-boards-spec-audit` (7 agents) + a live `mcp__lake` data probe + DAG/route
audits — every claim here was read in-session, not remembered.

---

## ⛳ SHIPPED STATE + OPEN ERRORS TO FIX — handoff for the next Opus (2026-06-07)

**Layers 1 + 2 (Highlighter + Reach R0/R1/R4) are BUILT and MERGED to `main`** via PR #68 (squash `82e33fd`,
"feat(highlighter): in-page reach engine — R0 cross-area + R1 cross-report + R4 Claude handoff"). The server
engine deployed to prod. Tests: **1254/1254 pass, tsc clean, eslint clean.**

### What is live right now

| Piece                                                      | State                              | Notes                                                                                                                                                                                                                          |
| ---------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/converse` SSE engine (R0 + R1 + R4)                  | ✅ **live on prod**, live-verified | grounded on `claude-haiku-4-5`; R0 cites every-ZIP `detail_tables`, R1 fetches 0–3 other reports server-side (allowlist-bounded), R4 builds the "Open in your Claude" handoff                                                  |
| `usage_events` meter                                       | ✅ **live**, counting only         | migration applied to prod; enforcement OFF; writes 1 row per successful answer                                                                                                                                                 |
| Primary-report gating                                      | ✅ fixed (C1)                      | gates on brain-exists (404 if missing), NOT MCP-catalog membership — `franchise-outcomes` (live brain, not in `BRAIN_CATALOG`) works; reach stays catalog-bound                                                                |
| **Popup UI** (`HighlighterLayer`, chips, popup, coachmark) | 🟡 **shipped but DARK**            | mounted behind flag `HIGHLIGHTER_UI` (default **OFF**) in `app/r/[slug]/page.tsx`. Code is on prod; renders for nobody until the flag flips. `lib/highlighter/flag.ts` → `highlighterUiEnabled()` (ON only for `"1"`/`"true"`) |

### Verify findings (from the live `/api/converse` runtime pass — these are real, carry them forward)

- ⚠️ **The GUI popup itself was NOT driven** — no browser automation could reach it. The _server stream_ it
  consumes was verified end-to-end (the part headless tests mocked). **Still unverified: popup positioning,
  selection UX, mobile chips, coachmark.** This is the open `highlighter_ui_live_verify` check; it needs a real
  browser pass. (Cloud browser tools can't hit localhost; prod has the popup flag-gated OFF — see "how to verify"
  below.)
- ✅ **The real SDK v0.69.0 streaming path works against the live Anthropic API.** The `extractText`
  event-iteration branch (`content_block_delta` → `text_delta`) — which CI only exercises via a mock — streamed
  text cleanly across many frames. This was the single biggest unknown; **confirmed live.**
- ✅ **Decline-without-a-ZIP fired under real conditions** — given the whole dossier and no ZIP named, the model
  refused to fabricate a single-ZIP number and offered the grain instead. The structural guarantee works live.
- 🔧 **Next 16.2.6 deprecation** logged at dev-server start: _"the 'middleware' file convention is deprecated,
  use 'proxy'"_ — **pre-existing, unrelated to this branch**, but worth a ticket before the next Next major.

### A breaker this merge caught (so the next Opus doesn't get bitten)

- **CI runs `eslint` and treats `@typescript-eslint/no-explicit-any` as an ERROR, not a warning.** `bun test` +
  `tsc` were green locally but the PR's `build` check went RED on lint (7 `as any` in two test files). Fixed in
  the same PR. **Lesson: run `npx eslint` (or `bun run lint`) locally before pushing — green tests + green tsc do
  NOT mean green CI.** (Also: a gitignored local-only dir `awesome-claude-code-toolkit/` throws 43
  `no-require-imports` errors locally but is absent from CI's checkout — `--ignore-pattern` it when sanity-checking.)

### ❌ Open errors / work to fix (priority order for the next Opus)

1. **Browser-verify the popup, then turn it on.** This is the only thing between "engine live" and "users can
   click it." How to verify, two clean options:
   - **Preview-deploy path (recommended):** set `HIGHLIGHTER_UI=1` for a Vercel _Preview_ environment, push a
     throwaway branch, open the preview `/r/<slug>` URL, drive it (desktop text-select → popup → Ask → Answer;
     mobile chip tap; coachmark first-touch; popup positioning near viewport edges). Cloud browser tooling
     (Spider) CAN reach a public preview URL.
     - When it passes: flip `HIGHLIGHTER_UI=1` in the **Production** Vercel env + redeploy → popup goes live. Then
       close `highlighter_ui_live_verify`.
   - **Local Playwright path:** `bun add -d playwright` (⚠️ touches the lockfile — `git add bun.lock` per the
     pre-push gate), `HIGHLIGHTER_UI=1 bun run dev`, drive `localhost`. Heavier; only if preview is unavailable.
2. **`highlighter_suggestions_dossier_wiring`** (open check) — carry the Stage-4 precomputed suggestions IN the
   dossier so the popup shows them with zero round-trip. Blocked on the **atomic type-lift** of `BrainOutputMetric`
   (CLAUDE.md non-negotiable #3: the type change + backfill of all packs ship in ONE commit). The pure function
   `suggestionsForMetric(m, slug)` already exists in `refinery/stages/4-output.mts`; the client copy lives in
   `lib/highlighter/suggestions.ts`. Only the dossier-carry is unwired.
3. **`highlighter_factchip_metrics_wiring`** (open check) — wire `FactChip` → `MetricsTable` so a highlighted
   metric scrolls/links to its table row. Selection-only today.
4. **Next `middleware` → `proxy` rename** — file/fix the deprecation above before the next Next major.

> **Do NOT re-litigate the merged engine** — R0/R1/R4 + meter are live-verified and tested. The remaining work is
> the UI surface (items 1–3) and housekeeping (item 4). Pricing + the charge path (`highlighter_pricing_matrix`,
> `paid_path_wtp`) stay deliberately deferred.

---

## The promise

> **A user reads a SWFL report, points at any fact, and in seconds turns it into an answer, a chart, a
> comparison across the whole region, or a saved PDF — and every single number carries its source.**

That last clause is the moat. Anyone can bolt a chatbot onto a dashboard. The thing that makes this worth paying
for is that **it structurally cannot make up a SWFL number** — the engine only ever sees pre-validated, cited
data, and a lint rejects any chart cell that doesn't anchor to an audited value. Trust is the product;
"in seconds" is the feel.

---

## The end-to-end journey (what a user can actually do)

```
              ┌─────────────────────────────────────────────────────────────────────┐
              │  A user is on /r/housing-swfl reading the Naples housing report      │
              └─────────────────────────────────────────────────────────────────────┘
                                          │
   ① POINT  ── selects "$525,000 median" (desktop) or taps the [$525,000] chip (phone)
                                          │
   ② ASK    ── popup opens: instant suggested questions ($0) → or types their own
                                          │
   ③ ANSWER ── streams back, grounded, cite-or-decline, freshness token quoted once
                  │
                  ├─ R0  compares to ANY SWFL ZIP — the dossier already holds every ZIP
                  ├─ R1  reaches OTHER reports server-side: "what about flood here?" → pulls env-swfl;
                  │       "commercial rents?" → cre-swfl; "overall outlook?" → master
                  └─ R4  "Open in your Claude ↗" — hands the grounded dossier to the user's own Claude
                                          │
   ④ CHART  ── "Chart this" → a real bar chart renders inline, only audited numbers, lint-checked
                  │            (Tier A pre-baked · Tier B intent-routed · Tier C "chart it this way" NL)
                  │
   ⑤ SAVE   ── "Save / Share" → /c/[id]  (a shareable, sourced single chart)
                  │
   ⑥ COMPOSE── "Add to board" (sign in) → /board/[id]: charts + reports they read + notes, in order
                  │
   ⑦ EXPORT ── "Save as PDF" → window.print() → a clean sourced PDF: citations + freshness token survive
```

Seven steps, four build layers, one continuous motion from _curiosity_ → _shareable artifact_. No step leaves
the data behind; provenance rides all the way to the PDF.

---

## The four layers (each links to its build-ready doc)

### Layer 1 — The Highlighter: point → ask → grounded answer

**Doc:** `2026-06-07-highlighter-in-page-ask-chart-design.md`

The in-page UI on `/r/` pages. A user points at a fact (desktop selection / mobile chip), a popup anchors to it
with three states — **Suggestions** (precomputed at build, instant, $0) → **Ask** (composer) → **Answer**
(streamed). The engine is a server route `/api/converse` on our Anthropic key (`claude-haiku-4-5`, SSE), grounded
**only** in the report's dossier + the rules-of-engagement, so it cites or declines. Metered from day one
(`usage_events`), enforcement off. This is the Tier-3 "Conversation" layer of THE-GOAL made visible.

### Layer 2 — Reach: the answer can pull the whole platform

**Doc:** the **Reach Expansion** section of the Highlighter spec + the plan
`docs/superpowers/plans/2026-06-07-highlighter-reach-r0-r1-r4.md` (8 TDD tasks, ready to execute).

The decisive upgrade: the answer isn't trapped on one report. **Committed:**

- **R0 — in-dossier reach** ($0): a housing dossier already carries _every SWFL ZIP_ in `detail_tables`, so
  "compare Naples to Cape Coral" is answered from data already in the payload.
- **R1 — cross-report fetch:** a deterministic, allowlist-bounded resolver maps the question to 0–3 _other_
  reports and fetches them server-side (`fetchBrain` + `buildDossier`) — other verticals (flood/CRE/permits/
  tourism) for the same place, other regions, or `master` for the whole-lake read. Every fetched block is
  pre-validated, cited brain output, so reach widens without weakening the guarantee.
- **R4 — "Open in your Claude":** the uncapped escape valve. Hands the grounded dossier to the user's own Claude
  (via the `swfl_fetch` MCP) so they can blend our cited data with outside info and build whatever, off our
  meter — and it teaches them to `claude mcp add` us (distribution).

**Deferred:** **R2** (a bounded runtime lake read — monthly/yearly **time-series**, the full city_pulse signal
set, ad-hoc columns no brain surfaces) is the next headline; it gets its own spec because it needs per-row
citation enforcement + a cost guard. **Rejected:** **R3** (free-form LLM SQL on the public surface) — it's the
one thing that breaks the structural no-invention property.

> **Why this matters:** the lake already holds far more than the reports render (storm history 1996–2025, ZORI
> rents, BLS-by-year, city*pulse's 49+ live signals vs the brain's 8). The gap to "all our data" is a \_read
> endpoint*, not data. R0/R1 unlock everything already shaped into a brain; R2 later unlocks the raw columns.

### Layer 3 — Charts: a fact becomes a chart

**Doc:** `2026-06-07-chart-generation-three-tier-design.md`

We have a renderer (`ChartBlockView`/`HBarChart`) and a classifier (`routeChart`) but **no producer** — this
layer builds it, in three independently-shippable tiers, all feeding the existing renderer:

- **Tier A — deterministic "at a glance"** (build-time, $0): every chartable brain gets one bar chart computed
  in code (`computeMetricChart`) from a `detail_table` or ≥3 comparable `key_metrics`, persisted into the brain
  `.md` and wired into the dead `Dossier.chart` slot. This also gives the Highlighter a chart target on _every_
  report.
- **Tier B — intent-routed** (deterministic, $0): wires the missing glue behind `routeChart` →
  `buildChartForIntent` → `ChartBlock`. This is what the Highlighter's **"Chart this"** calls on a routable fact
  (rents, vacancy, flood-AAL, ZHVI, corridor vitals).
- **Tier C — natural-language "chart it _this_ way"** (LLM, metered): when a request isn't routable, the
  `/api/converse` engine picks metrics + shape **from the dossier only** and emits a `ChartBlock`, hard-linted
  for provenance (every numeric cell within 5%/0.05 of a dossier number, else rejected).

Constraint to honor everywhere: a brain output's `value` is a **scalar** — a chart from a brain is a _bar_ over
key_metrics or a detail_table's rows. A **trend/area line needs its own series source** (only ZHVI has one
today) — that's the R2/lake story.

### Layer 4 — Save · Compose · Export: the artifact

**Doc:** `2026-06-07-boards-pdf-composed-export-design.md`

Delivers the already-marketed _"ask for a sourced PDF or doc, get one."_ Three components in order:

1. **`/c/[id]`** — a saved, shareable single chart (`saved_charts` table, public read-by-id, anonymous). The
   atom boards compose.
2. **`/board/[id]`** — a signed-in user composes an ordered board from charts they generated + reports they read
   - notes. This introduces the **first real `auth.uid() = user_id` RLS policy in the codebase** — identity
     exists (magic-link) but has never gated anything; boards is where multi-tenancy actually begins.
3. **PDF export** — v1 is client `window.print()` + a print stylesheet (**no new dependency**, respects the
   lockfile gate). Nav/upsell chrome hidden, charts full-width, page-breaks between items, and **citations +
   freshness token survive into the PDF** (provenance must outlive export).

---

## The guarantee (why every output is trustworthy)

This is the spine that runs through all four layers — the reason the speed is safe:

1. **Structural context-restriction.** The engine sees only the dossier(s) + rules — no web, no open tools, no
   raw lake. It can't cite what it wasn't given.
2. **Cite-or-decline.** No source in the payload → no claim. A gap is offered as "we don't hold that," never
   invented. SWFL numbers finer than we hold (sub-ZIP) are structurally refused.
3. **Reach keeps the property.** R0/R1 only ever add _more pre-validated, cited dossiers_ — never raw rows. R3
   (which would) is rejected; R2 (which could) carries mandatory per-row citation enforcement.
4. **Charts are lint-gated.** `lintChartBlock` rejects any numeric cell not anchored (5%/0.05) to an audited
   value. A malformed or unsourced block is never persisted or rendered.
5. **Provenance survives to the edge.** The freshness token is quoted in answers and printed on PDFs; saved
   charts carry `source_meta`; the speaker projection that widens for charts is leak-tested (no internal ids).

"The system prevents invention" ≫ "the AI promises not to." That's structural, not behavioral — and it's what
lets us charge.

---

## What's real vs. greenfield (consolidated)

| Capability                                                                                       | Status                         | Note                                                                   |
| ------------------------------------------------------------------------------------------------ | ------------------------------ | ---------------------------------------------------------------------- |
| `/api/b/<slug>?format=json` (every report is an API)                                             | ✅ live                        | the seam R1 fetches; carries the dossier                               |
| Dossier with every-ZIP `detail_tables`                                                           | ✅ live                        | R0 is $0 because of this                                               |
| `RULES_OF_ENGAGEMENT`, `GEOGRAPHY_GAZETTEER`, `getAnthropic`, `resolvePlace`, `buildReportIdSet` | ✅ live                        | reused by the converse engine + reach                                  |
| `/api/converse` engine                                                                           | ❌ greenfield                  | built by the reach plan (Tasks 1–4)                                    |
| `usage_events` meter                                                                             | ❌ greenfield                  | built once, shared by all four layers                                  |
| `ChartBlock` / `lintChartBlock` / `ChartBlockView` / `HBarChart`                                 | ✅ live                        | renderer + contract exist                                              |
| `routeChart` (classifier)                                                                        | ✅ live but **no consumer**    | Tier B builds the glue                                                 |
| brain→`ChartBlock` producer                                                                      | ❌ greenfield                  | Tier A builds `computeMetricChart`                                     |
| `Dossier.chart` slot                                                                             | ⚠️ dead                        | Tier A wires it                                                        |
| `HBarChart` responsive <320px                                                                    | ⚠️ fixed-px                    | shared sub-task (Highlighter mobile + Charts + print)                  |
| runtime lake read (`/api/lake`)                                                                  | ❌ none (dev-side DuckDB only) | that's **R2**, its own spec                                            |
| `/c/`, `/board`, PDF libs                                                                        | ❌ greenfield                  | Layer 4; PDF v1 needs no dependency                                    |
| magic-link auth                                                                                  | ✅ exists, **unenforced**      | `/board/*` is the first gated route + first `auth.uid()` RLS           |
| payment processor (Stripe)                                                                       | ❌ none                        | "$39/$79" is copy + `mailto`; charging is a separate deferred decision |

---

## Build order (the full dependency chain across all four layers)

```
Highlighter Phase 1  (ask-in-place: fact detect + popup + /api/converse + meter)        ← reach plan Tasks 1–7
   ├─ R0 baked in (Task 1 inlines detail_tables)
   └─ R1 + R4 (Tasks 2–4, 6)                                                             ← "reaches the platform"
        │
Charts Tier A  (deterministic at-a-glance; lights a chart target on every report)
        └─ Charts Tier B  +  Highlighter "Chart this"   (intent glue)
                  └─ Charts Tier C  (NL chart; depends on /api/converse; metered)
        │
/c/[id] + saved_charts   (anonymous, public — smallest save unit)
        └─ /board/[id] + boards   (auth + first auth.uid() RLS policy)
                └─ PDF export   (window.print() + print CSS — no dependency)
        │
[LATER, own spec]  R2 runtime bounded lake read  → unlocks time-series + ad-hoc columns → richer Tier C charts
```

**Start here:** the reach plan's Task 1 (`/api/converse` grounding) — everything else stands on the converse
engine. Reach-aware suggestions (Task 8) and Charts Tier A can proceed in parallel once the engine exists.

---

## Money / meter posture (mechanism only — numbers deferred)

- One _answer_ or one _chart generation_ = **1 use** in `usage_events`. Suggestions, reading, saving, and the R4
  Claude-handoff are free. Counting is **on from day one; enforcement is OFF.**
- When pricing lands, the flag `HIGHLIGHTER_FREE_WEEKLY_CAP` flips (hypothesis 5–10/week) and the (N+1)th use
  routes to the existing soft wall (`/#waitlist`). **There is no charge path in the repo** — collecting money is
  a separate, deliberately-deferred willingness-to-pay decision (`checks: paid_path_wtp`).
- Cost is not the constraint: even a heavy free user is single-digit cents/week on Haiku. The cap is a
  monetization lever, not a cost control; a daily-$ ceiling is cheap abuse insurance.

---

## Pointers

| Layer                         | Detailed doc                                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1 — Highlighter (ask/trigger) | `docs/superpowers/specs/2026-06-07-highlighter-in-page-ask-chart-design.md`                              |
| 2 — Reach (R0/R1/R4)          | same spec, "Reach Expansion" section + `docs/superpowers/plans/2026-06-07-highlighter-reach-r0-r1-r4.md` |
| 3 — Charts (A/B/C)            | `docs/superpowers/specs/2026-06-07-chart-generation-three-tier-design.md`                                |
| 4 — Save/Compose/Export       | `docs/superpowers/specs/2026-06-07-boards-pdf-composed-export-design.md`                                 |
| Next headline                 | **R2** runtime bounded lake read — to be specced (`checks: highlighter_reach_axis` follow-on)            |

**Open checks:** `highlighter_pricing_matrix` (the cross-feature pricing numbers), `paid_path_wtp` (the charge
path), and the R2 spec itself remain the named follow-ups. Everything in Layers 1–4 above is build-ready cold.
