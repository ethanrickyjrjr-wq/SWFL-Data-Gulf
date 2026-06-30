# Phase 2 — Sold lake + on-demand comps

**Builders:** split —
- `ingest-engineer` for the organic sold capture into `listing_transitions`.
- `answer-engine-guardian` for the on-demand comp helper wired into `lib/assistant`.

**Why two parts:** there is **no bulk sold-search** (the API's `/search` is for-sale only;
`/price-histogram?status=sold` → 422). Sold is reachable only per-property / per-radius. So we deliver it
two ways, both grounded in the live API.

## Part A — Organic sold capture (ingest-engineer)

When a tracked for-sale listing **leaves the sweep** (it was in the prior snapshot, not the current one),
fire one `/property-tax-history?propertyId=` for it:
- If the history shows a recent **Sold** event → record sold price + sold date into `listing_transitions`
  ("another land"), status `sold`.
- If no sold event → it was delisted; record status `withdrawn`/`expired`.

Bounded by turnover (~240/day). **Sample to fit budget** (~500/mo): prioritize higher-value ZIPs or
listings that were active longest. Over months this becomes a genuine SWFL sold-price dataset for the
inventory we already track — sourced legitimately, never invented.

Files: `ingest/pipelines/listing_lifecycle/pipeline.py` (off-market hook), `extract_api.py` (a
`fetch_sold_event(property_id)` helper), `transitions.py`.

## Part B — On-demand comp helper (answer-engine-guardian)

When the AI values/comps a property, it calls (live, cited, never stale):
1. `/nearby-home-values?lat=&lon=&radius=` → the 25 nearest properties (sold + off-market + for-sale) with
   beds/baths/sqft + realtor.com AVM estimate + last list price + status — **1 call**.
2. For the exact sold price + sold date on a chosen comp, `/property-tax-history?propertyId=` — +1 call.

~1–3 calls per comp request (usage-driven). Wire into `lib/assistant` comp path; reads `lib/assistant/CLAUDE.md`.
Citations: `realtor.com via SteadyAPI`, as-of the call date (MM/DD/YYYY). **Never surface an MLS number.**

## Parallelism

Part B (`lib/assistant`) shares **nothing** with the ingest phases → fully parallel with Phase 1/3/4.
Part A touches `pipeline.py`/`extract_api.py` → serial with Phase 1 (same files, same builder).

## Note — distinct from the Email Lab/Social rewire

The Email Lab + Social RentCast→SteadyAPI rewire is a **separate** follow-up (check
`email_social_steadyapi_rewire`), not part of this build. The on-demand comp helper here is the answer
engine's comp path, not the labs' listing-context path.

## Verification

- Part A: `pytest` on the off-market hook; assert a known sold listing produces a `sold` transition with
  price+date; assert sampling cap holds the call count.
- Part B: live-verify one comp request returns cited nearby solds with no MLS# leak; assert ≤3 calls.
