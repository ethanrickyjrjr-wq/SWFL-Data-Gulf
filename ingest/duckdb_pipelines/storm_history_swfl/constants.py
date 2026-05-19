"""Constants for the storm-history-swfl DuckDB ingest pipeline."""

# NOAA NCEI Storm Events Database -- modern-schema range only (1996+).
# Pre-1996 records use an incompatible column layout; see spec Open Q3.
NOAA_BASE_URL = "https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/"
YEAR_RANGE_START = 1996
YEAR_RANGE_END = 2025  # bump annually as NCEI publishes new yearly files
NOAA_URL_GLOB = (
    f"{NOAA_BASE_URL}StormEvents_details-ftp_v1.0_d"
    f"{{{YEAR_RANGE_START}..{YEAR_RANGE_END}}}_*.csv.gz"
)

# SWFL scope -- Lee, Collier, Charlotte counties only.
# NOAA's cz_name column is uppercase county names (no "County" suffix).
SWFL_COUNTIES_CZ = ["LEE", "COLLIER", "CHARLOTTE"]

# Tier 1 Storage destination
BUCKET = "lake-tier1"
PARQUET_PATH = "environmental/storm_events_swfl.parquet"
PARQUET_TARGET = f"s3://{BUCKET}/{PARQUET_PATH}"

# Pack consumer + audit-trail
PACK_ID = "storm-history-swfl"
VINTAGE = f"{YEAR_RANGE_START}-{YEAR_RANGE_END}"
