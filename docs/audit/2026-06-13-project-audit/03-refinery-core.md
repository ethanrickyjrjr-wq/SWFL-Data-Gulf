# Refinery core — stages 1-4 + DAG / freshness / confidence / master-gate

**Health: mostly-ok.** The engine's structural invariants are honored well: thin-pipe is enforced through a single OUTPUT-block parser (`brain-output-reader.mts`), cycle detection is correct three-color DFS, the `--resilient` exit-code semantics (deterministic=loud exit 1, transient=quiet exit 2, master-built-but-unwritten=exit 1) are implemented and well-tested, validators gate writes before the `.md` lands, and the silent-master-freeze watchdog is a genuinely independent ground-truth backstop. The notable problems are: (1) master's conclusion **prose** confidence is computed with the LEGACY multiplicative formula while Stage 4 publishes the NEW weighted-mean — they no longer match, contradicting the in-code comment; and (2) a degraded-but-not-stale upstream silently bypasses the confidence cap even though its confidence was already folded into the cap floor. Both are real correctness/honesty gaps, not cosmetic.

---

## [HIGH] master conclusion prose confidence uses the LEGACY formula; published confidence uses the NEW weighted-mean — they disagree

Location: `refinery/packs/master.mts:136-157` (`computeConfidence` → `composeConclusion`) vs `refinery/stages/4-output.mts:427-437` (`trustTierWeightedConfidence`)

Detail: Lane 1A (`645e426`) hard-cut the published headline confidence formula from the legacy multiplicative cap `self × avg(upstream_conf)` (`computeConfidence`) to a trust-tier-weighted mean (`trustTierWeightedConfidence`). Stage 4 stamps the weighted-mean value into `BrainOutput.confidence`. But `master.mts` still calls the **legacy** `computeConfidence` and passes its result into `composeConclusion`, which renders `Combined confidence ${confidence.toFixed(2)}` verbatim into the conclusion **prose** (`synth.mts:310-312`). Stage 4 takes `distilled.conclusion` verbatim and does NOT reconcile it. For any brain with upstreams — master has ~all of them — the two formulas produce different numbers (that divergence is the entire stated rationale for Lane 1A: e.g. seven 0.9s + one 0.3 → legacy cap 0.39 vs weighted mean much higher). So master's narrative says "Combined confidence 0.39" while the published `confidence` field reads (say) 0.81. The in-code comment at `master.mts:136-139` ("recomputed by Stage 4 against the same inputs ... so composeConclusion's stamped value matches the engine value ... zero risk") is now FALSE. This violates the consumption contract (numbers in prose must equal the audited values) and is exactly the kind of self-contradiction the no-smoothing/citation rules exist to prevent. `computeConfidence` is dead everywhere else (only `master.mts` calls it).

Fix: Stop computing a second confidence in `master.mts`. Either (a) compute the headline number once in the engine and have Stage 4 inject the final `confidence` into the conclusion template (re-template the "Combined confidence" clause in Stage 4 after the weighted-mean is known), or (b) have `master.mts` call `trustTierWeightedConfidence` with the same args Stage 4 uses so the stamped prose matches. Option (a) is cleaner — the producer should not duplicate engine math at all. Then delete `computeConfidence` (and its test) or relabel it explicitly as the `joint_integrity` diagnostic only.

Model: opus — touches the deterministic-math vs prose boundary and the published-confidence invariant; requires deciding where the single source of truth for the headline lives.

---

## [MEDIUM] Degraded-but-not-stale upstream lowers the cap floor but the cap is never applied (dead floor / missed cap)

Location: `refinery/stages/4-output.mts:208-216` (degraded branch lowers `minCappedUpstreamConfidence`) + `:247-254` (`applyStalenessCap` gates only on `stalenessCaveats.length`)

