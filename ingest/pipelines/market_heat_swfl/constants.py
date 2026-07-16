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

# ── Columns kept from each source (verbatim from the live header 2026-06-25;
#    ceiling-fill families re-verified against the live header 2026-07-16) ──
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
    # Ceiling fill (07/16/2026, check ingest_market_heat_swfl_column_gap_fill):
    # the documented source_ceiling families — same file, zero extra fetch cost.
    "average_listing_price",
    "average_listing_price_mm",
    "average_listing_price_yy",
    "median_listing_price_per_square_foot",
    "median_listing_price_per_square_foot_mm",
    "median_listing_price_per_square_foot_yy",
    "median_square_feet",
    "median_square_feet_mm",
    "median_square_feet_yy",
    "pending_listing_count",
    "pending_listing_count_mm",
    "pending_listing_count_yy",
    "price_increased_count",
    "price_increased_count_mm",
    "price_increased_count_yy",
    "total_listing_count",
    "total_listing_count_mm",
    "total_listing_count_yy",
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
    # Ceiling fill (07/16/2026): hh_rank = Nielsen HH Rank. The 07/08 ceiling note's
    # "Hotness Rank Within-CBSA/Within-County" columns do NOT exist in the ZIP-grain
    # History header (verified live) — the real rank-change columns are the _mm/_yy
    # deltas; "LDP Unique Viewers Per Property vs US" is named
    # page_view_count_per_property_vs_us in this file.
    "hh_rank",
    "hotness_rank_mm",
    "hotness_rank_yy",
    "page_view_count_per_property_mm",
    "page_view_count_per_property_yy",
    "page_view_count_per_property_vs_us",
]

# ── Gate-4 volume floor (non-null guard before the REPLACE write) ─────────────
# SWFL footprint is ~120 ZCTAs; the History file carries ~78 months back to
# 201912. A healthy filtered pull lands several thousand rows. Floor set far
# below that to catch a truncated/empty fetch without false-alarming.
MIN_ROWS = 200
