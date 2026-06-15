# Plan C — Reconciliation Engine (AUDITED · DECISION-LOCKED 2026-06-15)

**Status:** planned 2026-06-15 (operator-confirmed — 4 forks locked + live-code review folded in).
**Models:** **OPUS** on the correctness path (C-1 TTL gate, C-2 comparator, C-3 lane bridges, C-4 lint
gate); **SONNET** on the read surface + ship (C-5, C-6). **Depends on:** nothing hard for the
fixture-tested core — **C-1, C-2, C-3 build NOW** against lane-tagged fixtures. **C-4 ships behind a
feature flag, default OFF**, flipped ON only after a full rebuild has stamped `output.expires` on every
brain AND the catalog-gap `not_found` branch is in (it has live deliverable blast radius). The LIVE lane-1
lookup waits on **daily-freshness-system files 01+03** (`refinery/packs/freshness-pulse.mts` UNBUILT);
shares ONE identity (`auth.uid`) + B's `lib/identity/mcp-connected.ts` (UNBUILT). **Stops at:** "a
deterministic reconciliation verdict + a single (flag-gated) build-time gate that refuses to assert a
stale or invented figure, readable via a keyless MCP tool that says 'X verified, Y needs review'." A
verdict UI page, per-account paid-MCP keys, and cross-brain reconciliation are Tier-3 follow-ons.

**Cite symbols, not line numbers — they drift; grep to locate.**

## Why C exists

A and B move numbers two directions: A ships cited payloads OUT (lane 1 — our lake facts), B carries the
user's filed items BACK (lane 2 — what the user's AI asserted). Neither ever asks the honest question:
**does the number the user's AI is asserting still match what we hold, and is it still fresh enough to
assert at all?** C builds lane 3 — the **reconciliation verdict** comparing lane 1 vs lane 2 under a
**hard TTL gate**, surfacing conflicts honestly ("X verified, Y needs review") and — the prime directive
— **never letting the system assert a stale or invented figure.**

## The crux finding (verified in-session — do not re-litigate)

The prime directive — *"forbidden to assert past TTL"* — **has no self-TTL enforcing substrate today.**

- `refinery/lib/confidence.mts` computes `freshnessRatio = max(0, min(1, daysRemaining/ttlDays))` and
  **MULTIPLIES** it into the headline. At refine `daysRemaining === ttlDays` ⇒ ratio is **1.0**; it
  decays only if a caller recomputes with a later instant — **and no live read path ever does.** It
  **never rejects, throws, or zeroes** on a brain's OWN TTL.
- **There IS a partial numeric staleness mechanism, but it is upstream-only and a cap, not a reject:**
  `applyStalenessCap()` in `refinery/stages/4-output.mts` does `Math.min(base, minStaleUpstreamConfidence)`
  when an UPSTREAM is stale. It caps the headline; it never refuses to publish, and it does nothing for a
  brain's own TTL.
- The only staleness *detection* is `brainStatus()` in `refinery/lib/dag.mts` (`stale = Date.now() >
  expiresMs`) — but that gates the **CLI rebuild decision only**, never the published number.
- The master gate confidence floor (`refinery/lib/master-gate.mts`, `MASTER_MIN_PUBLISH_CONFIDENCE`) is
  **0.0 — off day one.**

**Conclusion: C's real first sub-project is the self-TTL HARD reject gate (C-1) — foundational OPUS work,
not a thin reconcile layer.**

## Locked decisions (canonical — do not re-litigate)

