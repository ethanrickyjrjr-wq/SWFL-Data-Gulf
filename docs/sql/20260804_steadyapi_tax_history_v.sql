-- 20260804_steadyapi_tax_history_v.sql
--
-- FAMILY B of the raw-landing playbook (STEP 3): per-property, per-YEAR tax + valuation
-- series, typed out of bytes we ALREADY BOUGHT AND STORED. ZERO paid calls.
-- Measured live 08/04/2026: 273,051 year-rows across 16,514 properties, 2007-2025,
-- averaging 16.5 years of history per property (max 19, min 1).
--
-- ── WHAT THIS IS **NOT** (the authority ruling, locked 08/02/2026) ────────────
-- This is NOT the valuation authority for either county, and must never be wired as one.
-- Full-book assessed/market value STAYS `leepa_parcels` (Lee) and `collier_parcels`
-- (Collier — that IS the FDOR pull, so Collier is already covered; an earlier shorthand
-- claiming Steady "covers Collier where LEEPA doesn't reach" was WRONG and is corrected
-- here). County rolls are full-book; this is listing-scoped — a row exists only for a
-- property we probed because it was listed or sold. Never serve an aggregate off this
-- view as a county or ZIP statistic.
--
-- Its two real jobs:
--   1. The THIRD cross-source agreement family — steady_tax vs county valuation — the
--      same two-class discipline already running for leepa-vs-fdor and realtor-vs-redfin.
--      This is the operator's "use all the data to confirm data we already have".
--   2. The intended home for ANNUAL TAX PAID by year, where NO built root exists today
--      (`fetchPropertyTaxAnnual` is a stub; check `should_i_sell_property_tax_source`).
--
-- ⚠️ `tax_amount` IS NOT CLEARED FOR SERVING YET. The playbook requires it be validated
-- against a known county tax bill first, and carry the caveat that a vendor's annual tax
-- figure is not the county bill. Gate tracked in `steadyapi_tax_amount_validation_owed`.
-- The column exists so validation can run; a user-facing surface must not read it until
-- that check closes.
--
-- ── SHAPE, MEASURED — the census's "assessment{total,building,land}" is only half true ──
-- Every key exists on every row, but the VALUES are sparse and wildly uneven. Key
-- presence is not value presence, and treating these as populated is how a "$0 land
-- value" reaches a reader:
--     assessment.total     273,034 / 273,051  (99.99%)
--     assessment.building   60,025            (22.0%)   ← SPARSE
--     assessment.land       51,757            (19.0%)   ← SPARSE
--     market_value.total   272,912            (99.9%)
--     market_value.building 212,091           (77.7%)
--     market_value.land    183,723            (67.3%)
-- Also: `market_value` is JSON null (not an object) on 139 rows, and `tax_amount` is
-- JSON null on exactly 1. Both are handled by `->` + jsonb_typeof rather than assumed.
--
-- ── DIRTY TAIL, MEASURED ──────────────────────────────────────────────────────
-- 4 rows carry tax_amount = 0. Inspected: they are genuinely tiny parcels (assessment
-- total $100-$103), so ZERO IS KEPT — it is a real figure, not a sentinel. Years span
-- 2007-2025 with ZERO future years, so no year guard is needed beyond rejecting a
-- non-numeric or future year defensively.
--
-- A VIEW, not a table — same reasoning as the permits view: data-roots rule 4, the bytes
-- are already persisted and immutable, and a second copy buys only a staleness window.

create or replace view data_lake.steadyapi_tax_history_v as
select
  r.property_id,
  (h->>'year')::int                                                as tax_year,
  -- Numeric ONLY when the vendor really sent a number. `->>` on a JSON null yields SQL
  -- NULL, but a defensive typeof keeps a future string payload from casting to garbage.
  case when jsonb_typeof(h->'tax_amount') = 'number'
       then (h->>'tax_amount')::numeric end                        as tax_amount,
  case when jsonb_typeof(h->'assessment'->'total') = 'number'
       then (h->'assessment'->>'total')::numeric end               as assessment_total,
  case when jsonb_typeof(h->'assessment'->'building') = 'number'
       then (h->'assessment'->>'building')::numeric end            as assessment_building,
  case when jsonb_typeof(h->'assessment'->'land') = 'number'
       then (h->'assessment'->>'land')::numeric end                as assessment_land,
  case when jsonb_typeof(h->'market_value'->'total') = 'number'
       then (h->'market_value'->>'total')::numeric end             as market_value_total,
  case when jsonb_typeof(h->'market_value'->'building') = 'number'
       then (h->'market_value'->>'building')::numeric end          as market_value_building,
  case when jsonb_typeof(h->'market_value'->'land') = 'number'
       then (h->'market_value'->>'land')::numeric end              as market_value_land,
  r.address_key,
  r.county,
  r.fetched_at
from data_lake.steadyapi_property_history_raw r
cross join lateral jsonb_array_elements(
  coalesce(r.body->'body'->'tax_history', '[]'::jsonb)
) as h
where h->>'year' ~ '^[0-9]{4}$'
  and (h->>'year')::int <= extract(year from current_date)::int;

comment on view data_lake.steadyapi_tax_history_v is
  'Per-property per-YEAR tax + valuation series, parsed with ZERO paid calls from data_lake.steadyapi_property_history_raw. 273,051 year-rows / 16,514 properties / 2007-2025, avg 16.5 years per property (measured 08/04/2026). NOT A VALUATION AUTHORITY - full-book assessed/market value stays leepa_parcels (Lee) and collier_parcels (Collier, which IS the FDOR pull and IS covered). LISTING-SCOPED: a row exists only for a probed listed/sold property, so never serve an aggregate here as a county or ZIP statistic. Two jobs: (1) the third cross-source agreement family vs county valuation; (2) the intended home for annual tax paid, where no root exists today (fetchPropertyTaxAnnual is a stub). tax_amount IS NOT CLEARED FOR USER-FACING SERVING until validated against a real county tax bill - check steadyapi_tax_amount_validation_owed - and a vendor annual tax figure is not the county bill. VALUE SPARSITY IS THE TRAP: assessment_total 99.99% but assessment_building 22.0% and assessment_land 19.0%; market_value_total 99.9%, building 77.7%, land 67.3% - key presence is not value presence, never render an absent split as zero. 4 rows carry tax_amount=0 and those are real tiny parcels (assessment total 100-103), not sentinels. Playbook: docs/superpowers/plans/2026-08-02-steadyapi-raw-landing-playbook.md STEP 3 family B.';

grant select on data_lake.steadyapi_tax_history_v to service_role;

notify pgrst, 'reload schema';
