"""USGS DuckDB-lane constants — Tier 1 Storage destinations and core data config."""

# ── Core data config ────────────────────────────────────────────────────────

STATE_CD = "FL"
BACKFILL_START_YEAR = 2000  # supports 20–25y rolling normals

# Parameter code → label/unit/stat/datum. 72019/62610/00065/00045 per spec.
PARAMETER_CDS: dict[str, dict] = {
    "72019": {"label": "Depth to water level below land surface", "unit": "ft",
              "stat_cd": "00003", "datum": "LAND_SURFACE"},
    "62610": {"label": "Groundwater level above NAVD88",         "unit": "ft",
              "stat_cd": "00003", "datum": "NAVD88"},
    "00065": {"label": "Gage height",                            "unit": "ft",
              "stat_cd": "00003", "datum": "LOCAL"},
    "00045": {"label": "Precipitation",                          "unit": "in",
              "stat_cd": "00006", "datum": "NONE"},
}

SITE_TYPE_GROUPS: list[str] = ["GW", "ST,LK,SP", "AT"]
NODATA_SENTINEL = -999999.0

# ── Tier 1 Storage targets ───────────────────────────────────────────────────

BUCKET = "lake-tier1"

# Daily readings — main consumer target
DAILY_PARQUET_PATH = "environmental/usgs_water_swfl.parquet"
DAILY_PARQUET_TARGET = f"s3://{BUCKET}/{DAILY_PARQUET_PATH}"

# Site catalog — supporting lookup data
SITES_PARQUET_PATH = "environmental/usgs_water_swfl_sites.parquet"
SITES_PARQUET_TARGET = f"s3://{BUCKET}/{SITES_PARQUET_PATH}"

# Update this when the consuming brain is confirmed.
PACK_ID = "env-swfl"

USGS_BASE_URL = "https://waterservices.usgs.gov/nwis"
