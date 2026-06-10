"""Submarket + site-ZIP stamping for MHS permits (J3 — universal ZIP spine tie-in).

Two deterministic post-ingest steps, idempotent, run after the PDF upsert:

  1. submarket_slug  — map the raw `jurisdiction` string to a submarket slug via
     `data_lake.mhs_jurisdiction_xwalk` (DDL/INSERT in the J3 migration). A raw
     jurisdiction with no crosswalk row is left NULL (loud gap, never guessed).

  2. zip_code  — geocode `project_address` through the US Census batch geocoder
     (same free endpoint collier_permits uses) and **scope-gate every result
     through the 6-county ZIP spine** (`fixtures/swfl-zip-county.json`, the same
     set `resolveZip().in_scope` reads). A ZIP that resolves outside the 6
     counties — or an address Census can't match — is left NULL. We never derive
     a ZIP from `jurisdiction` (a jurisdiction spans many ZIPs → invented
     precision) and never write an out-of-scope or invented ZIP (MOAT).

`project_address` rows are street-only ("2555 Crystal Dr"); Census needs a city,
so we hint it from the jurisdiction. A wrong/approximate hint makes Census
No_Match (→ NULL) rather than return a wrong ZIP, so the hint is safe: it only
ever *adds* correct coverage, never invents precision.

G2: `pipeline.py` calls `stamp_submarket_and_zip()` after every upsert so future
annual drops populate both columns, not just this one-time backfill.
"""
from __future__ import annotations

import csv
import io
import json
import sys
from pathlib import Path

import requests

CENSUS_GEOCODER_URL = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch"
CENSUS_BATCH_SIZE = 9_999  # Census hard limit is 10,000 rows/request

_FIXTURE_PATH = (
    Path(__file__).resolve().parents[3] / "fixtures" / "swfl-zip-county.json"
)

# Jurisdiction → city hint for the Census geocoder. Incorporated cities map to
# themselves; unincorporated areas use the county seat (matches addresses in the
# seat city, No_Match → NULL elsewhere — honest, never a wrong ZIP).
JURISDICTION_CITY: dict[str, str] = {
    "City of Cape Coral": "Cape Coral",
    "City of Fort Myers": "Fort Myers",
    "City of Bonita Springs": "Bonita Springs",
    "City of Sanibel": "Sanibel",
    "Town of Fort Myers Beach": "Fort Myers Beach",
    "Estero": "Estero",
    "City of Naples": "Naples",
    "City of Marco Island": "Marco Island",
    "City of Punta Gorda": "Punta Gorda",
    "Unincorporated Lee County": "Fort Myers",
    "Unincorporated Collier": "Naples",
    "Unincorporated Charlotte County": "Punta Gorda",
}


def load_inscope_zips() -> set[str]:
    """The 6-county ZIP set — identical to what `resolveZip().in_scope` reads."""
    data = json.loads(_FIXTURE_PATH.read_text())
    return {e["zip"] for e in data["entries"]}


def _extract_zip(matched_addr: str) -> str | None:
    """ZIP = last comma segment of a Census matched_addr (G4-verified field path).

    "2555 CRYSTAL DR, FORT MYERS, FL, 33966" -> "33966".
    """
    parts = matched_addr.rsplit(",", 1)
    if len(parts) < 2:
        return None
    cand = parts[1].strip()
    return cand if len(cand) == 5 and cand.isdigit() else None


