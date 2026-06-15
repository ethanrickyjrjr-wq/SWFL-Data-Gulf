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

# Hazard zone-event types (CZ_TYPE='Z'). NOAA logs hurricanes/surge ONLY at the
# NWS zone level, with CZ_NAME like "COASTAL LEE" / "INLAND COLLIER COUNTY".
# Exclude Drought / Frost/Freeze (climatology, not storms).
HAZARD_ZONE_EVENT_TYPES = [
    "Hurricane (Typhoon)",
    "Tropical Storm",
    "Tropical Depression",
    "Storm Surge/Tide",
    "High Wind",
    "Strong Wind",
    "Coastal Flood",
]

# Volume-guard floors for the destructive parquet replace (BIBLE §0.2 rule 5).
MIN_TOTAL_ROWS = 1000        # live corpus is ~1,178 county rows; zone rows only add to that, so 1k is a safe floor
MIN_HURRICANE_ROWS = 5       # Hurricane Ian alone is 6 zone rows; full vintage has many


def swfl_filter_sql() -> str:
    """WHERE clause: all county-type rows for the 3 counties, PLUS hazard-type
    zone rows for those counties. cz_name for zones is 'COASTAL/INLAND <county>'
    with an optional ' COUNTY' suffix."""
    counties = ", ".join(f"'{c}'" for c in SWFL_COUNTIES_CZ)
    hazards = ", ".join(f"'{t}'" for t in HAZARD_ZONE_EVENT_TYPES)
    zone_re = r"^(COASTAL|INLAND) (LEE|COLLIER|CHARLOTTE)( COUNTY)?$"
    return (
        f"state = 'FLORIDA' AND (\n"
        f"  (cz_type = 'C' AND cz_name IN ({counties}))\n"
        f"  OR (cz_type = 'Z'\n"
        f"      AND regexp_matches(cz_name, '{zone_re}')\n"
        f"      AND event_type IN ({hazards}))\n"
        f")"
    )


# Tier 1 Storage destination
BUCKET = "lake-tier1"
PARQUET_PATH = "environmental/storm_events_swfl.parquet"
PARQUET_TARGET = f"s3://{BUCKET}/{PARQUET_PATH}"

# Pack consumer + audit-trail
PACK_ID = "storm-history-swfl"
VINTAGE = f"{YEAR_RANGE_START}-{YEAR_RANGE_END}"
