-- 20260804_steadyapi_listing_events_v.sql
--
-- READ LAYER over `data_lake.steadyapi_listing_events`. NOT a root, NOT a second parse.
--
-- ══ CORRECTION 08/04/2026 — THIS FILE USED TO BE A SECOND ROOT ══════════════
-- Every earlier cut of this view parsed `steadyapi_property_history_raw`'s
-- `property_history[]` array itself — one day after `data_lake.steadyapi_listing_events`
-- was built from the SAME array (migration `20260803_steadyapi_listing_events.sql`,
-- parser `ingest/pipelines/listing_lifecycle/parse_listing_events.py`, 235,383 rows live,
-- 11 tests, wired into the listings brain via `listing_recent_price_cuts_stats`, and named
-- "IS the root" at `docs/standards/data-roots.md` line 500).
--
-- Two parses of one array, both live, with DIFFERENT rules: the table kept `price = 0`,
-- the view NULLed it; the table stored the vendor percentage as text on purpose, the view
-- cast it to numeric. The same property could answer differently depending on which
-- surface a caller reached.
--
-- The shape was never ambiguous. `docs/standards/data-consolidation-plan.md` — the source
-- of data-roots rule 4 — says it in one line: "Only ingest writes base tables; only root
-- views read them; only consumers read root views." Three layers. The playbook's "typed
-- tables from stored bytes" builds the BASE TABLE; rule 4's root view sits ON TOP of it.
-- The 08/04 build flattened the two and re-parsed the JSON. This restores the layering:
-- the parse happens ONCE, in the parser; this view only TYPES and GUARDS.
--
-- ⚠️ `listing_dom` STAYS THE DOM ROOT. `days_after_listed` is a VALIDATION column, here
-- and in the table — never a second days-on-market root (playbook ruling: the computed
-- view has full coverage and is deterministic; this does not).
--
-- ══ THE FOUR GUARDS THIS VIEW ADDS — all measured live 08/04/2026 ═══════════
--
-- 1. `price_change_pct` — POSITIVE EVIDENCE, not shape-guessing. A value counts as a
--    percentage only when it carries a '%' and no '$'. Measured across all 235,383 events:
--    44,896 values present · 42,633 percent-shaped · 2,263 DOLLAR-shaped ("+$1,000",
--    "-$900", "$0") · ZERO carrying both markers, so the two shapes separate cleanly.
--    Reading a dollar string as a percentage prints "-900%" off a $900 cut, which is why
--    the table stores this field as raw text and never casts it (migration comment,
--    08/03/2026). Two earlier cuts got this wrong in sequence: the first stripped only '%'
--    and matched 16,099 — every survivor NEGATIVE, because 26,978 of the values lead with
--    '+', so the column silently held cuts only. This rule parses all 42,633.
--    `price_change_pct_raw` keeps the vendor's text so a caller can tell "we hold nothing"
--    apart from "we refused what we were given".
--
-- 2. `price = 0` IS A SENTINEL, NOT A PRICE — concentrated: 22,745 of 49,531 "Listing
--    removed" events (45.9%) carry 0. NULLed here; `price_is_zero_sentinel` records that it
--    happened. `price_change` keeps its 0 — there, zero means "no change", which is real.
--    The table stores both raw; the guard belongs at the read edge, not in the store.
--
-- 3. RENT EVENTS SHARE THE HISTORY WITH SALE EVENTS. 17,022 rent events across 3,696
--    properties ("Listed for rent", "Price Changed for rent"). A consumer that averages
--    `price` without filtering mixes a $7,500 monthly rent into sale prices. `is_rental`
--    exists so no caller has to remember the string match.
--
-- 4. DIRTY DATE FLOOR. 3,097 events pre-date 1990 and 124 pre-date 1900, down to
--    1800-01-01. No future dates. `event_date` is NULLed outside [1900-01-01, today];
--    `event_date_raw` always carries what the table stored.
--
-- ══ TWO FACTS A CALLER SHOULD NOT RE-DERIVE ════════════════════════════════
-- The event vocabulary is 7 values, not 3: Price Changed 58,727 · Listed 58,329 · Listing
-- removed 49,531 · Sold 47,631 · Listed for rent 10,262 · Price Changed for rent 6,760 ·
-- Relisted 4,143. "Listing removed" and "Relisted" are the delisting/relisting signal.
--
-- `listing_id` is NULL on 31,217 events and `source_name = 'Public Record'` on exactly the
-- same 31,217 — deed/public-record events, not board listings. A null listing_id is not
-- missing data.
--
-- LISTING-SCOPED BY DEFINITION — a row exists only for a property we probed because it was
-- listed or sold. Never serve an aggregate off this view as a county or ZIP figure.
--
-- DROP + CREATE, not CREATE OR REPLACE: the column list changes shape (the old
-- `days_after_listed_raw` is gone — the table stores the parsed integer and nothing read
-- the raw string), and `create or replace view` can only append.

