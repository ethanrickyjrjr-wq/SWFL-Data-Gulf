"""Local-only Census Building Permits Survey county capture.

This is deliberately not an ingest pipeline: it writes no lake table and carries no workflow.
It keeps the Census county-file's estimated and reported structure classes separate so an
analyst, rather than this collector, decides whether any aggregate is appropriate.
"""
from __future__ import annotations

import argparse
import calendar
import csv
import hashlib
import io
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import requests

from ingest.lib.research_capture import first_seen_for_release, resolve_capture_root, store_raw_bytes, write_observations_and_manifest


BASE_URL = "https://www2.census.gov/econ/bps/County/co{yy:02d}{month:02d}c.txt"
TARGET_COUNTIES = {"021": "12021", "071": "12071"}
COUNTY_GEOS = tuple(sorted(TARGET_COUNTIES.values()))
MAX_BYTES = 10 * 1024 * 1024


class BpsParseError(RuntimeError):
    pass


def month_range(start: str, through: str) -> list[str]:
    def parse(value: str) -> tuple[int, int]:
        try:
            year, month = map(int, value.split("-"))
            if not 1 <= month <= 12:
                raise ValueError
            return year, month
        except ValueError as exc:
            raise ValueError(f"expected YYYY-MM month, got {value!r}") from exc
    year, month = parse(start)
    end_year, end_month = parse(through)
    answer: list[str] = []
    while (year, month) <= (end_year, end_month):
        answer.append(f"{year:04d}-{month:02d}")
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return answer


def release_url(period: str) -> str:
    year, month = map(int, period.split("-"))
    return BASE_URL.format(yy=year % 100, month=month)


def discover_latest_period() -> str:
    """Read the official directory rather than assuming the current calendar month is due."""
    directory = "https://www2.census.gov/econ/bps/County/"
    response = requests.get(directory, timeout=(10, 30), headers={"User-Agent": "SWFL-Data-Gulf research capture"})
    response.raise_for_status()
    matches = re.findall(r"co(\d{2})(\d{2})c\.txt", response.text)
    if not matches:
        raise BpsParseError("Census county directory did not expose monthly coYYMMc.txt releases")
    year, month = max((2000 + int(year), int(month)) for year, month in matches if 1 <= int(month) <= 12)
    return f"{year:04d}-{month:02d}"


def fetch_release(period: str, *, retries: int = 3) -> bytes:
    url = release_url(period)
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            response = requests.get(url, timeout=(10, 60), headers={"User-Agent": "SWFL-Data-Gulf research capture"})
            response.raise_for_status()
            if len(response.content) > MAX_BYTES:
                raise BpsParseError(f"{period}: release exceeds {MAX_BYTES} byte safety limit")
            if len(response.content) < 100:
                raise BpsParseError(f"{period}: truncated release ({len(response.content)} bytes)")
            return response.content
        except Exception as exc:  # keep a period-specific failure for coverage matrix
            last_error = exc
            if attempt + 1 < retries:
                time.sleep(0.5 * (attempt + 1))
    assert last_error is not None
    raise BpsParseError(f"{period}: download failed from {url}: {last_error}")


def _cached_release(root: str | Path, period: str) -> bytes | None:
    """Resume an interrupted backfill from immutable retained source bytes."""
    archive_root = resolve_capture_root(root)
    paths = sorted((archive_root / "raw" / "census_bps_county").glob(f"*/*-{period}.txt"))
    if not paths:
        return None
    # Multiple byte hashes for one month indicate a publisher revision.  The normal resume
    # path uses a deterministic retained vintage; a later explicit refresh adds another hash.
    return paths[-1].read_bytes()


def _number(value: str) -> int | None:
    clean = value.strip().replace(",", "")
    if clean in {"", "-", "(D)", "(X)", "NA", "N/A"}:
        return None
    try:
        return int(clean)
    except ValueError as exc:
        raise BpsParseError(f"non-numeric BPS cell {value!r}") from exc


