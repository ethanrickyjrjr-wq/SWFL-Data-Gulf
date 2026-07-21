-- data_lake.community_profiles — schema catch-up, 07/20/2026.
-- The 07/06 migration fixed the shape before Phase 2's scrape/merge fields were
-- nailed down. Today's finalize.py merge produces 13 real scraped fields the
-- table has no column for (naplesgolfguy's club/fee/home-profile block +
-- 55places' fnb/age/activity flags) — additive only, nothing existing changes.
-- Idempotent; run via: bun scripts/run-migration.ts migrations/20260720_community_profiles_schema_catchup.sql

ALTER TABLE data_lake.community_profiles
  ADD COLUMN IF NOT EXISTS club_type              text,
  ADD COLUMN IF NOT EXISTS golf_initiation_fee     text,
  ADD COLUMN IF NOT EXISTS golf_annual_dues        text,
  ADD COLUMN IF NOT EXISTS social_initiation_fee   text,
  ADD COLUMN IF NOT EXISTS social_annual_dues      text,
  ADD COLUMN IF NOT EXISTS fnb_minimum_disclosed   boolean,
  ADD COLUMN IF NOT EXISTS home_types              text,
  ADD COLUMN IF NOT EXISTS new_or_resale           text,
  ADD COLUMN IF NOT EXISTS builder                 text,
  ADD COLUMN IF NOT EXISTS years_built             text,
  ADD COLUMN IF NOT EXISTS age_restrictions        text,
  ADD COLUMN IF NOT EXISTS activity_director       boolean,
  ADD COLUMN IF NOT EXISTS price_range             text,
  ADD COLUMN IF NOT EXISTS fees_included           text;

NOTIFY pgrst, 'reload schema';
