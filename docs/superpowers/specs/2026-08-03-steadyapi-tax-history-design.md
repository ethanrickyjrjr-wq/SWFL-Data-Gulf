# SteadyAPI Step 3 family B: steadyapi_tax_history typed table

**Date:** 2026-08-03
**Check:** `steadyapi_tax_history_live_verify`
**Parent:** `docs/superpowers/plans/2026-08-02-steadyapi-raw-landing-playbook.md` §STEP 3 (authority locked
there) + `docs/superpowers/handoffs/2026-08-03-steadyapi-step3-sonnet-handoff.md`. Sibling: family A
(`docs/superpowers/specs/2026-08-03-steadyapi-listing-events-design.md`, shipped 08/03/2026).

## Problem

`data_lake.steadyapi_property_history_raw`'s `body->'body'->'tax_history'` array (per-property
~9-year tax/assessment/market-value series) is unparsed. 16,514 of 17,875 raw bodies (92.4%) carry a
non-empty array; **273,051** total year-rows.

## Goal

Parse into `data_lake.steadyapi_tax_history`, zero paid calls. **NOT a valuation root, ever** —
`leepa_parcels` (Lee) / `collier_parcels` (Collier, IS the FDOR pull) stay the assessed/market-value
authority. This table's two jobs (playbook-locked): (1) intended home for ANNUAL TAX PAID
(`tax_amount` by year — no built root exists today, fixes `should_i_sell_property_tax_source`); (2)
the third cross-source agreement family (steady_tax ↔ county valuation), same two-class discipline as
`leepa_fdor` in `ingest/quality/quality_registry.yaml`.

## Live evidence (measured this session, prod, read-only)

- Denominator: 17,875 raw bodies; 17,874 have a `tax_history` KEY typed as an array (one body's key
  is missing/non-array); 16,514 (92.4%) are non-empty; **273,051** year-rows (exact match to the
  playbook's published figure).
- **Dedupe key measured, not guessed:** `(property_id, year)` — **zero collisions** across all
  273,051 rows, zero NULL years. Far simpler than family A — no NULL-sentinel needed.
- Field shapes (checked against all 273,051 rows): `year` is a JSON **number** (e.g. `2025`), cast
  directly — no string-parsing landmine like family A's `days_after_listed`. `tax_amount` is a clean
  JSON number. `assessment.{total,building,land}` and `market_value.{total,building,land}` are each
  independently-nullable JSON numbers (5 and 4 distinct null-combinations observed respectively, all
  numeric when present — never a string). One sample element confirms no undocumented extra keys
  beyond the 64-field census's four (`year`, `tax_amount`, `assessment{}`, `market_value{}`).
- **No cast-failure landmines found for family B** (unlike family A's `"111 days"` and mixed
  `"+59.50%"`/`"+$1,000"` traps) — this family is clean.

## Join-lane investigation (playbook-mandated gate, before any contract)

The playbook requires measuring the address-match rate BEFORE writing a cross-source contract
(Marco Island 0/360 precedent, 06/30/2026). Checked live this session:

- `data_lake.leepa_parcels` (Lee, appraiser feed) carries **no site-address column at all** — only
  `strap`, `folioid`, `zip_code`, and value/sale fields. The existing `lee_parcels` (FDOR) table is
  what carries `phy_addr1`/`phy_addr2`/`phy_city` and joins to `leepa_parcels` via a strap crosswalk
  (`lee_parcels.parcel_id = leepa_parcels.strap`, built 07/19/2026).
- `data_lake.collier_parcels` (Collier, FDOR) does carry `phy_addr1`/`phy_addr2`/`phy_city`.
- **No existing pipeline has ever computed an address_key on any parcel table** — grepped the whole
  `ingest/` tree; `address_key` normalization exists only in `ingest/pipelines/listing_lifecycle/`
  (built for SteadyAPI listings) and `listing_week`. Building a FDOR-side address-key normalizer,
  proving its match rate against SteadyAPI's `address_key`, and handling the inevitable edge cases
  (unit-number formats, directional prefixes, PO-box vs. site address) is a real sub-project, not a
  quick join — exactly the shape of work that produced the Marco Island 0/360 failure the playbook
  cites as its own precedent for gating this.

**Decision:** ship the clean, zero-risk core table + parser + tax-paid pack wiring THIS build. Defer
the address-join quality-registry contract as its own tracked, named piece of work — check
`steadyapi_tax_history_quality_contract_address_join_owed` — rather than rushing an address-matching
implementation under this build's time budget and risking a silent match-rate collapse that reads as
agreement instead of a broken join (the exact failure mode RULE 0.8 exists to stop).

## What we're building

### Schema (`migrations/20260803_steadyapi_tax_history.sql`)

```sql
CREATE TABLE IF NOT EXISTS data_lake.steadyapi_tax_history (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  property_id         text NOT NULL,
  address_key         text,
  county               text,
  tax_year             integer NOT NULL,
  tax_amount            numeric,
  assessment_total       numeric,
  assessment_building     numeric,
  assessment_land          numeric,
  market_value_total        numeric,
  market_value_building       numeric,
  market_value_land             numeric,
  fetched_at                     timestamptz NOT NULL, -- carried from the raw table (provenance)
  parsed_at                       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, tax_year)
);
CREATE INDEX IF NOT EXISTS idx_steadyapi_tax_history_property ON data_lake.steadyapi_tax_history (property_id);
GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role;
NOTIFY pgrst, 'reload schema';
```

`UNIQUE (property_id, tax_year)` is a plain composite unique (not a generated dedupe_key like family
A) — both columns are `NOT NULL` (measured live: zero NULL years, and `property_id` is never null on
the raw table), so Postgres's NULL-inequality trap that forced family A's design doesn't apply here.

### Parser (`ingest/pipelines/listing_lifecycle/parse_tax_history.py`)

Same shape as family A's `parse_listing_events.py`: a `PARSE_SQL` module constant (TRUNCATE + INSERT
via `LATERAL jsonb_array_elements`), a pre-measured floor from `jsonb_array_length`, a `run_parse`
that raises loud if the post-insert count falls below the floor, idempotent by full re-derive.