def _metric_map(cells: list[str]) -> dict[str, dict[str, Any]]:
    # The monthly county layout has six metadata fields, then four estimated structure
    # families followed by their reported counterparts.  Do not roll reported rows into
    # estimates or mix the current-month file with BPS YTD files.
    families = [("one_unit", 6), ("two_unit", 9), ("three_four_unit", 12), ("five_plus_unit", 15)]
    metrics: dict[str, dict[str, Any]] = {}
    for suffix, offset in families:
        for field, index in (("buildings", offset), ("units", offset + 1), ("valuation_usd", offset + 2)):
            metrics[f"residential_{suffix}_{field}"] = {"value": _number(cells[index]), "value_basis": "estimated"}
    for suffix, offset in [("one_unit", 18), ("two_unit", 21), ("three_four_unit", 24), ("five_plus_unit", 27)]:
        for field, index in (("buildings", offset), ("units", offset + 1), ("valuation_usd", offset + 2)):
            metrics[f"residential_{suffix}_{field}_reported"] = {"value": _number(cells[index]), "value_basis": "reported"}
    return metrics


def parse_county_file(content: bytes, requested_period: str) -> list[dict[str, Any]]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise BpsParseError(f"{requested_period}: non-text county release") from exc
    rows = list(csv.reader(io.StringIO(text)))
    if len(rows) < 3 or not rows[1] or rows[1][:3] != ["Date", "State", "County"]:
        raise BpsParseError(f"{requested_period}: unrecognized county-file header/layout")
    parsed: list[dict[str, Any]] = []
    for cells in rows[2:]:
        if not cells or not cells[0].strip():
            continue
        if len(cells) < 30:
            raise BpsParseError(f"{requested_period}: truncated county row ({len(cells)} columns)")
        if cells[1].strip() != "12" or cells[2].strip() not in TARGET_COUNTIES:
            continue
        source_period = cells[0].strip()
        if source_period != requested_period.replace("-", ""):
            raise BpsParseError(f"{requested_period}: file period {source_period!r} disagrees with requested month")
        parsed.append({"geo_id": TARGET_COUNTIES[cells[2].strip()], "county_name": cells[5].strip(), "metrics": _metric_map(cells)})
    if not parsed:
        raise BpsParseError(f"{requested_period}: no Florida Lee/Collier rows in county release")
    return sorted(parsed, key=lambda row: row["geo_id"])


def coverage_matrix(start: str, through: str, present: set[str], failures: dict[str, str] | None = None) -> dict[str, Any]:
    failures = failures or {}
    expected = month_range(start, through)
    missing = [{"period": period, "reason": failures.get(period, "not_retrieved")} for period in expected if period not in present]
    return {"expected_period_count": len(expected), "present_period_count": len(present), "missing": missing}


def _observation(period: str, geo_id: str, metric_id: str, cell: dict[str, Any], *, source_url: str, sha256: str, retrieved_at: str) -> dict[str, Any]:
    year, month = map(int, period.split("-"))
    return {
        "schema_version": 1,
        "source_id": "census_bps_county",
        "metric_id": metric_id,
        "definition_version": "census_bps_county_monthly_v1",
        "geo_type": "county_fips",
        "geo_id": geo_id,
        "period_start": f"{period}-01",
        "period_end": f"{period}-{calendar.monthrange(year, month)[1]:02d}",
        "frequency": "monthly",
        "value": cell["value"],
        "unit": "dollars" if "valuation_usd" in metric_id else "count",
        "status": cell.get("status", "observed" if cell["value"] is not None else "suppressed"),
        "value_basis": cell["value_basis"],
        "published_at": None,
        "first_seen_at": retrieved_at,
        "retrieved_at": retrieved_at,
        "available_at": None,
        "availability_basis": "unknown",
        "source_url": source_url,
        "source_sha256": sha256,
        "vintage_id": sha256,
        "quality_flags": ["publisher_date_not_exposed_in_county_file", *cell.get("quality_flags", [])],
    }


