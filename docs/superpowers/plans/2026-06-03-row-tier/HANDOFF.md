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

3. **R6 citation-provenance guard** _(Sonnet — this is a BUILD, verified gap)_
   - `refinery/lib/citation-url.mts` `buildSourceCitationUrl` swaps page-origin via `NEXT_PUBLIC_SITE_URL` but never branches on build-mode. Thread the build-mode (`REFINERY_SOURCE` / the refinery's `env.source`) into citation emission: a **non-live** build must not emit a live-provenance `/r/source/[table]` citation (omit the live URL or stamp the vintage). Add a test in `refinery/lib/citation-url.test.mts` pinning "fixture build → no live citation."

4. **CLAUDE.md policy C1 + C2** _(Opus authors the wording)_ — land in the **same commit** as the R8 hook.
   - **C1 (working agreement):** architecture-level claims get a code audit **always**; an adversarial web-refutation pass **only** when the claim imports an outside best-practice (new storage tier / new mandatory gate / any "X is the spine / the one primitive"). Eloquence is not evidence.
   - **C2 (standing refusal, SCOPED):** "Extend the enforced artifact you already have; never erect a new mandatory pre-materialization gate — this applies to **data-pipeline gates and mandatory pre-materialization schema constraints**, NOT the agent's own behavioral guardrails (the R8 path-guard hook is explicitly in-bounds)."

**Do NOT lock R1/R2/R3/R7 into CLAUDE.md.** R1/R2/R3 graduate to code with the row-tier machinery; R7 already exists (`inference-bait-lint`). Locking them now recreates the rotting-marker drift Phase 0 cleaned out.

---

## Track A — Full classifier sweep / audit (the row-tier on-ramp) 🔴

This is plan phase **P2**. Run `resolveGradeConfig` across the whole lake and produce, per slug, a three-column ledger:

1. **row vs brain** — `gradeable === false` → row-tier candidate; `true` → brain.
2. **moat-fuel backlog** — slugs ungradeable **only** for a missing `direction_polarity` (everything else qualifies). These are the cheapest predictions to make gradeable.
3. **backtestable inventory** — read each slug's `vintage_policy` from `cadence_registry` (see Track B gate 1): `append_asof` / revision-stable source → backtestable; `overwrite` → contaminated, not backtestable until vintages are recovered.

Then author the row-tier spec (schema with **no free-text column** — numeric/enum/identifier only; materialize as a precomputed artifact served through the `lib/fetch-brain.ts` disk choke point, not a live-DB read). **A second Opus agent adversarially refutes the spec before it's blessed** (C1). Then P3–P6 per `README.md`.

Model split: the sweep itself is mechanical (⚪/🔵); the row/brain semantics, schema design, and adversarial refutation are 🔴.

---

## Track B — Flywheel backward-engine (fastest path to a non-empty moat) 🔴

The backtest. **Gated entirely on point-in-time honesty** (README § two engines). Steps:

1. **Inventory backtestable slugs** — overlaps Track A column 3. A slug is backtestable iff its as-of-then value is recoverable (revision-stable source archive, or retained vintages). Where pipelines `overwrite`, the vintage is gone — flag those as "recover vintages first" or skip. **This is the make-or-break gate; do it honestly or the whole track is fool's gold.**
2. **Deterministic retrodiction harness** _(Sonnet to spec; Opus designs the look-ahead guard)_ — no LLM. For each backtestable slug × each past period: reconstruct (as-of-then baseline + window + the slug's polarity rule) → the direction the system _would_ have predicted → grade against the known later outcome via the existing `grade_prediction()` machinery. Seeds `grade_accuracy_by_slug` with real N today.
3. **Pre-register the event catalog** _(Opus designs; the selection bias is the trap)_ — every past store opening (permits), interchange (FDOT), rate hike (Fed), Hurricane Ian (Sept 2022). Register the **full** catalog before grading; grade ALL of it, duds included.
4. **Report** real N + direction-hit rate, with the contamination caveats stated (which slugs are clean-vintaged vs revised-only).
5. **Defer** the rich version (re-run the master pack against a point-in-time lake snapshot to backtest its _conditional_ calls, not just the deterministic signal) until the deterministic version proves the machinery.

---

## Recommended sequence

**Step 0 → Track A's sweep (it produces Track B's input inventory for free) → decide how far to push Track B.** They are not either/or at the foundation; the sweep is the shared spine.

**Token discipline:** Step 0 items 1–3 + Track B harness are Sonnet to a written spec. Opus reserved for: C1 wording, the row/brain schema semantics, the look-ahead-bias + event-catalog design, and the adversarial refutation pass. That keeps Opus at ~20–25% of spend.
