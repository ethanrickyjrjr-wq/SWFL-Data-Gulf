-- 20260722_leepa_comparable_sales_indexes.sql
--
-- Indexes + grant for data_lake.leepa_comparable_sales (LeePA ParcelInfo layer 23,
-- "Comparable Sales"). Table is created by the dlt pipeline:
--   ingest/pipelines/leepa_comp_sales/  ->  python -m ingest.pipelines.leepa_comp_sales.pipeline
--
-- WHY THESE INDEXES. dlt creates the table with no index beyond its own internals, and
-- folioid is the ONLY join key anyone will ever use (into data_lake.leepa_parcels.folioid).
-- Without them the trailing-6-month coverage join hit the Postgres statement timeout on
-- the first attempt, 07/22/2026 — measured, not anticipated. With them it returns in
-- seconds. The partial index serves the only predicate that matters for comp work:
-- "does this parcel have a real bedroom count".
--
-- LANDED 07/22/2026 (first live load): 108,848 rows / 92,625 distinct folioid.
-- 108,881 fetched, 33 collapse on merge as exact content duplicates (same parcel, month,
-- deed type and price — indistinguishable in the source, deduped by the comp_id hash).
-- Join: 91,546 of 92,625 folios (98.8%) resolve in data_lake.leepa_parcels.
--
-- GRAIN WARNING (docs/standards/data-roots.md T10): sale_year + sale_month_num are the
-- source's two separate integers. sale_month is a first-of-month DATE built for range
-- queries ONLY — the day component is an artifact of the DATE type, not a fact. Render
-- "May 2026", never "05/01/2026". This layer does NOT fix sale-date recency.

create index if not exists leepa_comparable_sales_folioid_idx
  on data_lake.leepa_comparable_sales (folioid);

-- Partial: the comp path only ever wants parcels with a real bedroom count.
create index if not exists leepa_comparable_sales_folioid_beds_idx
  on data_lake.leepa_comparable_sales (folioid)
  where bedrooms > 0;

analyze data_lake.leepa_comparable_sales;

grant select on all tables in schema data_lake to service_role;

notify pgrst, 'reload schema';

-- Verify (measured 07/22/2026):
--   select count(*) from data_lake.leepa_comparable_sales;                    -- 108,848
--   select count(*) from data_lake.leepa_comparable_sales where bedrooms > 0; --  75,746
