# CRE Broker Briefing: logistics-swfl

_Market-direction read framed for commercial real estate decisions, with flood-barrier-mode-1 and rate signals foregrounded._

## TL;DR

**NEUTRAL** (magnitude 0.50)

## ⚠️ Caveats (read first)

- FAF5 flows in this build are synthetic fixture data — unset REFINERY_SOURCE or set it to `live` to query data_lake.faf_flows.
- Scope is inbound domestic only (dms_dest=129 AND trade_type=1). Imports (trade_type=2), exports (trade_type=3), and outbound flows (dms_orig=129) are intentionally excluded — separate brains would own those scopes if built.
- Year scope is 2024 (latest historical FAF5 year). FAF5 forecast years are deliberately not consumed here; bump LATEST_HISTORICAL_FAF_YEAR in refinery/sources/faf5-source.mts when ORNL publishes the next vintage.
- v1 emits no direction/magnitude vote — the brain reports a point-in-time snapshot, not a time series. Direction reads require a multi-year retro (planned for v2 once a second FAF5 vintage is ingested).

## Conclusion

In FAF5 year 2024, SWFL (FAF zone 129) absorbed 12853.1K tons of inbound domestic freight worth $11639.4M across 7 origin zones and 7 commodity classes. Top origin zones by tonnage: Tampa-St. Petersburg (4411.1K tons), Orlando (2768.6K tons), Miami (2221K tons) — the freight base loads into SWFL primarily from these corridors. Top commodity classes by tonnage: commodity_12 (4704.3K tons), commodity_7 (2747K tons), commodity_17 (2305.4K tons).

## Key Findings


- **Total inbound domestic freight to SWFL, year 2024 (thousand tons)** — 12853.1 → _(source: [FAF5.7.1 inbound domestic freight flows (ORNL/FHWA Cold Lane Parquet; dms_dest=129 trade_type=1, year 2024). Aggregate:…](fixture://refinery/__fixtures__/logistics-swfl.sample.json), T1, fetched 2026-05-20T07:42:54Z)_
- **Total inbound domestic freight value to SWFL, year 2024 (millions USD)** — 11639.4 → _(source: [FAF5.7.1 inbound domestic freight flows (ORNL/FHWA Cold Lane Parquet; dms_dest=129 trade_type=1, year 2024). Aggregate:…](fixture://refinery/__fixtures__/logistics-swfl.sample.json), T1, fetched 2026-05-20T07:42:54Z)_

## Drivers

_No upstream drivers (primary brain)._

## Confidence

- **1.00** (deterministic: trust tier × freshness × upstream propagation)
- Worst trust tier in chain: T1
- Upstream brains that passed the relevance floor: 0

---

_Brain: `logistics-swfl` v13 · refined 2026-05-20T07:42:54Z · relevance half-life 720h · decay `weeks`_
