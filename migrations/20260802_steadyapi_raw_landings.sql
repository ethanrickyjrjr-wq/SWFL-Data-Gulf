-- Raw landings for EVERY remaining paid SteadyAPI surface (operator decree 08/02/2026 —
-- the /property-tax-history landing proved the pattern; these close the parse-and-discard
-- gap on the rest). Cold provenance stores, NEVER served roots; typed tables parse OUT of
-- these with zero paid calls. Writer: ingest/lib/raw_landing.py (idempotent upsert).
--
-- Grain rationale (Rule-11 volume honesty):
--   search/rentals  = LATEST-WINS per property (nightly/weekly sweeps re-return the whole
--                     book; keeping history would be ~12M rows/yr for zero marginal signal —
--                     the diff already lands in listing_transitions, and per-property history
--                     arrives via /property-tax-history bodies).
--   histogram/details/geo-trends = TIME-SERIES per capture date, mirroring their typed
--                     tables' append-with-captured_date grain (weekly/monthly, tiny).

CREATE TABLE IF NOT EXISTS data_lake.steadyapi_search_raw (
  property_id  text PRIMARY KEY,
  county       text,
  body         jsonb NOT NULL,
  fetched_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS data_lake.steadyapi_rentals_search_raw (
  property_id  text PRIMARY KEY,
  county       text,
  body         jsonb NOT NULL,
  fetched_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS data_lake.steadyapi_price_histogram_raw (
  county        text NOT NULL,
  captured_date date NOT NULL,
  body          jsonb NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (county, captured_date)
);

CREATE TABLE IF NOT EXISTS data_lake.steadyapi_market_details_raw (
  zip_code      text NOT NULL,
  county        text,
  captured_date date NOT NULL,
  body          jsonb NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (zip_code, captured_date)
);

CREATE TABLE IF NOT EXISTS data_lake.steadyapi_geo_trends_raw (
  anchor_property_id text NOT NULL,
  anchor_label       text,
  captured_date      date NOT NULL,
  body               jsonb NOT NULL,
  fetched_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (anchor_property_id, captured_date)
);

GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role;
NOTIFY pgrst, 'reload schema';
