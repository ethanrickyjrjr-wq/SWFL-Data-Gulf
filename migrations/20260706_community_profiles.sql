-- data_lake.community_profiles — one row per MARKETED community (~200-400,
-- communities-swfl Phase 2/4), keyed on the alias reconciler's community slug
-- (refinery/lib/subdivision-aliases.mts CommunitySlug / fixtures/community-aliases.json).
-- This is the read contract the Phase-4 pack + Lab AI/chat (Phase 5) consume;
-- Phase 2's scrape+distill pipeline is the writer (not yet built) but the shape
-- is fixed here first so downstream readers aren't blocked on it landing.
--
-- Provenance is grouped by scrape source (design spec: golf/naplesgolfguy,
-- amenities+gated+home_count/55places, fees/realtyofnaples are three distinct
-- source pages per community) — one source_url+as_of pair per fact GROUP, not
-- per individual column, since facts within a group come from the same page.
-- home_count carries its own pair because it can be EITHER the Tier-1
-- authoritative aggregate (rolled up from neighborhood_stats — the GO path) OR
-- a lane-3 cited estimate from 55places (the NO-GO fallback per the spec).
--
-- Idempotent; run via:  bun scripts/run-migration.ts migrations/20260706_community_profiles.sql

CREATE TABLE IF NOT EXISTS data_lake.community_profiles (
  community_slug         text PRIMARY KEY,
  label                  text NOT NULL,
  county                 text NOT NULL,

  -- home_count: Tier-1 aggregate (authoritative) or lane-3 cited estimate (NO-GO fallback).
  home_count             integer,
  home_count_source_url  text,
  home_count_as_of       date,

  -- golf (naplesgolfguy) — HEADLINE per the design spec.
  gated                  boolean,
  golf_structure         text CHECK (golf_structure IN ('bundled', 'equity', 'optional', 'none')),
  golf_holes             integer,
  golf_courses           integer,
  golf_source_url        text,
  golf_as_of             date,

  -- fees (realtyofnaples) — HEADLINE per the design spec.
  hoa_fee_range          text,
  cdd_flag               boolean,
  fees_source_url        text,
  fees_as_of             date,

  -- inside the gates (55places) — structured flags; full amenity list stays
  -- prose/detail_tables-side, not modeled as a column per amenity.
  pool                   boolean,
  tennis                 boolean,
  pickleball             boolean,
  fitness                boolean,
  clubhouse              boolean,
  on_site_dining         boolean,
  boating_marina         boolean,
  amenities_source_url   text,
  amenities_as_of        date,

  inserted_at            timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_profiles_county_idx ON data_lake.community_profiles (county);

GRANT SELECT ON data_lake.community_profiles TO service_role;

NOTIFY pgrst, 'reload schema';
