# SteadyAPI Step 3 family A: steadyapi_listing_events typed table

**Date:** 2026-08-03
**Check:** `steadyapi_listing_events_live_verify`
**Parent:** `docs/superpowers/plans/2026-08-02-steadyapi-raw-landing-playbook.md` §STEP 3 (authority design
locked there — this spec does not re-litigate it) + `docs/superpowers/handoffs/2026-08-03-steadyapi-step3-sonnet-handoff.md`.

## Problem

`data_lake.steadyapi_property_history_raw` holds 17,875 full SteadyAPI response bodies (landed
08/02–08/03/2026, zero new paid calls needed). Each body's `body->'body'->'property_history'`
array carries the full per-listing event history — price cuts with amount/pct, relist events, MLS
board (`source_name`), vendor-computed per-event DOM (`days_after_listed`) — currently unparsed and
unreadable by anything except a raw JSON blob. Nothing else we hold carries this per-event history.

## Goal

Parse the stored bytes into `data_lake.steadyapi_listing_events`, ZERO paid calls, so the event
history becomes queryable and servable. This table IS the sole root for per-listing event history
(playbook-locked) — `listing_dom` view stays the DOM root; `days_after_listed` lands as a validation
column only, never a second root.

## Live evidence this design is built on (measured this session, prod, read-only)

- Denominator: 17,875 raw bodies; 17,859 (99.9%) have a non-empty `property_history[]`; **235,383**
  total event rows (cross-checked below — matches exactly).
- **Dedupe key measured, not guessed:** `(property_id, date, event_name, price, listing_id)` has
  **zero collisions** across all 235,383 rows. Dropping `price` and `listing_id` collides 11,759
  times; dropping just `listing_id` still collides 8,324 times. `listing_id` is NULL on 31,217 rows
  (13.3% — events with no `listing{}` block, e.g. bare price-change entries) but the 5-tuple still
  has zero collisions even restricted to those NULL rows (verified via SQL `DISTINCT`, which treats
  NULLs as equal for grouping — a true duplicate among NULL-listing_id rows would have shown up).
- Field shapes (spot-checked against all 235,383 rows, not a sample): `date` is ISO on 100%, `price`
  is a JSON number on 100%, `county`/`address_key` are non-null on all 17,875 raw rows. The
  `listing{}` sub-object's three date-ish fields (`list_date`, `last_status_change_date`,
  `last_update_date`) are independently nullable — 6 distinct null-combinations observed, all
  strings when present (safe to cast, guarded with `->>`).
- 7 distinct `event_name` values: Price Changed (58,727), Listed (58,329), Listing removed (49,531),
  Sold (47,631), Listed for rent (10,262), Price Changed for rent (6,760), Relisted (4,143).

## What we're building

### Schema (`migrations/20260803_steadyapi_listing_events.sql`)

```sql
CREATE TABLE IF NOT EXISTS data_lake.steadyapi_listing_events (
  id                               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  property_id                      text NOT NULL,
  address_key                      text,
  county                           text,
  event_date                       date NOT NULL,
  event_name                       text NOT NULL,
  price                            numeric,
  price_change                     numeric,
  price_change_percentage          numeric,
  price_sqft                       numeric,
  days_after_listed                integer, -- VENDOR VALIDATION COLUMN ONLY. listing_dom view
                                             -- stays the DOM root; never promote this to a root.
  source_name                      text,    -- originating MLS board (e.g. "CoconutCoast")
  listing_id                       text,
  listing_list_price               numeric,
  listing_status                   text,
  listing_list_date                date,
  listing_last_status_change_date  timestamptz,
  listing_last_update_date         timestamptz,
  event_seq                        integer NOT NULL, -- array ordinal for analysis ONLY —
                                             -- NEVER part of the identity key (vendor array order
                                             -- across a re-probe is unproven; a prepended event
                                             -- would shift every ordinal).
  dedupe_key                       text GENERATED ALWAYS AS (
                                      property_id || '|' || event_date::text || '|' || event_name ||
                                      '|' || COALESCE(price::text, E'\\x00') ||
                                      '|' || COALESCE(listing_id, E'\\x00')
                                    ) STORED,
  fetched_at                       timestamptz NOT NULL, -- carried from the raw table (provenance)
  parsed_at                        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_steadyapi_listing_events_property ON data_lake.steadyapi_listing_events (property_id);
CREATE INDEX IF NOT EXISTS idx_steadyapi_listing_events_listing ON data_lake.steadyapi_listing_events (listing_id);
GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role;
NOTIFY pgrst, 'reload schema';
```

