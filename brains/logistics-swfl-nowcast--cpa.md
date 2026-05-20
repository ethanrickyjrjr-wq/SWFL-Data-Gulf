# CPA / Audit Briefing: logistics-swfl-nowcast

_Audit-grade read with full per-metric provenance tabulated by trust tier — every value traceable to its source URL._

## TL;DR

**NEUTRAL** (magnitude 0.00)

## ⚠️ Caveats (read first)

- FDOT freight segments and shock-log entries in this build are synthetic fixture data — unset REFINERY_SOURCE or set it to `live` to query data_lake.fdot_aadt_fl + data_lake.fdot_freight_nowcast_shock_log.
- Path B (post-commit 297ad23): deviation math compares CURRENT FDOT segment-count activity (Σ AADT × tfctr × payload × 365) against the rolling mean/stddev of the same quantity in the last 90 days of shock-log history. The FAF5 number above is preserved as audited CONTEXT but is no longer the math anchor — the prior v1 design comparing FDOT activity to FAF5 flow had dimensional + population mismatches.
- Daily-cadence shock detection uses a synthetic per-day denominator (annual tons_per_year ÷ 365) because Tier 2 carries only annual FDOT AADT. 30d / 90d escalation thresholds will rarely fire from current Tier 2 data alone — true daily AADT-equivalent (FDOT continuous-count stations) is reserved for v2 ingest.
- Conversion math: activity_tons_per_year_per_segment = AADT × tfctr × 16 × 365. The 16.0 tons/truck payload is FHWA HS 2023 Table VM-1 (combination trucks); commodity-mix shifts (heavy gravel vs light electronics) are not modeled in v1.
- Path B over-counts pass-through traffic (one truck traversing five segments contributes to five segment counts) — the over-count is constant across days and cancels in the z-score, but the headline tons/year number should NOT be compared directly to FAF5 flow.
- Scheduled FDOT construction closures look mathematically identical to genuine slowdowns; v1 has no calendar-aware filter to separate the two.

## Conclusion

FAF5 audited annual inbound freight: 0 tons (CY2026). This is a flow metric; the deviation below is an activity metric from FDOT segment counts. Current freight activity (annualized from 9 freight-coded FDOT segments) is 242,430,080 tons/year against a 242,477,266 tons/year rolling baseline (90-day window, σ = 2,179,960) — deviation z = -0.02 (0.0%). Shock-state: normal. Baseline-validity flag: valid. Consecutive breach days: 0.

## Audit Trail (all metrics, by trust tier)

| Tier | Metric | Value | Direction | Citation | URL |
| --- | --- | --- | --- | --- | --- |
| T1 | Assumed combination-truck average payload — FHWA Highway Statistics 2023, Table VM-1 | 16 | stable | FHWA Highway Statistics 2023, Table VM-1 — combination-truck average payload as… | https://www.fhwa.dot.gov/policyinformation/statistics/2023/vm1.cfm |
| T1 | FAF5 audited annual inbound freight FLOW to SWFL (CONTEXT — not the math anchor; the deviation z below is computed against FDOT's own rolling history) | 0 | stable | Upstream brain logistics-swfl (confidence 1.00, refined 2026-05-20) — supplies… | https://brain-platform-amber.vercel.app/api/b/logistics-swfl |
| T2 | Baseline-validity flag (valid \| stale-structural, sticky once stale) | valid | stable | FDOT AADT freight-coded segments (fixture; refinery/__fixtures__/logistics-swfl… | fixture://refinery/__fixtures__/logistics-swfl-nowcast.sample.json |
| T2 | Consecutive prior refines (incl. this one) where \|z\| > 3 with matching sign — cold-start runs do not progress the counter | 0 | stable | FDOT AADT freight-coded segments (fixture; refinery/__fixtures__/logistics-swfl… | fixture://refinery/__fixtures__/logistics-swfl-nowcast.sample.json |
| T2 | Count of prior shock-log rows with non-null activity in the rolling window — must be ≥ 90 for z computation to proceed | 90 | stable | FDOT AADT freight-coded segments (fixture; refinery/__fixtures__/logistics-swfl… | fixture://refinery/__fixtures__/logistics-swfl-nowcast.sample.json |
| T2 | Current-state freight ACTIVITY proxy from FDOT AADT × tfctr × payload × 365 (annualized tons crossing the freight-coded corpus) | 242430080 | stable | FDOT AADT freight-coded segments (fixture; refinery/__fixtures__/logistics-swfl… | fixture://refinery/__fixtures__/logistics-swfl-nowcast.sample.json |
| T2 | Deviation as percent of rolling_mean | 0 | stable | FDOT AADT freight-coded segments (fixture; refinery/__fixtures__/logistics-swfl… | fixture://refinery/__fixtures__/logistics-swfl-nowcast.sample.json |
| T2 | Deviation z-score: (current_activity − rolling_mean) / rolling_stddev | -0.02 | stable | FDOT AADT freight-coded segments (fixture; refinery/__fixtures__/logistics-swfl… | fixture://refinery/__fixtures__/logistics-swfl-nowcast.sample.json |
| T2 | Freight-coded FDOT segments contributing to current_activity | 9 | stable | FDOT AADT freight-coded segments (fixture; refinery/__fixtures__/logistics-swfl… | fixture://refinery/__fixtures__/logistics-swfl-nowcast.sample.json |
| T2 | Rolling-mean baseline (last 90 of up to 90 prior runs) — the actual math anchor for the deviation z below | 242477266 | stable | FDOT AADT freight-coded segments (fixture; refinery/__fixtures__/logistics-swfl… | fixture://refinery/__fixtures__/logistics-swfl-nowcast.sample.json |
| T2 | Rolling-stddev baseline (population stddev over the same window) — denominator of the deviation z below | 2179960 | stable | FDOT AADT freight-coded segments (fixture; refinery/__fixtures__/logistics-swfl… | fixture://refinery/__fixtures__/logistics-swfl-nowcast.sample.json |
| T2 | Shock-state classifier (normal \| anomaly \| structural_break \| insufficient_history) | normal | stable | FDOT AADT freight-coded segments (fixture; refinery/__fixtures__/logistics-swfl… | fixture://refinery/__fixtures__/logistics-swfl-nowcast.sample.json |

## Drivers

- `logistics-swfl` — input

## Confidence

- **0.91** (deterministic: trust tier × freshness × upstream propagation)
- Worst trust tier in chain: T2
- Upstream brains that passed the relevance floor: 1

---

_Brain: `logistics-swfl-nowcast` v8 · refined 2026-05-20T07:33:37Z · relevance half-life 720h · decay `weeks`_
