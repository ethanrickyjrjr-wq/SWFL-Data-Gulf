# USGS Water Services constants.
#
# Spec of record: docs/API_BLUEPRINTS_USGS.md (committed bbc4a73).
# Replaces dead SFWMD DBHYDRO (docs/API_BLUEPRINTS_DBHYDRO.md).
#
# Lifecycle warning: USGS has announced the legacy waterservices.usgs.gov
# will sunset in early 2027 in favor of api.waterdata.usgs.gov/ogcapi/v0/.
# All URL construction lives in urls.py so the cutover is a one-file swap.

STATE_CD = "FL"

# Full-backfill window — supports 20–25y rolling normals (NOAA baseline is 1991–2020).
BACKFILL_START_YEAR = 2000

# Parameter code → metadata. The vertical datum is encoded IN the parameterCd,
# not as a side metadata field. 62610 ≠ 62611 even though both are "groundwater
# elevation." See spec §2.
PARAMETER_CDS: dict[str, dict] = {
    "72019": {
        "label": "Depth to water level below land surface",
        "unit": "ft",
        "stat_cd": "00003",  # mean
        "datum": "LAND_SURFACE",  # datum-agnostic — relative to land surface
    },
    "62610": {
        "label": "Groundwater level above NAVD88",
        "unit": "ft",
        "stat_cd": "00003",
        "datum": "NAVD88",
    },
    "00065": {
        "label": "Gage height",
        "unit": "ft",
        "stat_cd": "00003",
        "datum": "LOCAL",  # gage local zero, not a vertical datum
    },
    "00045": {
        "label": "Precipitation",
        "unit": "in",
        "stat_cd": "00006",  # sum
        "datum": "NONE",
    },
}

# Three site-catalog queries cover the brain's needs. siteType groups per
# USGS taxonomy: GW = groundwater wells; ST/LK/SP = streams/lakes/springs;
# AT = atmospheric (rain gauges).
SITE_TYPE_GROUPS: list[str] = ["GW", "ST,LK,SP", "AT"]

# USGS-published sentinel for "no data" in dv responses. Coerced to None.
NODATA_SENTINEL = -999999.0
