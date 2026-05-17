# CPA / Audit Briefing: cre-swfl

_Audit-grade read with full per-metric provenance tabulated by trust tier — every value traceable to its source URL._

## TL;DR

**BULLISH** (magnitude 0.81)

## ⚠️ Caveats (read first)

- 4 of 25 corridors have no cap_rate / vacancy_rate metrics — direction is read from the 21 corridors with data.

## Conclusion

The SWFL CRE pack covers 25 verified corridors across Lee and Collier counties. Median cap rate sits at 6.25% (falling); median vacancy at 5.5% (falling). Cap rates and vacancy are predominantly compressing — landlord-market read.

## Audit Trail (all metrics, by trust tier)

| Tier | Metric | Value | Direction | Citation | URL |
| --- | --- | --- | --- | --- | --- |
| T2 | Median SWFL CRE cap rate (21 of 25 corridors) | 6.25 | falling | Brains Supabase corridor_profiles (verified, non-deleted) — median across 21 co… | https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/corridor_profiles?select=*&verification_status=eq.verified&deleted_at=is.null&cap_rate_pct=not.is.null |
| T2 | Median SWFL CRE vacancy rate (21 of 25 corridors) | 5.5 | falling | Brains Supabase corridor_profiles (verified, non-deleted) — median across 21 co… | https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/corridor_profiles?select=*&verification_status=eq.verified&deleted_at=is.null&vacancy_rate_pct=not.is.null |

## Drivers

_No upstream drivers (primary brain)._

## Confidence

- **0.80** (deterministic: trust tier × freshness × upstream propagation)
- Worst trust tier in chain: T2
- Upstream brains that passed the relevance floor: 0

---

_Brain: `cre-swfl` v16 · refined 2026-05-17T02:52:26Z · relevance half-life 720h · decay `weeks`_
