# The Glass — build decomposition (6 sections, waved-parallel)

**Date:** 2026-06-07
**Status:** DECOMPOSITION / HANDOFF — audited & corrected against live code + the live DB this session (brief, not a status board; obligations live in `public.checks` per RULE 2).
**Companion to (all four now on `main`):**

- `docs/superpowers/specs/2026-06-07-the-glass-observability-and-improvement-loop-design.md` (the settled 4-pane design)
- `docs/superpowers/plans/2026-06-07-flywheel-bootstrap-grades-from-history.md` (+ `-REVIEW-knobs.md`, `-EXPLAINER.md`)

> **PRECONDITION FOR EVERY PLANNER — read before anything else.** These design docs landed on `main` via **PR #70 (`c662e3d`)** _during the session this decomposition was written_ — before that they were stranded on the now-deleted `claude/flywheel-plan` branch. `git pull` and confirm `main ≥ c662e3d` (current tip `4af42c1`) or the paths above will not resolve. Do not trust a path because this doc names it — Rule 1 / Rule 3 C1: open the file.

---

## 0. How to use this doc

- Each section is self-contained enough to hand to a **different Claude to PLAN in parallel**, against the **Pinned contracts** below.
- **Waved BUILD (planning is parallel; building is not):**
  - **Wave 1 — `§1`, `§2`, `§6`** — zero dependency on each other or on a backtest corpus. Build first.
  - **Wave 2 — `§3`, `§4`, `§5`** — they render/consume `§2`'s `backtest_grades` corpus + the live grade views. **Plan them now against the pinned `§2` contract; do not build until `§2` has written ≥100 rows.** Building Pane 3/4 before the corpus exists means coding against a shape that isn't real yet.
- Every section files its own open obligation as a `checks` row when it starts (RULE 2) — e.g. `glass_section1_calls_live`. **Never** `⬜/✅` markers in a plan doc; they rot (RULE 2).
- A planner's job ends at a written implementation plan, not code.

---

## Dispatch — who builds what, when, and what runs at the same time

**What you send each agent:** this doc + the section number + "the companion design docs are on `main`, read them first." Send `§6` as a **brainstorm** (it has an unresolved architectural fork). For the Opus _plan-first_ sections, ask for a `writing-plans` implementation plan before any code.

| §   | Section                     | Repo               | Model                            | First step                                        | Can start                          | Same-time OK | NEVER same-time (same repo) |
| --- | --------------------------- | ------------------ | -------------------------------- | ------------------------------------------------- | ---------------------------------- | ------------ | --------------------------- |
| 1   | Glass shell + Pane 2        | `swfldatagulf-ops` | **Sonnet**                       | build (brief is execution-ready)                  | **now**                            | §2, §6       | §3, §5                      |
| 2   | Backtest engine (CRIT path) | `brain-platform`   | **Opus**                         | plan → build (point-in-time correctness)          | **now**                            | §1           | §4, §6                      |
| 6   | Lift live gradeable yield   | `brain-platform`   | **Opus**                         | **brainstorm** the "leaves log predictions?" fork | **now** (aligns to §2 Phase-0 cfg) | §1           | §2, §4                      |
| 3   | Pane 3 Scoreboard           | `swfldatagulf-ops` | **Sonnet** (Opus vets the SQL)   | plan → build                                      | after §2 wrote ≥100 rows           | §4           | §1, §5                      |
| 4   | data_targets generator      | `brain-platform`   | **Opus** plan / **Sonnet** build | plan → build                                      | after §2 corpus + live grade views | §3, §5       | §2, §6                      |
| 5   | Pane 4 + Pane 1             | `swfldatagulf-ops` | **Sonnet**                       | build Pane 4 / resolve DECISION 3 (Pane 1)        | Pane 4 after §4; Pane 1 in Wave 2  | §4           | §1, §3                      |

**The rule that bounds parallelism — one working tree, one agent.** Two build agents editing the _same repo's working tree_ at once collide in git. The repos split cleanly: **`swfldatagulf-ops`** → §1/§3/§5; **`brain-platform`** → §2/§4/§6. So **honest max parallelism = two streams (one per repo)** unless each section gets its own branch/worktree:

- **Wave 1 (now):**
  - **Stream A — `swfldatagulf-ops`:** §1 (Sonnet).
  - **Stream B — `brain-platform`:** §2 **then** §6 (Opus, sequential in one tree) — or §2 ‖ §6 on **separate branches** for true concurrency. §2 Phase 0 locks the grade-config §6 aligns to, so if sequential, §2 first.
- **Wave 2 (after §2 wrote ≥100 `backtest_grades` rows):**
  - **Stream A — `swfldatagulf-ops`:** §3 **then** §5 (Sonnet).
  - **Stream B — `brain-platform`:** §4 (Opus plan / Sonnet build).

**Why these models:** Sonnet for the well-scoped execution surfaces (§1/§3/§5 — clear briefs, mirror existing patterns, no novel design). Opus for the correctness/design-critical ones: §2 (a look-ahead leak turns the whole corpus to fiction), §6 (novel synthesis change with an honesty trap + an open architectural fork), §4 (threshold/ranking design). For "Opus plan / Sonnet build," the plan pins every decision so the build is mechanical.

---

## The load-bearing truth (every planner inherits this)

**The Glass RENDERS grades; it does not MAKE them.** Pane 2 (The Calls) is live today off `predictions`/`outcomes`. Pane 3 (Scoreboard) and Pane 4 (Shopping List) depend on **new brain-platform code** — the `§2` backtest corpus and the `§4` `data_targets` generator. That dependency is the whole reason for the wave ordering.

### Live data reality — verified against the live DB (`jtkdowmrjaxfvwmemxso`) on 2026-06-07

| Fact                                           | Value                                     | Consequence                                                                                                |
| ---------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `predictions` rows                             | **40, all `brain_id='master'`, all open** | Pane 2 has content today                                                                                   |
| …with a logged `conditional_claims` array      | **11** (6 `gradeable` + 5 `ungradeable`)  | **These are the real calls**                                                                               |
| …`grade_status='pending'`                      | **29**                                    | **Legacy husks** written before claim-logging — empty `[]`, no falsifier. **Must be excluded from Pane 2** |
| rows with `gradeable_slug` / `window_end_date` | **6 / 6**                                 | Only 6 carry a concrete grade-by date                                                                      |
| **`outcomes` rows**                            | **0**                                     | No receipts, no live scoreboard yet                                                                        |
| current master read                            | **`mixed` → ungradeable**, conf 0.92      | Live gradeable-call yield is low; see `§6`                                                                 |

**Implication:** Pane 2 shows ~11 real cards today; the graded-receipt path and Pane 3's _live_ half stay empty until the grader resolves a window. This is expected and honest — not a bug.

**Use live counts, never hardcode.** master has **22** input brains today (`refinery/packs/master.mts` `input_brains`; 2 are `modifier` edges, `macro-swfl` emits no metrics) — the settled spec's ASCII says "15," which is stale. Source/table counts likewise come from `ingest/cadence_registry.yaml` + `mcp__lake__list_views` at render time.

---

## Corrected facts (spec drift — inherit these or repeat the mistakes)

1. **`ConditionalClaim`** (`refinery/types/brain-output.mts:163`) is exactly `{ condition, then_direction, basis, basis_refs[], falsifier }`. **No `prediction_window`, no per-claim confidence/magnitude** — by design ("the thesis rides on `OUTPUT.confidence` + `.direction`"). The grade horizon lives on the **prediction row**: `prediction_window` (TEXT) + `window_end_date` (DATE) + `gradeable_slug` + `baseline_value` + `predicted_direction` + `grade_status`.
2. **`basis_refs` are mixed** — some are metric slugs (resolve against `key_metrics`), some are `brain_id`s (resolve against `drivers`). `deriveGradeFields` picks the **first numeric metric-slug** basis_ref as `gradeable_slug`; a claim whose refs are all `brain_id`s is **`ungradeable`** even if directional (this is why the live `mixed` sample is ungradeable). Pane 2 renders refs as chips either way.
3. **The backtest substrate EXISTS — reuse, do not rebuild.** On `main`, tested:
   - `refinery/lib/backtest/decision-fn.mts` → `computeBacktestCall(asOf, gradeConfig)`
   - `refinery/lib/backtest/skill-baseline.mts` → `computeSkillScore(calls)` returns `{ system_accuracy, persistence_accuracy, lift, lake_tier1_accuracy, n_calls, n_families, n_calls_by_tag, … }` (`lift = system − persistence`)
   - `refinery/lib/predictions-log.mts` → `deriveGradeFields()` (the live grade-field logic) + `buildPredictionRow()`
   - `refinery/grade/grade-predictions.mts` → the deterministic grader + `grade_prediction()` RPC
   - `refinery/vocab/loader.mts` → `resolveGradeConfig(slug)` (window_days / epsilon / polarity / gradeable)
   - `refinery/tools/ian-retrodiction-demo.mts` → N≈1 proof; **NOT** a reusable harness.
     The only genuinely-missing backtest code is `refinery/tools/flywheel-backtest.mts` (the as-of grid loop). **Constraint:** `computeSkillScore` collapses N at same-slug/same-as-of-date (persistence-null needs a prior; neutral observeds drop) — the grid **must vary as-of dates per slug**.
