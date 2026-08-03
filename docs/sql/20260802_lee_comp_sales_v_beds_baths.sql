-- 20260802_lee_comp_sales_v_beds_baths.sql
--
-- Wires LeePA layer 23 ("Comparable Sales") beds/baths into the Lee comp view,
-- and drops non-residential rows from the comp universe.
-- Plan: docs/superpowers/plans/2026-08-02-probe-red-burndown-tdd-plans.md (P1b Steps 0-1)
-- Resolves: check comps_commercial_contamination (sanity ceiling BEFORE any serving
-- path reads these columns) + check leepa_comp_sales_no_consumer (the answer-engine
-- comp path is now the consumer).
--
-- TWO CHANGES vs 20260722_lee_comp_sales_view.sql:
--   1. Residential filter: dor_use_code IN ('001','002','004','005','007','008') —
--      the same homes-only list parcel_subdivision_v uses. Kills the commercial rows
--      the contamination check named (4395 COLONIAL BLVD; the CAPTIVA DR $45M
--      bulk-sale trio dies with its office/hotel dor_uc).
--   2. beds/baths: LEFT JOIN LATERAL picking the LATEST layer-23 sale per folioid,
--      behind a BETWEEN 1 AND 10 sanity ceiling (live 08/02/2026 contamination:
--      800/800, 56/516, 412/512 — building totals, not home features). Outside the
--      ceiling or no join row -> NULL, never a fake count.
--
-- Join key: leepa_parcels.folioid (numeric) -> leepa_comparable_sales.folioid (text).
-- Live-measured 08/02/2026: 75,409 of 75,746 layer-23 rows with bedrooms>0 join (99.6%).
-- Indexes already in place: docs/sql/20260722_leepa_comparable_sales_indexes.sql.
--
-- Idempotent: create or replace (columns appended at the end only) + explicit grant
-- + PostgREST schema reload (the 07/22 lesson: without the reload the view serves
-- zero rows through PostgREST while direct SQL works).

create or replace view data_lake.lee_comp_sales_v as
select
  l.strap             as parcel_strap,
  f.phy_addr1         as address_line,
  f.phy_city          as city,
  f.phy_zipcd         as zip_code,
  f.living_area_sqft  as living_area_sqft,
  f.actual_year_built as year_built,
  f.dor_uc            as dor_use_code,
  l.last_sale_date    as sale_month,
  l.last_sale_amount  as sale_price,
  b.bedrooms          as beds,
  b.bathrooms         as baths
from data_lake.leepa_parcels l
join data_lake.lee_parcels f on f.parcel_id = l.strap
left join lateral (
  select c.bedrooms, c.bathrooms
  from data_lake.leepa_comparable_sales c
  where c.folioid = l.folioid::text
    and c.bedrooms  between 1 and 10
    and c.bathrooms between 1 and 10
  order by c.sale_month desc nulls last
  limit 1
) b on true
where l.last_sale_date is not null
  and l.last_sale_amount > 1000
  and f.living_area_sqft > 0
  and f.dor_uc in ('001','002','004','005','007','008');

comment on view data_lake.lee_comp_sales_v is
  'ROOT: Lee County SOLD COMP UNIVERSE, residential only (dor_uc 001/002/004/005/007/008). Sale recency+price from leepa_parcels, physical characteristics from lee_parcels (strap crosswalk 07/19/2026), beds/baths from leepa_comparable_sales (LeePA layer 23) via folioid lateral join behind a 1-10 sanity ceiling (08/02/2026). sale_month is MONTH GRAIN - never render as an exact date. living_area_sqft>0 excludes land per Fannie B4-1.3-08. Spec: docs/superpowers/specs/2026-07-22-comp-distance-ranker-design.md + plans/2026-08-02-probe-red-burndown-tdd-plans.md P1b';

grant select on data_lake.lee_comp_sales_v to service_role;

notify pgrst, 'reload schema';

-- Verify after running (08/02/2026 expectations):
--   select count(*) from data_lake.lee_comp_sales_v;                          -- < 387,609 (commercial dropped)
--   select count(*) from data_lake.lee_comp_sales_v where baths is not null;  -- > 0, plausibly ~60-70k
--   select count(*) from data_lake.lee_comp_sales_v where baths > 10;         -- MUST be 0
--   select beds, baths from data_lake.lee_comp_sales_v
--     where parcel_strap = '124523C4002190110';                               -- 3 / 3.0 (folio 10109534)
