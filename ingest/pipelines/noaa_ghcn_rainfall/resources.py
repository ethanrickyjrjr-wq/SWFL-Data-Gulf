import io
import csv
import logging
from datetime import datetime, timezone

import dlt
import requests

from .constants import (
    GHCN_S3_BY_YEAR_URL,
    GHCN_COLUMNS,
    ANCHOR_STATIONS,
    ANCHOR_STATION_NAMES,
    TENTHS_MM_PER_INCH,
    MIN_DAY_COUNT,
    BACKFILL_YEARS,
    _current_year,
)

log = logging.getLogger(__name__)

_GHCN_RAINFALL_COLUMNS: dict = {
    "id":           {"data_type": "text",      "nullable": False, "primary_key": True},
    "station_id":   {"data_type": "text",      "nullable": False},
    "station_name": {"data_type": "text",      "nullable": True},
    "county":       {"data_type": "text",      "nullable": False},
    "year":         {"data_type": "bigint",    "nullable": False},
    "annual_in":    {"data_type": "double",    "nullable": False},
    "day_count":    {"data_type": "bigint",    "nullable": False},
    "_ingested_at": {"data_type": "timestamp", "nullable": True},
}

# Coverage status buckets — why a station-year did or did not land.
STATUS_KEPT = "kept"
STATUS_DROPPED_BELOW_MIN = "dropped_below_min_day_count"
STATUS_ABSENT = "absent_from_csv"


def _fetch_year_coverage(year: int) -> list[dict]:
    """
    Download the GHCN by_year CSV for `year` and compute PRCP coverage for EVERY
    anchor station — including the ones that do not land.

    A station-year only lands in the lake if it has ≥ MIN_DAY_COUNT QC-passing
    PRCP days (so a partial year's SUM is never compared against a full year's).
    The old code dropped sub-threshold stations in a silent dict-comprehension,
    so a chronically under-reporting COOP station (e.g. USC00086078 Naples COOP,
    ~275 PRCP days/yr) simply vanished and looked like an ingest bug. This returns
    one record PER anchor so every drop is visible and countable, never silent.

    Each record:
      station_id, station_name, county, year
      rows_seen     – PRCP rows found for the station (any q_flag)
      qc_failed     – PRCP rows dropped for a non-blank q_flag (QC failure)
      missing_value – PRCP rows dropped for the GHCN -9999 missing sentinel
      day_count     – PRCP days passing QC with value ≥ 0 (the completeness count)
      annual_in     – summed inches over those day_count days (VALUE / 254)
      status        – STATUS_KEPT | STATUS_DROPPED_BELOW_MIN | STATUS_ABSENT

    Returns records for all anchors even if the URL yields no data (all ABSENT).
    """
    url = GHCN_S3_BY_YEAR_URL.format(year=year)
    resp = requests.get(url, timeout=300)
    resp.raise_for_status()

    # Per-anchor accumulators (all anchors seeded so absent stations still report).
    totals: dict[str, float] = {sid: 0.0 for sid in ANCHOR_STATIONS}
    day_counts: dict[str, int] = {sid: 0 for sid in ANCHOR_STATIONS}
    rows_seen: dict[str, int] = {sid: 0 for sid in ANCHOR_STATIONS}
    qc_failed: dict[str, int] = {sid: 0 for sid in ANCHOR_STATIONS}
    missing_value: dict[str, int] = {sid: 0 for sid in ANCHOR_STATIONS}

    # The by_year CSV carries a header row ("ID,DATE,ELEMENT,..."); DictReader is
    # given explicit fieldnames, so that header arrives as a data row with
    # station_id == "ID" and is harmlessly skipped by the anchor filter below.
    reader = csv.DictReader(io.StringIO(resp.text), fieldnames=GHCN_COLUMNS)
    for row in reader:
        sid = row["station_id"].strip()
        if sid not in ANCHOR_STATIONS:
            continue
        if row["element"].strip() != "PRCP":
            continue
        rows_seen[sid] += 1
        # Drop rows that failed quality control (non-blank q_flag).
        if row["q_flag"].strip():
            qc_failed[sid] += 1
            continue
        try:
            value_raw = float(row["value"].strip())
        except (ValueError, TypeError):
            continue
        if value_raw < 0:
            # -9999 is the GHCN missing-data sentinel.
            missing_value[sid] += 1
            continue
        totals[sid] += value_raw / TENTHS_MM_PER_INCH
        day_counts[sid] += 1

    coverage: list[dict] = []
    for sid in ANCHOR_STATIONS:
        dc = day_counts[sid]
        if rows_seen[sid] == 0:
            status = STATUS_ABSENT
        elif dc >= MIN_DAY_COUNT:
            status = STATUS_KEPT
        else:
            status = STATUS_DROPPED_BELOW_MIN
        coverage.append({
            "station_id":    sid,
            "station_name":  ANCHOR_STATION_NAMES.get(sid),
            "county":        ANCHOR_STATIONS[sid],
            "year":          year,
            "rows_seen":     rows_seen[sid],
            "qc_failed":     qc_failed[sid],
            "missing_value": missing_value[sid],
            "day_count":     dc,
            "annual_in":     round(totals[sid], 2),
            "status":        status,
        })
    return coverage