drop view if exists data_lake.steadyapi_listing_events_v;

create view data_lake.steadyapi_listing_events_v as
select
  e.property_id,
  e.event_seq                                                     as event_ordinal,
  e.event_name,
  -- Guard 3: rent and sale events share one history.
  e.event_name ilike '%for rent%'                                 as is_rental,
  e.event_date::text                                              as event_date_raw,
  -- Guard 4: the vendor's floor reaches 1800-01-01.
  case when e.event_date between date '1900-01-01' and current_date
       then e.event_date end                                      as event_date,
  -- Guard 2: $0 is a sentinel, never an asking price.
  nullif(e.price, 0)                                              as price,
  (e.price = 0)                                                   as price_is_zero_sentinel,
  -- 0 here means "no change" and IS real — do not null it.
  e.price_change,
  -- Guard 1: parsed ONCE in the lateral below and reused, because writing it inline in
  -- three places is exactly how the two branches drifted apart in an earlier cut.
  p.pct                                                           as price_change_pct,
  e.price_change_percentage                                       as price_change_pct_raw,
  e.price_sqft,
  -- VALIDATION ONLY — listing_dom stays the DOM root.
  e.days_after_listed,
  e.source_name,
  -- NULL on 31,217 events, all of them source_name='Public Record' — by design.
  e.listing_id,
  e.listing_list_price                                            as list_price,
  e.listing_status,
  e.listing_list_date::text                                       as list_date,
  e.listing_last_status_change_date::text                         as last_status_change_date,
  e.listing_last_update_date::text                                as last_update_date,
  e.address_key,
  e.county,
  e.fetched_at,
  -- True when the vendor shipped a percentage whose sign contradicts its own amount, so a
  -- caller can tell "we hold no percentage" apart from "we refused the one we were given".
  (p.pct is not null and e.price_change is not null
     and e.price_change <> 0 and sign(e.price_change) <> sign(p.pct))
                                                                  as price_change_pct_conflict
from data_lake.steadyapi_listing_events e
cross join lateral (
  select case
    when e.price_change_percentage like '%!%%' escape '!'
     and strpos(e.price_change_percentage, '$') = 0
     and translate(e.price_change_percentage, '+,%', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
    then translate(e.price_change_percentage, '+,%', '')::numeric
  end as pct
) p;

comment on view data_lake.steadyapi_listing_events_v is
  'READ LAYER over data_lake.steadyapi_listing_events - NOT a root and NOT a second parse. The ROOT is the table (migration 20260803_steadyapi_listing_events.sql, parser ingest/pipelines/listing_lifecycle/parse_listing_events.py, 235,383 rows, data-roots line 500). CORRECTION 08/04/2026: every earlier cut of this view re-parsed property_history[] itself, one day after the table was built from the same array, leaving two live surfaces with different rules for one concept - the table kept price=0 and stored the vendor percentage as text on purpose, the view NULLed the zero and cast the percentage. docs/standards/data-consolidation-plan.md, the source of data-roots rule 4, settles it: only ingest writes base tables, only root views read them, only consumers read root views. The parse now happens once and this view only types and guards. FOUR GUARDS, measured live 08/04/2026: (1) price_change_pct counts a value as a percentage ONLY when it carries a percent sign and no dollar sign - 44,896 present, 42,633 percent-shaped, 2,263 DOLLAR-shaped (+$1,000 / -$900 / $0), ZERO carrying both, so the shapes separate cleanly and a dollar amount can never print as -900%; two earlier cuts got this wrong, the first stripping only the percent sign and matching 16,099 with every survivor NEGATIVE because 26,978 values lead with plus; price_change_pct_raw keeps the vendor text and price_change_pct_conflict flags a percentage whose sign contradicts its own amount. (2) price=0 is a SENTINEL concentrated in Listing removed (22,745 of 49,531 = 45.9%) - NULLed, with price_is_zero_sentinel recording it, while price_change keeps its 0 because there zero means no-change. (3) RENT events share the history with sale events - 17,022 across 3,696 properties - use is_rental or a $7,500 monthly rent lands in a sale-price average. (4) dirty date floor - 3,097 events pre-1990 and 124 pre-1900 down to 1800-01-01, zero future - event_date NULLed outside [1900-01-01, today], event_date_raw always kept. Vocabulary is 7 values not 3: Price Changed 58,727, Listed 58,329, Listing removed 49,531, Sold 47,631, Listed for rent 10,262, Price Changed for rent 6,760, Relisted 4,143. listing_id is NULL on 31,217 events and source_name=Public Record on exactly the same 31,217 - deed/public-record events, not missing data. listing_dom STAYS the DOM root; days_after_listed is a validation column. LISTING-SCOPED, never a county or ZIP statistic. Playbook: docs/superpowers/plans/2026-08-02-steadyapi-raw-landing-playbook.md STEP 3 family A.';

grant select on data_lake.steadyapi_listing_events_v to service_role;

notify pgrst, 'reload schema';
