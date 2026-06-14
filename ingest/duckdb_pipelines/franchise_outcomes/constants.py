"""SBA 7(a) FOIA — franchise outcomes ingest constants.

Source: U.S. Small Business Administration FOIA data portal
  https://data.sba.gov/en/dataset/7-a-504-foia
  Public domain. Updated quarterly (~1 month after quarter end).
  Resource IDs are stable across quarterly refreshes; filenames rotate.

Grain: brand × county (Lee + Collier FL) — county-grain is authoritative.
       ZIP-approx grain is a supplemental table; see SOURCED.md#sba-foia-franchise-row-counts.

Consuming brain: franchise-outcomes (refinery/config/packs.mts).

Row counts (full-file reads, verified 2026-06-14):
  FY2000-2009 : 83 franchise rows / 690,333 total in Lee + Collier FL
  FY2010-2019 : 160 franchise rows / 545,751 total in Lee + Collier FL
  FY2020-pres : 210 franchise rows / 373,981 total in Lee + Collier FL
  Total       : 453 franchise rows across the full ~26-year span
  See SOURCED.md#sba-foia-franchise-row-counts
"""

# ── SBA FOIA download URLs ────────────────────────────────────────────────────
# Base URL uses the stable dataset UUID; filename rotates with each quarterly
# refresh (e.g. asof-260331 → asof-260630). The resource-ID path redirects to
# the latest file — use the dataset page to discover the current filename if
# the redirect ever breaks.
_BASE = (
    "https://data.sba.gov/en/dataset"
    "/0ff8e8e9-b967-4f4e-987c-6ac78c575087/resource"
)

SBA_FOIA_URLS = [
    # FY2000-FY2009  (resource id: 186eb176)
    f"{_BASE}/186eb176-b53e-4cbe-ab93-e5c4fb50197d"
    "/download/foia-7a-fy2000-fy2009-asof-260331.csv",
    # FY2010-FY2019  (resource id: 3f838176)
    f"{_BASE}/3f838176-6060-44db-9c91-b4acafbcb28c"
    "/download/foia-7a-fy2010-fy2019-asof-260331.csv",
    # FY2020-present (resource id: d67d3ccb)
    f"{_BASE}/d67d3ccb-2002-4134-a288-481b51cd3479"
    "/download/foia-7a-fy2020-present-asof-260331.csv",
]

# Dataset landing page — stable citation URL for brain output.
SBA_FOIA_CITATION_URL = "https://data.sba.gov/en/dataset/7-a-504-foia"

# ── Geographic filter ─────────────────────────────────────────────────────────
PROJECT_STATE = "FL"
PROJECT_COUNTIES = {"LEE", "COLLIER"}  # matches projectcounty column (upper-cased)

# ── Resolved-loan statuses (PeerSense + existing pack methodology) ────────────
# survival_rate = P I F / (P I F + CHGOFF) over RESOLVED loans only.
# All other statuses (CURR, DELINQ, LIQUID, CANCLD, COMMIT, etc.) are excluded.
# N_MIN_RESOLVED sourced from existing pack logic (refinery/config/packs.mts:168)
# and PeerSense SBA methodology (peersense.com/industry-data, verified 2026-06-14).
STATUS_PAID_IN_FULL = "P I F"
STATUS_CHARGED_OFF = "CHGOFF"
N_MIN_RESOLVED = 3  # see SOURCED.md#sba-foia-franchise-row-counts

# ── Tier 1 Storage targets ────────────────────────────────────────────────────
BUCKET = "lake-tier1"

# County-grain: one row per brand (Lee+Collier aggregate).
# This is the primary source consumed by the franchise-outcomes brain.
COUNTY_PARQUET_PATH = "franchise/sba_foia_franchise_county.parquet"
COUNTY_PARQUET_TARGET = f"s3://{BUCKET}/{COUNTY_PARQUET_PATH}"

# ZIP-approx grain: brand × zip_approx, N_MIN_RESOLVED≥3 enforced.
# Supplemental table for detail_tables; NOT yet consumed by the brain (Phase 2).
# zip_is_approx is always True; citation must reflect this — see concern #8.
ZIP_PARQUET_PATH = "franchise/sba_foia_franchise_zip_approx.parquet"
ZIP_PARQUET_TARGET = f"s3://{BUCKET}/{ZIP_PARQUET_PATH}"

PACK_ID = "franchise-outcomes"

# ── ZCTA asset ────────────────────────────────────────────────────────────────
# Absolute path resolved at import time; pipeline.py passes this to get_zip_approx.
import os as _os
_HERE = _os.path.dirname(_os.path.abspath(__file__))
ZCTA_ASSET_PATH = _os.path.normpath(
    _os.path.join(_HERE, "..", "..", "..", "public", "maps", "fl_zips.geojson")
)
