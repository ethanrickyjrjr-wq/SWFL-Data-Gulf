-- CRE figures layer — unified, monitorable multi-source CRE figures + cross-source
-- corroboration confidence. Derived from data_lake.marketbeat_swfl (all four firms),
-- normalized to canonical_submarket × sector × quarter × metric grain in TypeScript
-- (refinery/lib/derived/cre-figures.mts + cre-corroboration.mts), materialized here.
--
-- Provenance (operator 07/18): every real professional-firm figure enters; rows with no
-- firm URL (Cushman, Colliers) carry the SWFL Data Gulf citation. No-invention is
-- satisfied — real numbers, real citation. source_verified is an editorial spot-check,
-- NOT a gate. Idempotent (run directly, verify row count after).
--
-- Run: bun scripts/run-migration.ts migrations/20260718_cre_figures.sql

create schema if not exists data_lake;

-- Per-firm normalized figures. one row per (canonical_submarket, sector, quarter, metric, source_firm).
create table if not exists data_lake.cre_figures (
  canonical_submarket text not null,
  sector              text not null,
  quarter             text not null,           -- 'YYYY-Qn'
  metric              text not null,            -- vacancy_rate | asking_rent_nnn | asking_rent_full_service | absorption_sqft | cap_rate | sale_price_psf
  value               double precision not null,
  units               text not null,
  source_firm         text not null,            -- source_name (cw_marketbeat|colliers_industrial|mhs_databook|lee_associates), NEVER _source_model
  source_url          text not null,            -- firm report URL, or the SWFL Data Gulf citation
  source_verified     boolean not null default false,
  as_of               date,                     -- data period (quarter end)
  fanned              boolean not null default false, -- true if this row came from a composite firm submarket fanned onto a finer canonical (a grain inference)
  built_at            timestamptz not null default now(),
  primary key (canonical_submarket, sector, quarter, metric, source_firm)
);

-- Tiered confidence layer: one row per cell, corroboration applied.
create table if not exists data_lake.cre_figures_confidence (
  canonical_submarket text not null,
  sector              text not null,
  quarter             text not null,
  metric              text not null,
  tier                text not null,            -- corroborated | flagged | single_source
  reported_value      double precision not null,
  units               text not null,
  contributing_firms  text[] not null,          -- source_firm[]
  spread              double precision,          -- null for single_source
  reported_firm       text not null,             -- which firm's value is reported (verified-preferred)
  has_fanned_contributor boolean not null default false, -- true if ANY contributing value was fanned from a composite (a flagged cell may then be grain-mismatch, not a firm conflict)
  built_at            timestamptz not null default now(),
  primary key (canonical_submarket, sector, quarter, metric)
);

-- Idempotent adds for an already-created table (first migration run predates these columns).
alter table data_lake.cre_figures            add column if not exists fanned boolean not null default false;
alter table data_lake.cre_figures_confidence add column if not exists has_fanned_contributor boolean not null default false;

create index if not exists cre_figures_grain_idx
  on data_lake.cre_figures (sector, quarter, metric);
create index if not exists cre_figures_conf_grain_idx
  on data_lake.cre_figures_confidence (sector, quarter, tier);

-- service_role needs explicit grants to read these via PostgREST (ops page).
grant usage on schema data_lake to service_role;
grant select on data_lake.cre_figures to service_role;
grant select on data_lake.cre_figures_confidence to service_role;
