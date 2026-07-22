-- 20260722_lee_comp_sales_view.sql
--
-- ROOT: Lee County SOLD COMP UNIVERSE — the candidate set for comp selection.
-- Spec: docs/superpowers/specs/2026-07-22-comp-distance-ranker-design.md
-- Consumer: lib/assistant/comp-source-lake.ts (fetchLeeComps)
--
-- WHY. The vendor's /nearby-home-values response carries NO sale date; real sale dates
-- arrive only from a per-comp enrichment hard-capped at 2 calls. A "sold in the last 6
-- months" window therefore could not be enforced on the vendor feed without treating AVM
-- valuation dates as sale dates — an invented fact. We already held the real thing.
--
-- SHAPE. Sale recency + price from leepa_parcels (Lee Property Appraiser); physical
-- characteristics from lee_parcels (FDOR); joined on the strap crosswalk that landed
-- 07/19/2026 (leepa_parcels.strap = lee_parcels.parcel_id, 97.4% join rate on 6-month sales).
--
-- MEASURED LIVE 07/22/2026 after creation:
--   387,609 home sales all-time · 8,999 in the trailing 6 months · 41 ZIPs · newest 06/01/2026
--   Example subject (1,978 sq ft, ZIP 33991): 64 in-band candidates, tier 1, standard met.
--
-- TWO PROPERTIES CONSUMERS MUST HONOR:
--   1. sale_month is MONTH GRAIN. Every leepa_parcels.last_sale_date is day-of-month 1
--      (all 31,632 rows in the trailing 12 months). NEVER render it as an exact date —
--      "May 2026", not "05/01/2026". Doing otherwise asserts a precision the source
--      does not have. comp-rank.ts enforces this via dateGrain: "month".
--   2. NEITHER source has a bedroom or bathroom column. living_area_sqft > 0 is the home
--      test — it excludes land, which is what Fannie Mae B4-1.3-08's ban on mixing
--      vacant-land sales into a home comp set requires.
--
-- SCOPE: LEE ONLY. Collier's parcel table carries FDOR month-grain sale fields with no
-- exact-date equivalent, so Collier needs its own source before it can be served.
--
-- Idempotent: create or replace + an explicit grant. The grant is NOT optional — the
-- view returned zero rows through PostgREST until service_role was granted and the
-- schema cache reloaded, while direct SQL returned 64. Verified by live probe, not assumed.

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
  l.last_sale_amount  as sale_price
from data_lake.leepa_parcels l
join data_lake.lee_parcels f on f.parcel_id = l.strap
where l.last_sale_date is not null
  and l.last_sale_amount > 1000
  and f.living_area_sqft > 0;

comment on view data_lake.lee_comp_sales_v is
  'ROOT: Lee County SOLD COMP UNIVERSE. Sale recency+price from leepa_parcels (Lee Property Appraiser), physical characteristics from lee_parcels (FDOR), joined on the 07/19/2026 strap crosswalk. sale_month is MONTH GRAIN (every last_sale_date is day-of-month 1) - never render it as an exact date. living_area_sqft>0 is the home test (excludes land, per Fannie B4-1.3-08). No beds/baths exist in either source. Spec: docs/superpowers/specs/2026-07-22-comp-distance-ranker-design.md';

grant select on data_lake.lee_comp_sales_v to service_role;

notify pgrst, 'reload schema';

-- Verify (expect ~8,999 in the trailing 6 months as of 07/22/2026):
--   select count(*) from data_lake.lee_comp_sales_v
--   where sale_month >= current_date - interval '6 months';
