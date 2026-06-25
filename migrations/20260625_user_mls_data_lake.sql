-- data_lake.user_mls_listings — agent's own Property records
-- Keyed on (listing_key, board_slug) because keys may collide across boards.

CREATE TABLE IF NOT EXISTS data_lake.user_mls_listings (
  listing_key             text NOT NULL,
  user_id                 uuid NOT NULL,
  board_slug              text NOT NULL,
  list_price              numeric,
  close_price             numeric,
  listing_contract_date   date,
  close_date              date,
  days_on_market          integer,
  bedrooms_total          integer,
  bathrooms_total         numeric,
  living_area             numeric,
  postal_code             text,
  standard_status         text,
  property_type           text,
  synced_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_key, board_slug)
);

CREATE INDEX IF NOT EXISTS idx_user_mls_listings_user_board
  ON data_lake.user_mls_listings (user_id, board_slug);

CREATE INDEX IF NOT EXISTS idx_user_mls_listings_postal
  ON data_lake.user_mls_listings (user_id, board_slug, postal_code);

-- data_lake.user_mls_stats — computed ZIP-level market stats
-- Recomputed on each sync for affected ZIPs.

CREATE TABLE IF NOT EXISTS data_lake.user_mls_stats (
  user_id              uuid NOT NULL,
  board_slug           text NOT NULL,
  postal_code          text NOT NULL,
  period_months        integer NOT NULL DEFAULT 24,
  median_close_price   numeric,
  avg_days_on_market   numeric,
  active_count         integer NOT NULL DEFAULT 0,
  close_count          integer NOT NULL DEFAULT 0,
  avg_price_per_sqft   numeric,
  computed_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, board_slug, postal_code)
);

-- Grant PostgREST access (required after any data_lake table creation)
GRANT SELECT, INSERT, UPDATE, DELETE ON data_lake.user_mls_listings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON data_lake.user_mls_stats TO service_role;
NOTIFY pgrst, 'reload schema';
