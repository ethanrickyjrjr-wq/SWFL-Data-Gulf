-- data_lake.steadyapi_neighborhood* — the AROUND-the-community amenity root, from
-- SteadyAPI /neighborhood-amenities (full-scope probe: _RESEARCH/data-and-ingest/
-- 2026-08-03-neighborhood-amenities-full-scope.md). Three tables, one concept family:
--   steadyapi_neighborhoods           — one row per vendor neighborhood (slug_id PK):
--                                       name, centroid, boundary polygon, 12 location scores
--   steadyapi_neighborhood_amenities  — nearby businesses per neighborhood (Yelp-derived
--                                       rating/reviews, category, lat/lon, distance)
--   steadyapi_property_neighborhood   — property_id -> slug_id assignment (the listings
--                                       pairing edge; api_feed rows carry no subdivision)
-- DISTINCT from data_lake.community_profiles (in-gate facts: golf structure, HOA range,
-- gated) — do not merge the two concept families (probe doc, "What this does NOT give").
--
-- Idempotent; run via:  bun scripts/run-migration.ts migrations/20260803_steadyapi_neighborhoods.sql

CREATE TABLE IF NOT EXISTS data_lake.steadyapi_neighborhoods (
  slug_id        text PRIMARY KEY,
  name           text NOT NULL,
  city           text,
  state_code     text,
  geo_type       text,
  level          text,
  centroid_lat   double precision,
  centroid_lon   double precision,
  boundary       jsonb,          -- GeoJSON polygon, verbatim from the vendor
  scores         jsonb,          -- [{label, value, text}] x12 location scores, verbatim labels
  search_radius  integer,        -- vendor-fixed radius (miles) on the sourcing call
  source_url     text NOT NULL,  -- provenance: the vendor endpoint
  as_of          date NOT NULL,
  inserted_at    timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS data_lake.steadyapi_neighborhood_amenities (
  slug_id        text NOT NULL,
  category       text NOT NULL,  -- vendor category key (golf, countryclubs, ...)
  name           text NOT NULL,
  phone          text,
  rating         double precision,
  reviews_count  integer,
  categories     jsonb,
  -- address_line participates in the PK because the vendor returns DISTINCT
  -- branches of the same chain (two Dunkin' rows, one neighborhood+category)
  -- — name alone collides on real data (first live load, 08/03/2026).
  address_line   text NOT NULL DEFAULT '',
  city           text,
  postal_code    text,
  lat            double precision,
  lon            double precision,
  distance_from_property double precision,
  yelp_url       text,
  business_url   text,
  source_url     text NOT NULL,
  as_of          date NOT NULL,
  inserted_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (slug_id, category, name, address_line)
);

CREATE TABLE IF NOT EXISTS data_lake.steadyapi_property_neighborhood (
  property_id    text PRIMARY KEY,
  slug_id        text NOT NULL,
  as_of          date NOT NULL,
  inserted_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS steadyapi_nbhd_amenities_category_idx
  ON data_lake.steadyapi_neighborhood_amenities (category);
CREATE INDEX IF NOT EXISTS steadyapi_prop_nbhd_slug_idx
  ON data_lake.steadyapi_property_neighborhood (slug_id);

GRANT SELECT ON data_lake.steadyapi_neighborhoods TO service_role;
GRANT SELECT ON data_lake.steadyapi_neighborhood_amenities TO service_role;
GRANT SELECT ON data_lake.steadyapi_property_neighborhood TO service_role;

NOTIFY pgrst, 'reload schema';
