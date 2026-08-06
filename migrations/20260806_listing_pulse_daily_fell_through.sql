-- Names the sold->active transition (a closing that fell through AFTER the
-- deal recorded sold) in the Daily Market Pulse view. It was in the feed the
-- whole time (data_lake.listing_transitions), never lost, and was already
-- counted inside total_events — it simply had no bucket of its own. Distinct
-- from `returned` (holding->active — a PENDING deal falling through before
-- closing). Live-quantified 08/06/2026: 32 occurrences since coverage began
-- (07/02/2026), ~6-7/week across Lee+Collier. Check: sold_to_active_no_named_surface.
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
  max(scraped_at) as latest_scraped_at,
  count(*) filter (where from_state = 'sold' and to_state = 'active') as fell_through
from data_lake.listing_transitions
where seed = false
  and sale_or_rent is distinct from 'rent'
group by "at";

grant select on data_lake.listing_pulse_daily to service_role;