4. **Does NOT exist yet:** `backtest_grades` table, `data_targets` table, `refinery/tools/flywheel-backtest.mts`, any `app/glass/*` page, `lib/glass.ts`.
5. **The ops repo is pure CSS** (`app/globals.css`, CSS variables; no Tailwind). Three corrections vs. the original Section-1 draft:
   - Reader idiom is **`{ available, <entityName> }`** (e.g. `{ available, checks }`, `{ available, goals }`) — **not** `{ available, data }`. Match it: `{ available, calls }` / `{ available, graded }`.
   - **`ProgressBar` is NOT exported** from `app/ui.tsx` (only `DonutChart` is). Use the `.progress-fill` width-% CSS idiom (or export `ProgressBar`); do not import it.
   - **`getMasterHealth().freshnessToken` is `string | null`**, parsed from `brains/master.md` frontmatter (not the DB). Handle `null` in the topbar.
6. `predictions`/`outcomes` are **not** anon-granted (only `grade_accuracy_by_slug` is). The ops repo reads with the **service-role** key on the **same project** — so it reads them fine. New internal views (`§3`) **GRANT to `service_role` only, never `anon`** — an internal page must not widen exposure to a retrodicted number (guardrail 2).

---

## Pinned contracts (so the 6 parallel planners don't collide)

- **Data access:** server-side only, `lib/supabase.ts` `sb()` pattern, `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`, shared project `jtkdowmrjaxfvwmemxso`. Every reader returns `{ available, <entity> }` and degrades to "signal unavailable" when `sb()` is `null`.
- **One shared module:** every pane extends **`lib/glass.ts`** (created in `§1`). New panes add functions there, not new clients.
- **CSS namespace:** all new classes are `.glass-*` in `app/globals.css`, mirroring `.lb-*` / `.category-*` / `.catnav-*`. Tokens already exist: `--green #4ade80`, `--yellow #fcd34d`, `--red #f87171`, `--teal #2dd4bf`, `--muted #6b8794`, `--text #e2eef2`, `--bg/--bg-raised/--border …`.
- **`§2` OUTPUT CONTRACT (pinned so `§3`/`§4` plan against it):** table `backtest_grades`, columns `slug, as_of_date, predicted_direction, baseline_value, window_end_date, observed_value, grade (hit|miss|partial|neutral), magnitude_error, confidence, grade_method='retrodicted'`; **idempotent on `(slug, as_of_date, grade_method)`**; `GRANT … TO service_role` (mirror `docs/sql/20260601_grade_predictions.sql`); created via psycopg3 + `.dlt/secrets.toml` per RULE 1, row-count verified. Pane 3 reads `backtest_grades` (seed) **and** `outcomes` (live), **never blended into one figure**.
- **Honesty guardrails (break one → the page lies):**
  1. Every `%` carries its `N` — `76% (N=29)`, never `76%`.
  2. **Retrodicted ≠ live** — Pane 3 labels backtest-seed vs live everywhere, never blends.
  3. **No public accuracy number off retrodicted grades** — The Glass is internal; views grant `service_role` only.
  4. **Freshness token** quoted once, verbatim, top of page, from `getMasterHealth().freshnessToken` (handle `null` → "freshness unavailable").
  5. **No invented numbers** — a gap renders "not enough data yet," never a guess.
