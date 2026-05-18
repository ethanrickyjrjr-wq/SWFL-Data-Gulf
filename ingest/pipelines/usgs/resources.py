"""
Two dlt resources for USGS Water Services:

  - usgs_daily_resource: dv pulls (4 parameterCds × statewide FL × backfill)
  - usgs_sites_resource: site catalog (3 siteType groups, RDB-parsed)

Both write to data_lake.* with write_disposition="merge". Sentinels coerced
to None per spec §5. Datum derived from parameterCd, not site metadata.

Deviation from spec §7: text[] columns (qualifiers, parameter_cds) ship as
jsonb (dlt's "json" data_type) — functionally identical for our queries and
avoids a custom Postgres-only schema hint. TS connector reads them as JSON
arrays. Grant SQL targets the auto-created column types, whatever they are.
"""

import io
from datetime import datetime, timezone

import dlt
import requests

from .constants import (
    BACKFILL_START_YEAR,
    NODATA_SENTINEL,
    PARAMETER_CDS,
    SITE_TYPE_GROUPS,
)
from .urls import build_dv_url, build_site_url


# ── Column schemas ─────────────────────────────────────────────────────────────

_USGS_DAILY_COLUMNS: dict = {
    "site_no":      {"data_type": "text",      "nullable": False, "primary_key": True},
    "parameter_cd": {"data_type": "text",      "nullable": False, "primary_key": True},
    "stat_cd":      {"data_type": "text",      "nullable": False, "primary_key": True},
    "obs_date":     {"data_type": "date",      "nullable": False, "primary_key": True},
    "value":        {"data_type": "double",    "nullable": True},
    "unit":         {"data_type": "text",      "nullable": False},
    "datum":        {"data_type": "text",      "nullable": False},
    "qualifiers":   {"data_type": "json",      "nullable": True},
    "source_url":   {"data_type": "text",      "nullable": False},
    "ingested_at":  {"data_type": "timestamp", "nullable": False},
}

_USGS_SITES_COLUMNS: dict = {
    "site_no":        {"data_type": "text",      "nullable": False, "primary_key": True},
    "agency_cd":      {"data_type": "text",      "nullable": False},
    "station_nm":     {"data_type": "text",      "nullable": True},
    "site_tp_cd":     {"data_type": "text",      "nullable": True},
    "state_cd":       {"data_type": "text",      "nullable": True},
    "county_cd":      {"data_type": "text",      "nullable": True},
    "huc_cd":         {"data_type": "text",      "nullable": True},
    "latitude":       {"data_type": "double",    "nullable": True},
    "longitude":      {"data_type": "double",    "nullable": True},
    "coord_datum_cd": {"data_type": "text",      "nullable": True},
    "alt_va":         {"data_type": "double",    "nullable": True},
    "alt_datum_cd":   {"data_type": "text",      "nullable": True},
    "parameter_cds":  {"data_type": "json",      "nullable": True},
    "site_status":    {"data_type": "text",      "nullable": True},
    "source_url":     {"data_type": "text",      "nullable": False},
    "refreshed_at":   {"data_type": "timestamp", "nullable": False},
}


# ── Coercion helpers ───────────────────────────────────────────────────────────


def _coerce_float(v) -> float | None:
    if v in (None, "", " "):
        return None
    try:
        x = float(str(v).strip())
    except (ValueError, TypeError):
        return None
    if x == NODATA_SENTINEL:
        return None
    return x


def _coerce_int_str(v) -> str | None:
    """Coerce to string for IDs/codes; treats empty as None."""
    if v in (None, "", " "):
        return None
    return str(v).strip()


# ── usgs_daily resource ────────────────────────────────────────────────────────


def _year_chunks(start_year: int, end_year: int) -> list[tuple[str, str]]:
    """
    Yield (start_dt, end_dt) per calendar year. Per-year chunking keeps
    individual JSON response bodies in the tens-to-hundreds-of-MB range
    rather than multi-GB statewide-26-year monsters.
    """
    return [(f"{y}-01-01", f"{y}-12-31") for y in range(start_year, end_year + 1)]


