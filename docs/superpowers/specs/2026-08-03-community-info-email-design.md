# Community Info Email

**Date:** 2026-08-03

## Problem

## Goal

## What we're building

## Failure modes (named before build — each pairs with a guard)

- Neighborhood not matched from the user's typed area → builder returns the grid with open
  slots (default-grid pattern), NEVER null-and-refuse (RULE 0.7) and NEVER a nearest-guess
  neighborhood presented as the asked one. Guard: `community-info.test.ts` FM1.
- Amenity list is Yelp-derived and can be sparse for a neighborhood → cells render only
  categories with rows; empty categories are dropped, not zero-filled. Guard: FM2 (sparse
  fixture ships no "0 restaurants" cell).
- Citation leakage → every steadyapi-derived cell cites "realtor.com" (operator decree);
  google_maps_amenities would cite Google Maps. Guard: FM3 (the string "SteadyAPI" appears
  nowhere in the built doc).
- Stale-month drift → provenance carries the source row's as-of date MM/DD/YYYY, not the
  build date. Guard: FM4.
- Chart temptation → `chart: "none"` at launch; an amenity-count bar is a tomorrow upgrade.
  Guard: recipes.ts entry + no chart block in the composed grid.
- LLM invention → narrative is DETERMINISTIC: composed from the vendor's own location-score
  sentences (back-on-market precedent), no model call at all.
