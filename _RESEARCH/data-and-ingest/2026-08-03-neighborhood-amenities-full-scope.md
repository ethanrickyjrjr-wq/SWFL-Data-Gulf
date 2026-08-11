# SteadyAPI /neighborhood-amenities — FULL-SCOPE-FIRST probe (live, 08/03/2026)

One real call: `GET /v1/real-estate/neighborhood-amenities?propertyId=6588181567` (Naples,
Collier; property_id from `data_lake.listing_state` api_feed lane). HTTP 200, 71,441 bytes.
Raw response cached at the session scratchpad (`amenities-probe.json`). `latitude/longitude`
params were rejected (422 "The property id field is required") — **propertyId is the ONLY
input key**; radius is vendor-fixed (`meta.search_radius: 5` miles on this call).

## Full field census (everything the one call returns)

- `meta` (10): version, status, copywrite, **property_id**, neighborhood_count,
  amenities_count (19 here), schools_count, score_groups[3], search_radius (5), categories[7].
- `body.neighborhoods[]` — **the headline find**: id, **name** ("Rural Estates"), city,
  state_code, **slug_id** ("Rural-Estates_Naples_FL"), geo_type ("neighborhood"),
  level ("macro_neighborhood"), **centroid {lat,lon}**, **boundary (GeoJSON polygon)**.
  The vendor assigns every property to a NAMED neighborhood with a boundary polygon —
  this is the listings↔community pairing key the api_feed lane lacks (34,904 rows,
  0 with `subdivision`; verified live this session).
- `body.location_scores[12]`: label/value/text/icon_url/groups — Walking, Cycling, Transit,
  Driving, Groceries, Shopping, Nightlife, Restaurants, Cafes, Daycares, Quiet, Vibrant
  (0–10 floats).
- `body.schools`: summary {total, public, private, elementary, middle, high, avg_rating,
  assigned_schools[]} + list[] {id, name, slug_id, education_levels, grades, funding_type,
  rating, parent_rating, student_count, student_teacher_ratio, review_count,
  distance_in_miles, assigned, coordinate{lat,lon}}.
- `body.amenities.by_category` — **31 categories on this one call** (golf, countryclubs,
  local_active_and_outdoor, venues, grocery, local_groceries, seafoodmarkets, meats,
  gardening, local_shopping, florists, floraldesigners, weightlosscenters, artclasses,
  specialtyschools, local_entertainment, theater, djs, sewingalterations, tradamerican,
  local_food_and_drink, cafes, restaurants, local_cafes, convenience, coffee, donuts,
  preschools, childcare, summer_camps, local_preschools). Each business: name, phone,
  rating, reviews_count, categories[], display_tags[], icon_url, photo_url, yelp_url,
  business_url, reviews_url, address {line_one, line_two, city, state_code, postal_code,
  **lat, lon, distance_from_property**}. Ratings/reviews are Yelp-derived (yelp_url on
  every business). Golf sample: Olde Florida Golf Club 0.24mi, Golf Club of the
  Everglades 0.8mi, Calusa Pines 1.42mi.

## Call-economics finding (changes the 07/16 plan)

The 07/16 check `steadyapi_community_amenity_precache` assumed ~3,349 calls (one per
community). Better: call per PROPERTY but **dedupe by returned neighborhood slug_id** —
once a neighborhood's row is stored, every property whose lat/lon falls inside its stored
boundary polygon needs NO call. Coverage of the active book (34,904 property_ids) collapses
to roughly one call per distinct vendor neighborhood (unknown count until walked; Naples has
macro_neighborhoods like Rural Estates covering large areas). Quota context: 50k/mo,
currently using a fraction (memory: use the headroom).

## What this does NOT give (verified ceilings, don't re-look)

- **HOA/condo fees: NOWHERE in SteadyAPI** (re-confirmed — this response has no fee field;
  matches `docs/steadyapi-capability-census.md` §4). HOA stays on the scrape/listing-detail
  lanes, range-with-source only.
- In-gate community amenities (bundled golf structure, resident-only pool) are NOT here —
  these are NEARBY businesses in a 5-mile radius. `community_profiles` (69 rows, live
  counts 08/03: golf 42, hoa 12, gated 11) remains the in-gate root; this endpoint is the
  AROUND-the-community root. Different concepts — do not merge them into one column family.

## Apify Google Maps ground-truth pulls (launched 08/03/2026, this session)

Actor `compass/crawler-google-places`, base $0.003/place (Bronze), NO paid filters/add-ons,
cap $6/run. Terms: golf course, country club, clubhouse, community pool, marina ×
maxCrawledPlacesPerSearch=200.
- Lee County: run `May105YCBlyq7mbBb`, dataset `qvAz1bpVeCTsKAEKO`
- Collier County: run `8oKzMnzwQ4CR80Hzm`, dataset `6bVXKK2MzQfemrZfW`
Retrieve with Apify MCP `get-dataset-items`. Check `amenities_apify_maps_ground_truth`
tracks landing these into the lake + spatial join.

## Pairing state (live-verified 08/03/2026)

- `listing_state`: api_feed 34,904 rows — property_id+lat/lon 100%, subdivision 0%;
  lifecycle_seed 298 rows — subdivision 100%, property_id 0%.
- `parcel_subdivision_v`: 604,362 parcels, 100% subdivision_name (plat grain).
- `neighborhood_stats`: 20,400 subdivision rows, NO centroid/lat-lon columns.
- Existing resolver: `lib/listings/community-lookup.ts` (address→community via
  parcel_subdivision_v + community-aliases fixture).
