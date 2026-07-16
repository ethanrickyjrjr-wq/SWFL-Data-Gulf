-- Re-key street-less api_feed rows onto identity keys (L<property_id>:<zip>).
-- Check: listing_state_streetless_address_key_collision (07/16/2026).
--
-- WHY: a street-less permalink (no house number) minted address_keys like FORTMYERS:33912 /
-- BUCKINGHAMRD:33905 — every street-less listing in one city/street+ZIP collapsed onto ONE
-- merge row, silently overwriting its neighbors. 732 such rows (693 active) live on 07/16/2026.
-- _keyed_scan now keys these on the vendor property_id (address_key.identity_key), so the
-- stored rows must move onto the same keys or they can never merge again.
--
-- ORDER OF OPERATIONS — RUN ONLY AFTER THE 07/16 KEYING CODE IS DEPLOYED. Run against the old
-- code, the next scan would re-mint the old street-less keys and duplicate every row this moves.
-- Until both land, pipeline.py holds old street-less keys out of the diff (no fabricated
-- departures either way).
--
-- Idempotent: the predicate only matches OLD-format keys (no digit before the colon); identity
-- keys contain digits, so a re-run matches 0 rows. Transitions re-key FIRST (their join to state
-- still rides the old key), then state. Rows with property_id NULL (27 on 07/16) or whose target
-- key already exists are left untouched — they stay held out of the diff, inert.
--
-- VERIFY AFTER: both counts below should be their pre-run values; the leftover query ≈ 27.
--   SELECT count(*) FROM data_lake.listing_state
--    WHERE source_name='api_feed' AND address_key ~ '^[A-Z]+:[0-9]{5}$';   -- expect ~27 (no-pid remainder)

BEGIN;

UPDATE data_lake.listing_transitions t
SET address_key = 'L' || s.property_id || ':' || split_part(s.address_key, ':', 2)
FROM data_lake.listing_state s
WHERE t.source_name = 'api_feed'
  AND s.source_name = 'api_feed'
  AND t.address_key = s.address_key
  AND t.sale_or_rent = s.sale_or_rent
  AND s.address_key ~ '^[A-Z]+:[0-9]{5}$'
  AND s.property_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM data_lake.listing_state x
    WHERE x.source_name = 'api_feed'
      AND x.sale_or_rent = s.sale_or_rent
      AND x.address_key = 'L' || s.property_id || ':' || split_part(s.address_key, ':', 2)
  );

UPDATE data_lake.listing_state s
SET address_key = 'L' || s.property_id || ':' || split_part(s.address_key, ':', 2)
WHERE s.source_name = 'api_feed'
  AND s.address_key ~ '^[A-Z]+:[0-9]{5}$'
  AND s.property_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM data_lake.listing_state x
    WHERE x.source_name = 'api_feed'
      AND x.sale_or_rent = s.sale_or_rent
      AND x.address_key = 'L' || s.property_id || ':' || split_part(s.address_key, ':', 2)
  );

COMMIT;