1. **TTL home = uniform per-brain `BrainOutput.expires`, stamped at Stage 4.** Compute
   `expires = expiresFor(refined_at, pack.ttl_seconds)` for **every** brain at render time, keyed off the
   already-required per-brain `ttl_seconds` (`refinery/types/pack.mts:79`). The Stage-4 STAMP reads the
   full `PackDefinition`, so it **never fails**. C's gate reads ONE field uniformly:
   `freshnessGate(expires, now)`.
   - **C NEVER reads `cadence_registry.yaml`** — it models *ingest cadence* (`cadence_days` ×
     `tolerance_multiplier`), a different concept from brain-output staleness. Two clean layers:
     ingest-freshness spine = the registry (the daily-freshness plan's domain); brain-output-TTL spine =
     `pack.ttl_seconds` → `output.expires` → C's gate.
   - **`anomaly_flag` ⊥ staleness.** `data_lake.daily_truth.anomaly_flag` is value-plausibility — NOT a
     freshness signal. C reads `!anomaly_flag` rows for plausibility AND applies `freshnessGate` for
     staleness; orthogonal.
2. **De-confliction with daily-freshness-system — COMPOSE, never duplicate.** The daily system PRODUCES;
   C CONSUMES + COMPARES. C does not re-implement its anomaly gate (`engine.py`) or filter. The
   `freshness-pulse` brain stamps `as_of: r.period` (**not** `expires`) — so for daily metrics C derives
   `expires` the same uniform way (its catalog `ttl_seconds: 86400` ⇒ 1-day expiry). One gate, one TTL
   concept, zero duplicated anomaly logic.
3. **EXTEND the enforced narrative-lint artifact — no new mandatory gate** (RULE 3 C2). A new `"ttl"` gate
   in `lib/deliverable/narrative-lint.ts`, injected into the SAME `violations[]` array that
   `lib/deliverable/build.ts`'s regenerate-once-then-hard-strip loop already enforces. **No second gate in
   the build path.** The comparator's deterministic value-withholding is verdict computation, not a second
   censor.
4. **Verbatim-or-fail, ONE normalizer.** Exact match after format-normalization → `verified`; any
   difference → `needs_review` with a delta. C **reuses** `normalizeNumber` (and the newly-exported
   `extractNumbers`) from `lib/deliverable/narrative-lint.ts` — never a parallel normalizer. No tolerance
   band.
5. **ONE identity.** C reuses B's `lib/identity/mcp-connected.ts` (`isMcpConnected(authUid)`) and
   `auth.uid`. No `mcp_account_links`, no parallel scheme, no read-path emit. The keyless `swfl_reconcile`
   tool is anonymous (like `swfl_fetch`); per-user scoping only on the keyed `swfl_project_*` path.
6. **Safe rollout (rebuild-order + catalog-gap + flag).** `output.expires` does not exist today.
   - **(a) Stamp + rebuild first.** Ship the Stage-4 stamp (additive, all brains) and run a FULL rebuild
     so every written output carries `expires` BEFORE any consumer relies on it.
   - **(b) Catalog-gap is `not_found`, never false-stale.** The app-side derivation fallback reads the
     lean `BRAIN_CATALOG` (`refinery/packs/catalog.mts`), which is **KNOWN_INCOMPLETE** (e.g.
     `home-values-swfl`, `investor-zip-swfl` are absent). Resolve via
     `BRAIN_CATALOG.find(e => e.id === report_id)?.ttl_seconds`; if no entry and no stamped `expires` →
     status **`not_found`** ("no TTL basis"), **never `cannot_assert_stale`.**
   - **(c) C-4 behind a flag.** The build-time `"ttl"` gate (C-4) modifies the LIVE strip loop and reads
     LIVE brains — it ships behind a feature flag (`RECONCILE_TTL_GATE_ENABLED`), default **OFF** (no-op),
     flipped ON only after (a) and (b). C-1..C-3 land ahead safely.

## Architecture / flow

```
LANE 1 (our cited lake facts)                LANE 2 (user's-AI assertions)
  loadParsedBrain(report_id) ─┐              ProjectItem{kind:"metric", report_id,
  fetchDetailRow(slug, zip)   │                label, value, freshness_token,
  (try/catch → null)          │                source_url?, metric_slug?}  origin "mcp"|"web"
  → BrainOutput.key_metrics   │                     │   (B carry-back / live web project)
  + C-1: expires ?? derive    │                     │
    (cat=BRAIN_CATALOG.find(   │                    │
       e=>e.id===report_id);   │                    │
     no cat → not_found)       │                     │
                               ▼                     ▼
                   ┌──────────────────────────────────────────┐
                   │ C-2  reconcileMetric(fact|null, assertion)│  ← PURE, fixture-driven,
                   │   1. fact==null             → not_found   │     testable NOW (no B, no daily PR)
                   │   2. expires unresolvable    → not_found   │     (catalog-gap, B2)
                   │   3. freshnessGate(expires) → cannot_assert_stale (withhold value)
                   │   4. grain (asserted finer) → out_of_grain
                   │   5. normalizeNumber compare → verified | needs_review(+delta)
                   └──────────────────────┬───────────────────┘
                                          ▼
                          ReconciliationVerdict (C-2 contract)
       status ∈ { verified | needs_review | cannot_assert_stale | out_of_grain | not_found }
                                          │
              ┌────────────────────────────┴──────────────────────────────┐
              ▼                                                            ▼
   C-4 narrative-lint "ttl" gate  (FLAG-GATED, OFF until rebuild+B2)   C-5 read surface
   (lib/deliverable/narrative-lint.ts + build.ts)                      keyless swfl_reconcile MCP tool
   injects ttl violations into the existing                           + verdict in a deliverable section
   regenerate-once / hard-strip loop = THE SINGLE seam                "X verified, Y needs review"
                                                                       swfl_fetch byte-for-byte untouched
```

## Components

| Unit | Responsibility | Mirror / reuse |
|---|---|---|
| `refinery/lib/freshness.mts` (extend) | `expiresFor(refined_at, ttl_seconds) → ISO`; `freshnessGate(expires, now?) → {fresh, expired, expires_at, days_past?}` (the ONLY reject primitive, fail-closed) | beside `freshnessToken`/`LAKE_ID`; math mirrors `dag.mts:brainStatus` but REJECTS |
| `BrainOutput.expires` + `.ttl_seconds` | per-brain TTL stamped at Stage 4 for every brain (stamp reads required `pack.ttl_seconds`) | `refined_at` stamping in `refinery/stages/4-output.mts` |
| `lib/reconcile/types.ts` | `ReconciliationVerdict`, `LaneOneFact`, `LaneTwoAssertion` (lane-tagged) | `lib/project/items.ts` ProjectItem shape |
| `lib/reconcile/reconcile.ts` | `reconcileMetric()` — pure comparator (null→stale→grain→value); suppresses `fresher_side` when value withheld | `normalizeNumber` + exported `extractNumbers` from `narrative-lint.ts` (reused, not forked) |
| `lib/reconcile/slug-map.ts` + `lane1.ts` + `lane2.ts` | label→slug resolve (ambiguous → `not_found`); live lookup (`BRAIN_CATALOG.find`, derivation fallback, `fetchDetailRow` try/catch, phantom guard); ProjectItem → assertion | `loadParsedBrain`/`fetchDetailRow` (`lib/fetch-brain.ts`), `projectItemSchema`, `BRAIN_CATALOG` |
| narrative-lint `"ttl"` gate (flag-gated) | inject stale/unsourced verdict violations into the existing `violations[]` | `lib/deliverable/narrative-lint.ts` `Gate` union + `build.ts` loop |
| keyless `swfl_reconcile` MCP tool | read-only verdict surface; "X verified, Y needs review" | `swfl_fetch` read pattern in `app/api/mcp/*` |

## Invariants (must hold — checked in C-6)

- **No assertion past TTL.** `expires < now` → `cannot_assert_stale`; the number is withheld; the surface
  offers a re-pull (RULE 3 GRAIN: "a gap = offer to pull, never invent").
- **Catalog gap ≠ stale.** A `report_id` absent from `BRAIN_CATALOG` with no stamped `expires` →
  `not_found` ("no TTL basis"), **never** `cannot_assert_stale`. (`cannot_assert_stale` means "held but
  expired", only.) The comparator tests `expires === undefined` (truly no basis), **not** `!expires` — a
  present-but-corrupt stamped value falls through to the gate and fail-closes to `cannot_assert_stale` (R1).
- **No invention below grain.** Lane-2 finer than lane-1 (parcel vs ZIP) → `out_of_grain`; never fabricate.
- **One enforcement seam.** The flag-gated narrative-lint `"ttl"` gate is the only thing that
  strips/refuses a number from customer prose. The comparator withholds deterministically; no second
  materialization gate (RULE 3 C2).
- **Verbatim-or-fail, one normalizer.** Reuse `normalizeNumber`/`extractNumbers` from `narrative-lint.ts`;
  no band; no fork.
- **Never throws across the lane boundary.** `loadParsedBrain` is null-resilient; `fetchDetailRow` is
  wrapped in try/catch → `null`. A missing/invalid brain → `not_found`, never a crash.
- **Verdict cites both sides.** `verified`/`needs_review` carry the lake slug + `source` receipt AND the
  assertion's value + `freshness_token`/`source_url`. `fresher_side` is `"unknown"` whenever `ours.value`
  is withheld.
- **One identity.** Per-user scoping uses `auth.uid` via `isMcpConnected`; no new table; no read-path emit.
- **`swfl_fetch` and the daily `engine.py` are byte-for-byte untouched** by C.
- **Fail-closed, never fail-open** — an unparseable stamped `expires` is treated as expired; `expiresFor`
  returns `undefined` (not a thrown `RangeError`) on a corrupt `refined_at` (R2).

## Task index

| File | Task | Model |
|---|---|---|
| `task-1-expires-stamp-and-gate.md` | `expiresFor` + `freshnessGate` in `freshness.mts`; stamp `BrainOutput.expires` at Stage 4 (additive, all brains) + full rebuild | **OPUS** |
| `task-2-reconcile-comparator.md` | pure `reconcileMetric()` + verdict contract (incl. catalog-gap `not_found`) + slug policy + lane-tagged fixtures | **OPUS** |
| `task-3-lane-bridges.md` | `resolveMetricSlug` + `lookupLakeFact` (`BRAIN_CATALOG.find`, derivation fallback, `fetchDetailRow` try/catch, phantom guard) + `toAssertion`; optional `metric_slug?` | **OPUS** |
| `task-4-narrative-lint-ttl-gate.md` | `export extractNumbers`; add `"ttl"` gate + `build.ts` injection behind `RECONCILE_TTL_GATE_ENABLED` (OFF) | **OPUS** |
| `task-5-read-surface.md` | keyless read-only `swfl_reconcile` MCP tool + verdict in a deliverable section | SONNET |
| `task-6-tests-and-ship.md` | integration tests, green build, full rebuild, flag-flip step, ledgers, ship (operator-approved) | SONNET |

## Tier-3 follow-ons (named, OUT of C)

- **Per-account paid-MCP bearer keys** (`app/api/mcp/auth.ts` is one shared `MCP_BEARER_TOKEN` today).
- **A verdict UI page** (`/reconcile/[id]` or a Briefcase panel). C ships the verdict object + text/MCP
  surface only.
- **Cross-brain reconciliation** (one assertion vs many brains) — C does single-brain.
- **Auto-re-pull on `cannot_assert_stale`** — C *offers* it; wiring the refresh trigger is follow-on.

## Verification (end-to-end — when C is built)

1. `bun test` green (FULL suite — subset runs hit the `mock.module` SYNTHESIS_MODEL footgun); `tsc`;
   `eslint`; `bun run build` clean.
2. **C-1 alone:** `expiresFor("2026-05-01T00:00:00Z", 86400*35) === "2026-06-05T00:00:00Z"`;
   `freshnessGate` past → `{expired:true}`, future → `{fresh:true}`, garbage → `{expired:true}`. A built
   fixture brain's `BrainOutput.expires === expiresFor(refined_at, ttl_seconds)`; existing
   confidence/caveat output byte-identical. **Full rebuild done before any consumer relies on `expires`.**
3. **C-2 fixtures (NO B, NO daily brain):** `verified`, `needs_review` (+`delta_pct`), `cannot_assert_stale`
   (no value leaked, `fresher_side:"unknown"`), `out_of_grain`, `not_found` (slug missing/ambiguous AND
   **uncataloged-brain/no-TTL-basis** — distinct from stale). Determinism: fixed `now` → byte-identical.
4. **C-3:** `BRAIN_CATALOG.find` resolves cataloged brains; an uncataloged `report_id` → `not_found`;
   `fetchDetailRow` on a bad slug → `null` (no throw); per-ZIP path returns the row's value.
5. **C-4 (flag ON, in a test):** stale/unsourced verdict prose → one `"ttl"` violation → regenerate →
   hard-strip; clean verdict → passes five gates; **flag OFF → build.ts byte-identical to today.**
6. **Daily de-confliction:** an `anomaly_flag=true` row never reaches a verdict; C reads only `!anomaly_flag`
   AND still applies `freshnessGate`.
7. **Phantom-data guard:** the post-landing check proves lane-1 reads the LIVE `freshness-pulse` brain, not
   a silent fixture fallback while citing live.
8. **Identity:** keyless `swfl_reconcile` is anonymous; any per-user scoping calls
   `isMcpConnected(auth.uid)`; no new table; `swfl_fetch` diff = empty.
