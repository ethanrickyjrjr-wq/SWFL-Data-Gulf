"""Zillow ZHVI SWFL home-value-index tracker — Tier 1 ingest constants.

Source: Zillow Research public CSV — ZIP-level smoothed seasonally-adjusted
all-homes (SFR + Condo) middle-tier (0.33–0.67) home-value index.
Grain: ZIP × month (wide-format source, melted to long via DuckDB UNPIVOT).
Filter: STATE = 'FL' + Metro IN (Cape Coral, Naples, Punta Gorda, North Port) MSAs.
Output: s3://lake-tier1/market/zhvi_swfl.parquet

PACK_ID is set to the consuming brain from day one per Data Tier Policy §2 —
the home-values-swfl pack ships in the same PR as this pipeline.
"""

from ingest.lib.swfl_metros import SWFL_METRO_SUBSTRINGS  # noqa: F401  (re-export for pipeline)

# ── Source ───────────────────────────────────────────────────────────────────
#
# Zillow Research publishes the ZIP-level ZHVI at the stable public path below.
# Filename is the ZIP-level, all-homes (SFR + Condo), middle-tier
# (0.33–0.67 of the value distribution), smoothed + seasonally-adjusted series.
# Header verified live 2026-06-11: 9 metadata columns identical to the ZORI feed
# (RegionID, SizeRank, RegionName, RegionType, StateName, State, City, Metro,
# CountyName) followed by monthly columns from 2000-01-31 onward.
#
# If Zillow renames the file in a future research-data revamp the pipeline
# will fail loudly on the download step (HTTP 404) — preferred to silent drift.

ZHVI_CSV_URL = (
    "https://files.zillowstatic.com/research/public_csvs"
    "/zhvi/Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"
)

# ── Tier 1 Storage targets ────────────────────────────────────────────────────

BUCKET = "lake-tier1"
PARQUET_PATH = "market/zhvi_swfl.parquet"
PARQUET_TARGET = f"s3://{BUCKET}/{PARQUET_PATH}"

# Consuming brain ships in the same PR — set the inventory pointer from day 1.
PACK_ID: str | None = "home-values-swfl"

# ── Geographic filter ─────────────────────────────────────────────────────────

STATE_CODE = "FL"
REGION_TYPE = "zip"

# Metadata columns to preserve through the UNPIVOT (everything not month-shaped).
# Names match the ZHVI CSV header verbatim (case-sensitive) — identical to ZORI.
METADATA_COLUMNS: tuple[str, ...] = (
    "RegionID",
    "SizeRank",
    "RegionName",
    "RegionType",
    "StateName",
    "State",
    "City",
    "Metro",
    "CountyName",
)
