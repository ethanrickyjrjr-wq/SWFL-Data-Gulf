# Franchise Consultant Briefing: tourism-tdt

_Outcomes-first read framed for franchise opportunity assessment, with survival and sector-credit signals foregrounded._

## TL;DR

**BULLISH** (magnitude 0.80)

## ⚠️ Caveats (read first)

- TDT collections in this build are SYNTHETIC fixture data — unset REFINERY_SOURCE or set it to `live` to read the real fl_dor_tdt_collections table.
- Latest month is a trough-season reading (trough). Operators should not extrapolate the single-month figure to an annual run rate — weight against trailing_12mo_collections_usd instead.

## Conclusion

Lee County TDT collections for 2025-09 (trough season): $1.80M. Year-over-year +12.5% against the prior fiscal year. Trailing 12 months stand at 99% of the strongest pre-Hurricane-Ian annual run. Hospitality / accommodation operators should weight forward decisions against this seasonal pulse; the cross-vertical read lives downstream in master.

## Key Findings


- **Latest monthly TDT collections (Lee County, 2025-09, trough season)** — 1800000 ↑ _(source: [Florida DOR Tourist Development Tax collections via Brains Supabase fl_dor_tdt_collections (Lee County, 48 monthly rows…](fixture://refinery/__fixtures__/tourism-tdt.sample.json), T1, fetched 2026-05-18T20:50:57Z)_
- **Year-over-year delta vs same month prior year** — 12.5 ↑ _(source: [Florida DOR Tourist Development Tax collections via Brains Supabase fl_dor_tdt_collections (Lee County, 48 monthly rows…](fixture://refinery/__fixtures__/tourism-tdt.sample.json), T1, fetched 2026-05-18T20:50:57Z)_
- **Trailing 12-month TDT collections total** — 53150000 → _(source: [Florida DOR Tourist Development Tax collections via Brains Supabase fl_dor_tdt_collections (Lee County, 48 monthly rows…](fixture://refinery/__fixtures__/tourism-tdt.sample.json), T1, fetched 2026-05-18T20:50:57Z)_
- **Post-Hurricane-Ian recovery ratio (trailing 12mo ÷ best pre-Ian 12mo)** — 0.99 (99.00%) ↑ _(source: [Florida DOR Tourist Development Tax collections via Brains Supabase fl_dor_tdt_collections (Lee County, 48 monthly rows…](fixture://refinery/__fixtures__/tourism-tdt.sample.json), T1, fetched 2026-05-18T20:50:57Z)_
- **Seasonal position vs same-month historical mean** — 1.11 ↑ _(source: [Florida DOR Tourist Development Tax collections via Brains Supabase fl_dor_tdt_collections (Lee County, 48 monthly rows…](fixture://refinery/__fixtures__/tourism-tdt.sample.json), T1, fetched 2026-05-18T20:50:57Z)_

## Drivers

_No upstream drivers (primary brain)._

## Confidence

- **1.00** (deterministic: trust tier × freshness × upstream propagation)
- Worst trust tier in chain: T1
- Upstream brains that passed the relevance floor: 0

---

_Brain: `tourism-tdt` v13 · refined 2026-05-18T20:50:57Z · relevance half-life 720h · decay `weeks`_
