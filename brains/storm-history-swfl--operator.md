# Operator Briefing: storm-history-swfl

_Flat technical read of the brain output in DAG order, suitable for engine operators and producers._

## TL;DR

**NEUTRAL** (magnitude 0.20)

## ⚠️ Caveats (read first)

- NOAA modernized the Storm Events schema in 1996; this brain reads the modern-schema vintage only (1996+). Pre-1996 records use an incompatible column layout and are excluded by construction.
- damage_property strings are parsed best-effort (regex matches "1.5M" / "10K" / "2B" / plain numbers). 8 events in this corpus had unparseable damage strings and are excluded from damage-based metrics (counted but not summed).
- Vintage end year is 2025 — bump YEAR_RANGE_END in ingest/duckdb_pipelines/storm_history_swfl/constants.py and re-run the ingest when NCEI publishes the next yearly file.
- Direction is bearish when SWFL-wide extreme-wind event count (>= 74 kt) in the trailing 10-year window crosses 3; neutral otherwise. This brain never emits bullish — absence of named storms is the baseline, not an upside.

## Conclusion

Southwest Florida storm history (LEE + COLLIER + CHARLOTTE) — 1,178 total NOAA Storm Events across the 1996-2025 modern-schema vintage, 10 qualifying as major storms (damage >= $1M AND event_type in {Hurricane, Tornado, Flash Flood, Storm Surge/Tide}). Most recent billion-dollar event in scope: Hurricane (Typhoon) on 2004-08-13. Trailing 10-year window: 76 property-damage events, 0 events at hurricane-force wind (>= 74 kt) — neutral read on near-term physical risk.

## Key Findings

- **SWFL property-damage event count (trailing 10-year window, all 3 SWFL counties)** — 76 → _(source: [NOAA Storm Events Database via data_lake._tier1_inventory[lake-tier1/environmental/storm_events_swfl.parquet] (SWFL cou…](s3://lake-tier1/environmental/storm_events_swfl.parquet), T1, fetched 2026-05-19T05:00:57Z)_
- **SWFL hurricane-force wind event count (MAGNITUDE >= 74 kt, trailing 10-year window)** — 0 → _(source: [NOAA Storm Events Database via data_lake._tier1_inventory[lake-tier1/environmental/storm_events_swfl.parquet] (SWFL cou…](s3://lake-tier1/environmental/storm_events_swfl.parquet), T1, fetched 2026-05-19T05:00:57Z)_
- **SWFL major storm count (damage >= $1M AND event_type in MAJOR_EVENT_TYPES, full vintage)** — 10 → _(source: [NOAA Storm Events Database via data_lake._tier1_inventory[lake-tier1/environmental/storm_events_swfl.parquet] (SWFL cou…](s3://lake-tier1/environmental/storm_events_swfl.parquet), T1, fetched 2026-05-19T05:00:57Z)_
- **SWFL total storm event count (full vintage 1996-2025)** — 1178 → _(source: [NOAA Storm Events Database via data_lake._tier1_inventory[lake-tier1/environmental/storm_events_swfl.parquet] (SWFL cou…](s3://lake-tier1/environmental/storm_events_swfl.parquet), T1, fetched 2026-05-19T05:00:57Z)_
- **Most recent SWFL billion-dollar storm event date (ISO 8601)** — 2004-08-13 → _(source: [NOAA Storm Events Database via data_lake._tier1_inventory[lake-tier1/environmental/storm_events_swfl.parquet] (SWFL cou…](s3://lake-tier1/environmental/storm_events_swfl.parquet), T1, fetched 2026-05-19T05:00:57Z)_
- **Most recent SWFL billion-dollar storm event type** — Hurricane (Typhoon) → _(source: [NOAA Storm Events Database via data_lake._tier1_inventory[lake-tier1/environmental/storm_events_swfl.parquet] (SWFL cou…](s3://lake-tier1/environmental/storm_events_swfl.parquet), T1, fetched 2026-05-19T05:00:57Z)_
- **SWFL counties present in the storm history corpus (alphabetical)** — CHARLOTTE+COLLIER+LEE → _(source: [NOAA Storm Events Database via data_lake._tier1_inventory[lake-tier1/environmental/storm_events_swfl.parquet] (SWFL cou…](s3://lake-tier1/environmental/storm_events_swfl.parquet), T1, fetched 2026-05-19T05:00:57Z)_
- **NOAA Storm Events vintage range covered by this build** — 1996-2025 → _(source: [NOAA Storm Events Database via data_lake._tier1_inventory[lake-tier1/environmental/storm_events_swfl.parquet] (SWFL cou…](s3://lake-tier1/environmental/storm_events_swfl.parquet), T1, fetched 2026-05-19T05:00:57Z)_

## Drivers

_No upstream drivers (primary brain)._

## Confidence

- **1.00** (deterministic: trust tier × freshness × upstream propagation)
- Worst trust tier in chain: T1
- Upstream brains that passed the relevance floor: 0

---

_Brain: `storm-history-swfl` v4 · refined 2026-05-19T05:00:57Z · relevance half-life 720h · decay `weeks`_
