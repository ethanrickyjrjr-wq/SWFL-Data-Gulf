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
-- A READ LAYER over `data_lake.steadyapi_tax_history` — NOT a root, NOT a second parse.
-- Same shape as the permits view: the TABLE is the root, this types and guards it. Never
-- re-parse `steadyapi_property_history_raw` here; a missing field goes in the PARSER.

-- ══ CORRECTION 08/04/2026 — THIS VIEW USED TO BE A SECOND PARSE ════════════
-- It parsed `steadyapi_property_history_raw`'s `tax_history[]` array itself, alongside
-- `data_lake.steadyapi_tax_history` — the typed table built from the SAME array, at an
-- identical 273,051 rows. Two parses of one array is the "one root per concept" violation,
-- and `docs/standards/data-consolidation-plan.md` — the source of data-roots rule 4 —
-- settles the shape: "only ingest writes base tables; only root views read them; only
-- consumers read root views." The TABLE is the root. This is the read layer over it.
--
-- The per-field `jsonb_typeof` guards that used to live here did their work at PARSE time
-- and belong to the parser now, not the reader. What survives is the one guard that is a
-- READ concern: a defensive future-year rejection, kept because `tax_year` is the column a
-- caller is most likely to render straight onto a series axis.

create or replace view data_lake.steadyapi_tax_history_v as
select
  e.property_id,
  e.tax_year,
  e.tax_amount,
  e.assessment_total,
  e.assessment_building,
  e.assessment_land,
  e.market_value_total,
  e.market_value_building,
  e.market_value_land,
  e.address_key,
  e.county,
  e.fetched_at
from data_lake.steadyapi_tax_history e
where e.tax_year <= extract(year from current_date)::int;

comment on view data_lake.steadyapi_tax_history_v is
  'READ LAYER over data_lake.steadyapi_tax_history - NOT a root and NOT a second parse. The ROOT is the TABLE; this view only types and guards it (data-consolidation-plan.md: only ingest writes base tables, only root views read them, only consumers read root views). CORRECTION 08/04/2026: an earlier cut re-parsed property_history_raw tax_history[] itself, alongside the table built from the same array at the identical row count - two parses of one array. Per-property per-YEAR tax + valuation series, ZERO paid calls. 273,051 year-rows / 16,514 properties / 2007-2025, avg 16.5 years per property (measured 08/04/2026). NOT A VALUATION AUTHORITY - full-book assessed/market value stays leepa_parcels (Lee) and collier_parcels (Collier, which IS the FDOR pull and IS covered). LISTING-SCOPED: a row exists only for a probed listed/sold property, so never serve an aggregate here as a county or ZIP statistic. Two jobs: (1) the third cross-source agreement family vs county valuation; (2) the intended home for annual tax paid, where no root exists today (fetchPropertyTaxAnnual is a stub). tax_amount IS NOT CLEARED FOR USER-FACING SERVING until validated against a real county tax bill - check steadyapi_tax_amount_validation_owed - and a vendor annual tax figure is not the county bill. VALUE SPARSITY IS THE TRAP: assessment_total 99.99% but assessment_building 22.0% and assessment_land 19.0%; market_value_total 99.9%, building 77.7%, land 67.3% - key presence is not value presence, never render an absent split as zero. 4 rows carry tax_amount=0 and those are real tiny parcels (assessment total 100-103), not sentinels. Playbook: docs/superpowers/plans/2026-08-02-steadyapi-raw-landing-playbook.md STEP 3 family B.';

grant select on data_lake.steadyapi_tax_history_v to service_role;

notify pgrst, 'reload schema';