Detail: In `harvestUpstreams`, a degraded upstream (failed rebuild, serving last-good — added to `degradedIds`) lowers `minCappedUpstreamConfidence` (line 215), the same variable a stale upstream lowers. That variable is returned as `minStaleUpstreamConfidence` and fed to `applyStalenessCap` at line 433. But `applyStalenessCap` only applies the cap when `stalenessCaveats.length > 0` (line 252). A degraded upstream whose last-good is still within its own TTL is `status.kind === "fresh"` (degraded ≠ stale), so it produces a degradation caveat but NO staleness caveat. Result: its (lower) confidence is folded into the floor, then the floor is silently discarded — the downstream headline is NOT capped by the degraded input it is actually leaning on. Either the cap SHOULD fire for degraded inputs (then this is a correctness bug: master can report a confident headline while serving a stale fallback for a critical input), or it should NOT (then lowering the floor for degraded upstreams at line 215 is dead, misleading code and the variable name conflates two concepts). The test suite only exercises the stale path (`stale-upstream-cascade.test.mts`), so this gap is uncovered.

Fix: Decide the intended semantics. If degraded inputs should cap (recommended — a last-good fallback is at least as uncertain as a stale read), gate `applyStalenessCap` on `stalenessCaveats.length > 0 || degradationCaveats.length > 0` and rename `minStaleUpstreamConfidence` → `minCappedUpstreamConfidence` end-to-end. If they should not, remove the line-215 `Math.min` so the floor reflects only stale upstreams. Add a test for the degraded-but-fresh case either way.

Model: opus — confidence-propagation invariant under degradation; the right answer interacts with the resilience design (does last-good cap the headline?).

---

## [MEDIUM] Default outputProducer emits `value: 0` placeholder metrics that get logged to `metric_observations` as real zeros

Location: `refinery/stages/4-output.mts:279-315` (`defaultOutputProducer`, `value: 0`) → `:684` (`logMetricObservations`) → `refinery/lib/metric-observations-log.mts:42-52`