```sql
TRUNCATE data_lake.steadyapi_tax_history;
INSERT INTO data_lake.steadyapi_tax_history (
  property_id, address_key, county, tax_year, tax_amount,
  assessment_total, assessment_building, assessment_land,
  market_value_total, market_value_building, market_value_land, fetched_at
)
SELECT
  r.property_id, r.address_key, r.county,
  (e.value->>'year')::integer,
  (e.value->>'tax_amount')::numeric,
  (e.value->'assessment'->>'total')::numeric,
  (e.value->'assessment'->>'building')::numeric,
  (e.value->'assessment'->>'land')::numeric,
  (e.value->'market_value'->>'total')::numeric,
  (e.value->'market_value'->>'building')::numeric,
  (e.value->'market_value'->>'land')::numeric,
  r.fetched_at
FROM data_lake.steadyapi_property_history_raw r,
     LATERAL jsonb_array_elements(r.body->'body'->'tax_history') e
WHERE jsonb_typeof(r.body->'body'->'tax_history') = 'array';
```

### Consuming pack — extend `active-listings-swfl` again (same precedent)

New aggregate view `data_lake.listing_recent_tax_paid_stats` (region grain): median/latest-year
`tax_amount` for SWFL residential properties with a tax history row, surfaced as ONE new caveat-
qualified `key_metrics` entry (`median_annual_tax_swfl`) — explicitly caveated "vendor-reported
annual tax paid, NOT a county tax bill; listing-scope only" per the playbook's validation requirement
("validate vendor tax_amount against a known county tax bill BEFORE serving... caveat vendor annual
tax ≠ the county bill"). Because the address-join validation is deferred (see above), this metric
ships with the caveat UNVALIDATED-vs-county explicitly stated, not silently implied as verified.

### Quality-registry contract

**Deferred, tracked** — check `steadyapi_tax_history_quality_contract_address_join_owed` (opened this
session). Not silently skipped: the join-lane investigation above is the required gate work, and it
surfaced a real sub-project (FDOR-side address-key normalization has never been built) that doesn't
fit this build's scope without repeating the Marco Island failure shape.

### cadence_registry.yaml + data-roots.md

Same treatment as family A: comment block under the existing `listing_lifecycle` entry (no new
top-level pipeline — zero paid calls), `docs/standards/data-roots.md` flip 🔴→🟢 for family B with the
live row count. **Landmine from family A:** `cadence_registry.yaml` was actively claimed by a
parallel session during family A's build — check for an active claim before editing; if blocked
again, defer via the SAME mechanism (a named check), don't force-release another session's claim.

## Failure modes → guards (RULE 3.5)

| Failure | Guard |
|---|---|
| Envelope-path regression reads the table as empty, ships green | Same floor guard as family A: pre-measured `jsonb_array_length` sum, `RuntimeError` if the post-insert count falls short |
| `tax_amount` served as if it were the county tax bill | Explicit caveat on every serving surface: vendor-reported, not validated against a county bill (the address-join validation is the deferred piece) |
| `assessment`/`market_value` promoted to a valuation root by a future consumer | Table + column comments state explicitly: NOT a valuation root, ever — `leepa_parcels`/`collier_parcels` stay authority |
| A future address-join contract asserts on an unmeasured/collapsed match rate and reads as agreement | This build does NOT ship that contract — the gate stays open via the tracked check, not bypassed |
| `UNIQUE (property_id, tax_year)` breaks if a future raw body ever carries a NULL year | Measured live: 0 of 273,051 rows have a NULL year today; if this ever changes, the INSERT will fail loud (NOT NULL constraint) rather than silently drop or duplicate a row |

## Testing plan (TDD — failing first)

`ingest/tests/pipelines/listing_lifecycle/test_parse_tax_history.py`, mirroring family A's suite:
1. `PARSE_SQL` reads `body->'body'->'tax_history'` (nested envelope path), not the top-level shape.
2. `PARSE_SQL` guards on `jsonb_typeof(...) = 'array'`.
3. `PARSE_SQL` truncates before insert.
4. `run_parse` computes the floor before TRUNCATE/INSERT.
5. `run_parse` raises `RuntimeError` when post-insert count < floor.
6. `run_parse` does not raise when count >= floor.
7. `run_parse(dry_run=True)` issues no DDL/DML.
8. Single transaction, one commit.

Live evidence to paste at close: typed row count vs 273,051; a second live run proving byte-identical
idempotency; one property traced raw → typed.

## Out of scope (this build)

- The address-join quality-registry contract (steady_tax ↔ county valuation) — tracked separately,
  check `steadyapi_tax_history_quality_contract_address_join_owed`.
- Family C (`building_permits`) — next, separate PR, per "NOT A RUSH".
