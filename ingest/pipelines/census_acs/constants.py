"""Census ACS 5-year ingest constants.

Per-ZCTA (= per-ZIP) demographics for the SWFL footprint. Source: Census ACS 5-year
Data API. Geography query VERIFIED live 2026-06-24: `for=zip code tabulation area:<zcta>`
returns 200 with a key; the older `&in=state:12` nesting is DEPRECATED (HTTP 400
"unknown/unsupported geography hierarchy") for ZCTAs — so we query per-ZIP over the
in-scope list, never state-nested. A CENSUS_API_KEY is REQUIRED (unauthenticated calls
302 → missing_key.html).

Design: docs/superpowers/specs/2026-05-30-census-acs-pipeline-design.md (cut-1, 8 covariates).
"""

CENSUS_ACS_BASE_URL = "https://api.census.gov/data/{year}/acs/acs5"

# Latest published stable 5-year vintage (e.g. 2022 = 2018–2022 estimates). Census
# publishes the next vintage each December; the GHA cron bumps this one line.
ACS_LATEST_YEAR = 2022

# Raw ACS variable codes — fetched in ONE call per ZCTA. Derived pct/rate fields are
# computed in Python (design §2). total_population (B01003_001E) doubles as the
# moved-in denominator, so it is fetched once.
ACS_RAW_VARS = [
    "B01003_001E",  # total_population
    "B19013_001E",  # median_household_income (dollars; suppressed → NULL)
    "B01002_001E",  # median_age
    "B25003_002E",  # owner-occupied units (num)
    "B25003_001E",  # total occupied units (den)
    "B07003_001E",  # mobility universe (pop 1yr+) — moved-pct denominator
    "B07003_004E",  # "same house 1 year ago"; moved% = (universe - same_house) / universe
    "B17001_002E",  # income below poverty (num)
    "B17001_001E",  # poverty universe (den)
    "B23025_004E",  # employed (num)
    "B23025_002E",  # in labor force (den)
    "B25010_001E",  # avg_household_size
]

# Census negative annotation sentinels for suppressed/unavailable cells (e.g.
# -666666666). Every cut-1 field is non-negative in reality, so any negative value
# is a suppression sentinel → stored as NULL, never zero (design §4).

# ~125 in-scope ZCTAs expected (Lee+Collier core; 6-county footprint is larger). Floor
# catches a partial pull if the API errors mid-loop. Tune from cadence_registry.
ACS_ZCTA_MIN_ROWS = 80
