-- 20260804_steadyapi_property_permits_v.sql
--
-- FAMILY C of the raw-landing playbook (docs/superpowers/plans/2026-08-02-steadyapi-raw-landing-playbook.md
-- STEP 3): per-property building permits, typed out of bytes we ALREADY BOUGHT AND STORED.
-- Operator 08/04/2026: "why the fuck are we not bringing in data we need... get everything."
--
-- ZERO PAID CALLS. The bytes were landed 08/02-08/03/2026 and parsed ONCE, by
-- `ingest/pipelines/.../parse_property_permits.py`, into `data_lake.steadyapi_property_permits`.
-- Measured live 08/04/2026: 79,281 permit rows across 12,946 properties.
--
-- ── A READ LAYER OVER THE TABLE — NOT A ROOT, NOT A SECOND PARSE ──────────────
-- The ROOT is `data_lake.steadyapi_property_permits`. This view types and guards it and
-- nothing else. `docs/standards/data-consolidation-plan.md` — the source of data-roots
-- rule 4 — sets the layering in one line: "only ingest writes base tables; only root views
-- read them; only consumers read root views." Three layers, not two. Never re-parse
-- `steadyapi_property_history_raw` here; if a field is missing, add it to the PARSER.
--
-- ── THE DATE LANDMINE, MEASURED (not assumed) ─────────────────────────────────
-- The 08/02 census warned the vendor's `effective_date` is the human string "Mar 8, 2021".
-- Live probe 08/04/2026: not occasional — UNIVERSAL, 79,281 of 79,281 match 'Mon D, YYYY',
-- ZERO ISO. The parser converts all 79,281 with no failures, so the table holds a real
-- `date` and this view never has to touch a string.
--
-- ── THE DIRTY TAIL, MEASURED ──────────────────────────────────────────────────
-- 4 rows parse to absurd futures: "Feb 14, 2282" (status Issued) and "Aug 1, 2269" x3
-- (status Final — a completed permit 243 years from now). 0 rows are pre-1900. So the guard is
-- one-sided: `effective_date` is NULL'd when it lands after today. NOTHING IS DESTROYED —
-- `effective_date_raw` carries the UNGUARDED stored date, so the garbage stays inspectable
-- (as "2269-08-01", not as the vendor's "Aug 1, 2269" — see the honest-loss note below) —
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

-- ══ CORRECTION 08/04/2026 — THIS VIEW USED TO BE A SECOND PARSE ════════════
-- It parsed `steadyapi_property_history_raw`'s `building_permits[]` array itself, alongside
-- `data_lake.steadyapi_property_permits` — the typed table built from the SAME array, at an
-- identical 79,281 rows. Two parses of one array is the "one root per concept" violation,
-- and `docs/standards/data-consolidation-plan.md` — the source of data-roots rule 4 —
-- settles the shape: "only ingest writes base tables; only root views read them; only
-- consumers read root views." The TABLE is the root. This is the read layer over it.
--
-- ⚠️ ONE HONEST LOSS, NOT PAPERED OVER. `effective_date_raw` used to be the vendor's
-- literal human string ("Mar 8, 2021"). The root table does not keep that string — it
-- stores the parsed, UNGUARDED date. So this column is now that unguarded date as ISO text
-- ("2021-03-08"). It still does the job the column exists for: the 4 absurd futures
-- (Feb 14 2282, Aug 1 2269 x3) stay visible and inspectable after `effective_date` NULLs
-- them, and the dedupe key in `lib/listings/property-permits.ts` is unaffected because raw
-- and parsed are 1:1 derivations of each other. What is gone is the vendor's exact
-- formatting. Restoring it means adding the raw string to the TABLE, in the parser —
-- tracked as `steadyapi_permits_vendor_date_string_not_stored`, not fixed by a second parse.

create or replace view data_lake.steadyapi_property_permits_v as
select
  e.property_id,
  -- Ordinal within the property's permit array. Part of the identity: the vendor ships exact
  -- duplicate permit objects, so property_id + fields alone is NOT unique.
  e.permit_seq                                    as permit_ordinal,
  e.permit_type,
  e.status,
  e.project_name,
  e.project_type_1,
  e.project_type_2,
  e.project_type_3,
  -- The stored date UNGUARDED, so the absurd futures stay inspectable (see note above).
  e.effective_date::text                          as effective_date_raw,
  -- Sanity-guarded. NULL rather than a fabricated-looking future date.
  case when e.effective_date between date '1900-01-01' and current_date
       then e.effective_date end                  as effective_date,
  e.address_key,
  e.county,
  e.fetched_at
from data_lake.steadyapi_property_permits e;

comment on view data_lake.steadyapi_property_permits_v is
  'READ LAYER over data_lake.steadyapi_property_permits - NOT a root and NOT a second parse. The ROOT is the TABLE; this view only types and guards it (data-consolidation-plan.md: only ingest writes base tables, only root views read them, only consumers read root views). CORRECTION 08/04/2026: an earlier cut of this view re-parsed property_history_raw building_permits[] itself, alongside the table built from the same array at the identical 79,281 rows - two parses of one array. Per-property BUILDING PERMITS for listed/sold properties, ZERO paid calls (bodies landed 08/02-08/03/2026). 79,281 permit rows / 12,946 properties measured 08/04/2026. LISTING-SCOPED - a row exists only for a property we probed, so this is NEVER the authority for a county-wide permit statistic; lee_building_permits / collier_building_permits stay the area-wide lane. effective_date is the stored date NULLed outside [1900-01-01, today] because 4 rows carry absurd futures (Feb 14 2282; Aug 1 2269 x3); effective_date_raw is that same date UNGUARDED, as ISO text, so the garbage stays inspectable. KNOWN LOSS: the vendor ships the human string Mar 8, 2021 (universally - 79,281 of 79,281, zero ISO) and the table does not store it, so effective_date_raw is no longer the vendor literal - restore it in the PARSER if ever needed, never by re-parsing here (check steadyapi_permits_vendor_date_string_not_stored). Exact duplicate permit objects are NOT deduped - permit_ordinal keeps them visible and the key unique. permit_type can equal Pool: that is a permit EVENT, never a pool-ownership fact - the ONE pool root is lee_comp_sales_v.pool. Playbook: docs/superpowers/plans/2026-08-02-steadyapi-raw-landing-playbook.md STEP 3 family C.';

grant select on data_lake.steadyapi_property_permits_v to service_role;

notify pgrst, 'reload schema';
