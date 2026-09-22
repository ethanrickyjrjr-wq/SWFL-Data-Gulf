"""FDIC BankFind — bank branches + annual branch deposits for Lee/Collier/Hendry, full scope.

Three datasets from one keyless API (spec: docs/superpowers/specs/2026-09-22-fdic-bankfind-design.md):

  fdic_sod           /sod          one row per branch per year, 81 fields, 1994-> (deposits in $000s)
  fdic_locations     /locations    current branch directory, 38 fields
  fdic_institutions  /institutions the banks behind those branches, 134 fields

Every vendor field is kept as written (key lowercased) plus ``ingested_at``. Nothing is renamed,
summed or coerced here — the aggregate view (docs/sql/20260922_fdic_sod_county_year_v.sql) does the
math in SQL.

THE TRAP: on /sod, ``STCNTY`` is the bank's HEADQUARTERS county and ``STCNTYBR`` is the branch's.
The 08/02/2026 scout filtered on STCNTY and saw 26 Lee rows for 2025; the branch filter returns 160.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, Iterator

import dlt
import requests

from ingest.lib.guards import VolumeGuardError, assert_header_has, assert_min_rows

from .constants import (
    API_BASE,
    CERT_BATCH,
    COUNTY_FIPS,
    INSTITUTIONS_MIN_ROWS,
    INSTITUTIONS_REQUIRED,
    LOCATIONS_MIN_ROWS,
    LOCATIONS_REQUIRED,
    PAGE_LIMIT,
    SOD_MIN_ROWS,
    SOD_REQUIRED,
)


def sod_filter(fips: str) -> str:
    return f"STCNTYBR:{fips}"  # branch county, NOT the HQ county (STCNTY)


def locations_filter(fips: str) -> str:
    # On /locations every record IS a branch, so STCNTY is the branch's county (verified 09/22/2026:
    # a Bank of America branch, HQ North Carolina, carries STCNTY 12071).
    return f"STCNTY:{fips}"


def cert_batches(certs: Iterable[int | str], size: int = CERT_BATCH) -> Iterator[str]:
    batch: list[str] = []
    for c in certs:
        batch.append(f"CERT:{c}")
        if len(batch) == size:
            yield " OR ".join(batch)
            batch = []
    if batch:
        yield " OR ".join(batch)


def fetch_all(endpoint: str, filters: str, label: str = "") -> list[dict]:
    """Page through one filtered endpoint and return the raw vendor rows.

    Raises VolumeGuardError when the sweep ends short of ``meta.total`` — a partial page landing
    as a healthy-looking table is the failure this exists to stop.
    """
    rows: list[dict] = []
    total: int | None = None
    offset = 0
    while True:
        resp = requests.get(
            f"{API_BASE}/{endpoint}",
            params={"filters": filters, "limit": PAGE_LIMIT, "offset": offset, "format": "json"},
            timeout=120,
        )
        if not resp.ok:
            raise RuntimeError(f"fdic_bankfind {label or endpoint}: HTTP {resp.status_code} — {resp.text[:300]}")
        body = resp.json()
        total = int(body.get("meta", {}).get("total", 0))
        page = [r["data"] for r in body.get("data", [])]
        rows.extend(page)
        offset += len(page)
        if not page or offset >= total:
            break
    if total is None or len(rows) != total:
        raise VolumeGuardError(
            f"[volume-guard] fdic_bankfind {label or endpoint}: fetched {len(rows)} of meta.total={total} "
            f"— partial sweep, aborting before write"
        )
    print(f"  fdic_bankfind {label or endpoint}: {len(rows):,} rows")
    return rows


def require_fields(rows: list[dict], required: Iterable[str], label: str = "") -> None:
    if rows:
        assert_header_has(rows[0].keys(), required, label=f"fdic_bankfind {label}")


def normalize(row: dict, ingested_at: str) -> dict:
    out = {k.lower(): v for k, v in row.items()}
    out["ingested_at"] = ingested_at
    return out


def collect_all_datasets() -> dict[str, list[dict]]:
    """Fetch every dataset once, guard it, and return normalized rows keyed by resource name."""
    ingested_at = datetime.now(timezone.utc).isoformat()

    sod: list[dict] = []
    locations: list[dict] = []
    for fips in COUNTY_FIPS:
        sod.extend(fetch_all("sod", sod_filter(fips), label=f"sod {fips}"))
        locations.extend(fetch_all("locations", locations_filter(fips), label=f"locations {fips}"))
    require_fields(sod, SOD_REQUIRED, label="sod")
    require_fields(locations, LOCATIONS_REQUIRED, label="locations")
    # Guards run BEFORE the destructive replace on locations/institutions (BIBLE §0.2 rule 5).
    assert_min_rows(len(sod), SOD_MIN_ROWS, label="fdic_sod")
    assert_min_rows(len(locations), LOCATIONS_MIN_ROWS, label="fdic_locations")

    certs = sorted({int(r["CERT"]) for r in sod} | {int(r["CERT"]) for r in locations})
    institutions: list[dict] = []
    for i, batch in enumerate(cert_batches(certs)):
        institutions.extend(fetch_all("institutions", batch, label=f"institutions batch {i}"))
    require_fields(institutions, INSTITUTIONS_REQUIRED, label="institutions")
    assert_min_rows(len(institutions), INSTITUTIONS_MIN_ROWS, label="fdic_institutions")

    return {
        "fdic_sod": [normalize(r, ingested_at) for r in sod],
        "fdic_locations": [normalize(r, ingested_at) for r in locations],
        "fdic_institutions": [normalize(r, ingested_at) for r in institutions],
    }


def build_resources(data: dict[str, list[dict]]) -> list:
    """dlt resources over already-guarded rows. Lives HERE, next to the assert_min_rows() calls above,
    because the pre-push Gate 4 checks per FILE that a destructive replace sits beside its guard."""
    return [
        # SOD is an append-only history keyed YEAR_CERT_BRNUM: merge never wipes prior years.
        dlt.resource(data["fdic_sod"], name="fdic_sod", write_disposition="merge", primary_key="id"),
        # Locations + institutions are CURRENT directories: closed branches must disappear, so
        # replace — guarded by the min-rows floors in collect_all_datasets() before this runs.
        dlt.resource(data["fdic_locations"], name="fdic_locations", write_disposition="replace", primary_key="id"),
        dlt.resource(data["fdic_institutions"], name="fdic_institutions", write_disposition="replace", primary_key="id"),
    ]
