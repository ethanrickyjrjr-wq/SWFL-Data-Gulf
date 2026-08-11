# Baths handoff — real fill-rate + the lane we shipped (live probe 08/03/2026)

**Why:** `_ASSISTANT/2026-08-03-listings-baths-HANDOFF.md` (RULE 3.5 handoff) asked three
questions before any code: (1) how often does each lane actually fire at real scale, (2) is
there a property_id-keyed lane that sidesteps the address-match problem entirely, (3) what
does it cost at multi-category-recipe scale. Answered from our own code + a live query
against `data_lake.listing_state` — no crawl4ai needed, no vendor quota spent.

## Q2 answered first: the property_id-keyed lane already exists — it's not a new endpoint

`data_lake.listing_state.baths` is populated by `ingest/pipelines/listing_lifecycle/
extract_api.py enrich_baths_batched` via `/nearby-home-values`, **clustered by lat/lon**,
never by address match. `property_id` is a real, indexed column on every row (budget-fix
migration `20260630b_listing_state_budget_fix_columns.sql`). Streetless rows (builder spec
homes with a real listing but no house-number permalink token) get keyed onto
`L<property_id>:<zip>` identity keys (`address_key.py identity_key`, migration
`20260716_listing_state_streetless_rekey.sql`) — so THEY are in the lake too, unlike the
`ready_to_build`/`is_plan` builder-FLOOR-PLAN records, which are correctly dropped at parse
time because they aren't listings at all.

Net: a plain `SELECT property_id, baths FROM data_lake.listing_state WHERE property_id IN
(...)` resolves baths for BOTH addressed and address-less real listings, at **zero live
vendor calls per request** — the enrichment was already paid for by the nightly ingest.
This beats every lane the handoff speculated about (LeePA address-match, live
`/nearby-home-values` per-listing) on cost, and matches the address-less case the existing
`withBaths()` (`resolve-subject.ts`) structurally cannot reach (it requires a target street
string to match against).

## Q1 answered: real fill rate, live query (not a 3-6 listing sample)

```sql
select (address_key ~ '^L[0-9]') as streetless, count(*) as n, count(baths) as baths_filled
from data_lake.listing_state
where source_name='api_feed' and state='active' and sale_or_rent='sale' and property_type<>'land'
group by 1;
```

| bucket | n | baths_filled | % |
|---|---|---|---|
| addressed | 22,355 | 4,499 | 20.1% |
| streetless (spec homes etc.) | 105 | 16 | 15.2% |

By anchor city (Cape Coral / Fort Myers / Naples — `COUNTY_ANCHOR_CITY` in `select.ts`):
Cape Coral 501/3,983 (12.6%), Fort Myers 819/3,878 (21.1%), Naples 1,099/5,424 (20.3%).

**This is lower than hoped** — the nightly enrich lane only fires on a listing's FIRST-seen
sweep (`known_ids` skip), and the one-shot `backfill_baths.py` (re-runnable, targets `baths
IS NULL`) hasn't caught the whole backlog. Streetless and addressed rows have SIMILAR fill
rates (15–20%) — the gap is enrichment completeness, not an address-availability problem as
the handoff's Q1 hypothesized. **Not fixed this session** — re-running the backfill at scale
means real vendor-quota spend and the handoff explicitly said not to burn quota in the dev
loop; opened as a check instead (`listing_state_baths_backfill_completeness`) rather than a
silent gap, per RULE 2.4.

## Q3 answered: cost at scale

The shipped lane is a single indexed Postgres SELECT per email build (one query, ≤3
property_ids for `listings-showcase.ts` — MAX_HOMES) — **zero marginal vendor cost**,
scales to any number of sends/categories/day without touching the 50k/mo, 1 req/s quota.
A listing this lane misses (the ~80% still NULL) simply keeps its honest null bathrooms;
`fallbackHighlight()`'s existing `.filter(Boolean)` already drops the field rather than
render a blank slot — no code change needed there, it was already correct.

## What shipped

`lib/listings/select.ts fetchLakeBathsByPropertyId()` (new, tested) + `lib/deliverable/
recipes/listings-showcase.ts enrichBaths()` (new, tested) wired into `buildListingsShowcase`
right after `picks` (≤3 final listings) is computed. Additive only — `withBaths()`'s
existing single-address callers (new-listing, just-sold) are untouched. The other two
`fetchPhotoListings` consumers (`lib/assistant/comp-helper.ts`, `lib/deliverable/recipes/
under-contract.ts`) were NOT touched, per the handoff's explicit instruction — they'd likely
benefit from the same lane but that's a separate PR.
