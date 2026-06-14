"""Redfin Data Center — price drops → Tier 1 ingest constants.

Source: Redfin public S3, price_drops/monthly/all_zips.csv
Grain: ZIP × rolling-3-month period
Filter: Lee County (Cape Coral MSA) + Collier County (Naples MSA) + Punta Gorda + North Port
Output: s3://lake-tier1/market/redfin_price_drops.parquet

Consuming brain: seller-stress-swfl.
Publishes: ~15th of each month (Redfin 2026 release calendar).
"""

# ── Source ───────────────────────────────────────────────────────────────────

REDFIN_URL = (
    "https://redfin-public-data.s3.us-west-2.amazonaws.com"
    "/redfin_data_center/price_drops/monthly/all_zips.csv"
)

# ── Tier 1 Storage targets ────────────────────────────────────────────────────

BUCKET = "lake-tier1"
PARQUET_PATH = "market/redfin_price_drops.parquet"
PARQUET_TARGET = f"s3://{BUCKET}/{PARQUET_PATH}"

PACK_ID = "seller-stress-swfl"

# ── Geographic filter ─────────────────────────────────────────────────────────

from ingest.lib.swfl_metros import SWFL_METRO_SUBSTRINGS  # noqa: E402, F401
