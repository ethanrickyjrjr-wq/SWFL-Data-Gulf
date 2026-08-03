-- data_lake.google_maps_amenities — county-wide amenity ground truth from a one-time
-- Google Maps pull (Apify compass/crawler-google-places, runs May105YCBlyq7mbBb Lee /
-- 8oKzMnzwQ4CR80Hzm Collier, 08/03/2026; terms: golf course, country club, clubhouse,
-- community pool, marina). Loader: scripts/load-google-maps-amenities.mts.
-- Joins to communities spatially (lat/lng vs steadyapi_neighborhoods.boundary) or by
-- the place's own `neighborhood` field. Provenance: the place's Google Maps URL.
--
-- Idempotent; run via:  bun scripts/run-migration.ts migrations/20260803_google_maps_amenities.sql

CREATE TABLE IF NOT EXISTS data_lake.google_maps_amenities (
  place_id           text PRIMARY KEY,      -- Google placeId
  county             text NOT NULL,         -- which county run returned it (Lee | Collier)
  title              text NOT NULL,
  category_name      text,
  categories         jsonb,
  total_score        double precision,      -- Google star rating
  reviews_count      integer,
  lat                double precision,
  lng                double precision,
  street             text,
  city               text,
  postal_code        text,
  neighborhood       text,                  -- Google's own neighborhood label, when present
  website            text,
  phone              text,
  permanently_closed boolean,
  temporarily_closed boolean,
  search_string      text,                  -- which search term found it
  source_url         text NOT NULL,         -- the place's Google Maps URL
  scraped_at         timestamptz,
  as_of              date NOT NULL,
  inserted_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gmaps_amenities_county_idx ON data_lake.google_maps_amenities (county);
CREATE INDEX IF NOT EXISTS gmaps_amenities_category_idx ON data_lake.google_maps_amenities (category_name);

GRANT SELECT ON data_lake.google_maps_amenities TO service_role;

NOTIFY pgrst, 'reload schema';
