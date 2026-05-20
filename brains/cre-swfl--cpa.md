# CPA / Audit Briefing: cre-swfl

_Audit-grade read with full per-metric provenance tabulated by trust tier — every value traceable to its source URL._

## TL;DR

**BULLISH** (magnitude 0.86)

## ⚠️ Caveats (read first)

- 1 of 8 corridors have no cap_rate / vacancy_rate metrics — direction is read from the 7 corridors with data.

## Conclusion

The SWFL CRE pack covers 8 verified corridors across Lee and Collier counties. Median cap rate sits at 6.5% (falling); median vacancy at 6% (falling). Cap rates and vacancy are predominantly compressing — landlord-market read.

## Audit Trail (all metrics, by trust tier)

| Tier | Metric | Value | Direction | Citation | URL |
| --- | --- | --- | --- | --- | --- |
| T2 | Median SWFL CRE cap rate (7 of 8 corridors) | 6.5 | falling | Brains Supabase corridor_profiles (verified, non-deleted) — median across 7 cor… | fixture://refinery/__fixtures__/corridor-profiles.sample.json |
| T2 | Median SWFL CRE vacancy rate (7 of 8 corridors) | 6 | falling | Brains Supabase corridor_profiles (verified, non-deleted) — median across 7 cor… | fixture://refinery/__fixtures__/corridor-profiles.sample.json |

## Drivers

_No upstream drivers (primary brain)._

## Confidence

- **0.80** (deterministic: trust tier × freshness × upstream propagation)
- Worst trust tier in chain: T2
- Upstream brains that passed the relevance floor: 0

---

_Brain: `cre-swfl` v24 · refined 2026-05-18T20:50:40Z · relevance half-life 720h · decay `weeks`_
