-- SWFL view over the Tier 2 FDOT AADT table.
--
-- ⚠️  IMPORTANT: this view is an ANALYST CONVENIENCE — NOT the path the brain reads.
--     The traffic-swfl brain's source connector (refinery/sources/fdot-source.mts)
--     queries data_lake.fdot_aadt_fl DIRECTLY, not this view. The connector needs
--     Charlotte rows for the post-Ian recovery index (3-county storm-geo
--     exception); this view filters them out. So if you ever wire the brain to
--     read this view instead, the Ian metric will silently go null. Keep them
--     separate on purpose.
--
-- County scope (this view only): Lee + Collier (matches env-swfl and master.mts
-- SWFL Intelligence Lake scope). The full FDOT extract covers all of Florida;
-- the wider 6-county SWFL set (Lee + Collier + Charlotte + Glades + Hendry +
-- Monroe) would let thousands of rural segments dominate length-weighted
-- corridor averages, so an analyst querying this view consumes only the 2 urban
-- counties. The traffic_post_ian_recovery index uses a wider 3-county set
-- (Lee + Collier + Charlotte) computed in the source connector against the
-- base table, since it's a storm-geography signal not a brain-scope one.
--
-- Null filter: FDOT suppresses AADT on segments not surveyed in a given year.
-- The Tier 2 mirror keeps those rows; this view drops them. If the brain ends
-- up too noisy, tighten to `AND aadtflg = 'T'` (true counts only, no estimates
-- or extrapolations).
--
-- Length-weighting source: shape_length (auto-generated geometry length in the
-- layer projection). The shape_leng attribute is not selected — it may be stale
-- after route realignments.

CREATE OR REPLACE VIEW data_lake.fdot_aadt_swfl_yearly AS
SELECT
    year_,
    county,
    roadway,
    desc_frm,
    desc_to,
    aadt,
    aadtflg,
    tfctr,
    shape_length
FROM data_lake.fdot_aadt_fl
WHERE county IN ('LEE', 'COLLIER')
  AND aadt IS NOT NULL;

GRANT SELECT ON data_lake.fdot_aadt_swfl_yearly TO service_role;
