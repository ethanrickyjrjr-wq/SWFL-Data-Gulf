# Sourced movement-band + confirm-on-outlier for deliverable numbers

**Date:** 2026-07-05
**Status:** design — brainstormed with operator 2026-07-05; crawl4ai research pass done (RULE 0.4);
architecture corrected after code read (RULE 0.5).
**Extends:** Operation July task **18** (`_AUDIT_AND_ROADMAP/Operation July/18-content-freshness-guards.md`).
**Check:** `sourced_band_number_guard_live_verify`.

---

## Operator decree (the baseline rule — LOCKED 2026-07-05)

> **Whatever the brain says now is right. We base the NEXT email off of what the FIRST email said.**

The baseline a new number is judged against is **the value the previous deliverable in the same
series actually printed** — NOT a lake time-series, NOT a precomputed delta, NOT a second source.
The current brain output is trusted as correct; the guard only asks "did this number move an
implausible distance from what we told this reader last time?"

---

## Problem

A number in a deliverable is checked for **provenance** (exact-anchor gate,
`lib/deliverable/narrative-lint.ts`) and, behind a default-OFF flag, **freshness**
(`lintVerdictFreshness`). Nothing checks whether it is **believable versus the last one we sent**. A
broken join that doubles a home value, or a WAF-403 that collapses a permit count, ships to a
customer as long as it traces to a row. Task 18 as written adds "is it fresh"; it does not add "is
it believable, and what do we do when it's missing."

Two live surfaces make this urgent:

1. **Scheduled sends can't stop to ask a human.** A recipe firing on a cadence must ship a
   defensible number or asterisk it — it cannot block on "confirm this."
2. **Gaps must never ship blank.** Per the four-lane moat, a missing number is filled from the next
   lane (our data → upload → named web → user figure), never blank, never invented.

## Goal

Every number a deliverable prints is compared to **what the previous deliverable in its series
printed for the same metric**, against a **sourced** movement band. In band → ship silently. Out of
band or missing → walk a **fallback ladder** ending in either a real sourced number or an
inference-note-with-asterisk that names its basis and asks the reader to confirm. No silent outlier,
no blank, no invented figure. The band itself is sourced, not invented (§4).

---

## Background — the seams this reuses (verified against code, RULE 0.5)

| Concern | Reality in code | File |
|---|---|---|
| Prior deliverable + its frozen numbers | `deliverables(project_id, items_snapshot, created_at)` — every send stored forever | `docs/sql/20260613_deliverables.sql` |
| Snapshot freeze + number collection | `freezeSnapshot` → `items_snapshot`; `collectSnapshotNumbers` | `lib/deliverable/build.ts:92,187` |
| Metric item shape | `{kind:"metric", label, value}` — a POINT value, **no** delta | `lib/deliverable/build.ts:191` |
| Narrative gate seam (where a new pass hooks) | `gateNarrative` | `lib/deliverable/build.ts:428` |
| Movement mechanism to mirror | `assert_vs_baseline(landed, prior, drop_band, spike_band)` (ingest layer) | `ingest/lib/guards.py:81` |
| Missing/estimated number, with falsifier | `inference_notes` (exempt from exact-anchor; MUST carry `falsifier:` + a cited base) | `lib/deliverable/narrative-lint.ts:352` |

**Two seams the earlier draft wrongly named — corrected here:**

- **The reconcile layer is NOT the home.** `ReconciliationVerdict` compares lane 1 (our lake fact)
  vs lane 2 (a user's-AI assertion) at one instant — `theirs` is always required and
  `delta_pct = (theirs − ours)` is cross-source, not across time (`lib/reconcile/types.ts:67`).
  A band check is ours-now vs ours-prior; it has no "theirs" assertion. It gets its **own** module,
  not a new verdict status.
- **`lookupLakeFact` gives no prior period.** It reads only the current `ParsedBrain`
  (`lib/reconcile/lane1.ts:146`). There is no lake time-series behind it. Per the decree we don't
  need one — the prior value is the previous deliverable's printed value.

---

## Design — the fallback ladder

On build, load the **previous deliverable for this `project_id`** (most recent row with
`created_at <` now; null on the first send). For each `metric` item in the new snapshot, match it by
label/slug to the prior snapshot and resolve in order:

1. **Have it now (trusted) + a prior to compare.** Compute the move `(now − prior)/prior` and check
   it against the sourced band for the metric's family, scaled to the send cadence (§4).
   - **In band** → ship silently.
   - **Out of band** → do NOT silently print. On an interactive build → a confirm affordance. On a
     scheduled send → drop to lane 3 (ship asterisked, flag for review — §5). Never silently ship
     the raw outlier.
2. **First send, or no prior match, or the value is missing.** Fill from the next lane: our data →
   crawl4ai for a responsibly-sourced, cited number (named-web lane). A first send has no prior, so
   it only *establishes* the baseline — no band gate, but every number is nailed down here.
3. **Still nothing found.** Estimate from the prior send's value + the movement of closely-related
   metrics, and print it **only as an inference note**: value + basis + falsifier + explicit "we can
   make mistakes — please confirm." Rides the existing `inference_notes` channel (forced falsifier +
   cited base).

Hard rule, unchanged: lane 3 may **estimate** but never **invent** — the estimate must name its
basis (which prior value, which related metrics), so it is a sourced inference, not a bare number.

