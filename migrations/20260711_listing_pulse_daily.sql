-- Daily transition pulse, aggregated at source so /desk reads ~30 small rows
-- instead of hauling ~1.3k raw transition rows/day past the PostgREST cap.
-- Class definitions mirror the observed state machine (verified 07/11/2026):
--   new        = first sighting (no prior state) entering active
--   price_cut  = active->active with a negative price_delta
--   returned   = holding->active (back on the wire after an ambiguous departure)
--   departures = ->holding (ambiguous: left active, reason NOT asserted)
--   sold/withdrawn = explicit terminal transitions
-- Seed rows are the baseline backfill, not market events — always excluded.
create or replace view data_lake.listing_pulse_daily as
select
  "at" as day,
  count(*) filter (where from_state is null and to_state = 'active') as new_listings,
  count(*) filter (where from_state = 'active' and to_state = 'active' and price_delta < 0) as price_cuts,
  count(*) filter (where from_state = 'active' and to_state = 'active' and price_delta > 0) as price_increases,
  count(*) filter (where from_state = 'holding' and to_state = 'active') as returned,
  count(*) filter (where to_state = 'holding') as departures,
  count(*) filter (where to_state = 'sold') as sold,
  count(*) filter (where to_state = 'withdrawn') as withdrawn,
  count(*) as total_events,
  max(scraped_at) as latest_scraped_at
from data_lake.listing_transitions
where seed = false
  and sale_or_rent is distinct from 'rent'
group by "at";

grant select on data_lake.listing_pulse_daily to service_role;
