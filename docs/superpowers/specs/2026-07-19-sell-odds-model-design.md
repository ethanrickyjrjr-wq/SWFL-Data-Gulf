# Per-listing sell odds — discrete-time hazard model + cohort facts

**Date:** 2026-07-19 · **Check:** `sell_odds_model_live_verify`
**Approved by operator in-session 07/19/2026** ("good to go … spec and lets get this moving").
Operator constraints locked in Q&A: BOTH displays (cohort count + tagged estimate), BOTH builds
(sell odds + empirical seller-stress weight retune), NO video/manim work for the site.

## Problem

Every score the platform serves is hand-weighted arithmetic. The seller-stress composite's
weights are annotated "pending empirical tuning" in `refinery/packs/seller-stress-swfl.mts` —
the 0.25 cancellation weight is an admitted guess with no published precedent. Nothing anywhere
is trained against realized outcomes, so we cannot answer the one question the Why Isn't It
Selling report ultimately begs: "what are the odds this listing actually sells?"

The industry answers it and hides it (Homebot, CoreLogic Sell Score — 07/17/2026 landscape
research). We now have what they have: per-listing outcome tracking.

## Goal

One trained model, two deliverables:

1. **Per-listing sell odds** — P(sells within 90 days) per active listing, consumed by the
   Why Isn't It Selling seller report and the agent Stale-Listing Radar ranking.
2. **Empirical seller-stress weight retune** — the model's fitted coefficients reveal which
   stress signals actually predict outcomes, replacing the guessed weights with fitted ones
   (served composite stays exactly the same deterministic shape; only the constants change,
   with operator sign-off per RULE 1).

## Evidence (probed live 07/19/2026 — RULE 0.5 / 0.4)

- **No trained code exists today.** Repo-wide sweep: zero cross-entropy/loss-function/training
  code. This is the platform's first learned model.
- **Features exist.** `data_lake.listing_state` carries list_price, beds, baths, sqft,
  lot_acres, property_type, zip_code, county, subdivision, listed_date, days_on_market,
  status flags (pending/contingent/foreclosure/new_construction/price_reduced), address_key.
  `data_lake.listing_dom` view: 33,267 active rows, 9.9% still date-floored (07/18 backfill
  ~90% landed; probe-on-use heals the rest). DOM is NOT a blocker.
- **Labels are young.** `data_lake.listing_transitions` (the outcome record) starts
  06/27/2026: 195 sold, 43 withdrawn, 9,101 holding transitions as of 07/19/2026. Full
  90-day-labeled cohorts don't mature until late Sept 2026. **This is the binding clock.**
- **Parcel solds are NOT a substitute label.** Open defect check: `leepa_parcels` captures
  ~1/3 of MLS sold transactions with unquantified selection bias. Redfin solds are ZIP
  aggregates, not per-listing. Labels come from our own transitions only.
- **Method (named source):** "Survival prediction models: an introduction to discrete-time
  modeling," BMC Medical Research Methodology (2022),
  https://link.springer.com/article/10.1186/s12874-022-01679-6 — discrete-time survival on a
  person-period data set; any binary classifier can estimate the per-interval conditional
  hazard; censoring handled natively. Corroborated by standard treatments (Singer & Willett
  ALDA ch. 11; discSurv CRAN package) surfaced in the same 07/19 sweep.

## What we're building

### The model (plain words)

Each listing-week becomes one training row: "given the listing was still active at week N,
did it sell during week N+1?" A logistic model — trained with binary cross-entropy, the
standard loss for this — learns the weekly sell hazard from features. 90-day odds fall out by
compounding 13 weekly hazards. Because every observed week is a training row, listings that
haven't resolved yet still teach the model (censoring is native). The model starts learning
from week one of tracker data and sharpens as labels accumulate — no waiting for September.

