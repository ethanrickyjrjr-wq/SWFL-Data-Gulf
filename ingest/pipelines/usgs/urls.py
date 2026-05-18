# USGS URL construction — sole owner of the legacy base URL.
#
# When the early-2027 OGC API cutover comes (api.waterdata.usgs.gov/ogcapi/v0/),
# swap _BASE_URL and the two builder bodies here; callers in resources.py
# never need to change.
#
# Trailing-slash gotcha: USGS uses /nwis/dv/?... (slash before ?). Omitting
# triggers a 301 redirect chain that doubles request count.

from .constants import PARAMETER_CDS, STATE_CD

_BASE_URL = "https://waterservices.usgs.gov/nwis"


def build_dv_url(
    parameter_cd: str,
    start_dt: str | None = None,
    end_dt: str | None = None,
    modified_since: str | None = None,
) -> str:
    """
    Build a daily-value URL for one parameterCd statewide.

    Two modes:
      - Full / chunked backfill: pass start_dt + end_dt (YYYY-MM-DD).
      - Incremental refresh:     pass modified_since (e.g. "P7D", "P90D").

    statCd is derived from PARAMETER_CDS — mean for elevation/stage/depth,
    sum for precipitation. See spec §4.
    """
    stat_cd = PARAMETER_CDS[parameter_cd]["stat_cd"]
    parts = [
        f"stateCd={STATE_CD}",
        f"parameterCd={parameter_cd}",
        f"statCd={stat_cd}",
        "siteStatus=active",
        "format=json",
    ]
    if modified_since:
        parts.append(f"modifiedSince={modified_since}")
    if start_dt:
        parts.append(f"startDT={start_dt}")
    if end_dt:
        parts.append(f"endDT={end_dt}")
    qs = "&".join(parts)
    # Note the trailing slash before `?` — avoids 301 redirect chain.
    return f"{_BASE_URL}/dv/?{qs}"


def build_site_url(site_type: str) -> str:
    """
    Build a site-catalog URL for one siteType (or comma-list of types).
    Returns USGS RDB tab-delimited format (simpler than the JSON site response).
    """
    parts = [
        f"stateCd={STATE_CD}",
        "siteStatus=active",
        "hasDataTypeCd=dv",
        f"siteType={site_type}",
        "format=rdb",
        "siteOutput=expanded",  # gives us alt_va, alt_datum_cd, huc_cd, etc.
    ]
    qs = "&".join(parts)
    return f"{_BASE_URL}/site/?{qs}"