def geocode_zip_batch(
    keyed_addrs: list[tuple[str, str]],
    session: requests.Session | None = None,
) -> dict[str, str | None]:
    """Geocode (street, city) tuples; return {f"{street}|{city}": zip|None}.

    Keyed by the exact "street|city" string we send so callers can join back.
    """
    http = session or requests.Session()
    result: dict[str, str | None] = {}
    # de-dupe identical street|city queries
    unique: list[tuple[str, str]] = []
    seen: set[str] = set()
    for street, city in keyed_addrs:
        k = f"{street}|{city}"
        if k not in seen:
            seen.add(k)
            unique.append((street, city))
            result[k] = None
    if not unique:
        return result

    for start in range(0, len(unique), CENSUS_BATCH_SIZE):
        chunk = unique[start : start + CENSUS_BATCH_SIZE]
        payload = "\n".join(
            f"{i},{street},{city},FL," for i, (street, city) in enumerate(chunk)
        )
        try:
            r = http.post(
                CENSUS_GEOCODER_URL,
                data={"benchmark": "Public_AR_Current", "returntype": "locations"},
                files={"addressFile": ("addresses.csv", payload.encode("utf-8"), "text/plain")},
                timeout=120,
            )
            r.raise_for_status()
        except requests.RequestException as exc:
            print(f"[mhs-geocode] Census error chunk {start}: {exc}", file=sys.stderr)
            continue
        for row in csv.reader(io.StringIO(r.text)):
            # match rows have 8 cols; col2=status, col4=matched_addr
            if len(row) < 6:
                continue
            if row[2].strip().lower() != "match":
                continue
            try:
                idx = int(row[0].strip())
            except ValueError:
                continue
            street, city = chunk[idx]
            result[f"{street}|{city}"] = _extract_zip(row[4].strip())
    return result


def stamp_submarket_and_zip(db_url: str, dry_run: bool = False) -> dict[str, int]:
    """Idempotent: fill submarket_slug (via xwalk) + scope-gated zip_code.

    Returns counts: {submarket_filled, zip_in_scope, zip_out_of_scope_dropped,
    zip_no_match}.
    """
    import psycopg

    inscope = load_inscope_zips()
    stats = {
        "submarket_filled": 0,
        "zip_in_scope": 0,
        "zip_out_of_scope_dropped": 0,
        "zip_no_match": 0,
    }

    with psycopg.connect(db_url) as conn:
        # 1. submarket_slug from the crosswalk (idempotent; only fills NULLs)
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE data_lake.mhs_permits_swfl p
                   SET submarket_slug = x.submarket_slug
                  FROM data_lake.mhs_jurisdiction_xwalk x
                 WHERE p.jurisdiction = x.raw_jurisdiction
                   AND p.submarket_slug IS DISTINCT FROM x.submarket_slug
                """
            )
            stats["submarket_filled"] = cur.rowcount

        # 2. geocode zip for rows missing one with a usable address + city hint
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, project_address, jurisdiction
                  FROM data_lake.mhs_permits_swfl
                 WHERE zip_code IS NULL AND project_address IS NOT NULL
                """
            )
            rows = cur.fetchall()

        queries: list[tuple[str, str]] = []
        row_key: dict[str, str] = {}  # id -> "street|city"
        for rid, addr, jur in rows:
            city = JURISDICTION_CITY.get(jur)
            if not city:
                continue
            street = addr.strip()
            key = f"{street}|{city}"
            queries.append((street, city))
            row_key[rid] = key

        zmap = geocode_zip_batch(queries)

        updates: list[tuple[str, str]] = []  # (zip, id)
        for rid, key in row_key.items():
            z = zmap.get(key)
            if z is None:
                stats["zip_no_match"] += 1
            elif z in inscope:
                stats["zip_in_scope"] += 1
                updates.append((z, rid))
            else:
                stats["zip_out_of_scope_dropped"] += 1

        if dry_run:
            print(f"[dry-run] would set zip_code on {len(updates)} rows", file=sys.stderr)
        elif updates:
            with conn.cursor() as cur:
                cur.executemany(
                    "UPDATE data_lake.mhs_permits_swfl SET zip_code=%s WHERE id=%s",
                    updates,
                )
            conn.commit()

    return stats


if __name__ == "__main__":
    import argparse

    from ingest.pipelines.mhs_permits_swfl.pipeline import _get_db_url

    ap = argparse.ArgumentParser(description="MHS submarket + site-ZIP stamper")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    out = stamp_submarket_and_zip(_get_db_url(), dry_run=args.dry_run)
    print("submarket/zip stamp:", out, file=sys.stderr)
