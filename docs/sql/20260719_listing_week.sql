-- docs/sql/20260719_listing_week.sql — idempotent. Person-period training panel
-- for the sell-odds hazard model (spec 2026-07-19-sell-odds-model-design.md).
-- Append-only via merge; labels for week W are written by the run observing W+1.
CREATE TABLE IF NOT EXISTS data_lake.listing_week (
  address_key            text        NOT NULL,
  sale_or_rent           text        NOT NULL,
  week_start             date        NOT NULL,
  listing_id             text,
  zip_code               text,
  county                 text,
  property_type          text,
  beds                   numeric,
  baths                  numeric,
  sqft                   integer,
  lot_acres              numeric,
  listed_date            date,
  dom_days               integer,
  state_at_week_end      text,
  list_price             bigint,
  cuts_to_date           integer,
  cut_depth_pct_to_date  numeric,
  weeks_since_last_cut   integer,
  relists_to_date        integer,
  flag_foreclosure       boolean,
  flag_new_construction  boolean,
  sold_next_week         boolean,
  holding_next_week      boolean,
  price_cut_next_week    boolean,
  built_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (address_key, sale_or_rent, week_start)
);
CREATE INDEX IF NOT EXISTS listing_week_week_idx ON data_lake.listing_week (week_start);
CREATE INDEX IF NOT EXISTS listing_week_zip_idx  ON data_lake.listing_week (zip_code);
GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role;
NOTIFY pgrst, 'reload schema';