Model class is deliberately small: regularized logistic regression first (interpretable
coefficients — required for deliverable #2). Gradient-boosted trees are explicitly out of
scope for v1; revisit only if calibration error on the holdout demands it.

### Phase 0 — training substrate (build NOW; cannot be backfilled later)

- **`data_lake.listing_week` append-only person-period table.** One row per (listing_id,
  week): features frozen as-of that week (price, DOM, weeks-since-last-cut, cut count/depth
  to date, beds/baths/sqft/type/ZIP, flags) + label columns filled in by the next week's
  observation (sold / delisted / cut / still-active). Grain: weekly, aligned to the tracker's
  scrape cadence.
- **Reconstruction backfill 06/27→now** from `listing_transitions` (price events are dated,
  listed_date is known), so no observed week is wasted. Reconstruction is possible ONLY for
  transition-covered history — hence the snapshot job going forward.
- **Weekly GHA cron wrapper + `--dry-run`** in the same PR (pipeline-freshness standard).
  Idempotent merge on (listing_id, week_start). Non-null guard per ingest Gate 4.
- **data-roots entry** for the new root (concept: per-listing weekly panel) — one root, added
  to `docs/standards/data-roots.md` top table in the same PR (RULE 0.55).
- Registered in `ingest/cadence_registry.yaml` with full `source_scope` (FULL-SCOPE-FIRST:
  the scope is `listing_state`'s full column list; ceiling = columns we hold but don't
  snapshot).

### Phase 1 — cohort facts (servable as soon as counts are honest)

The countable, lane-1 display: "we tracked N listings like yours (price band × DOM band ×
property type × county); X% sold within 90 days, Y% cut price first, Z% delisted." Pure SQL
over `listing_week` — no model involved, cited to our own tracker with an as-of date.
Sample-size suppression copies the `lib/buyer-leverage/zip-benchmark.ts` pattern: below the
floor (N < 30 per cohort until tuned), the cohort fact is suppressed, never thinned to a
smaller honest-sounding cohort.

Servable when suppression thresholds pass — realistically once ~8–12 weeks of labeled
outcomes exist. Consumed by Why Isn't It Selling v1.5 as an added block (v1 ships without it
and is not blocked by this spec).

### Phase 2 — the trained model (when holdout calibration passes)

- **Training:** offline Python job in `ingest/` (scikit-learn logistic regression; no new
  paid surface, no GPU, no vendor). Time-based train/validation split (train on weeks ≤ T,
  validate on weeks > T — never random split; leakage guard).
- **Candidate feature (cross-link, no dependency):** homestead status + SOH gap size via
  address-key join to `lee_parcels`/`collier_parcels` — SOH lock-in plausibly depresses
  sell-through. Reads published parcel tables only; the separate SOH-portability build
  (07/19, other session) neither blocks nor is blocked by this.
- **Gate to ship:** calibration on the time-forward holdout (Brier score + reliability curve
  documented in the training report artifact) — the model ships only when its predicted
  probabilities match realized frequencies within a documented tolerance, and beats the
  naive baseline (cohort base rate) on log loss. Numbers land in the training report, not in
  this spec (no invented thresholds here; the tolerance is set with the operator at gate
  time, on the evidence).
- **Artifact:** fitted coefficients + feature scaling constants land as a **versioned JSON
  data file in the repo** (reviewable in diff, like any constant). Serving stays
  deterministic TypeScript: dot product + sigmoid + hazard compounding — no Python, no model
  runtime, no LLM in the number path.
- **Display (operator-locked BOTH):** cohort fact leads (lane-1 count, cited to our
  tracker); the personalized estimate follows, always worded as estimated ("estimated from
  our tracking of SWFL listing outcomes since 06/2026"), with the falsifier stated (the
  cohort's realized rate it's calibrated against). Never printed for a listing whose cohort
  is fully suppressed AND whose feature vector falls outside the training distribution.
- **Consumers:** Why Isn't It Selling report block; agent radar feed ordering (radar may
  rank by odds even before the number is printable — ranking is internal).

### Phase 3 — seller-stress weight retune (deliverable #2)

Aggregate the fitted per-listing coefficients up to the five stress-signal families and
compare against the shipping hand weights (0.30 delisting / 0.25 breadth / 0.25 cancellation
/ 0.15 depth / 0.05 relisting). Produce a one-page comparison; operator signs off before any
weight edit (pack change = ask-first class, RULE 1). The composite's shape, baseline window,
suppression guards, and display map do not change — only the constants.

## Boundaries (locked)

- **No video/manim work for the site** (operator 07/19: "nothing about videos for our site").
- No deep nets, no GPU, no new paid API surface, no per-call vendor.
- The served number path stays deterministic code end-to-end; training is offline.
- Model estimates are never facts: always "estimated," never printed where the training
  data can't support them; the cohort count is the headline, the estimate is the follow.
- Seller-stress pack constants change only via Phase 3 sign-off, nothing else in this spec
  touches served brains.

## Testing

- `listing_week` builder: unit tests on reconstruction from a fixture transition history
  (row-per-week correctness, label assignment, censoring rows, idempotent re-run).
- Cohort SQL: fixture-backed tests incl. suppression floor behavior.
- Serving math: coefficients JSON → probability parity test against a Python-computed
  fixture (same inputs, same outputs to tolerance), so the TS port can't drift.
- Training job: deterministic seed; training report artifact committed alongside the
  coefficients JSON in the same PR.

## Sequencing

Phase 0 now (the only time-critical piece — every week unsnapshotted is training data lost);
Phase 1 when suppression passes; Phase 2 when the calibration gate passes; Phase 3 after
Phase 2. Why Isn't It Selling v1 proceeds independently and is not gated on any of this.
