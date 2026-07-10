-- ZIP×month YoY % change of ZHVI, computed at source so the /charts heatmap
-- reads a small window instead of hauling 34k raw rows past the PostgREST cap.
-- Join on month-truncated period_end (period_end is month-END; a leap-February
-- date-arithmetic join would miss 2024-02-29 → 2025-02-28).
create or replace view data_lake.zhvi_zip_yoy_monthly as
select
  cur.zip_code,
  cur.period_end,
  cur.home_value,
  ((cur.home_value - prior.home_value) / prior.home_value) * 100.0 as yoy_pct
from data_lake.zhvi_swfl cur
join data_lake.zhvi_swfl prior
  on prior.zip_code = cur.zip_code
 and date_trunc('month', prior.period_end) = date_trunc('month', cur.period_end - interval '1 year')
where cur.home_value is not null
  and prior.home_value is not null
  and prior.home_value <> 0;

grant select on data_lake.zhvi_zip_yoy_monthly to service_role;
