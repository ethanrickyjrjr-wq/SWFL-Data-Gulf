-- parcel_community_pd_summary_v — the ONE aggregate the communities brain reads.
--
-- Aggregate-at-source (ingest/CLAUDE.md): the communities-swfl source consumes ONE
-- row from this view instead of hauling 100k+ assignment rows through PostgREST
-- (which would also silently truncate at db-max-rows). Underlying table:
-- data_lake.parcel_community_pd, written by
-- ingest/pipelines/lee_planned_developments/spatial_join.py.
--
-- Idempotent: CREATE OR REPLACE VIEW.

CREATE OR REPLACE VIEW data_lake.parcel_community_pd_summary_v AS
SELECT
  count(*)::bigint                                                   AS assigned_parcels,
  count(DISTINCT community_name_normalized)::bigint                  AS communities,
  count(*) FILTER (WHERE ambiguous)::bigint                          AS ambiguous_parcels,
  count(*) FILTER (WHERE input_method IN ('Sketched', 'Bad Legal'))::bigint
                                                                     AS low_trust_parcels,
  -- The SERVABLE universe — what a consumer may actually speak: unambiguous,
  -- trusted-boundary assignments only (mirrors lib/listings/community-identity.ts's
  -- silence rules; one definition, counted here so no consumer re-derives it).
  count(*) FILTER (WHERE NOT ambiguous
                     AND (input_method IS NULL
                          OR input_method NOT IN ('Sketched', 'Bad Legal')))::bigint
                                                                     AS servable_parcels,
  count(DISTINCT community_name_normalized)
      FILTER (WHERE NOT ambiguous
                AND (input_method IS NULL
                     OR input_method NOT IN ('Sketched', 'Bad Legal')))::bigint
                                                                     AS servable_communities,
  max(assigned_at)                                                   AS assigned_at
FROM data_lake.parcel_community_pd;

GRANT SELECT ON data_lake.parcel_community_pd_summary_v TO service_role;
NOTIFY pgrst, 'reload schema';
