"""Constants for the Redfin Data Center → Collier County market-tracker ingest.

Source is a FREE static file on Redfin's public S3 bucket (no auth, no metered
API, no scraping).

RETARGETED 09/17/2026: the legacy dump (redfin_market_tracker/
county_market_tracker.tsv000.gz) FROZE at Last-Modified ~06/02/2026 while still
serving HTTP 200 (newest content stuck at period_end 2026-05-31, tripping the
55d content-freshness guard since 08/18/2026 — issue #182). Never point back at
it. Same freeze family + same fix as the ZIP (07/17, ed0b2efd) and city
(08/10/2026) pipelines' retargets — the county file was MISSED in both passes.
New feed differences handled in resources.py: plain CSV (not gzip TSV),
"REGION NAME"/"REGION TYPE" columns, literal "NA" nulls, YoY in PERCENT (legacy
stored fractions — converted at ingest to keep the column contract), no
property-type split (all-residential rollup).

Verified live 09/17/2026: HTTP 200, ~147 MB, Last-Modified 09/12/2026, REGION
TYPE "County", REGION NAME "Collier County, FL" present, newest PERIOD END
2026-08-31.
"""

# Redfin Data Center — county-grain market tracker (plain CSV).
REDFIN_COUNTY_TRACKER_URL = (
    "https://redfin-public-data.s3.us-west-2.amazonaws.com"
    "/redfin_data_center/housing_market/monthly/all_counties.csv"
)

# Exact REGION NAME string for Collier County in the county tracker (verified live).
COLLIER_REGION = "Collier County, FL"

# The retargeted feed is an all-residential ROLLUP with no property-type column,
# so ingest STAMPS this constant onto every row — same pattern as redfin_city_swfl.
HEADLINE_PROPERTY_TYPE = "All Residential"

# This-run landing floor (90% of 176 rows measured live 09/17/2026 — one row per
# month back to 2012). The registry's `expected_rows_min: 700` guards the
# CUMULATIVE count_table, which a merge write never shrinks even if this run
# yields zero new Collier rows — it would stay "healthy" on nothing but old
# rows forever. This floor catches THIS pull going quiet.
MIN_ROWS = 150