def _parse_dv_response(payload: dict, parameter_cd: str, source_url: str, ingested_at: str):
    """
    Walk a USGS dv JSON response (per spec §6) and yield row dicts.

    Shape: value.timeSeries[].sourceInfo.siteCode[0].value (site_no)
                            .variable.unit.unitCode (unit)
                            .variable.noDataValue (per-series sentinel, usually -999999.0)
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
        # Series-local sentinel takes precedence over constant if present.
        series_sentinel = variable.get("noDataValue")

        values_blocks = series.get("values") or []
        for vb in values_blocks:
            for v in vb.get("value") or []:
                date_time = v.get("dateTime")
                if not date_time:
                    continue
                obs_date = date_time[:10]  # 'YYYY-MM-DDT...' → 'YYYY-MM-DD'

                raw_val = v.get("value")
                val = _coerce_float(raw_val)
                if val is not None and series_sentinel is not None and val == series_sentinel:
                    val = None

                qualifiers = v.get("qualifiers") or []
                # Some responses bury qualifiers in {"qualifiers": ["A"]}; some emit them
                # at the values-block level. Take the value-level if present, else block-level.
                if not qualifiers:
                    qualifiers = vb.get("qualifier") or []

                yield {
                    "site_no":      site_no,
                    "parameter_cd": parameter_cd,
                    "stat_cd":      stat_cd,
                    "obs_date":     obs_date,
                    "value":        val,
                    "unit":         unit,
                    "datum":        datum,
                    "qualifiers":   qualifiers,
                    "source_url":   source_url,
                    "ingested_at":  ingested_at,
                }


@dlt.resource(
    name="usgs_daily",
    write_disposition="merge",
    primary_key=["site_no", "parameter_cd", "stat_cd", "obs_date"],
    columns=_USGS_DAILY_COLUMNS,
)
def usgs_daily_resource(
    modified_since: str | None = None,
    backfill_start_year: int = BACKFILL_START_YEAR,
    backfill_end_year: int | None = None,
):
    """
    Pull daily-value rows for the 4 configured parameterCds statewide FL.

    Two modes:
      - modified_since (e.g. "P7D", "P90D"): single call per parameterCd,
        all dates, only records changed in the window. Cheap nightly/monthly.
      - Full backfill (modified_since=None): chunked per (parameterCd, year)
        to keep response bodies reasonable. ~4 × 26 = 104 requests for a
        2000→present run.
    """
    ingested_at = datetime.now(timezone.utc).isoformat()
    end_year = backfill_end_year or datetime.now(timezone.utc).year

    for parameter_cd in PARAMETER_CDS:
        if modified_since:
            url = build_dv_url(parameter_cd, modified_since=modified_since)
            resp = requests.get(url, timeout=300)
            resp.raise_for_status()
            yield from _parse_dv_response(resp.json(), parameter_cd, url, ingested_at)
            continue

        for start_dt, end_dt in _year_chunks(backfill_start_year, end_year):
            url = build_dv_url(parameter_cd, start_dt=start_dt, end_dt=end_dt)
            resp = requests.get(url, timeout=300)
            resp.raise_for_status()
            # Empty-window responses return {"value": {"timeSeries": []}} — fine.
            yield from _parse_dv_response(resp.json(), parameter_cd, url, ingested_at)


# ── usgs_sites resource ────────────────────────────────────────────────────────

# Map RDB column names → our column names. RDB uses USGS internal short names.
_SITE_COLUMN_MAP: dict[str, str] = {
    "agency_cd":           "agency_cd",
    "site_no":             "site_no",
    "station_nm":          "station_nm",
    "site_tp_cd":          "site_tp_cd",
    "dec_lat_va":          "latitude",
    "dec_long_va":         "longitude",
    "dec_coord_datum_cd":  "coord_datum_cd",
    "alt_va":              "alt_va",
    "alt_datum_cd":        "alt_datum_cd",
    "huc_cd":              "huc_cd",
    "state_cd":            "state_cd",
    "county_cd":           "county_cd",
}


def _parse_rdb(text: str):
    """
    Yield dicts from a USGS RDB tab-delimited response.

    Lines starting with '#' are comments. After comments, the first line is
    a tab-separated header (column names), the second is a tab-separated
    type/width row (e.g. '5s'/'15s'/'12s' — skip), and the rest is data.
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


@dlt.resource(
    name="usgs_sites",
    write_disposition="merge",
    primary_key="site_no",
    columns=_USGS_SITES_COLUMNS,
)
def usgs_sites_resource():
    """
    Pull active FL site metadata across the 3 siteType groups. Same site
    can appear in multiple type queries (rare); merge on site_no dedupes.

    parameter_cds is left as None here — populated by pipeline.py via a
    post-ingest UPDATE rollup from data_lake.usgs_daily (spec §7).
    """
    refreshed_at = datetime.now(timezone.utc).isoformat()

    for site_type in SITE_TYPE_GROUPS:
        url = build_site_url(site_type)
        resp = requests.get(url, timeout=120)
        resp.raise_for_status()

        for row in _parse_rdb(resp.text):
            site_no = _coerce_int_str(row.get("site_no"))
            if not site_no:
                continue
            yield {
                "site_no":        site_no,
                "agency_cd":      _coerce_int_str(row.get("agency_cd")) or "USGS",
                "station_nm":     _coerce_int_str(row.get("station_nm")),
                "site_tp_cd":     _coerce_int_str(row.get("site_tp_cd")),
                "state_cd":       _coerce_int_str(row.get("state_cd")),
                "county_cd":      _coerce_int_str(row.get("county_cd")),
                "huc_cd":         _coerce_int_str(row.get("huc_cd")),
                "latitude":       _coerce_float(row.get("dec_lat_va")),
                "longitude":      _coerce_float(row.get("dec_long_va")),
                "coord_datum_cd": _coerce_int_str(row.get("dec_coord_datum_cd")),
                "alt_va":         _coerce_float(row.get("alt_va")),
                "alt_datum_cd":   _coerce_int_str(row.get("alt_datum_cd")),
                "parameter_cds":  None,  # populated post-ingest
                "site_status":    "active",
                "source_url":     url,
                "refreshed_at":   refreshed_at,
            }