---

## The band — sourced, per family, cadence-scaled (§4)

crawl4ai research (05/2026 releases; local, not committed per RULE 0.4) established the published
movement bands. The comparison window is the **send cadence** (weekly recipe → compare over a week;
monthly → over a month), so the band scales to how far apart the two emails are.

**Tier A — a source publishes the realized move for this metric + geo.** realtor.com publishes M/M %
change for count/price/DOM metrics; Zillow publishes home-value and rent moves. Where available,
compare our number's move against the source's own move — the band is the realized market, not a
constant.

**Tier B — no published move; per-family band grounded in published noise.**

| Metric family (our labels) | Grounded band | Source of the band |
|---|---|---|
| Slow prices/values — Median Home Value, Median Asking Rent, Price/SqFt, list/sold medians | ~1% MoM / low-single-digit YoY | Zillow report: home value 0.8% YoY, rent 2.0% YoY |
| Volatile counts — Active Inventory, Homes Sold, New/Commercial Permits, new-listing counts | ±~10–12% MoM is *noise* | Census construction release ± CI: starts ±9.8%, completions ±12.3% |
| Durations — Days on Market | ±~15% (seasonal) | realtor.com DOM M/M (Tier A preferred) |
| Bounded ratios/shares/scores — Sale-to-List, Pending Ratio, Price-Cut Share, Months of Supply, Market Heat / hotness | absolute delta, not ratio (e.g. ±8 pts) | bounded 0–100; a ratio band is meaningless near 0 |
| Structural/annual — household income, Save-Our-Homes Gap, Annual Flood Loss | any monthly move ⇒ confirm | ACS/annual cadence |

Single tweakable table (mirrors `assert_vs_baseline`'s `drop_band`/`spike_band` constants).
"Out of band" = beyond a **confirm multiple** of the family band (placeholder 2.5×), not the band
edge — the edge is "normal," the confirm line is "implausible."

---

## Where it hooks

- **`lib/deliverable/band-guard.ts` (new)** — the family band table + a pure
  `checkBand(nowValue, priorValue, family, cadence) → "ok" | "confirm_outlier"`. Pure, unit-tested
  directly (like `assert_vs_baseline`). Holds both the Tier-A published-move comparator and the
  Tier-B family bands. **No dependency on the reconcile layer.**
- **`lib/deliverable/band-guard.ts` — metric→family map** keyed off the existing signal labels
  (enumerated during design). One table, not per-call heuristics.
- **`lib/deliverable/build.ts`** — after `freezeSnapshot`, load the prior deliverable's snapshot for
  the `project_id`, run `checkBand` over each matched `metric`, and map any `confirm_outlier` to an
  inference note (scheduled) or a confirm affordance (interactive). Flag-gated `BAND_GUARD_ENABLED`
  (default OFF), same dark-ship pattern as `RECONCILE_TTL_GATE_ENABLED`.
- **Prior-deliverable fetch** — `SELECT items_snapshot FROM deliverables WHERE project_id = $1 AND
  created_at < now() ORDER BY created_at DESC LIMIT 1`. Service-role read in the build route.

---

## Scheduled-send behavior (the "can't ask a human" case)

- **First deliverable** of a recipe establishes every number — by finding (lanes 1–2) or, if truly
  absent, an inference note (lane 3). No band gate (no prior). After this the recipe runs on the
  established metric set.
- **A scheduled run that hits `confirm_outlier`** does NOT silently ship the outlier and does NOT
  block the send. It ships the value **as a lane-3 inference note** (value + basis + "please
  confirm") and flags the run for operator review. The number still goes out — asterisked and
  honest — so the cadence is never broken by a lone bad pull.

---

## Not building (YAGNI)

- No lake time-series lookup — the baseline is the prior deliverable's printed value (the decree).
- No new reconcile verdict / no touching the lane-1/lane-2 comparator — a band is a different axis.
- No `movementPct` coupling — the ranked-signal path already carries a YoY delta; that is a possible
  Tier-A cross-check LATER, not a v1 dependency.
- No new mandatory pre-materialization gate — one flag-gated pass on the existing `build.ts` seam
  (RULE 3 C2).
- No per-ZIP hand-tuned bands in v1 — five family bands + the Tier-A comparator.

---

## Done when (live proof)

`sourced_band_number_guard_live_verify` closes when, on a real build with a prior deliverable
present:

1. A metric whose new value is a deliberate outlier vs what the previous deliverable printed (e.g. a
   home value 3× last send) is **NOT** silently printed — it renders as an inference note with basis
   + "please confirm," or trips the interactive confirm affordance.
2. A metric with no prior and no lake value is filled by a **cited crawl** number (lane 2), not left
   blank.
3. A normal in-band number ships unchanged (no false alarm, no spurious asterisk).

All three observed on the running build path, not asserted from code.

---

## Open for writing-plans

- Exact `confirm_outlier` multiple per family (2.5× placeholder — set from the published bands).
- Metric matching across snapshots: by `label` vs a stable slug — labels are display strings and may
  drift; confirm whether `metric` items carry a stable key or matching is label-normalized.
- The interactive "confirm" affordance shape (email-lab surface) — separate from the scheduled-send
  path, which is fully specified above.
