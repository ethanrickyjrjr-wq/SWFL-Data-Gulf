"""Zillow ZHVI tier-divergence SWFL (K-shaped market) — Tier 1 ingest constants.

Source: Zillow Research public CSVs — ZIP-level all-homes (SFR + Condo) RAW
home-value index for the TOP tier (luxury, 0.67–1.0 of the value distribution)
and the BOTTOM tier (starter, 0.0–0.33). Two source files, one per tier.
Grain: ZIP × month (wide-format source, melted to long via DuckDB UNPIVOT, then
the two tiers FULL OUTER JOINed on (zip_code, period_end)).
Filter: STATE = 'FL' + Metro IN (Cape Coral, Naples, Punta Gorda, North Port) MSAs.
Output: s3://lake-tier1/market/tier_divergence_swfl.parquet

RAW (not seasonally adjusted): Zillow publishes NO `_sm_sa` variant for the tier
series — the smoothed/seasonally-adjusted form exists only for the middle tier
(the `zhvi_swfl` brain). RAW is the only form available here. The consuming brain
leans on YoY (which cancels seasonality by construction); raw level / MoM are
seasonally noisy and should not be read as a clean trend.

PACK_ID is set to the consuming brain from day one per Data Tier Policy §2 —
the tier-divergence-swfl pack ships in the same PR as this pipeline.
"""

from ingest.lib.swfl_metros import SWFL_METRO_SUBSTRINGS  # noqa: F401  (re-export for pipeline)

# ── Source ───────────────────────────────────────────────────────────────────
#
# Zillow Research publishes the ZIP-level ZHVI tier series at the stable public
# paths below. Each filename is the ZIP-level, all-homes (SFR + Condo), RAW
# (NOT smoothed, NOT seasonally-adjusted) series for its percentile tier:
#   BOTTOM = starter, 0.0–0.33 of the value distribution.
#   TOP    = luxury,  0.67–1.0 of the value distribution.
# Headers verified live 2026-06-14: 9 metadata columns identical to the middle-
# tier ZHVI feed (RegionID, SizeRank, RegionName, RegionType, StateName, State,
# City, Metro, CountyName) followed by monthly columns from 1996-02 onward.
#
# There is NO `_sm_sa` variant for the tiers — RAW is the only form Zillow ships.
#
# If Zillow renames either file in a future research-data revamp the pipeline
# will fail loudly on the download step (HTTP 404) — preferred to silent drift.

BOTTOM_CSV_URL = (
    "https://files.zillowstatic.com/research/public_csvs"
    "/zhvi/Zip_zhvi_uc_sfrcondo_tier_0.0_0.33_month.csv"
)

TOP_CSV_URL = (
    "https://files.zillowstatic.com/research/public_csvs"
    "/zhvi/Zip_zhvi_uc_sfrcondo_tier_0.67_1.0_month.csv"
)

# ── Tier 1 Storage targets ────────────────────────────────────────────────────

BUCKET = "lake-tier1"
PARQUET_PATH = "market/tier_divergence_swfl.parquet"
PARQUET_TARGET = f"s3://{BUCKET}/{PARQUET_PATH}"

# Consuming brain ships in the same PR — set the inventory pointer from day 1.
PACK_ID: str | None = "tier-divergence-swfl"

# ── Geographic filter ─────────────────────────────────────────────────────────

STATE_CODE = "FL"
REGION_TYPE = "zip"

# Metadata columns to preserve through the UNPIVOT (everything not month-shaped).
# Names match the ZHVI tier CSV headers verbatim (case-sensitive) — identical to
# the middle-tier ZHVI / ZORI feeds.
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
