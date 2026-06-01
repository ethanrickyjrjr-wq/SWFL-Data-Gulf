-- DBPR SIRS Submissions — unified across pre-July 2025 and July 2025+ databases
-- Two schemas merged: pre-July has Project Type + ID; July+ has neither.
-- Presence in this table = SIRS confirmed complete by DBPR (per disclosure text).
-- Absence is NOT meaningful without an external condo registry — positive signal only.
-- result_truncated = true means the scrape window hit Qlik hypercube limit before
--   all statewide rows loaded; Lee/Collier rows near the end of the sort order may be missing.

create table if not exists data_lake.dbpr_sirs_submissions (
  id                  bigint generated always as identity primary key,

  -- Source tracking
  database_period     text        not null,   -- 'pre_july_2025' | 'july_2025_plus'
  row_hash            text        not null,   -- SHA256(project_name||association_name||zip||county)

  -- Project fields (project_type null for July 2025+ rows)
  project_type        text,
  project_name        text,
  association_name    text,

  -- Location (raw as submitted — county_normalized is the safe filter target)
  city                text,
  zip                 text,
  county              text,                   -- raw: 'LEE', 'Lee', 'MIAMI-DADE', etc.
  county_normalized   text,                   -- uppercased: 'LEE' | 'COLLIER'

  -- DBPR identifier (pre-July only; null for all July 2025+ rows — no ID in that schema)
  dbpr_id             text,

  -- Coverage flag: true when Qlik hypercube limit fired mid-load for this run
  result_truncated    boolean     not null default false,

  scraped_at          timestamptz not null,
  created_at          timestamptz not null default now()
);

-- Dedup: same row across monthly re-scrapes
create unique index if not exists dbpr_sirs_submissions_hash_period_uidx
  on data_lake.dbpr_sirs_submissions (row_hash, database_period);

-- Pre-July DBPR ID (sparse — only pre-July rows have it)
create unique index if not exists dbpr_sirs_submissions_dbpr_id_uidx
  on data_lake.dbpr_sirs_submissions (dbpr_id)
  where dbpr_id is not null;

-- Primary query path: filter to SWFL
create index if not exists dbpr_sirs_submissions_county_norm_idx
  on data_lake.dbpr_sirs_submissions (county_normalized);

create index if not exists dbpr_sirs_submissions_scraped_at_idx
  on data_lake.dbpr_sirs_submissions (scraped_at desc);
