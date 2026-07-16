-- docs/sql/20260717_listing_dom.sql
-- ONE AUTHORITY for per-listing days on market (spec 2026-07-16-listing-dom-design.md).
-- Facts stay stored (listed_date / first_seen / transitions); days are COMPUTED here,
-- at read time — never materialized, so they can never go stale.
--
-- Semantics: headline = CURRENT SPELL, matching realtor.com's own counter (resets on
-- relist, keeps counting through pending — realtor.com spokesperson via Brick
-- Underground, fetched 07/16/2026). cdom_days = cumulative across relists, never
-- resets (earliest evidence we hold).
--
-- spell_anchor precedence: vendor listed_date (when from the current spell)
--   > last relist we observed (from_state='holding' transition)
--   > first_seen (exact for arrivals after full sweep coverage 07/03/2026;
--     a censored FLOOR for the ~30k back-catalog rows first seen before that).
--
-- Apply via Bun.SQL (psql not installed):
--   bun scripts/run-migration.ts docs/sql/20260717_listing_dom.sql

CREATE OR REPLACE VIEW data_lake.listing_dom AS
WITH relists AS (
  SELECT source_name, address_key, sale_or_rent, max(at) AS last_relist_at
  FROM data_lake.listing_transitions
  WHERE from_state = 'holding'   -- leaving holding = back on market = a relist
  GROUP BY source_name, address_key, sale_or_rent
),
anchored AS (
  SELECT
    s.*,
    r.last_relist_at,
    CASE
      WHEN s.listed_date IS NOT NULL
           AND (r.last_relist_at IS NULL OR s.listed_date::date >= r.last_relist_at::date)
        THEN s.listed_date::date                      -- vendor truth for the current spell
      WHEN r.last_relist_at IS NOT NULL
        THEN r.last_relist_at::date                   -- we saw the relist; vendor date is stale/absent
      ELSE s.first_seen::date                         -- our observation clock
    END AS spell_anchor,
    LEAST(COALESCE(s.listed_date::date, s.first_seen::date), s.first_seen::date) AS cdom_anchor,
    (s.listed_date IS NULL
     AND r.last_relist_at IS NULL
     -- CENSOR BOUNDARY (one of two occurrences; the other: quality_registry.yaml
     -- listing_dom_first_seen_calibration): sweep coverage completed 07/03/2026 —
     -- rows first seen on/before it were already live, so first_seen is a FLOOR.
     AND s.first_seen::date <= DATE '2026-07-03'
    ) AS dom_is_floor
  FROM data_lake.listing_state s
  LEFT JOIN relists r USING (source_name, address_key, sale_or_rent)
  WHERE s.source_name = 'api_feed'
)
SELECT
  anchored.*,
  (CURRENT_DATE - spell_anchor)::int AS dom_days,
  (CURRENT_DATE - cdom_anchor)::int  AS cdom_days
FROM anchored;

GRANT SELECT ON data_lake.listing_dom TO service_role;
NOTIFY pgrst, 'reload schema';