def run_capture(start: str, through: str, *, capture_root: str | Path | None, dry_run: bool, refresh: bool = False) -> dict[str, Any]:
    periods = month_range(start, through)
    # A dry run remains bounded even when the supplied range is a 16-year backfill.
    probe_periods = periods if len(periods) <= 3 else [periods[0], periods[len(periods) // 2], periods[-1]]
    selected = probe_periods if dry_run else periods
    if not dry_run and capture_root is None:
        capture_root = os.environ.get("SWFL_RESEARCH_ROOT")
    observed: list[dict[str, Any]] = []
    raw_files: list[dict[str, Any]] = []
    failures: dict[str, str] = {}
    present: set[str] = set()
    county_present: dict[str, set[str]] = {geo_id: set() for geo_id in COUNTY_GEOS}
    retrieved_at = datetime.now(timezone.utc).isoformat()
    for period in selected:
        try:
            content = None if dry_run or refresh or capture_root is None else _cached_release(capture_root, period)
            if content is None:
                content = fetch_release(period)
            county_rows = parse_county_file(content, period)
        except BpsParseError as exc:
            failures[period] = str(exc)
            continue
        present.add(period)
        digest = hashlib.sha256(content).hexdigest()
        if not dry_run:
            assert capture_root is not None
            raw = store_raw_bytes(capture_root, source_id="census_bps_county", original_name=f"{period}.txt", content=content)
            digest = raw.sha256
            release_first_seen = first_seen_for_release(capture_root, source_id="census_bps_county", sha256=digest, observed_at=retrieved_at)
            raw_files.append({"relative_path": raw.relative_path, "sha256": raw.sha256, "byte_size": raw.byte_size, "source_url": release_url(period)})
        else:
            release_first_seen = retrieved_at
        for county in county_rows:
            for metric_id, cell in county["metrics"].items():
                observed.append(_observation(period, county["geo_id"], metric_id, cell, source_url=release_url(period), sha256=digest, retrieved_at=release_first_seen))
        # County participation can change across the archive.  Keep the released county's
        # measurements and emit explicit null placeholders for the other target geography.
        # A publisher omission is not a zero-construction month.
        present_geos = {county["geo_id"] for county in county_rows}
        for geo_id in present_geos:
            county_present[geo_id].add(period)
        template_metrics = next(iter(county_rows))["metrics"]
        for geo_id in set(COUNTY_GEOS) - present_geos:
            for metric_id, template in template_metrics.items():
                observed.append(_observation(period, geo_id, metric_id, {"value": None, "value_basis": template["value_basis"], "status": "missing", "quality_flags": ["county_absent_from_release"]}, source_url=release_url(period), sha256=digest, retrieved_at=release_first_seen))
    coverage = coverage_matrix(start, through, present, failures)
    county_coverage = {
        geo_id: coverage_matrix(start, through, periods, {period: "county_absent_from_release" for period in set(selected) - periods})
        for geo_id, periods in county_present.items()
    }
    result: dict[str, Any] = {
        "mode": "dry_run" if dry_run else "capture_local",
        "processed_period_count": len(selected),
        "sample_periods": selected if len(selected) <= 4 else [selected[0], selected[1], "…", selected[-1]],
        "coverage": coverage,
        "coverage_by_geo": county_coverage,
        "failures": failures,
        "observation_count": len(observed),
    }
    if not dry_run:
        assert capture_root is not None
        exported = write_observations_and_manifest(capture_root, source_id="census_bps_county", observations=observed, manifest={
            "run_id": retrieved_at,
            "source_ids": ["census_bps_county"],
            "raw_files": raw_files,
            "requested_date_range": {"from": start, "through": through},
            "source_periods": {"census_bps_county": coverage},
            "coverage_by_geo": county_coverage,
            "expected_period_count": coverage["expected_period_count"],
            "present_period_count": coverage["present_period_count"],
            "missing_periods": coverage["missing"],
            "discovery_parse_failures": failures,
        })
        result["observation_path"] = str(exported.observation_path)
        result["manifest_path"] = str(exported.manifest_path)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Capture Census BPS county files locally; never writes the lake.")
    parser.add_argument("--from", dest="start", default="2010-01")
    parser.add_argument("--through", default=datetime.now(timezone.utc).strftime("%Y-%m"), help="YYYY-MM or latest (currently current UTC month)")
    parser.add_argument("--dry-run", action="store_true", help="Fetch only a bounded three-period probe; no persistent writes.")
    parser.add_argument("--capture-local", action="store_true", help="Fetch requested range and write immutable local raw/export files under SWFL_RESEARCH_ROOT.")
    parser.add_argument("--refresh", action="store_true", help="Ignore retained month bytes and check publisher files for a revised vintage (capture-local only).")
    args = parser.parse_args(argv)
    if args.dry_run and args.capture_local:
        parser.error("--dry-run and --capture-local are mutually exclusive")
    if args.refresh and not args.capture_local:
        parser.error("--refresh requires --capture-local")
    through = discover_latest_period() if args.through == "latest" else args.through
    # No flag defaults to a safe, bounded dry run.
    result = run_capture(args.start, through, capture_root=os.environ.get("SWFL_RESEARCH_ROOT"), dry_run=not args.capture_local, refresh=args.refresh)
    print({key: result[key] for key in ("mode", "processed_period_count", "sample_periods", "observation_count", "failures")})
    print({"coverage": {key: result["coverage"][key] for key in ("expected_period_count", "present_period_count")}})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