**Why a GENERATED `dedupe_key` column instead of a raw 5-column UNIQUE constraint:** Postgres treats
`NULL != NULL` inside a unique index, so a raw composite unique on `(property_id, event_date,
event_name, price, listing_id)` would silently let two rows with identical non-NULL columns but
BOTH NULL `listing_id` land as duplicates on a future re-parse — even though the live data proves
that collision doesn't exist *today*. A future re-probe refreshing an old body must stay idempotent
by construction, not by luck of the current dataset. The generated column substitutes a sentinel
(`\x00`, never a real value) for NULL `price`/`listing_id`, making the key total.

### Parser (`ingest/pipelines/listing_lifecycle/parse_listing_events.py`)

Zero paid calls — a single SQL statement (`PARSE_SQL`, a module-level string constant so its shape
is directly testable without a DB) does the JSON-to-relational transform, per the ingest convention
"aggregate/transform at source, never haul raw rows to loop over in application code":

```sql
TRUNCATE data_lake.steadyapi_listing_events;
INSERT INTO data_lake.steadyapi_listing_events (
  property_id, address_key, county, event_date, event_name, price, price_change,
  price_change_percentage, price_sqft, days_after_listed, source_name, listing_id,
  listing_list_price, listing_status, listing_list_date, listing_last_status_change_date,
  listing_last_update_date, event_seq, fetched_at
)
SELECT
  r.property_id, r.address_key, r.county,
  (e.value->>'date')::date,
  e.value->>'event_name',
  (e.value->>'price')::numeric,
  (e.value->>'price_change')::numeric,
  (e.value->>'price_change_percentage')::numeric,
  (e.value->>'price_sqft')::numeric,
  (e.value->>'days_after_listed')::integer,
  e.value->>'source_name',
  e.value->'listing'->>'listing_id',
  (e.value->'listing'->>'list_price')::numeric,
  e.value->'listing'->>'status',
  (e.value->'listing'->>'list_date')::date,
  (e.value->'listing'->>'last_status_change_date')::timestamptz,
  (e.value->'listing'->>'last_update_date')::timestamptz,
  e.ordinality,
  r.fetched_at
FROM data_lake.steadyapi_property_history_raw r,
     LATERAL jsonb_array_elements(r.body->'body'->'property_history') WITH ORDINALITY AS e(value, ordinality)
WHERE jsonb_typeof(r.body->'body'->'property_history') = 'array';
```

`run_parse(dry_run=False)`:
1. Computes the FLOOR before touching anything: `SELECT sum(jsonb_array_length(body->'body'->'property_history')) FROM steadyapi_property_history_raw WHERE jsonb_typeof(body->'body'->'property_history')='array'`.
2. `dry_run=True`: prints the floor and returns — no DDL/DML.
3. Live: runs `TRUNCATE` + `INSERT` (above) inside ONE transaction, then re-counts the table.
4. **Floor guard (the "0 rows, green" guard the advisor flagged):** if the post-insert count is
   below the pre-measured floor, `raise RuntimeError` loud — never a silent short parse. A fixture
   test proves the SQL reads the right JSON path; it does NOT protect production against a vendor
   envelope change. This guard is what does.
5. Idempotent by construction: TRUNCATE + full re-derive from the raw table means a second run
   produces byte-identical output to the first (proven live at ship time by running it twice and
   pasting both counts — a SQL-string assertion in a unit test cannot prove this, only a live
   double-run can).

### Consuming pack — extend `active-listings-swfl`, not a new brain

Precedent: `docs/superpowers/specs/2026-08-01-listing-status-wire-design.md` made the identical call
for a different new fact off the same `listing_lifecycle` family ("wire into the existing
active-listings-swfl pack/brain, not a new brain — this is the same entity family already served
there"). Family A's events are the same entity family (active/recently-active SWFL residential
listings), so the same precedent applies — a brand-new leaf brain for one supporting table is
disproportionate blast radius (new brain in master's dossier, new GHA rebuild target, new
triage/synthesis LLM cost) for what is fundamentally listing-history depth, not a new topic.

Add one new aggregate to `active-listings-residential-source.mts` (the existing source
`active-listings-swfl` reads) or a small sibling source function: a "recent price cuts" count +
median cut % over the last 90 days, read from `steadyapi_listing_events` (`event_name='Price
Changed'`), surfaced as one new `key_metrics` entry + one caveat naming the listing-scope law (Steady
data only covers probed/listed properties, not the full book) and the "realtor.com" provenance label
(never "SteadyAPI"). No new vocabulary slug beyond the metric id itself
(`recent_price_cuts_count_swfl`), registered in `brain-vocabulary.json` in the same commit (Gate 2).

