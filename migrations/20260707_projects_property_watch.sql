-- migrations/20260707_projects_property_watch.sql
-- Property Watch v1 (spec docs/superpowers/specs/2026-07-07-property-watch-design.md).
--
-- Extends public.projects with the per-tracked-address watch config + subject spec.
-- No parallel watch_* table: nearby events ride the existing public.project_events row
-- (event_type/source are text, so the new EventType/EventSource values need no DDL —
-- only the TS unions widen). This migration is ONLY the projects columns.
--
-- watch_lat/lon are resolved ONCE at watch-enable time via geocodeAddress() (mirrors the
-- sell-campaign address_key arm-time resolution) — never re-geocoded on a cron pass.
-- The subject spec (beds/baths/sqft/price) auto-fills from data_lake.listing_state when the
-- tracked address resolves to an active listing by address_key; otherwise the small form
-- captures it directly (four-lane rule, lane 4). watch_price_is_estimate marks the lane-4 case.
--
-- Additive-only (ADD COLUMN IF NOT EXISTS); safe to re-run. psql is NOT installed on this box,
-- apply via Bun.SQL: `bun scripts/run-migration.ts migrations/20260707_projects_property_watch.sql`.
-- projects is owner-RLS'd; new columns inherit the existing row policy (no column-level RLS),
-- so the owner cookie client can read/write them and the service-role cron can scan them.

-- ── Watch config (per tracked address) ────────────────────────────────────────
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS watch_enabled       boolean NOT NULL DEFAULT false;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS watch_mode          text;              -- 'selling' | 'watching' (null until enabled)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS watch_lat           double precision;  -- resolved once at enable time
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS watch_lon           double precision;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS watch_radius_miles  numeric NOT NULL DEFAULT 0.5;  -- operator default (tighter than the ~1mi appraisal convention)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS watch_price_cut_threshold_pct numeric NOT NULL DEFAULT 2;  -- price-cut notify floor, user-adjustable

-- ── Subject spec (what a nearby comp is compared against) ──────────────────────
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS watch_beds          numeric;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS watch_baths         numeric;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS watch_sqft          integer;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS watch_price         bigint;            -- subject list/estimate price (whole dollars, matches listing_state.list_price)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS watch_price_is_estimate boolean NOT NULL DEFAULT false;  -- true = user-stated (lane 4), false = auto-filled from the lake

-- Partial index: the daily scan only ever reads watch_enabled rows.
CREATE INDEX IF NOT EXISTS ix_projects_watch_enabled ON public.projects (watch_enabled) WHERE watch_enabled = true;