def _log_coverage(year: int, coverage: list[dict]) -> None:
    """Emit one line per anchor so kept AND dropped station-years are visible."""
    for rec in coverage:
        if rec["status"] == STATUS_KEPT:
            log.info(
                "noaa_ghcn_rainfall %d %s (%s): KEPT day_count=%d annual_in=%.2f",
                year, rec["station_id"], rec["station_name"],
                rec["day_count"], rec["annual_in"],
            )
        else:
            # WARNING so it surfaces under a default (root=WARNING) log config —
            # a dropped anchor must never be invisible in pipeline output.
            log.warning(
                "noaa_ghcn_rainfall %d %s (%s): DROPPED status=%s day_count=%d "
                "(< MIN_DAY_COUNT=%d) rows_seen=%d qc_failed=%d missing_value=%d — "
                "station omitted from lake (expected for a station that chronically "
                "under-reports; investigate only if a normally-complete station drops)",
                year, rec["station_id"], rec["station_name"], rec["status"],
                rec["day_count"], MIN_DAY_COUNT, rec["rows_seen"],
                rec["qc_failed"], rec["missing_value"],
            )


def _fetch_year_prcp(year: int) -> dict[str, tuple[float, int]]:
    """
    Backward-compatible view: only station-years that clear MIN_DAY_COUNT, mapping
    station_id → (annual_in, day_count). Prefer _fetch_year_coverage for the full,
    drop-aware picture.
    """
    return {
        rec["station_id"]: (rec["annual_in"], rec["day_count"])
        for rec in _fetch_year_coverage(year)
        if rec["status"] == STATUS_KEPT
    }


@dlt.resource(
    name="noaa_ghcn_rainfall",
    write_disposition="merge",
    primary_key="id",
    columns=_GHCN_RAINFALL_COLUMNS,
)
def noaa_ghcn_rainfall_resource(years: list[int]):
    """
    Fetches NOAA GHCN-Daily annual rainfall totals for SWFL anchor stations
    from the AWS Open Data S3 mirror (no auth required).

    One row per (station, year) — suitable for the refinery source to average
    across stations for the latest complete year. Uses merge+primary_key so
    re-runs are idempotent. Only station-years with ≥ MIN_DAY_COUNT QC-passing
    PRCP days land; every dropped station-year is logged (see _log_coverage) so
    the gap is never silent.
    """
    ingested_at = datetime.now(timezone.utc).isoformat()

    for year in years:
        coverage = _fetch_year_coverage(year)
        _log_coverage(year, coverage)
        for rec in coverage:
            if rec["status"] != STATUS_KEPT:
                continue
            yield {
                "id":           f'{rec["station_id"]}|{year}',
                "station_id":   rec["station_id"],
                "station_name": rec["station_name"],
                "county":       rec["county"],
                "year":         year,
                "annual_in":    rec["annual_in"],
                "day_count":    rec["day_count"],
                "_ingested_at": ingested_at,
            }


def build_years() -> list[int]:
    """Rolling window: current year + (BACKFILL_YEARS - 1) prior complete years."""
    end = _current_year()
    return list(range(end - BACKFILL_YEARS + 1, end + 1))
