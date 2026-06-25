"""Constants for the market_heat_swfl pipeline.

Realtor.com Economic Research Data Library — free public-S3 ZIP-grain market
aggregates. Attribution-only license ("Data provided by Realtor.com"). The
files restate FULL history every month, so ingest is REPLACE (overwrite the
fixed-path Parquet), never append. Verified live 2026-06-25.
"""

# ── Source URLs (History variants — full time series, ZIP × month) ────────────
CORE_CSV_URL = (
    "https://econdata.s3-us-west-2.amazonaws.com/"
    "Reports/Core/RDC_Inventory_Core_Metrics_Zip_History.csv"
)
HOTNESS_CSV_URL = (
    "https://econdata.s3-us-west-2.amazonaws.com/"
    "Reports/Hotness/RDC_Inventory_Hotness_Metrics_Zip_History.csv"
)

# Provenance homepage (attribution-only license).
SOURCE_URL = "https://www.realtor.com/research/data/"

# ── Tier-1 Storage targets (fixed paths — overwritten monthly = REPLACE) ──────
BUCKET = "lake-tier1"
CORE_PARQUET_PATH = "market/market_heat_core_swfl.parquet"
HOTNESS_PARQUET_PATH = "market/market_heat_hotness_swfl.parquet"

# ── Columns kept from each source (verbatim from the live header 2026-06-25) ──
# Core: the vote drivers (active_listing_count, median_days_on_market,
# pending_ratio + their _yy) plus coincident context (new_listing_count,
# price_reduced_share) and realtor's own confidence flag.
CORE_COLUMNS = [
    "month_date_yyyymm",
    "postal_code",
    "zip_name",
    "active_listing_count",
    "active_listing_count_yy",
    "median_days_on_market",
    "median_days_on_market_yy",
    "pending_ratio",
    "pending_ratio_yy",
    "new_listing_count",
    "new_listing_count_yy",
    "price_reduced_share",
    "price_reduced_share_yy",
    "median_listing_price",
    "median_listing_price_yy",
    "quality_flag",
]

# Hotness: RELATIVE descriptors only (cross-sectional rank) — never vote drivers.
HOTNESS_COLUMNS = [
    "month_date_yyyymm",
    "postal_code",
    "hotness_score",
    "supply_score",
    "demand_score",
    "hotness_rank",
    "median_dom_vs_us",
    "quality_flag",
]

# ── Gate-4 volume floor (non-null guard before the REPLACE write) ─────────────
# SWFL footprint is ~120 ZCTAs; the History file carries ~78 months back to
# 201912. A healthy filtered pull lands several thousand rows. Floor set far
# below that to catch a truncated/empty fetch without false-alarming.
MIN_ROWS = 200
