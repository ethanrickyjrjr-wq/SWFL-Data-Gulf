-- 20260804_steadyapi_property_permits_v.sql
--
-- FAMILY C of the raw-landing playbook (docs/superpowers/plans/2026-08-02-steadyapi-raw-landing-playbook.md
-- STEP 3): per-property building permits, typed out of bytes we ALREADY BOUGHT AND STORED.
-- Operator 08/04/2026: "why the fuck are we not bringing in data we need... get everything."
--
-- ZERO PAID CALLS. Every row below is parsed from `steadyapi_property_history_raw`, landed
-- 08/02-08/03/2026. Measured live 08/04/2026: 79,281 permit rows across 12,946 properties.
--
-- ── A VIEW, NOT A TABLE — deliberate deviation from the playbook's "typed tables" wording ──
-- data-roots.md rule 4 is explicit: "Roots are VIEWS (or one loader function for cross-table
-- math) — one definition, fix once." The bytes are already persisted and immutable, so a second
-- physical copy would buy nothing and cost three things we have been burned by: a staleness
-- window between table and bytes, another cron to run and monitor, and another Gate-4 destructive
-- -write surface. A view cannot drift from its source. If a measured query-latency problem ever
-- appears, materialize THIS definition — do not hand-roll a parallel one.
--
-- ── THE DATE LANDMINE, MEASURED (not assumed) ─────────────────────────────────
-- The 08/02 census warned `effective_date` is the human string "Mar 8, 2021". Live probe
-- 08/04/2026: it is not occasional, it is UNIVERSAL — 79,281 of 79,281 match 'Mon D, YYYY'
-- and ZERO are ISO. `to_date(..., 'Mon DD, YYYY')` parses all 79,281 with no failures.
--
-- ── THE DIRTY TAIL, MEASURED ──────────────────────────────────────────────────
-- 4 rows parse to absurd futures: "Feb 14, 2282" (status Issued) and "Aug 1, 2269" x3
-- (status Final — a completed permit 243 years from now). 0 rows are pre-1900. So the guard is
-- one-sided: `effective_date` is NULL'd when it lands after today. The RAW STRING IS ALWAYS
-- KEPT in `effective_date_raw`, so nothing is destroyed and the garbage stays inspectable —
-- same discipline as the beds/baths 1-10 ceiling on lee_comp_sales_v.
--
-- ── SCOPE LAW (playbook, binding) ─────────────────────────────────────────────
-- Steady data is LISTING-SCOPED: a permit row exists only for a property we probed because it
-- was listed or sold. County rolls are FULL-BOOK. This view is the root for "permits on THIS
-- listed/sold property" and is NEVER the authority for a county-wide permit statistic — the
-- county spines (lee_building_permits, collier_building_permits) stay the area-wide lane.
-- Never serve a count off this view as "permits in Lee County".
--
-- ── DUPLICATES ARE REAL AND ARE NOT SILENTLY REMOVED ──────────────────────────
-- MEASURED 08/04/2026 — two keys, 14x apart, and quoting either alone misleads:
--   · LOOSE key (property_id + permit_type + status + effective_date_raw):
--     7,274 groups covering 12,371 surplus rows = 15.6% of 79,281.
--   · EVERY-FIELD key (adds the three project_type columns):
--     673 groups covering 882 surplus rows = 1.1%.
-- The gap is rows sharing a type and date but carrying DIFFERENT project_type tags —
-- e.g. property 6782488671 has "Single family - new home" twice on "Aug 1, 2269", one
-- tagged (New construction, Plumbing, Residential) and one (Hvac, New construction,
-- Plumbing). Possibly one permit the vendor emitted with rotating tags; nothing we hold
-- proves it. The view NEVER dedupes — `permit_ordinal` keeps every row addressable — and
-- the consumer collapses only the every-field kind. Over-merging destroys history;
-- double-counting merely inflates a count.
--
-- ── POOL WARNING — DO NOT CREATE A SECOND POOL ROOT ───────────────────────────
-- `permit_type` takes the literal value 'Pool'. That is a PERMIT EVENT, not a current-state
-- fact about the home, and it is listing-scoped. The ONE pool root is `lee_comp_sales_v.pool`
-- (docs/sql/20260804_lee_comp_sales_v_pool.sql). Never answer "does it have a pool" from here.

create or replace view data_lake.steadyapi_property_permits_v as
select
  r.property_id,
  -- Ordinal within the property's permit array. Part of the identity: the vendor ships exact
  -- duplicate permit objects, so property_id + fields alone is NOT unique.
  (p.ord)::int                                    as permit_ordinal,
  p.obj->>'permit_type'                           as permit_type,
  p.obj->>'status'                                as status,
  p.obj->>'project_name'                          as project_name,
  p.obj->>'project_type_1'                        as project_type_1,
  p.obj->>'project_type_2'                        as project_type_2,
  p.obj->>'project_type_3'                        as project_type_3,
  -- ALWAYS preserved, exactly as the vendor sent it.
  p.obj->>'effective_date'                        as effective_date_raw,
  -- Sanity-guarded parse. NULL rather than a fabricated-looking future date.
  case
    when to_date(p.obj->>'effective_date', 'Mon DD, YYYY') <= current_date
     and to_date(p.obj->>'effective_date', 'Mon DD, YYYY') >= date '1900-01-01'
    then to_date(p.obj->>'effective_date', 'Mon DD, YYYY')
  end                                             as effective_date,
  r.address_key,
  r.county,
  r.fetched_at
from data_lake.steadyapi_property_history_raw r
cross join lateral jsonb_array_elements(
  coalesce(r.body->'body'->'building_permits', '[]'::jsonb)
) with ordinality as p(obj, ord);

comment on view data_lake.steadyapi_property_permits_v is
  'ROOT: per-property BUILDING PERMITS for listed/sold properties, parsed with ZERO paid calls from data_lake.steadyapi_property_history_raw (bodies landed 08/02-08/03/2026). 79,281 permit rows / 12,946 properties measured 08/04/2026. LISTING-SCOPED - a row exists only for a property we probed, so this is NEVER the authority for a county-wide permit statistic; lee_building_permits / collier_building_permits stay the area-wide lane. effective_date_raw is the vendor string (UNIVERSALLY the human format Mon D, YYYY - 79,281 of 79,281, zero ISO); effective_date is the parsed date NULLed outside [1900-01-01, today] because 4 rows carry absurd futures (Feb 14 2282; Aug 1 2269 x3). Exact duplicate permit objects are NOT deduped - permit_ordinal keeps them visible and the key unique. permit_type can equal Pool: that is a permit EVENT, never a pool-ownership fact - the ONE pool root is lee_comp_sales_v.pool. Playbook: docs/superpowers/plans/2026-08-02-steadyapi-raw-landing-playbook.md STEP 3 family C.';

grant select on data_lake.steadyapi_property_permits_v to service_role;

notify pgrst, 'reload schema';
