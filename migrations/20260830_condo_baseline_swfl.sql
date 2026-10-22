-- condo_baseline_swfl — SWFL 3+-story condo building baseline + SIRS cross-reference.
-- Writer: ingest/pipelines/condo_baseline_swfl. Reader: refinery/sources/condo-baseline-source.mts
-- (pack condo-sirs-swfl). Sources + caveats: ingest/pipelines/condo_baseline_swfl/constants.py.
--
-- Apply via `new Bun.SQL` (psql is not installed), sslmode=require.

-- ── Buildings: one row per 3+-story condo building we can see ──────────────────
create table if not exists data_lake.condo_buildings_swfl (
  building_id             text        primary key,   -- lee:<STRAP>:<BuildingKey> | collier:<PermitNumber>
  county                  text        not null,      -- 'LEE' | 'COLLIER'
  source                  text        not null,      -- 'lee_footprints' | 'collier_milestone'

  association_name        text,                      -- raw source name (SubCondoName / AssociationName)
  assoc_name_norm         text,                      -- match.normalize_assoc_name(association_name)
  building_label          text,                      -- CondoBldgNo / ApplicationName

  street_address          text,
  city                    text,
  zip                     text,                      -- Lee only; Collier sources carry no zip

  residential_units       integer,                   -- Lee only
  stories                 numeric,                   -- Lee MaxStories; NULL for Collier (program entry implies 3+)
  year_built              integer,                   -- Lee ActualYearBuilt; Collier = year of CO date
  co_date                 date,                      -- Collier PDF only

  milestone_status        text,                      -- Collier ApplicationStatus: Cycle Completed | Not Due | Delinquent | Phase 1 ...
  milestone_status_detail text,                      -- Collier Application_Status (finer)
  next_milestone_year     integer,                   -- Collier service
  next_milestone_due      date,                      -- Collier PDF

  permit_number           text,                      -- Collier PL number
  parcel_strap            text,                      -- Lee STRAP
  folio_id                bigint,                    -- Lee
  site_address_id         integer,                   -- Collier
  source_object_id        integer,

  source_url              text        not null,
  source_as_of            text,                      -- PDF "As of ..." / Lee ModifyDate (ISO date)
  row_hash                text        not null,
  scraped_at              timestamptz not null,
  created_at              timestamptz not null default now()
);

create index if not exists condo_buildings_swfl_county_assoc_idx
  on data_lake.condo_buildings_swfl (county, assoc_name_norm);
create index if not exists condo_buildings_swfl_milestone_status_idx
  on data_lake.condo_buildings_swfl (milestone_status)
  where milestone_status is not null;

-- ── Cross-reference: one row per SWFL DBPR SIRS filing ─────────────────────────
-- match_method: exact | token_overlap | llm_tiebreak | needs_review | unmatched
-- assoc_name_norm is NULL unless match_method is one of the three accepted methods.
create table if not exists data_lake.condo_association_xref (
  dbpr_row_hash           text        not null,      -- data_lake.dbpr_sirs_submissions.row_hash
  database_period         text        not null,      -- 'pre_july_2025' | 'july_2025_plus'
  county                  text        not null,

  dbpr_association_name   text,
  dbpr_project_name       text,
  dbpr_query_norm         text,

  assoc_name_norm         text,                      -- → condo_buildings_swfl.assoc_name_norm (same county)
  match_method            text        not null,
  confidence              numeric     not null default 0,
  candidates              jsonb,                     -- [{norm, score}] offered (NULL on exact)
  primary_model           text,
  judge_model             text,
  reason                  text,

  matched_at              timestamptz not null,
  created_at              timestamptz not null default now(),
  primary key (dbpr_row_hash, database_period)
);

create index if not exists condo_association_xref_county_assoc_idx
  on data_lake.condo_association_xref (county, assoc_name_norm)
  where assoc_name_norm is not null;
create index if not exists condo_association_xref_method_idx
  on data_lake.condo_association_xref (match_method);

-- ── Compliance view: buildings ⟕ accepted SIRS match ⟕ milestone status ────────
-- has_sirs_filing is a LOWER BOUND on filing: an unmatched building may have filed
-- under a name the matcher could not resolve. milestone_delinquent is Collier-only
-- (Lee has no county program dashboard) and NULL elsewhere.
create or replace view data_lake.condo_compliance_swfl_v as
select
  b.building_id,
  b.county,
  b.source,
  b.association_name,
  b.assoc_name_norm,
  b.building_label,
  b.street_address,
  b.city,
  b.zip,
  b.residential_units,
  b.stories,
  b.year_built,
  b.co_date,
  b.milestone_status,
  b.next_milestone_year,
  b.next_milestone_due,
  (x.assoc_name_norm is not null)                       as has_sirs_filing,
  x.match_method                                        as sirs_match_method,
  x.database_period                                     as sirs_database_period,
  case
    when b.county = 'COLLIER' and b.milestone_status = 'Delinquent' then true
    when b.county = 'COLLIER' then false
    else null
  end                                                   as milestone_delinquent,
  b.source_url,
  b.scraped_at
from data_lake.condo_buildings_swfl b
left join lateral (
  select x.assoc_name_norm, x.match_method, x.database_period
  from data_lake.condo_association_xref x
  where x.county = b.county
    and x.assoc_name_norm = b.assoc_name_norm
    and x.match_method in ('exact', 'token_overlap', 'llm_tiebreak')
  order by case x.database_period when 'july_2025_plus' then 0 else 1 end
  limit 1
) x on true;

grant select on all tables in schema data_lake to service_role;
notify pgrst, 'reload schema';
