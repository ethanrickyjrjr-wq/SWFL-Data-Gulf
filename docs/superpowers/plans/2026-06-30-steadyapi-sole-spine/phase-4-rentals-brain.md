# Phase 4 — Rentals brain (new asset class)

**Builders:** `ingest-engineer` (rentals pipeline + Tier-2 table), then `refinery/packs` (the rentals
`PackDefinition` + vocab).

**Why:** rentals are a class we don't cover at all today. Measured SWFL inventory ≈ **9,000**.

## Weekly rentals sweep

- `/rentals-search?location=` both counties, paginate to `meta.total`. **20/page** (not 200).
- Lee county-form returned HTTP 500 on 06/30 → **sweep Lee by city** (Fort Myers, Cape Coral, Lehigh Acres,
  Bonita Springs, Estero, Fort Myers Beach, Sanibel, …); Collier county-form works (4,178).
- ~450 pages/sweep → **~1,935 calls/mo weekly** (biweekly ≈970 if budget tightens).

Fields per rental: price{min,max}, beds/baths/sqft ranges, address, property_id, photo. Into a new
`data_lake.rentals_*` Tier-2 table, `source_tag` `realtor.com via SteadyAPI`.

Files: new `ingest/pipelines/rentals/` module + cadence entry + GHA cron wrapper + `--dry-run`.

## Brain (brain-first gate)

**rentals-swfl** `PackDefinition` in `refinery/packs/` — rental inventory + median rent by area (the
`/housing-market-details` `median_rent` cross-checks it). Register every slug in `brain-vocabulary.json`
same commit; wire into `catalog.mts`.

## Parallelism

Parallelizable with Phase 3 after Phase 1 lands — different new pipeline files. Shared files
`ingest/cadence_registry.yaml` + `brain-vocabulary.json` → own worktree, stagger those commits.

## Verification

- `--dry-run` prints expected page count (~450); row-count guard (Gate 4); assert Lee city-sweep covers
  the cities that the county-form would have (no silent gap — `log()` any city that 500s).
- `bun run refinery -- rentals-swfl --target-only` green; vocab clean; pack ⇆ catalog (Gate 5).
- Live-verify via `node scripts/new-build.mjs` check.
