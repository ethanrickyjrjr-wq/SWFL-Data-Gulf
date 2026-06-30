# Phase 3 — Layer B aggregate brains (market-temperature + price-distribution)

**Builders:** `ingest-engineer` (new weekly aggregate pipeline + Tier-2 tables), then `refinery/packs`
builder (the two `PackDefinition`s + vocab). Reads `ingest/CLAUDE.md` then `refinery/packs/CLAUDE.md`.

**Why:** most "how's the market" questions want aggregates, and SteadyAPI already aggregates per-ZIP /
per-county / per-city in **one call** — no row-hauling, source-faithful ("read rates as written").

## New weekly pipeline

Pull, weekly, into Tier-2 tables:
- `/housing-market-details?zipcode=` per SWFL ZIP (~60) → median sold/listing/rent, DOM, ppsqft, hotness
  score, list_to_sold_ratio, sold_to_rent_ratio, market_strength.
- `/price-histogram?location=` per county (×2) → count per $50k band (40 bands) + total.
- `/geo-details?city_state=` per city (~10) → ZIPs + neighborhoods w/ median_listing_price, listing_count.
- `/mortgage-rate?state=FL` (×1) → daily 30yr fixed → folds into existing economy framing.

~320 calls/week total. Files: new `ingest/pipelines/market_aggregates/` module + cadence entry + GHA cron
wrapper + `--dry-run`. New `data_lake.*` tables (one per shape), `source_tag` provenance
`realtor.com via SteadyAPI`.

## Two brains (brain-first gate — table + PackDefinition in the same PR)

1. **market-temperature-swfl** — medians, DOM, hotness, list-to-sold, sold-to-rent, market_strength per ZIP.
2. **price-distribution-swfl** — listing count per price band per county (affordability shape).

For each: a `PackDefinition` in `refinery/packs/`, register every emitted slug (including conditionals) in
`brain-vocabulary.json` in the **same commit** (vocab gate), wire into `refinery/packs/catalog.mts`.
Mortgage-rate is context folded into the economy/master framing, not its own brain.

## Parallelism

Parallelizable with Phase 4 **after** Phase 1 lands, but both add cadence/cron entries + vocab slugs
(shared files `ingest/cadence_registry.yaml`, `brain-vocabulary.json`) → isolate each in its own worktree
(RULE 1.5) and **stagger those two commits**, not the code.

## Verification

- `--dry-run` prints expected weekly call count (~320); row-count guard per table (Gate 4).
- `bun run refinery -- market-temperature-swfl --target-only` and `... price-distribution-swfl --target-only`
  build green (use `--target-only` to avoid the cre-swfl egress hang + clobbering parallel sessions).
- Vocab clean: `bun refinery/tools/check-vocab-coverage.mts --all`.
- Pack ⇆ catalog mirror (Gate 5): `catalog.test.mts` + each pack's `bun:test`.
- Live-verify each brain via `node scripts/new-build.mjs` check.
