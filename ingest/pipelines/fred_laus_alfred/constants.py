"""Constants for fred_laus_alfred pipeline."""

# Key: FRED series ID  →  Value: area label stored in each row
SERIES_AREA_MAP = {
    "FLLEEC7URN": "lee",
    "FLCOLL0URN": "collier",
}

SOURCE_URL = "https://api.stlouisfed.org/fred/series/observations"
BUCKET = "lake-tier1"

# FRED sentinel for "all vintages from the beginning of time"
REALTIME_START_ALL = "1776-07-04"

# Both series start ~2007; "2000-01-01" captures everything without FRED's default truncation.
OBSERVATION_START = "2000-01-01"
