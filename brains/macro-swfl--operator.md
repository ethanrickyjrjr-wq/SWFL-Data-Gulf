# Operator Briefing: macro-swfl

_Flat technical read of the brain output in DAG order, suitable for engine operators and producers._

## TL;DR

**NEUTRAL** (magnitude 1.00)

## ⚠️ Caveats (read first)

- macro-swfl emits no SWFL-specific metrics today — the brain is a chain-position placeholder until county-level BLS LAUS for Lee + Collier is ingested. Downstream brains should declare macro-florida or macro-us as direct upstreams for macro context in the interim.

## Conclusion

macro-swfl is a regional delta brain. It currently emits no SWFL-specific metrics — county-level BLS LAUS (Lee + Collier) and other hyperlocal series are the planned sources and have not yet been ingested. The Florida state baseline reads: Florida unemployment rate 3.4% (stable), Florida labor force participation 60.9% (rising), Florida retail establishments 52000% (stable), Florida food service & accommodation establishments 40000% (stable), Florida construction establishments 38000% (stable), Florida healthcare establishments 35000% (stable), Florida professional services establishments 48000% (stable) (via macro-florida, confidence 1.00). Downstream consumers needing macro context today should declare macro-florida or macro-us as direct upstreams rather than routing through macro-swfl, until SWFL-specific data lands.

## Key Findings

_No key metrics emitted by this brain._

## Drivers

_No upstream drivers (primary brain)._

## Confidence

- **1.00** (deterministic: trust tier × freshness × upstream propagation)
- Worst trust tier in chain: T4
- Upstream brains that passed the relevance floor: 1

---

_Brain: `macro-swfl` v22 · refined 2026-05-20T07:33:37Z · relevance half-life 720h · decay `weeks`_