- **Page primitive:** async Server Component, `export const revalidate = 300`, parallel `Promise.all` fetch — exactly like `app/littlebird/page.tsx`. (Ops has **no test runner** — `npm run build` clean is the gate.)

---

## The sections

| #     | Wave  | Section                                                 | Repo                         | Depends on                                        | What that Claude plans                                                                                                                                                      |
| ----- | ----- | ------------------------------------------------------- | ---------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **1** | Glass shell + Pane 2 "The Calls"                        | `swfldatagulf-ops`           | none                                              | **Execution-ready below.** Ships this session.                                                                                                                              |
| **2** | **1** | Flywheel backtest engine → `backtest_grades` ≥100       | `brain-platform`             | none (Phase 0 first)                              | The as-of grid harness over the **existing** decision-fn/skill-baseline. **Critical path** — Wave 2 is dead without it.                                                     |
| **6** | **1** | **Lift live gradeable-call yield** (NEW)                | `brain-platform`             | none                                              | Raise the rate at which master/leaves emit **falsifiable, gradeable** directional calls — the moat-grower. **Honesty-gated: never manufacture a bet just to be gradeable.** |
| **3** | **2** | Pane 3 "The Scoreboard" (skill-over-time + calibration) | `swfldatagulf-ops` + new SQL | `§2` corpus + live `outcomes`                     | Two read views (`service_role`) + SVG line + reliability scatter (mirror `DonutChart`). Label retrodicted-seed vs live everywhere.                                          |
| **4** | **2** | `data_targets` generator + table                        | `brain-platform`             | grade views (`§2`/live) + `cadence_registry.yaml` | Idempotent migration + nightly GHA applying the DECISION-4 thresholds; upsert ranked rows.                                                                                  |
| **5** | **2** | Pane 4 "Shopping List" + Pane 1 "The Flow"              | `swfldatagulf-ops`           | `§4` (Pane 4 data)                                | Pane 4 renders `data_targets` (reuse `/targets` styling). Pane 1: resolve DECISION 3 (lean strip vs drawn DAG).                                                             |

---

## SECTION 1 — Glass shell + Pane 2 "The Calls" (EXECUTION-READY, Wave 1)

**Outcome:** a live `/glass` page in `swfldatagulf-ops` whose Calls pane renders **every open master call that carries a logged claim** — its conditional claim(s), the why, the falsifier, the deterministic confidence, and what it will be graded against next — with graded calls flipping to a call-vs-reality receipt. Panes 1/3/4 render intentional "ships in Wave N" placeholders. Zero upstream dependencies.

All work is in `C:\Users\ethan\dev\swfldatagulf-ops` — a **separate repo with its own conventions**. **Build Section 1 from a swfldatagulf-ops session** (open Claude in that repo, or `cd` into it): full edit + `npm run dev` + `vercel --prod` access, no brain-platform hooks in the way. The brain-platform path-guard (`.claude/hooks/check-project-path.mjs`) is **not** a restriction on building The Glass and **not** a permission anyone withholds — it only stops a _brain-platform_ session from cross-writing into sibling repos (a blast-radius guard against cross-project contamination). It just means the build happens in the ops repo's own session, which is where ops work belongs anyway. `feedback_no-autonomous-push` applies to ops too — commit, show the diff, wait for explicit OK before any push/deploy (`vercel --prod`).

### Files

