-- 20260804_lee_comp_sales_v_pool.sql
--
-- Adds POOL to the Lee comp view. Operator, 08/04/2026: "WE WANT SIMILAR SQ FT, STYLE,
-- BEDS AND BATHS SAME OR CLOSE AND POOL OR NO POOL. WE ARE FUCKING COMPARING!!!"
--
-- ── WHY THIS IS A ONE-COLUMN CHANGE AND NOT A VENDOR ONBOARDING ───────────────
-- `data_lake.leepa_comparable_sales.pool` has been populated since 07/22/2026 and is
-- NOT NULL on 108,848 of 108,848 rows (PostgREST count=exact, 08/04/2026), carrying the
-- literal source strings 'Pool' / 'No Pool'. `ingest/pipelines/leepa_comp_sales/
-- constants.py:42` pulls it; `resources.py:63,127` maps it. The 08/02 change to this
-- view opened a LEFT JOIN LATERAL against that exact row to take `bedrooms`/`bathrooms`
-- and simply did not select `pool` — so the data has been one unselected line away for
-- two days while the open check recorded "needs a new Zillow vendor onboarding."
--
-- It is FREE: same join, same row, zero extra calls, zero extra cost.
--
-- ── NO SANITY CEILING, DELIBERATELY ──────────────────────────────────────────
-- beds/baths carry a BETWEEN 1 AND 10 ceiling because layer 23 reports commercial
-- BUILDING TOTALS there (800/800, 56/516). `pool` has no such failure mode — it is a
-- two-value enum, not a count. Normalisation to a three-state boolean happens in exactly
-- ONE place, `poolFromSource` in lib/assistant/comp-source-lake.ts; anything the source
-- did not say stays NULL and the ranker skips the axis rather than guessing "no pool".
--
-- ── ONE ROOT (RULE 0.55) ─────────────────────────────────────────────────────
-- `lee_comp_sales_v.pool` is the ONLY pool root we serve. Any surface needing pool reads
-- this view. Do NOT add a second pool lane from listing detail pages, from a Maps POI
-- sweep, or from a new vendor actor without retiring this one first.
-- LEE ONLY — there is no Collier equivalent to this view (data-roots T9), so Collier
-- pool remains genuinely unsourced and must never be inferred.
--
-- Idempotent: create or replace (pool appended LAST so existing positional readers, if
-- any, do not shift) + explicit grant + PostgREST schema reload (the 07/22 lesson:
-- without the reload the view serves zero rows through PostgREST while direct SQL works).

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
  b.bathrooms         as baths,
  b.pool              as pool
from data_lake.leepa_parcels l
join data_lake.lee_parcels f on f.parcel_id = l.strap
left join lateral (
  select c.bedrooms, c.bathrooms, c.pool
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
  'ROOT: Lee County SOLD COMP UNIVERSE, residential only (dor_uc 001/002/004/005/007/008). Sale recency+price from leepa_parcels, physical characteristics from lee_parcels (strap crosswalk 07/19/2026), beds/baths/POOL from leepa_comparable_sales (LeePA layer 23) via folioid lateral join; beds/baths behind a 1-10 sanity ceiling (08/02/2026), pool added 08/04/2026 as the raw source enum Pool/No Pool (normalised ONCE in lib/assistant/comp-source-lake.ts poolFromSource - this is the ONLY pool root, RULE 0.55). sale_month is MONTH GRAIN - never render as an exact date. living_area_sqft>0 excludes land per Fannie B4-1.3-08. LEE ONLY - no Collier equivalent exists, never infer Collier pool. Spec: docs/superpowers/specs/2026-07-22-comp-distance-ranker-design.md';

grant select on data_lake.lee_comp_sales_v to service_role;

notify pgrst, 'reload schema';
