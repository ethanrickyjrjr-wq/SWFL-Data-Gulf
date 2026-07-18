## P10 (completeness-critic) — 2026-07-18

- **Streams P1–P9 had not landed when P10 ran** (their scratchpads in
  `.../data-consolidation/` were empty at write time). P10's critique is therefore of the
  CURRENT ARTIFACTS (data-roots.md + embedded 3-Sonnet verify, data-authority-map.md, the two
  plan docs), not of the streams' outputs. Any gap P10 marked "unowned" may already be claimed by
  a stream P10 could not see. **P10-completeness-critic.md must be refreshed once P1–P9 land** to
  re-attribute gaps and drop any that a stream already covered.
- Not a hard blocker — the gap list stands on its own as next-round work; this is a re-verify obligation.

## P10 UPDATE — re-attribution done (2026-07-18, same session)

- P2,P3,P4,P5,P6,P8,P9 landed mid-write; P10 READ all seven and RE-ATTRIBUTED. Refresh obligation
  above is DISCHARGED for those seven. Net: 6 of P10's 7 drafted gaps are owned by a landed stream;
  the survivor is the ZHVI chart-title + brain-metric-label mislabel (G1 — only the email is tracked).
- STILL UNLANDED: **P1 (corpse deletions)** and **P7 (bypass-wire execution)**. P10 Part 4 holds the
  deletion-execution guardrails + the P8-found landing-data false-freshness item for whoever runs them.
  Re-check P10 Part 4 against P1/P7 when they land.
- META RISK (P10 Part 2): the fan-out produced many `[NEEDS-SIGN-OFF]` recommendations + "recommend
  opening check X" but NO stream can open a check. 3-4 new checks must be opened this session or the
  parked decisions evaporate (RULE 2.4): city_pulse_freshness_predicate_dry, cre_figures cron/registry,
  fgcu-reri shadow-vote dedup, zhvi_median_mislabel_chart_and_brain.

## [P1-parcel-consolidation] collier_parcels feature-vs-distinct-parcel gap (affects lee_parcels landing gate)
- collier_parcels landed 290,973 rows = 290,973 distinct parcel_id (zero dupes in landed table),
  but the FDOR centroid returnCountOnly for CO_NO=21 is 364,827 FEATURES (live 2026-07-18). A 73,854 gap.
- Likely benign (merge on primary_key=parcel_id collapses multi-centroid-per-parcel rows), but NOT proven.
- Impact: the lee_parcels landing gate (P1 §5) cannot hard-assert ~556k landed rows. 556,100 is the
  CO_NO=46 FEATURE count; landed rows = distinct parcel_ids (expect materially lower, ~415k-475k if
  Lee mirrors Collier's 0.798 feature->distinct ratio). Someone should confirm the collapse cause
  before the gate floor is fixed, else a healthy Lee ingest could false-fail (or a short one false-pass).
- Not resolvable by this stream (read-only, lee_parcels does not exist yet).
