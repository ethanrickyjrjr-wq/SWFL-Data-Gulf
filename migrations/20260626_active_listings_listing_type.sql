-- active_listings_residential: classify rent vs sale (listing_type)
--
-- Problem: the scrape mixed monthly/seasonal RENTALS into the for-sale list_price column
-- (a $1,200/mo lease read as a $1,200 "home"), dragging the region median to a backwards
-- $315k (below the regional benchmark sold median). Root cause: distill.py only split land-vs-residential,
-- never rent-vs-sale.
--
-- Fix (ingest/pipelines/active_listings/distill.py): classify listing_type from the card's
--   .listing__price-suffix span ("/ month" => rent; Sarasota-region cards), with a price-floor
--   backstop for Collier-region cards that omit the suffix (a residential listing < $50k is a lease;
--   land is never reclassified). Confirmed live via crawl4ai 2026-06-26.
--
-- Idempotent. Run from repo root.

ALTER TABLE data_lake.active_listings_residential
  ADD COLUMN IF NOT EXISTS listing_type text;

-- Backstop on already-stored rows the scraper tagged 'sale' but are sub-floor residential
-- (the no-suffix Collier-region rentals).
UPDATE data_lake.active_listings_residential
   SET listing_type = 'rent'
 WHERE property_type = 'residential' AND listing_type = 'sale' AND list_price < 50000;

-- Backfill any unclassified rows (pre-migration / delisted tail) by the same rule.
UPDATE data_lake.active_listings_residential
   SET listing_type = CASE
         WHEN property_type = 'residential' AND list_price < 50000 THEN 'rent'
         ELSE 'sale' END
 WHERE listing_type IS NULL;

-- Verify (expect: residential/sale median ~ $475k on fresh rows; residential/rent in the $1k-$5k band):
--   SELECT listing_type, property_type, count(*), median(list_price) FILTER (WHERE list_price>=1000)
--   FROM data_lake.active_listings_residential
--   WHERE scraped_at >= now() - interval '24 hours' GROUP BY 1,2 ORDER BY 3 DESC;
