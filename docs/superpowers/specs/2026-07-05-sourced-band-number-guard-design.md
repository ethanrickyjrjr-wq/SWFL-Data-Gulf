# Sourced movement-band + confirm-on-outlier for deliverable numbers

**Date:** 2026-07-05
**Status:** design — brainstormed with operator 2026-07-05; crawl4ai research pass done (RULE 0.4).
**Extends:** Operation July task **18** (`_AUDIT_AND_ROADMAP/Operation July/18-content-freshness-guards.md`).
**Check:** `sourced_band_number_guard_live_verify`.

---

## Problem

A number that lands in a deliverable is only checked for **provenance** (does it come from a real
filed source — `lib/deliverable/narrative-lint.ts` exact-anchor gate) and, behind a default-OFF
flag, for **freshness** (is it past its TTL — `lintVerdictFreshness`). Nothing checks whether the
number is **believable relative to the last one**. So a bad pull — a ZHVI that doubled because a
join broke, a permit count that collapsed because a county WAF-403'd — sails into a customer email
as long as it traces to *a* row. Task 18 as written only adds "is it fresh"; it does not add "is it
believable, and what do we do when it's missing."

Two live surfaces make this urgent:

1. **Scheduled sends can't stop to ask a human.** A recipe firing on a cadence must either ship a
   defensible number or hold — it cannot block on "confirm this."
2. **Gaps must never ship blank.** Per the four-lane moat, a missing number is filled from the next
   lane (our data → upload → named web → user figure), never left empty and never invented.

## Goal

Every number a deliverable prints passes a **sourced movement band** vs. its own prior value. In
band → ship silently. Out of band or missing → walk a **fallback ladder** that ends in either a
real sourced number or an inference-note-with-asterisk that names its basis and asks the reader to
confirm. No silent outlier, no blank, no invented figure.

The tolerance band itself obeys the moat: it is **sourced, not invented** (see §4).

---

## Background — the seams this reuses (do NOT rebuild)

| Concern | Existing seam | File |
|---|---|---|
| Movement band (collapse/spike vs prior) | `assert_vs_baseline(landed, prior, drop_band=0.5, spike_band=5.0)` | `ingest/lib/guards.py:81` |
| Per-metric provenance / no-invention | `lintDeliverableNarrative` exact-anchor gate | `lib/deliverable/narrative-lint.ts:311` |
| Freshness (TTL) verdicts + gate wiring | `reconcileMetric`, `ReconciliationVerdict`, `gateNarrative` | `lib/reconcile/reconcile.ts`, `lib/deliverable/build.ts:428` |
| Prior/lake value lookup | `lookupLakeFact` (lane 1) | `lib/reconcile/lane1.ts` |
| Missing/estimated number, with falsifier | `inference_notes` (exempt from exact-anchor, MUST carry `falsifier:` + build on a cited base) | `lib/deliverable/narrative-lint.ts:352` |
| Frozen snapshot the deliverable renders from | `items_snapshot` + `collectSnapshotNumbers` | `lib/deliverable/build.ts:83,185` |

The band idea is proven at the **ingest** layer (row counts). This spec lifts the same mechanism to
the **deliverable-value** layer and grounds the band in published movement (§4). It adds **one new
verdict status** to the reconcile layer — it does not erect a new standalone gate (RULE 3 C2).

---

## Design — the fallback ladder

For each numeric metric a deliverable wants to print, resolve in order. Stop at the first lane that
yields a shippable value.

1. **Have it fresh from our data.** Pull the current value + the metric's **prior-period value**
   (extend `lookupLakeFact` / lane 1 to return the prior row for the same metric + geo). Run the
   band check (§4).
   - **In band** → ship silently (`verdict.status = "ok"`).
   - **Out of band** → do NOT silently print. Emit `verdict.status = "confirm_outlier"` (new). On an
     interactive build this surfaces a confirm affordance; on a scheduled send it falls to lane 3
     (§5), never silently ships the raw outlier.
2. **Missing or brand-new metric (no prior, no current).** Send crawl4ai for a responsibly-sourced,
   cited number (named-web lane). If found and in band → ship with its citation.
3. **Still nothing found.** Compute an estimate from the prior week(s) + the movement of
   closely-related metrics, and print it **only as an inference note**: value + basis + falsifier +
   an explicit "we can make mistakes — please confirm." This is the asterisk-at-the-bottom the
   operator described; it rides the existing `inference_notes` channel, which already forces a
   `falsifier:` clause and a cited base figure.

Hard rule, unchanged from the moat: lane 3 may **estimate** but never **invent** — the estimate must
name its basis (which prior values, which related metrics) so it is a sourced inference, not a bare
number.

---

## The band table — sourced, per family (§4)

crawl4ai research (05/2026 releases; local, not committed per RULE 0.4) established these as the
published movement bands. **Two tiers of grounding:**

