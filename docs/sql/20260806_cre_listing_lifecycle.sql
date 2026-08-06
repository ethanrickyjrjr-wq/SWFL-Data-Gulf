-- 08/06/2026 — give commercial listings a lifecycle and a price history.
--
-- WHY. `data_lake.active_listings_cre` was written by a blind `ON CONFLICT DO UPDATE`
-- with no expiry: a listing that vanished from the source stayed `status='available'`
-- forever. Measured live 08/06/2026: 61 crexi rows, ALL 'available', ALL frozen at
-- 07/05/2026 (32 days stale) feeding the commercial brain. Tracked by check
-- `cre_active_listings_no_expiry_stale_available`.
--
-- WHAT THIS ADDS.
--   1. first_seen_at / last_seen_at — how long a listing has been on market, and
--      whether THIS run still saw it.
--   2. gone_at — set when a run covering that city no longer returns the listing.
--      The row is NEVER deleted; it becomes history we can measure against.
--   3. data_lake.cre_listing_observations — one row per listing per run. This is the
--      asset: a price/size time series per listing, so a price cut is a fact we
--      observed rather than a number silently overwritten.
--
-- Idempotent. Safe to re-run.

ALTER TABLE data_lake.active_listings_cre
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at  timestamptz,
  ADD COLUMN IF NOT EXISTS gone_at       timestamptz;

-- Backfill the existing rows from what we already know. _ingested_at is the only
-- timestamp those 61 rows carry, so it seeds BOTH bounds — honest, not invented:
-- it is the one moment we can prove we saw them.
UPDATE data_lake.active_listings_cre
   SET first_seen_at = COALESCE(first_seen_at, _ingested_at),
       last_seen_at  = COALESCE(last_seen_at,  _ingested_at)
 WHERE first_seen_at IS NULL OR last_seen_at IS NULL;

CREATE INDEX IF NOT EXISTS active_listings_cre_last_seen_idx
  ON data_lake.active_listings_cre (source_name, city, last_seen_at DESC);

-- One row per listing per run. Append-only; never updated in place.
CREATE TABLE IF NOT EXISTS data_lake.cre_listing_observations (
  id               bigserial PRIMARY KEY,
  listing_id       text        NOT NULL,
  source_name      text        NOT NULL,
  city             text,
  observed_at      timestamptz NOT NULL,
  status           text,
  sqft             numeric,
  asking_price_psf numeric,
  UNIQUE (listing_id, observed_at)
);

CREATE INDEX IF NOT EXISTS cre_listing_observations_listing_idx
  ON data_lake.cre_listing_observations (listing_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS cre_listing_observations_city_idx
  ON data_lake.cre_listing_observations (city, observed_at DESC);
