"""Constants for the Redfin Data Center → FL city market-tracker ingest.

Source is a FREE static file on Redfin's public S3 bucket (no auth, no metered
API, no scraping) — the national CITY-level "market tracker" CSV (sibling of the
ZIP tracker `redfin_swfl` pulls). We stream it and keep EVERY Florida city —
separation happens in the lake, not at ingest (operator directive 07/12/2026:
"bring in all the data and separate in lake"; adding a city downstream is a
query, never a pipeline PR).

RETARGETED 08/10/2026: the legacy dump (redfin_market_tracker/
city_market_tracker.tsv000.gz) FROZE at Last-Modified 06/02/2026 while still
serving HTTP 200 — the desk hero sat on May closes into August because of it.
Never point back at it. Same freeze + same fix as the ZIP pipeline's 07/17
retarget (ed0b2efd; spec docs/superpowers/specs/
2026-07-17-redfin-datacenter-retarget-design.md) — the city file was MISSED in
that pass. New feed differences handled in resources.py: plain CSV (not gzip
TSV), "REGION NAME"/"REGION TYPE" columns, literal "NA" nulls, YoY in PERCENT
(legacy stored fractions — converted at ingest to keep the column contract),
no property-type split (all-residential rollup), and duplicate REGION NAMEs
with distinct REGION IDs.

City grain is what the daily desk hero needs for a source-faithful SOLD anchor:
`/housing-market-details` (SteadyAPI) is ZIP-only and the Redfin *county* tracker
is county-only, so neither serves a true city-grain median sale price. This file
does (verified live 08/10/2026: "Cape Coral, FL"/"Fort Myers, FL"/"Naples, FL"
present; Last-Modified 08/10/2026; newest PERIOD END 2026-06-30). Cadence is
monthly — this is the monthly SOLD anchor beneath the daily ASKING line.
"""

# Redfin Data Center — CITY-grain market tracker (plain CSV, ~536 MB).
REDFIN_CITY_TRACKER_URL = (
    "https://redfin-public-data.s3.us-west-2.amazonaws.com"
    "/redfin_data_center/housing_market/monthly/all_cities.csv"
)

# Ingest keeps every region with this exact suffix (Florida-wide; other states
# would be paid storage with no consumer). Matching is on the parsed REGION cell,
# suffix-exact, so "Naples, ME" / "Miami, OH" style collisions are excluded.
FL_REGION_SUFFIX = ", FL"

# The three desk-hero cities (verbatim REGION strings, verified live 07/11/2026).
# NOT an ingest filter anymore — this is the consumer-side selection the desk
# reads, and the ingest's own landing guard (all three must be present in every
# pull, or the run goes red).
DESK_HERO_REGIONS = ("Cape Coral, FL", "Fort Myers, FL", "Naples, FL")

# desk `area` slug <- exact Redfin REGION for the hero trio. Slugs for ALL rows
# are DERIVED (resources._area_slug); this map is pinned by tests so the derived
# slugs can never drift from what the desk hero keys on.
REGION_TO_AREA = {
    "Cape Coral, FL": "cape_coral",
    "Fort Myers, FL": "fort_myers",
    "Naples, FL": "naples",
}

# Headline property_type the desk reads for the sold anchor. The retargeted feed
# is an all-residential ROLLUP with no property-type column, so ingest STAMPS
# this constant onto every row — the desk's `property_type=eq.All Residential`
# filter (lib/desk/loaders.ts loadSoldSeries) keeps working unchanged, and the
# merge upserts cleanly over the legacy rows' "All Residential" slice.
HEADLINE_PROPERTY_TYPE = "All Residential"
