"""Pure HTTP fetch and parse functions for USGS Water Services.

All functions here are side-effect-free except the two `fetch_*` functions
which make HTTP GET calls. Every parse function is independently testable
with fixture data — no dlt, no DuckDB, no I/O dependencies.
"""

import io
import json
from datetime import datetime, timezone
from typing import Iterator

import requests

from .constants import NODATA_SENTINEL, PARAMETER_CDS, SITE_TYPE_GROUPS, USGS_BASE_URL, STATE_CD


# ── Coercion helpers ────────────────────────────────────────────────────────


def coerce_float(v) -> float | None:
    if v in (None, "", " "):
        return None
    try:
        x = float(str(v).strip())
    except (ValueError, TypeError):
        return None
    if x == NODATA_SENTINEL:
        return None
    return x


def coerce_int_str(v) -> str | None:
    if v in (None, "", " "):
        return None
    return str(v).strip()


# ── Backfill chunking ───────────────────────────────────────────────────────


def year_chunks(start_year: int, end_year: int) -> list[tuple[str, str]]:
    """Return (start_dt, end_dt) pairs per calendar year."""
    return [(f"{y}-01-01", f"{y}-12-31") for y in range(start_year, end_year + 1)]


# ── URL builders ────────────────────────────────────────────────────────────


def build_dv_url(parameter_cd: str, start_dt: str, end_dt: str) -> str:
    stat_cd = PARAMETER_CDS[parameter_cd]["stat_cd"]
    qs = "&".join([
        f"stateCd={STATE_CD}",
        f"parameterCd={parameter_cd}",
        f"statCd={stat_cd}",
        "siteStatus=active",
        "format=json",
        f"startDT={start_dt}",
        f"endDT={end_dt}",
    ])
    return f"{USGS_BASE_URL}/dv/?{qs}"


def build_site_url(site_type: str) -> str:
    qs = "&".join([
        f"stateCd={STATE_CD}",
        "siteStatus=active",
        "hasDataTypeCd=dv",
        f"siteType={site_type}",
        "format=rdb",
        "siteOutput=expanded",
    ])
    return f"{USGS_BASE_URL}/site/?{qs}"


# ── JSON response parser ────────────────────────────────────────────────────


def parse_dv_response(
    payload: dict,
    parameter_cd: str,
    source_url: str,
    ingested_at: str,
) -> Iterator[dict]:
    """Walk a USGS dv JSON response and yield row dicts.

    Shape: value.timeSeries[].sourceInfo.siteCode[0].value (site_no)
                            .variable.unit.unitCode (unit)
                            .variable.noDataValue (per-series sentinel)
           values[0].value[].dateTime / value / qualifiers
    """
    datum = PARAMETER_CDS[parameter_cd]["datum"]
    stat_cd = PARAMETER_CDS[parameter_cd]["stat_cd"]

    series_list = (payload.get("value") or {}).get("timeSeries") or []
    for series in series_list:
        source_info = series.get("sourceInfo") or {}
        site_codes = source_info.get("siteCode") or []
        if not site_codes:
            continue
        site_no = site_codes[0].get("value")
        if not site_no:
            continue

        variable = series.get("variable") or {}
        unit = ((variable.get("unit") or {}).get("unitCode")) or PARAMETER_CDS[parameter_cd]["unit"]
        series_sentinel = variable.get("noDataValue")

        for vb in series.get("values") or []:
            for v in vb.get("value") or []:
                date_time = v.get("dateTime")
                if not date_time:
                    continue
                obs_date = date_time[:10]

                raw_val = v.get("value")
                val = coerce_float(raw_val)
                if val is not None and series_sentinel is not None and val == series_sentinel:
                    val = None

                qualifiers = v.get("qualifiers") or vb.get("qualifier") or []
                yield {
                    "site_no":      site_no,
                    "parameter_cd": parameter_cd,
                    "stat_cd":      stat_cd,
                    "obs_date":     obs_date,
                    "value":        val,
                    "unit":         unit,
                    "datum":        datum,
                    "qualifiers":   json.dumps(qualifiers),
                    "source_url":   source_url,
                    "ingested_at":  ingested_at,
                }


