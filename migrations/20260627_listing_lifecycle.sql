-- migrations/20260627_listing_lifecycle.sql — listing lifecycle state machine.
--
-- Identity is the ADDRESS (address_key) + sale_or_rent, never the rotating listing id: a relisting
-- gets a new listing id, so keying on the id reads a relist as two unrelated events. One address can
-- be live for SALE and for RENT at the same time (27196 Belle Rio: $1.05M sale AND $5,000/mo lease),
-- so sale_or_rent is part of the key — else the second listing silently overwrites the first.
--
-- Capture wide, slice late: every card field is a COLUMN here; price/sqft/zip/type tiers are sliced
-- at query time in the brain's SQL, never as separate pipelines.
--
-- Apply via Bun.SQL (psql is not installed on this box): new Bun.SQL("<conn from .dlt/secrets.toml>?sslmode=require").
-- Idempotent (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS); safe to re-run.

CREATE TABLE IF NOT EXISTS data_lake.listing_state (
  source_name     text NOT NULL DEFAULT 'lifecycle_seed',  -- neutral; never a vendor/board name
  address_key     text NOT NULL,                           -- normalized street + zip (address_key.py)
  sale_or_rent    text NOT NULL DEFAULT 'sale',            -- part of the key: a sale + a rent listing coexist
  state           text NOT NULL,                           -- new|active|pending|under_contract|contingent|coming_soon|sold|pulled|back_on_market
  listing_id      text,                                    -- current source listing id (may rotate on relist)
  list_price      bigint,
  list_suffix     text,                                    -- raw per-period token (rent marker), kept for audit
  beds            numeric,
  baths           numeric,
  sqft            integer,
  lot_acres       numeric,
  property_type   text,                                    -- single_family|condo|townhouse|land (column, NOT a lane)
  zip_code        text,                                    -- ZIP gate G1: site address only, never mailing
  county          text,
  city            text,
  subdivision     text,
  brokerage       text,
  listed_date     date,
  days_on_market  integer,
  days_in_state   integer,
  first_seen      timestamptz NOT NULL DEFAULT now(),
  last_seen       timestamptz NOT NULL DEFAULT now(),
  scraped_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_name, address_key, sale_or_rent)
);

CREATE TABLE IF NOT EXISTS data_lake.listing_transitions (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_name         text NOT NULL DEFAULT 'lifecycle_seed',
  address_key         text NOT NULL,
  sale_or_rent        text NOT NULL DEFAULT 'sale',
  from_state          text,                                -- null on first appearance (=> 'new')
  to_state            text NOT NULL,
  at                  date NOT NULL,
  listing_id          text,
  price               bigint,
  price_delta         bigint,                              -- vs prior state's price (cut/raise)
  days_in_prev_state  integer,
  seed                boolean NOT NULL DEFAULT false,      -- true on the first-ever scan: baseline, NOT real flow
  scraped_at          timestamptz NOT NULL DEFAULT now(),
  -- One transition into a given state, per property+sale/rent, per day (daily-grain scan). Makes the
  -- append idempotent: a cron double-fire / overlapping manual run / mid-run crash can't double-count
  -- the headline transitions (deal-collapses, absorptions, withdrawals) the brain reports.
  CONSTRAINT uq_listing_transition UNIQUE (source_name, address_key, sale_or_rent, to_state, at)
);

CREATE INDEX IF NOT EXISTS ix_listing_transitions_addr ON data_lake.listing_transitions (address_key, at);
CREATE INDEX IF NOT EXISTS ix_listing_transitions_flow ON data_lake.listing_transitions (to_state, at) WHERE seed = false;
CREATE INDEX IF NOT EXISTS ix_listing_state_zip ON data_lake.listing_state (zip_code, state);

-- PostgREST access (required after any data_lake table creation), mirrors active_listings_residential.
GRANT SELECT, INSERT, UPDATE, DELETE ON data_lake.listing_state TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON data_lake.listing_transitions TO service_role;
NOTIFY pgrst, 'reload schema';