- **`app/glass/page.tsx`** (new) — async Server Component, `export const revalidate = 300`. Mirror `app/littlebird/page.tsx`: `Promise.all([ getMasterHealth(), fetchOpenCalls(), fetchGradedCalls() ])`, render the topbar (logo + title + freshness token), then four `.glass-section` blocks. Only Calls is populated; Flow/Scoreboard/Shopping-List render `<GlassPlaceholder section="…" wave={…} />`.
- **`lib/glass.ts`** (new) — shared reader module (extends the `lib/checks.ts`/`lib/goals.ts` idiom). Each function returns `{ available, … }`:
  - `fetchOpenCalls()` →
    `sb.from("predictions").select("id, brain_id, refined_at, conclusion, confidence, prediction_window, conditional_claims, gradeable_slug, baseline_value, predicted_direction, window_end_date, grade_status").in("grade_status", ["gradeable","ungradeable"]).order("refined_at",{ascending:false}).limit(40)`
    **Note the `.in(...)` filter — NOT `.neq("grade_status","graded")`.** The latter pulls the 29 legacy `pending` husks (empty claims, no falsifier) and renders 29 dead cards. Returns `{ available, calls }`.
  - `fetchGradedCalls()` → join outcomes→predictions:
    `sb.from("outcomes").select("predicted_direction, observed_direction, baseline_value, observed_value, direction_correct, error, graded_at, source_url, predictions!inner(brain_id, conclusion, confidence, gradeable_slug, window_end_date, conditional_claims)").order("graded_at",{ascending:false}).limit(20)`. **0 rows today** — verify the FK embed name (`predictions!inner(...)`) against the live schema in step 0; this path is unexercised until the grader resolves a window. Returns `{ available, graded }`.
  - Types: `OpenCall`, `GradedCall`, reusing `ConditionalClaim` (`condition, then_direction, basis, basis_refs, falsifier`).
  - Optional honest footnote helper: a count of `grade_status='pending'` master rows to render "N earlier refines predate claim-logging."
- **`app/glass/calls.tsx`** (new; server by default) — `CallCard`, `ConfidenceBar`, `StatusChip`, `ReceiptGrid`, `GlassPlaceholder`.
- **`app/globals.css`** (edit) — add `.glass-*`: `section`, `section-label`, `call-card`, `glass-confidence-bar` (width-% via `.progress-fill` idiom — **do not import `ProgressBar`**), `glass-chip{.open,.due,.ungradeable,.hit,.miss}`, `glass-receipt` grid, `glass-placeholder`. Copy structure from `.lb-section`/`.lb-card` and `/targets` `.pill`/`.chip`.
- **Nav** (edit) — add `<Link href="/glass" className="catnav-pill catnav-glass">Glass ◊</Link>` to the `.catnav` in `app/page.tsx` (+ a `.catnav-glass` color), and a cross-link on `app/littlebird/page.tsx`.

### Pane 2 rendering spec

One card per **open call that carries a claim** (the `.in(['gradeable','ungradeable'])` set; ~11 today), newest first, cap 40.

- **Header:** `conclusion` + `StatusChip` — `open` · `due soon` (`window_end_date ≤ ~14d`) · `graded ✓/✗`.
- **The call:** each `conditional_claims[]` as `condition → then_direction`.
- **Why:** the claim's `basis` + `basis_refs` as small slug/brain chips.
- **Confidence:** `ConfidenceBar` from `predictions.confidence` (deterministic — bar + the number, never a bare `%`).
- **Falsifier:** the claim's `falsifier`, visually distinct.
- **Graded against next:**
  - `gradeable` rows → `gradeable_slug` + `baseline_value` + `predicted_direction` resolved to the concrete `window_end_date` → "settles by 2026-08-31."
  - **`ungradeable` rows (null slug/date) → "not yet gradeable — no registered numeric driver,"** not a date. (This fires on the current live `mixed` read — handle it day one.)
- **Graded cards → receipt** (`fetchGradedCalls`): two-column `ReceiptGrid` — predicted `baseline_value`/`predicted_direction` vs observed `observed_value`/`observed_direction`, `direction_correct ✓/✗`, `error`, `graded_at`, `source_url` as citation. **Empty today.**
- **Freshness token** verbatim once in the topbar (`getMasterHealth().freshnessToken`; `null` → "freshness unavailable — could not read master health").
- **Empty/degraded:** `available:false` → "signal unavailable"; zero claim-bearing rows → "no calls logged yet." N-stamped throughout. Ensure claim strings render as clean UTF-8 (em-dash/`→` chars).

### Verification (end-to-end)