**Tier A — source publishes the realized move.** realtor.com's data methodology publishes a
month-over-month % change for every count/price/DOM metric we ship (active-listing-count M/M,
median-listing-price M/M, DOM M/M, new-listing-count M/M, pending M/M, price-per-sqft M/M). Zillow's
monthly report publishes home-value and rent moves (home value 0.8% YoY, rent 2.0% YoY as of
05/2026). Where a source publishes the move for the metric + geo, **compare our number's move
against the source's own move** — the band is the realized market, not a constant.

**Tier B — no published move; fall back to a per-family band grounded in published noise.**

| Metric family (our labels) | Grounded band (MoM) | Source of the band |
|---|---|---|
| Slow prices/values — Median Home Value, Median Asking Rent, Price/SqFt, list/sold medians | ±~2–3% | Zillow report: home value 0.8% YoY, rent 2.0% YoY → sub-1% typical MoM |
| Volatile counts — Active Inventory, Homes Sold, New/Commercial Permits, new-listing counts | ±~10–12% is *noise* | Census construction release states MoM ± CI: starts ±9.8%, completions ±12.3% |
| Durations — Days on Market | ±~15% (seasonal) | realtor.com DOM M/M series (Tier A preferred when available) |
| Bounded ratios/shares/scores — Sale-to-List, Pending Ratio, Price-Cut Share, Months of Supply, Market Heat / hotness | absolute delta, not ratio (e.g. ±8 pts) | bounded 0–100; a ratio band is meaningless near 0 |
| Structural/annual — household income, Save-Our-Homes Gap, Annual Flood Loss | any MoM move is suspect (annual cadence) | ACS/annual series — a monthly change ⇒ confirm |

Defaults, single tweakable table (mirroring `assert_vs_baseline`'s `drop_band`/`spike_band`
constants). "Out of band" = beyond a **confirm multiple** of the family band (e.g. 2.5×), not the
band edge itself — the band edge is "normal," the confirm line is "implausible."

---

## Where it hooks

- **`lib/reconcile/band.ts` (new)** — the band table + `checkBand(current, prior, family)` returning
  `"ok" | "confirm_outlier"`. Pure, unit-tested directly (like `assert_vs_baseline`). Tier-A
  comparator (`vs published move`) and Tier-B family bands both live here.
- **`lib/reconcile/lane1.ts`** — extend to return the prior-period value alongside the current one.
- **`lib/reconcile/types.ts`** — add `"confirm_outlier"` to the verdict status union.
- **`lib/deliverable/build.ts` `gateNarrative`** — after the existing lints, map any
  `confirm_outlier` verdict to: (interactive) a confirm affordance / (scheduled) lane-3 inference
  note. Flag-gated `BAND_GUARD_ENABLED` (default OFF), same pattern as `RECONCILE_TTL_GATE_ENABLED`,
  so it ships dark and is proven before it gates real sends.
- **Family classification** — a metric → family map keyed off the existing signal labels
  (`lib/zip-report/*`, the labels enumerated during design). One table, not per-call heuristics.

---

## Scheduled-send behavior (the "can't ask a human" case)

- **First deliverable** of a recipe is where every number is nailed down — by finding (lanes 1–2)
  or, if truly absent, an inference note (lane 3). After that the recipe runs on the established
  metric set.
- **A scheduled run that hits `confirm_outlier`** does NOT silently ship the outlier and does NOT
  block the send. It ships the value **as a lane-3 inference note** (value + basis + "please
  confirm") and flags the run for operator review. The number still goes out — asterisked and
  honest — so the cadence is never broken by a lone bad pull.

---

## Not building (YAGNI)

- No new gate object / no new mandatory pre-materialization stage — one new verdict status on the
  existing reconcile seam (RULE 3 C2).
- No live crawl on every number — lane 2 crawl fires only when lane 1 is empty.
- No per-ZIP hand-tuned bands in v1 — five family bands + the Tier-A published-move comparator.
- No re-opening the ingest guard — `assert_vs_baseline` stays as-is at its layer; this is the
  deliverable-layer sibling.

---

## Done when (live proof)

`sourced_band_number_guard_live_verify` closes when, on a real build:

1. A metric whose current value is a deliberate outlier vs its prior (e.g. a home value 3× last
   period) is **NOT** silently printed — it renders as an inference note with basis + "please
   confirm," or trips the interactive confirm affordance.
2. A metric with no prior and no lake value is filled by a **cited crawl** number (lane 2), not left
   blank.
3. A normal in-band number ships unchanged (no false alarm, no spurious asterisk).

All three observed on the running build path, not asserted from code.

---

## Open for writing-plans

- Exact `confirm_outlier` multiple per family (2.5× is a placeholder — set from the published bands).
- Prior-period lookup: prior deliverable snapshot vs. lake prior row — lane 1 (lake row) is the
  cleaner source; confirm the lake carries the prior period for every family.
- The interactive "confirm" affordance shape (email-lab surface) — separate from the scheduled-send
  path, which is fully specified above.
