# Phase 5 — Land + manufactured (parked backfill)

**Builder:** `ingest-engineer`. **Status:** parked — fill with spare calls, low cadence.

Land and manufactured were excluded from the residential sweep (Ricky, 06/30) to save calls, but **not
dropped permanently** — backfill "next month or two when we have extra calls." Ship the Operation Dumbo
Drop scaffold now so the graduation later is zero-code.

## ODD scaffold (ship in this build, parked)

1. **Empty-tolerant consumer** — the listing pipeline already tolerates missing types; confirm land/
   manufactured rows flow through `distill` without special-casing.
2. **Parked cadence entry** under `not_yet_running:` in `ingest/cadence_registry.yaml` (probe-excluded).
3. **Tier-1 cold target** — the `data_lake.listing_state` table already holds the shape; `property_type`
   distinguishes them.
4. **`source_tag` provenance** — `realtor.com via SteadyAPI`, same as residential.
5. **Idempotent merge** — same address-keyed upsert; no duplicate rows on re-run.

## Graduation (later, zero-code)

When spare budget allows: add `land` + `manufactured` (+ any other excluded type) to the sweep's
`property_type` list, move the cadence block from `not_yet_running:` to `pipelines:`. ~6 county/ZIP sweeps
at low cadence. No pipeline break, no silent contamination.

## Budget

Backfill rides the ~6,200/mo headroom (steady-state is only ~3,000–4,700/mo). Low cadence (monthly or
on-demand) keeps it inside spare capacity.
