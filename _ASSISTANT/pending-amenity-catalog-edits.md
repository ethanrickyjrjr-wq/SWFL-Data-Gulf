# Pending catalog edits — community amenity build (08/03/2026)

Files below were held by parallel sessions when this session tried to write them.
Apply all, then delete this file and close check `amenities_registry_docs_hygiene`.

## 0. fixtures/community-aliases.json — 12 alias entries (deferred, live write race)

Session 17f8bb7c held a claim and the file flip-flopped 69↔81 keys during commit prep, so the
ship_live alias write was NOT committed by this session. Once the file frees up, re-run
`python -m ingest.pipelines.community_profiles.ship_live` (idempotent: dlt merge on
community_slug + `maybe_register_alias` never overwrites existing entries) — it re-adds the 12
missing slugs (pelican-bay, lexington-country-club, forest-country-club, lakewood-country-club,
mediterra-golf-club, moorings-golf-and-country-club, plantation-golf-club, royal-palm-golf-club,
stonebridge-country-club, stoneybrook-golf-country-club, valencia-golf-and-country-club,
vanderbilt-country-club) and re-prints the fixture count. The 12 DB rows are already live
(community_profiles = 81, verified 08/03/2026) — only the fixture entry is pending.

## 1. ingest/cadence_registry.yaml — insert directly under the `not_yet_running:` line

```yaml
  # ── SteadyAPI /neighborhood-amenities — neighborhoods + nearby amenities + pairing ──
  # Tables: data_lake.steadyapi_neighborhoods (slug_id PK, boundary polygon + centroid +
  #   12 location scores) · steadyapi_neighborhood_amenities (Yelp-derived businesses w/
  #   category/rating/lat-lon/distance) · steadyapi_property_neighborhood (property_id ->
  #   slug_id — the listings↔community pairing edge; api_feed rows carry no subdivision).
  # Pipeline: ingest/pipelines/neighborhood_amenities/pipeline.py (boundary-polygon dedupe:
  #   one call per UNKNOWN neighborhood, followers assigned locally at zero vendor cost —
  #   live dry-run 08/03/2026: 5 calls -> 2 neighborhoods + 984 assignments).
  # GHA cron: .github/workflows/neighborhood-amenities-daily.yml (09:30 UTC, 500-call cap).
  # Migration: migrations/20260803_steadyapi_neighborhoods.sql (run 08/03/2026).
  # Graduation: move to `pipelines:` with freshness_table + expected_rows_min after the
  #   first clean scheduled fire (rentals precedent).
  - name: neighborhood_amenities
    workflow: neighborhood-amenities-daily.yml
    consuming_pack: communities-swfl
    lane: tier-2
    cadence_days: 1
    tolerance_multiplier: 2.0
    source_scope:
      confirmed_total:
        summary: "Per vendor call (propertyId is the ONLY input; radius vendor-fixed 5mi): named neighborhood w/ slug_id + centroid + GeoJSON boundary polygon; 12 location scores (Walking/Cycling/Transit/Driving/Groceries/Shopping/Nightlife/Restaurants/Cafes/Daycares/Quiet/Vibrant); nearby businesses across up-to-31 categories (golf, countryclubs, grocery, cafes, preschools, ...) each w/ name/phone/rating/reviews_count/lat-lon/distance. Property->neighborhood assignment persisted for every resolved property."
        source: "our ingest"
      source_ceiling:
        summary: "schools family (summary + per-school rating/parent_rating/student_count/student_teacher_ratio/distance/assigned flag, w/ coordinates) is returned on the SAME call and NOT yet persisted — zero extra calls to add a steadyapi_neighborhood_schools table. HOA/condo fees confirmed ABSENT vendor-wide (re-verified on this endpoint 08/03/2026 — capability census §4 stands)."
        as_of: "08/03/2026"
        source_url: "https://docs.steadyapi.com/collection.json"
        source_label: "realtor.com (via SteadyAPI)"
```

## 2. docs/standards/data-roots.md — line ~87, decision-table row "Community / subdivision grain"

Replace the fragment:

`community_profiles` (EMPTY + uncatalogued 07/19 — NO amenity root exists today, check `community_profiles_empty_via_lake_mcp`)

with:

amenity roots LIVE 08/03/2026: `community_profiles` 🟡 (IN-GATE facts — golf structure/HOA range/gated/amenity flags; 69 rows, coverage thin: golf 42 · hoa 12 · gated 11 — scale-out check `amenities_profiles_scale_out`) + `steadyapi_neighborhoods`/`steadyapi_neighborhood_amenities`/`steadyapi_property_neighborhood` 🟡 (AROUND-the-community: vendor neighborhood w/ boundary polygon + centroid, 12 location scores, nearby businesses w/ ratings; property_id→slug_id = the api_feed listings↔community pairing edge; `ingest/pipelines/neighborhood_amenities/`) — two DISTINCT concept families, never merge