1. **Step 0 — confirm content + the FK embed.** Read `predictions`/`outcomes` counts (read-only). Expect ~11 claim-bearing master rows + 0 outcomes — already confirmed 2026-06-07, but re-confirm and validate the `outcomes→predictions` embed name used by `fetchGradedCalls`.
2. `npm run dev`; open `/glass`. Confirm: freshness token quoted; ~11 open calls render `condition→then`, basis chips, falsifier, confidence bar, and either a concrete grade-by date OR "not yet gradeable"; **no empty husk cards**; Flow/Scoreboard/Shopping-List show intentional Wave placeholders.
3. Unset `SUPABASE_*` → page still builds, shows "signal unavailable."
4. `npm run build` clean (Next 15.1.6 / React 19 — no type errors; no test runner in ops).
5. Ship (gated): `vercel --prod` after operator review of the diff.

---

## SECTION 2 — Flywheel backtest engine (Wave 1 — CRITICAL PATH)

Turn `flywheel-bootstrap-grades-from-history.md` (+ REVIEW-knobs) into an execution plan. **This is the spine of the whole "getting better" half** — `outcomes=0` and master mostly emits `mixed`, so live grades will stay near-zero for months; the retrodicted corpus is the _only_ fuel Panes 3/4 have. Do not let it lag behind the UI sections.

- **Reuse, don't rebuild** (Corrected-fact 3): `computeBacktestCall`, `computeSkillScore`, `deriveGradeFields`, `grade_prediction`, `resolveGradeConfig` all exist + tested. The one new file is `refinery/tools/flywheel-backtest.mts` (Phase-1 as-of loop + Phase-2 grid runner).
- **Phase 0 first:** lock per-slug grade-config + verdict bands + the naive baseline; lift the `flywheel_backtest_decision_function` HOLD and reconcile the `row_tier_build_remaining` ledger check that carries it (no standalone row to close).
- **Honesty (non-negotiable, from the plan):** backtestable = ALFRED LAUS (`FLLEEC7URN`, `FLCOLL0URN`), immutable LeePA sale-velocity, permit counts. **Excluded (look-ahead) — LISTED not dropped:** ZORI, Census ACS, BLS QCEW, TDT (fixture-only). `grade_method='retrodicted'`, lands in **separate `backtest_grades`** (the pinned contract above) — never in `predictions`/`outcomes`.
- **Grid:** vary as-of per slug (the `computeSkillScore` N-collapse constraint). LAUS quarterly ≈ 70+/series (monthly ≈ 220); ≥30/slug, ≥100 total. Report N always.
- **Output:** `backtest_grades` ≥100 rows; first skill (`lift`) + calibration read; beats-naive y/n. File `flywheel_backtest_grades_corpus` + `flywheel_calibration_read` checks.

---

## SECTION 6 — Lift live gradeable-call yield (NEW, Wave 1)

**Why this section exists:** the live moat is nearly empty _by construction_, not by accident. Only 6 of 40 master predictions were ever `gradeable`; the rest are `mixed` (ungradeable by definition) or cite `brain_id`s instead of numeric slugs. A graded **live** track record is the actual customer-facing moat — the backtest (`§2`) is tuning fuel that, by guardrail 3, can never be quoted publicly. So the highest-leverage non-UI work is raising the **honest** live gradeable-call rate.

**The two yield leaks (audit them first):**

1. **Mixed synthesis** — when the upstream vote doesn't clear the agreement threshold, master returns `mixed` → `predicted_direction=null` → ungradeable (`composeConditionalThesis` / `voteDirection`).
2. **Non-numeric `basis_refs`** — `deriveGradeFields` only grades the **first numeric metric-slug** basis_ref; a directional claim whose refs lead with `brain_id`s is ungradeable.

**Candidate approaches for the planner (pick the smallest honest change):**

- **A — per-upstream / per-slug child calls (highest multiplier):** emit individually-gradeable directional sub-calls (each leaf brain already holds a directional read on numeric slugs) even when the synthesized top-line is `mixed`. Aligns the **live** gradeable-slug universe with `§2`'s retrodicted one. Biggest open question: should leaf brains log their own predictions? Today `predictions-log` is **master-only** — extending it multiplies yield ~22× but expands `predictions` semantics + grading load.
- **B — basis_ref ordering:** make `composeConditionalThesis` lead directional claims with a numeric, registered, gradeable slug so the existing `deriveGradeFields` picks it up — small, surgical.
- **C — REJECTED: lowering the `mixed` agreement threshold.** That manufactures bets to look gradeable. **Hard honesty line: never make a directional call the synthesis doesn't support just to be gradeable.** A `mixed` read is a true read.