Detail: When a pack omits `outputProducer`, the default lifts every `topic: "metric:*"` fact into a key_metric with a hardcoded `value: 0` and `direction: "stable"` (the comment admits it's a placeholder). Stage 4 then unconditionally calls `logMetricObservations`, which snapshots every NUMERIC key_metric to the `metric_observations` Supabase table — and `0` is numeric and finite, so it passes the `Number.isFinite` filter. The deterministic grader (Goal 9) reads window-end values from that table. A pack shipped without an `outputProducer` would therefore pollute the grading substrate with fabricated `0` observations under real slug names — a "system invented a number" violation laundered through telemetry. Today all live packs define an `outputProducer`, so this is latent, not active — but nothing prevents a new pack author from forgetting it, and the failure is silent (GREEN build, poisoned grader).

Fix: In `defaultOutputProducer`, either omit `value` entirely / set it to a sentinel the metric-observations builder skips, or have `buildMetricObservationRows` skip metrics carrying a `placeholder` flag. Better: gate `logMetricObservations` so default-producer placeholder metrics never reach it. Also consider a registry invariant (config/packs.mts load-time check) requiring `outputProducer` on any pack that emits `topic:metric:*` facts.

Model: sonnet — well-specified: add a skip flag / sentinel and a guard; low ambiguity.

---

## [LOW] `RANGE_NOT_SATISFIABLE` EOF handling only matches a PostgREST error *code*, not an HTTP 416 thrown by the client

Location: `refinery/lib/paginate.mts:78-83`

Detail: The docstring (lines 18-21) promises that an out-of-bounds `.range()` answered as a 416 / PGRST103 is treated as clean end-of-data "defensive against config drift." But the implementation only inspects `res.error.code === "PGRST103"`. If a PostgREST/Supabase config answers an out-of-bounds range by *rejecting the promise* (HTTP 416 surfaced as a thrown error rather than `{error}` in the resolved value), or with a different error code, `selectAllPaged` throws instead of breaking cleanly. The "exact multiple of pageSize" boundary is the trigger: the loop only breaks on a short page or this specific code, so a table whose row count is an exact multiple of 1000 relies on the next (empty/erroring) page being handled. The probed-live behavior (`{data:[], error:null}`) is fine, but the documented 416 fallback is not actually exercised for the thrown-error shape.

Fix: Wrap the `await q.range(...)` in a try/catch (or inspect a thrown error's status/message for 416 / "Range Not Satisfiable") and treat that as EOF too, matching the docstring's stated guarantee. Add a test for the thrown-416 shape.

Model: sonnet — mechanical defensive hardening with a clear contract.

---

## [LOW] Resilient walk calls `brainStatus` redundantly per upstream (3+ disk reads of the same `.md`); harmless but masks intent

Location: `refinery/cli.mts:285-335` (per-upstream `brainStatus`), `:391-395` (re-reads every upstream's status for master's stale check), `refinery/stages/4-output.mts:184-187` (`harvestUpstreams` reads each upstream `.md` again)

Detail: In a single resilient master build, each upstream `brains/{id}.md` is read by `brainStatus` in the build loop, then read AGAIN in the master upstream-refined-at gather loop, then read AGAIN (both `readBrainOutput` and `brainStatus`) inside `harvestUpstreams`. For ~15 critical upstreams that's ~45+ synchronous file reads of files that did not change between reads within one process. No correctness bug (single-threaded, files stable mid-run), but it is wasted I/O and, more importantly, the duplicated freshness reads make it easy for a future edit to update one read site and not the others, creating a freshness-classification skew between the gate decision and the harvest. There is no shared per-run cache.

Fix: Read each brain's status/output once per run into a `Map<brainId, {status, read}>` and thread it through the master stale-check and `harvestUpstreams`. Low priority; do it the next time this path is touched.

Model: sonnet — straightforward memoization refactor, but verify no test asserts on read counts.

---

## [LOW] `freshnessRatio` is always 1.0 at refine time, so published confidence never reflects how close a brain is to expiry

Location: `refinery/lib/confidence.mts:96-101` (`daysBetween(refined_at, refined_at)` ⇒ 0) and `refinery/lib/confidence.mts:274-280` (weighted-mean version: `refresh_at ?? refined_at` ⇒ elapsed 0)

Detail: Both confidence functions compute `freshnessRatio` against `refined_at` measured AT `refined_at`, so elapsed is always 0 and the ratio is always exactly 1.0 for the stamped value. This is documented as intentional ("the at-refine value"), and downstream readers *could* recompute AS-OF-now via the `refresh_at` escape hatch — but nothing in the live read path (`/api/b`, MCP) actually does. Net effect: a brain one hour from TTL expiry publishes the same confidence as one freshly built, and the freshness decay the formula advertises is never observed by any consumer. The freshness signal that DOES reach consumers is the separate `freshness_token` + stale caveat, so this isn't a data-integrity hole — but the elaborate freshness-ratio math in the confidence formula is effectively inert.

Fix: Either (a) accept it and simplify the comment to say "freshness_ratio is structurally 1.0 at stamp time; decay lives in the freshness_token / stale-cascade, not in confidence," or (b) if AS-OF-now confidence is actually wanted, recompute at read time in the API/MCP layer using the `refresh_at` hatch. Decide intentionally rather than leaving live-looking decay code that never decays.

Model: opus — small code, but the decision (does published confidence decay or not?) is a product/semantics call that touches the read path.

---

## [NIT] Dead `.filter((entry) => entry !== undefined)` on `degraded_inputs`

Location: `refinery/stages/4-output.mts:528-537`

Detail: The `.map(...)` immediately above always returns a defined object literal `{ label, date }`, so the trailing `.filter((entry) => entry !== undefined)` can never drop anything. Dead defensive code — harmless but misleading (implies the map can produce holes).

Fix: Remove the filter, or replace it with the real guard it presumably intended (e.g. filter out ids whose `PACKS[id]` is missing BEFORE building the entry).

Model: sonnet — trivial cleanup.