# ── RDB response parser ─────────────────────────────────────────────────────

_SITE_COLUMN_MAP: dict[str, str] = {
    "agency_cd":          "agency_cd",
    "site_no":            "site_no",
    "station_nm":         "station_nm",
    "site_tp_cd":         "site_tp_cd",
    "dec_lat_va":         "latitude",
    "dec_long_va":        "longitude",
    "dec_coord_datum_cd": "coord_datum_cd",
    "alt_va":             "alt_va",
    "alt_datum_cd":       "alt_datum_cd",
    "huc_cd":             "huc_cd",
    "state_cd":           "state_cd",
    "county_cd":          "county_cd",
}


def parse_rdb(text: str) -> Iterator[dict]:
    """Yield raw column dicts from a USGS RDB tab-delimited response.

    Lines starting with '#' are comments; first non-comment line is the header;
    second non-comment line is a type/width row (skip it); rest is data.
    """
    header: list[str] | None = None
    seen_typeline = False
    for raw in io.StringIO(text):
        line = raw.rstrip("\n").rstrip("\r")
        if not line or line.startswith("#"):
            continue
        if header is None:
            header = line.split("\t")
            continue
        if not seen_typeline:
            seen_typeline = True
            continue
        cols = line.split("\t")
        if len(cols) < len(header):
            cols = cols + [""] * (len(header) - len(cols))
        yield dict(zip(header, cols))


def _rdb_row_to_site(row: dict, source_url: str, refreshed_at: str) -> dict | None:
    """Convert a raw RDB row dict to a site record dict. Returns None if no site_no."""
    site_no = coerce_int_str(row.get("site_no"))
    if not site_no:
        return None
    return {
        "site_no":        site_no,
        "agency_cd":      coerce_int_str(row.get("agency_cd")) or "USGS",
        "station_nm":     coerce_int_str(row.get("station_nm")),
        "site_tp_cd":     coerce_int_str(row.get("site_tp_cd")),
        "state_cd":       coerce_int_str(row.get("state_cd")),
        "county_cd":      coerce_int_str(row.get("county_cd")),
        "huc_cd":         coerce_int_str(row.get("huc_cd")),
        "latitude":       coerce_float(row.get("dec_lat_va")),
        "longitude":      coerce_float(row.get("dec_long_va")),
        "coord_datum_cd": coerce_int_str(row.get("dec_coord_datum_cd")),
        "alt_va":         coerce_float(row.get("alt_va")),
        "alt_datum_cd":   coerce_int_str(row.get("alt_datum_cd")),
        "parameter_cds":  None,
        "site_status":    "active",
        "source_url":     source_url,
        "refreshed_at":   refreshed_at,
    }


# ── HTTP fetch wrappers ─────────────────────────────────────────────────────


def fetch_daily_rows(
    parameter_cd: str,
    start_dt: str,
    end_dt: str,
    ingested_at: str,
) -> list[dict]:
    """Fetch one year-chunk of daily values for one parameterCd. Returns a list of row dicts."""
    url = build_dv_url(parameter_cd, start_dt, end_dt)
    resp = requests.get(url, timeout=300)
    resp.raise_for_status()
    return list(parse_dv_response(resp.json(), parameter_cd, url, ingested_at))


def fetch_all_sites() -> list[dict]:
    """Fetch site catalog across all siteType groups. Returns a list of site dicts.

    Duplicates (same site in multiple type queries) are deduped by site_no —
    last write wins, which is fine since the rows are identical.
    """
    refreshed_at = datetime.now(timezone.utc).isoformat()
    seen: dict[str, dict] = {}
    for site_type in SITE_TYPE_GROUPS:
        url = build_site_url(site_type)
        resp = requests.get(url, timeout=120)
        resp.raise_for_status()
        for raw_row in parse_rdb(resp.text):
            site = _rdb_row_to_site(raw_row, url, refreshed_at)
            if site:
                seen[site["site_no"]] = site
    return list(seen.values())