**Seams / open questions for the planner:** leaf-level prediction logging (yes/no — the big fork); does each gradeable child call get its own `window_end_date` per `resolveGradeConfig`; how Pane 2 + Pane 3 surface child calls vs the master top-line; coverage of `resolveGradeConfig` over the slugs leaves actually emit. **Out of scope:** any change to The Glass panes (it reads grades; it doesn't make them).

---

## SECTION 3 — Pane 3 "The Scoreboard" (Wave 2)

Plan two read surfaces (new SQL, **`GRANT … TO service_role`**, not `anon`) + two chart primitives:

- **Skill-over-time** — `lift` (`computeSkillScore`) bucketed by month over the grade corpus. DECISION 2 = **both** raw hit-rate and skill-above-naive with a **toggle** (`lift` is the skill number).
- **Calibration** — stated `confidence` bucket (5 bands, REVIEW-knobs DIAL 1) vs actual hit-rate; diagonal = perfect.
- Charts: SVG line + reliability scatter, **no chart lib — mirror `DonutChart` in `app/ui.tsx`** (SVG). Ops has no test runner, so verify visually + `npm run build`.
- **Label retrodicted-seed vs live everywhere; never blend** (guardrails 1–3). Reads `backtest_grades` (seed) + `outcomes` (live). Today: live half = empty (0 outcomes); seed half = whatever `§2` wrote.

---

## SECTION 4 — `data_targets` generator + table (Wave 2)

- Idempotent migration (mirror `docs/sql/20260601_grade_predictions.sql`; psycopg3 per RULE 1; verify row count).
- Nightly GHA generator applying **DECISION-4 thresholds:** low-N `< 30`; low-skill `lift ≤ 0` over `N ≥ 15`; stale `> 2× cadence`; **excluded-but-wanted** seeded from REVIEW-knobs DIAL 2 (ZORI, Census ACS, BLS QCEW, TDT — listed until vintaged). Upsert ranked rows; resolved targets auto-drop as N climbs / source un-stales.
- **Consider an extra trigger from `§6`'s finding:** "falsifiability gap — master/this slug emitting mostly ungradeable calls." (Planner's call; it's the system noticing it isn't making bets.)
- Ships its GHA cron wrapper + `--dry-run` in the same PR (pipeline-freshness standard).

---

## SECTION 5 — Pane 4 "Shopping List" + Pane 1 "The Flow" (Wave 2)

- **Pane 4** renders `data_targets` (reuse `/targets` `.pill`/`.chip`/`.progress-fill` styling — it's the manual precursor; statuses `live`/`building`/`new`/`want`).
- **Pane 1** — resolve DECISION 3: lean three-column strip (counts from GitHub-raw `cadence_registry.yaml` + `brains/*.md` freshness + Supabase `_dlt_loads`, click-to-expand) **vs** drawn DAG (needs a lineage export from brain-platform + `refinery/lib/dag.mts`). Spec leans lean-strip for v1; flag the cross-repo cost of the DAG so the planner weighs it. **Use live counts** (22 brains, etc.), never the spec's illustrative numbers.

---

## Decisions already locked (do not re-litigate)

- **DECISION 1** — The Glass is a **new `/glass` page in the `swfldatagulf-ops` dashboard** — the internal control room that already serves `/littlebird` (master health + checks + reds + session-log), `/checks`, `/goals`, `/targets`, `/coverage`, `/queue`. Its own catnav pill **alongside** those, **not** inside `/littlebird`. Same Supabase project `jtkdowmrjaxfvwmemxso`, so the grade tables are reachable. (A future _public, live-only_ scoreboard is a separate customer-facing surface on the public `brain-platform` site — not this internal page.)
- **DECISION 2** — Pane 3 Y-axis = both raw hit-rate AND skill-above-naive (`lift`), toggle.
- **DECISION 3** — Pane 1 depth deferred to `§5`'s planner (leans lean-strip).
- **DECISION 4** — thresholds as in `§4`.
- **Build order** — superseded by the Wave model in §0.