### Quality-registry contract

**None for family A** — playbook-locked: A has no county twin (nothing else we hold carries
per-listing event history), so there is nothing to cross-validate against. This ships as **7 of 8**
ship-discipline items, with this omission named explicitly (not silently skipped), per RULE 0.8.

### cadence_registry.yaml + data-roots.md

- Add a comment block under the existing `listing_lifecycle` entry (mirroring how the raw-landing
  table and `steadyapi_search_raw` were documented as additional tables under the same pipeline
  entry, not a new top-level entry — this is a zero-paid-call derived table, not a new ingest run).
- Add `raw_landing_class: paid_landed` to the `listing_lifecycle` entry itself while touched (it was
  one of the ~80 entries missing this field per the 08/02 coverage-contracts handoff; the SteadyAPI
  bodies genuinely land via paid probes, so this is the correct value — fixing it here is in-scope
  because this PR is editing this exact block, not a broader backfill).
- `docs/standards/data-roots.md` ~line 398: flip family A's 🔴 to 🟢 with the live row count and
  as-of date.

## Failure modes → guards (RULE 3.5, named before TDD)

| Failure | Guard |
|---|---|
| Envelope-path regression (`body->'property_history'` instead of `body->'body'->'property_history'`) reads the whole table as empty, INSERT succeeds with 0 rows, ships green | Floor guard (step 4 above) computed from `jsonb_array_length` BEFORE the parse touches the table; a fixture test also pins the nested path string in `PARSE_SQL` |
| NULL-`listing_id` duplicate slips past a naive UNIQUE constraint on re-parse | Generated `dedupe_key` column substitutes a sentinel for NULL — see schema rationale above |
| `days_after_listed` gets promoted to a second DOM root by a future consumer | Column comment + spec text name it VALIDATION ONLY; `listing_dom` view is untouched by this build |
| A bad cast on an unexpected value aborts the whole TRUNCATE+INSERT transaction | Both statements run in ONE transaction — a cast failure rolls back cleanly to the prior state, never leaves the table half-truncated. Verified live 08/03: 100% of dates/prices in the CURRENT 235,383 rows cast cleanly; a future re-probe adding new bodies could in principle introduce a new shape — the guard is transactional atomicity, not defensive per-row casting |
| Downstream pack over-serves Steady's event history as full-book coverage | Caveat in the pack output names the listing-scope law explicitly (only probed/listed properties) |
| Provenance leak ("SteadyAPI" shown to a user) | Pack source label stays "realtor.com" per the operator decree, matching every other listing_lifecycle-derived surface |
| `event_seq` accidentally used as part of the identity key by a future edit | Column comment + spec text state explicitly it is metadata-only; `UNIQUE` is on `dedupe_key`, which never references `event_seq` |

## Testing plan (TDD — failing first)

`ingest/tests/pipelines/listing_lifecycle/test_parse_listing_events.py`:
1. `PARSE_SQL` contains `"body->'body'->'property_history'"` (nested envelope path) and does NOT
   read the top-level `"body->'property_history'"` shape (landmine regression guard).
2. `PARSE_SQL` guards on `jsonb_typeof(...) = 'array'`.
3. `run_parse` computes the floor query BEFORE issuing TRUNCATE/INSERT (call-order assertion via a
   fake cursor, mirroring `test_raw_landing.py`'s pattern).
4. `run_parse` raises `RuntimeError` when post-insert count < floor (fake cursor returns a low count).
5. `run_parse` does NOT raise when post-insert count >= floor.
6. `run_parse(dry_run=True)` issues no TRUNCATE/INSERT — only the floor query.
7. TRUNCATE and INSERT execute inside a single transaction (one `commit()` call, not two).

Live evidence to paste at close (RULE 0.8 — not a pytest assertion, a manual double-run):
typed row count vs 235,383 expected; run `run_parse` a second time and confirm the count is
byte-identical (idempotency proof no unit test can substitute for); one property traced raw → typed
(pick a `property_id`, show its raw `property_history[]` alongside its typed rows).

## Out of scope (this build)

- Families B (`tax_history`) and C (`building_permits`) — separate PRs per the playbook's "NOT A
  RUSH" decree, built after A ships with pasted evidence.
- Step 4 (scalars onto `listing_state`) — the `_ENRICH_ONLY_COLS` twice-fired-gun risk belongs to a
  later step, not this one; this table is intentionally its own table, never merged onto
  `listing_state`.
