# Opus Handoff — Row Tier + Flywheel (filed 2026-06-03)

**Read first:** this folder's `README.md` (the plan + Phase-0 audit + rule disposition + the two-engine flywheel reframe), `docs/THE-GOAL.md` (the three tiers), `CLAUDE.md` RULE 0–2 (the session loop). **Verify every "shipped" claim against `git` + code before trusting it** — Phase 0 found all drift is doc-lags-code, but verify anyway; that discipline is the whole point.

Three things were verified in-session 2026-06-03 (don't re-verify, but know the result):

- **R8 hook slot is real** — `.claude/settings.json` already wires `PreToolUse` gates; a `PreToolUse:Edit|Write` hook is a genuine registered slot.
- **R6 is a real GAP** — `buildSourceCitationUrl` does not branch on build-mode; a fixture build emits a live-looking citation. This is a build, not a verify.
- **A8 (`master-gate.mts`) shipped + wired + tested** — Phase-4 circuit breaker is live; its plan-doc header was stale (flipped this session).

---

## Step 0 — Lock the gate (SHARED — do this first on either track)

The only genuinely mechanizable lock-now items. These are CODE/POLICY, not prose. Land them as **one commit** (the C2 carve-out must ship with the R8 hook).

1. **R8 path-guard hook** _(Sonnet to this spec)_
   - Create `.claude/hooks/check-project-path.mjs`: read the `PreToolUse` payload from stdin (`tool_input.file_path`), resolve it, and **deny** (the deny convention used by `.claude/hooks/check-prepush-gate.mjs` — match its exit-code / JSON output exactly) when the path is outside the brain-platform repo root. Allow when inside.
   - Register in `.claude/settings.json` under `PreToolUse` with `matcher: "Edit|Write"` (that matcher is already proven in the `PostToolUse` block).
   - Smoke: attempt an Edit on a path outside the repo → must be denied; inside → allowed.

2. **R4 polarity assertion** _(Sonnet)_
   - Add to `refinery/tools/check-vocab-coverage.mts`: assert **no gradeable slug inherits `direction_polarity`** (every gradeable slug declares it explicitly). Already the runtime behavior (`resolveGradeConfig` → ungradeable if none) — this pins it so a future multi-metric vote can't regress to a category default. cre-swfl polarity-flip is the why.

3. **R6 citation-provenance guard — ✅ SHIPPED 2026-06-03 (not a remaining task).**
   - `buildSourceCitationUrl` now branches on `env.source`: a fixture build returns a `synthetic fixture` sentinel string instead of a live `/r/source/[table]` URL, so the existing Stage-4 fixture-sentinel gate hard-fails any live build that lifts it. Test pinned in `refinery/lib/citation-url.test.mts` (9 citation + 111 source tests green; live mode byte-identical). Left here only as the record of what the lock-now batch contained.

4. **CLAUDE.md policy C1 + C2** _(Opus authors the wording)_ — land in the **same commit** as the R8 hook.
   - **C1 (working agreement):** architecture-level claims get a code audit **always**; an adversarial web-refutation pass **only** when the claim imports an outside best-practice (new storage tier / new mandatory gate / any "X is the spine / the one primitive"). Eloquence is not evidence.
   - **C2 (standing refusal, SCOPED):** "Extend the enforced artifact you already have; never erect a new mandatory pre-materialization gate — this applies to **data-pipeline gates and mandatory pre-materialization schema constraints**, NOT the agent's own behavioral guardrails (the R8 path-guard hook is explicitly in-bounds)."

**Do NOT lock R1/R2/R3/R7 into CLAUDE.md.** R1/R2/R3 graduate to code with the row-tier machinery; R7 already exists (`inference-bait-lint`). Locking them now recreates the rotting-marker drift Phase 0 cleaned out.

---

## Track A — Full classifier sweep / audit (the row-tier on-ramp) 🔴

This is plan phase **P2**. **Pre-sweep dependency — ✅ DONE 2026-06-04.** `vintage_policy` audit complete: `docs/littlebird-notes/2026-06-04.md`. Key findings: **11 clean gradeable slugs** (3 SBA loan outcomes + 7 TDT hospitality + 1 LeePA sales velocity z-score — all immutable individual-record sources). 5 dirty (3 BLS LAUS revised-aggregate + 2 Zillow ZORI revised-aggregate). 5 licenses slugs gradeable-in-theory but pipeline not yet running. Gate verdict: **somewhere between** (~11 = modest boost, not moat-fuel). The `laus_lee_unemployment_rate` forward-flywheel slug is in the dirty bucket — needs `append_asof` before Track B can use it. Full table + LAUS note in the doc above.

Then run `resolveGradeConfig` across the whole lake → per slug, a three-column ledger:

1. **row vs brain** — `gradeable === false` → row-tier candidate; `true` → brain. _(from `resolveGradeConfig` alone — no vintage dependency.)_
2. **moat-fuel backlog** — slugs ungradeable **only** for a missing `direction_polarity`. The cheapest predictions to make gradeable. _(also vintage-independent.)_
3. **backtestable inventory** — from the `vintage_policy` audit above: immutable-record / vintaged → backtestable; revised-aggregate without retained vintages → contaminated. **The count here is the go/no-go on Track B** (≈8 clean = modest boost; ≈80 = moat-builder).

Then author the row-tier spec (schema with **no free-text column** — numeric/enum/identifier only; materialize as a precomputed artifact served through the `lib/fetch-brain.ts` disk choke point, not a live-DB read). **A second Opus agent adversarially refutes the spec before it's blessed** (C1). Then P3–P6 per `README.md`.

Model split: the sweep itself is mechanical (⚪/🔵); the row/brain semantics, schema design, and adversarial refutation are 🔴.

---

## Track B — Flywheel backward-engine (fastest path to a non-empty moat) 🔴

The backtest. **Gated entirely on point-in-time honesty** (README § two engines). Steps:

1. **Inventory backtestable slugs = Track A's `vintage_policy` audit** (don't duplicate it). A slug is backtestable iff its as-of-then value is recoverable: immutable records (sales/claims/permits) are clean by nature; revised aggregates are clean only with retained vintages. **The clean-corpus count is the make-or-break, size-the-prize gate — get it before building anything else, or the whole track is fool's gold.**
2. **Deterministic retrodiction harness** _(Sonnet to spec; Opus designs the look-ahead guard)_ — no LLM. For each backtestable slug × each past period: reconstruct (as-of-then baseline + window + the slug's polarity rule) → the direction the system _would_ have predicted → grade against the known later outcome via the existing `grade_prediction()` machinery. Seeds `grade_accuracy_by_slug` with real N today.
3. **Pre-register the event catalog — a mechanical two-phase gate, not a discipline note** _(Opus designs)_. Phase 1: enumerate the full event list from source data (store openings from permits, interchanges from FDOT, rate hikes from the Fed, Hurricane Ian Sept-2022) → write a **committed, content-hashed manifest**, never reading outcomes. Phase 2: outcome lookup + grading refuses to run unless pointed at a frozen manifest, and **stamps the manifest hash into every graded outcome** so "registered before looked-up" is provable. Grade ALL of it, duds included.
4. **Report** real N + direction-hit rate, with the contamination caveats stated (which slugs are clean-vintaged vs revised-only).
5. **Defer** the rich version (re-run the master pack against a point-in-time lake snapshot to backtest its _conditional_ calls, not just the deterministic signal) until the deterministic version proves the machinery.

---

## Recommended sequence

**Step 0 (R8 hook + R4 assertion + C1/C2; R6 already shipped) → ~~populate `vintage_policy` (pre-sweep dependency)~~ ✅ DONE → Track A's sweep → read the clean-corpus count → decide how far to push Track B.** Not either/or at the foundation; the sweep is the shared spine. Vintage policy audit landed 2026-06-04: 11 clean slugs, LAUS dirty. Next: Step 0 code (R8 hook + R4 assertion + C1/C2) and then the full Track A `resolveGradeConfig` sweep.

**Token discipline:** Step 0 items 1–2 + the Track B harness are Sonnet to a written spec. Opus reserved for: C1 wording, the row/brain schema semantics, the look-ahead-bias + event-catalog design, and the adversarial refutation pass. That keeps Opus at ~20–25% of spend.
