-- SteadyAPI Step 3 family A (08/03/2026): typed per-listing event history, parsed from
-- data_lake.steadyapi_property_history_raw's property_history[] array. Zero paid calls.
-- Design: docs/superpowers/specs/2026-08-03-steadyapi-listing-events-design.md
-- Idempotent (CREATE TABLE IF NOT EXISTS). Run via `new Bun.SQL` (psql NOT installed), sslmode=require.

CREATE TABLE IF NOT EXISTS data_lake.steadyapi_listing_events (
  id                               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  property_id                      text NOT NULL,
  address_key                      text,
  county                           text,
  event_date                       date NOT NULL,
  event_name                       text NOT NULL,
  price                            numeric,
  price_change                     numeric,
  -- RAW TEXT, not numeric: vendor data is heterogeneous — sometimes a real percentage
  -- ("-9.09%", "+100.00%"), sometimes a dollar amount ("+$1,000", "$0", "-$900"). Coercing this
  -- to numeric would silently corrupt the dollar-formatted rows into fake percentages. Found live
  -- 08/03/2026 mid-parse.
  price_change_percentage          text,
  price_sqft                       numeric,
  -- VENDOR VALIDATION COLUMN ONLY. listing_dom view stays the DOM root (full coverage,
  -- deterministic) — never promote this to a second root (playbook §STEP 3, locked 08/02/2026).
  days_after_listed                integer,
  source_name                      text, -- originating MLS board (e.g. "CoconutCoast")
  listing_id                       text,
  listing_list_price               numeric,
  listing_status                   text,
  listing_list_date                date,
  listing_last_status_change_date  timestamptz,
  listing_last_update_date         timestamptz,
  -- Array ordinal for analysis ONLY — NEVER part of the identity key. Vendor array order across a
  -- re-probe is unproven; a prepended event would shift every ordinal on re-parse.
  event_seq                        integer NOT NULL,
  -- Plain (not GENERATED) identity key, written directly by the parser INSERT from the raw JSON
  -- text fields — a GENERATED STORED column computed from event_date::text/price::text fails
  -- Postgres's "generation expression is not immutable" check (date/numeric->text casts depend on
  -- DateStyle/locale). Not a raw 5-column composite UNIQUE either: Postgres treats NULL != NULL
  -- inside a unique index, so a raw unique would silently let a future NULL-listing_id duplicate
  -- slip past ON CONFLICT even though today's data (235,383 rows, measured live 08/03/2026) has
  -- zero such collisions. The sentinel makes the key total instead of relying on today's luck.
  dedupe_key                       text NOT NULL,
  fetched_at                       timestamptz NOT NULL, -- carried from the raw table (provenance)
  parsed_at                        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_steadyapi_listing_events_property
  ON data_lake.steadyapi_listing_events (property_id);
CREATE INDEX IF NOT EXISTS idx_steadyapi_listing_events_listing
  ON data_lake.steadyapi_listing_events (listing_id);

GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role;
NOTIFY pgrst, 'reload schema';
