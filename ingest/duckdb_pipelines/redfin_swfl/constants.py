"""Redfin SWFL market tracker — Tier 1 ingest constants.

Source: Redfin Data Center (redesigned ~June 2026), housing_market monthly ZIP CSV.
        The legacy dump (redfin_market_tracker/zip_code_market_tracker.tsv000.gz)
        FROZE at Last-Modified 06/02/2026 while still serving HTTP 200 — never
        point back at it. Retarget spec:
        docs/superpowers/specs/2026-07-17-redfin-datacenter-retarget-design.md
Grain:  ZIP × month (rolling-3-month windows). All-property-types rollup — the
        per-property-type split lives in a SEPARATE file with NO rollup rows
        (property_types/monthly/all_zips.csv, unpulled; see cadence_registry
        source_ceiling).
Filter: SWFL metros via METRO column (the new feed has no STATE_CODE).
Output: s3://lake-tier1/market/redfin_swfl.parquet

Consuming brain: housing-swfl (refinery/packs/housing-swfl.mts) via
refinery/sources/housing-source.mts — unit conversions (percent → fraction)
happen THERE, once; this pipeline stores values AS-WRITTEN by the vendor.
"""

# ── Source ───────────────────────────────────────────────────────────────────

REDFIN_ZIP_URL = (
    "https://redfin-public-data.s3.us-west-2.amazonaws.com"
    "/redfin_data_center/housing_market/monthly/all_zips.csv"
)

# ── Tier 1 Storage targets ────────────────────────────────────────────────────

BUCKET = "lake-tier1"
PARQUET_PATH = "market/redfin_swfl.parquet"
PARQUET_TARGET = f"s3://{BUCKET}/{PARQUET_PATH}"

# consuming brain shipped as "housing-swfl" (not "redfin-swfl")
PACK_ID = "housing-swfl"

# ── Geographic filter ─────────────────────────────────────────────────────────

# Shared SWFL MSA substrings — single source of truth for every Tier 1 ZIP
# ingest pipeline (redfin_swfl, zori_swfl, …). See module docstring for the
# Glades/Hendry rationale.
from ingest.lib.swfl_metros import SWFL_METRO_SUBSTRINGS  # noqa: E402, F401
