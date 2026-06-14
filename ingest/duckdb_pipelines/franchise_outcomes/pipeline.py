"""SBA 7(a) FOIA — franchise loan outcomes → Parquet in Tier 1 Storage.

Run with: python -m ingest.duckdb_pipelines.franchise_outcomes.pipeline

What it does:
  1. Downloads three SBA 7(a) FOIA CSVs (FY2000-2009, FY2010-2019, FY2020-present)
     to a local temp directory. Each file is 50-200 MB (plain CSV, no compression).
  2. DuckDB filters to Lee + Collier county franchise rows (~453 total across all files;
     see SOURCED.md#sba-foia-franchise-row-counts for exact counts by file).
  3. Python enriches each unique (borrcity, projectcounty) with a ZIP approximation
     via the Census Geocoder centroid lookup (ingest.utils.zip_approx). The city names
     are ALL-CAPS in SBA data; zip_approx title-cases them internally (commit 6922a3a).
  4. Aggregates two output tables:
       county_brands  : one row per franchise brand (Lee+Collier aggregate)
                        → consumed by franchise-outcomes brain (Phase 1)
       zip_brands     : brand × zip_approx, N_MIN_RESOLVED≥3 enforced, zip_is_approx=True
                        → supplemental detail_tables table (Phase 2, not yet consumed)
  5. Writes two Parquet files to Tier-1 Storage and upserts inventory rows.

Directional polarity (concern #3):
  survival_rate rising  → bullish    (charged in packs.mts, direction stays neutral until
  chargeoff_rate rising → bearish     live cohort comparison is possible — see SOURCED.md)
  n_loans / avg_loan_size             → volume only, no direction vote

ZIP boundary (concern #4):
  ZIP-approx cells have zip_is_approx=True always. The county Parquet is the
  authoritative direction source. ZIP table is detail_tables only.

Tier / lane (concern #5): Tier-1 Parquet (DuckDB, no Postgres). No GRANT/NOTIFY needed.

Update schedule: SBA FOIA updates quarterly (~1 month after each quarter end).
Cron target: 15th of Jan / Apr / Jul / Oct at 08:00 UTC.
"""

import argparse
import os
import sys
import tempfile
from collections import defaultdict
from datetime import date
from pathlib import Path
import csv
import io
from typing import Any

import duckdb
import requests

from .constants import (
    BUCKET,
    COUNTY_PARQUET_PATH,
    COUNTY_PARQUET_TARGET,
    N_MIN_RESOLVED,
    PACK_ID,
    PROJECT_COUNTIES,
    PROJECT_STATE,
    SBA_FOIA_CITATION_URL,
    SBA_FOIA_URLS,
    STATUS_CHARGED_OFF,
    STATUS_PAID_IN_FULL,
    ZCTA_ASSET_PATH,
    ZIP_PARQUET_PATH,
    ZIP_PARQUET_TARGET,
)
from ingest.lib.tier1_inventory import upsert_inventory_row
from ingest.utils.zip_approx import get_zip_approx


def _load_env() -> None:
    env_path = Path(__file__).parent.parent.parent.parent / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def _configure_s3(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("INSTALL httpfs; LOAD httpfs;")
    endpoint = (
        os.environ["SUPABASE_S3_ENDPOINT"]
        .replace("https://", "")
        .replace("http://", "")
    )
    con.execute(f"""
        SET s3_endpoint='{endpoint}';
        SET s3_access_key_id='{os.environ["SUPABASE_S3_ACCESS_KEY_ID"]}';
        SET s3_secret_access_key='{os.environ["SUPABASE_S3_SECRET_ACCESS_KEY"]}';
        SET s3_region='us-east-1';
        SET s3_url_style='path';
        SET s3_use_ssl=true;
    """)


def _download_csv(url: str, dest: Path) -> None:
    label = url.rsplit("/", 1)[-1]
    print(f"  downloading {label}")
    with requests.get(url, stream=True, timeout=600) as resp:
        resp.raise_for_status()
        total = int(resp.headers.get("content-length", 0))
        written = 0
        with dest.open("wb") as f:
            for chunk in resp.iter_content(chunk_size=8 * 1024 * 1024):
                f.write(chunk)
                written += len(chunk)
                if total:
                    pct = written / total * 100
                    print(f"\r    {written / 1e6:.0f}/{total / 1e6:.0f} MB ({pct:.0f}%)",
                          end="", flush=True)
    print(f"\r    {written / 1e6:.1f} MB — done")


def _filter_franchise_rows(con: duckdb.DuckDBPyConnection, csv_paths: list[Path]) -> list[dict]:
    """DuckDB: read all CSVs, filter to Lee/Collier franchise rows, return as dicts."""
    paths_sql = ", ".join(f"'{p}'" for p in csv_paths)
    counties_sql = ", ".join(f"'{c}'" for c in PROJECT_COUNTIES)

    rows = con.execute(f"""
        SELECT
            TRIM(franchisecode)                  AS franchise_code,
            TRIM(franchisename)                  AS franchise_name,
            UPPER(TRIM(borrcity))                AS borr_city,
            UPPER(TRIM(projectcounty))           AS project_county,
            TRIM(loanstatus)                     AS loan_status,
            TRY_CAST(REPLACE(TRIM(grossapproval), ',', '') AS DOUBLE) AS gross_approval,
            TRY_CAST(TRIM(jobssupported) AS INTEGER)                  AS jobs_supported
        FROM read_csv([{paths_sql}],
                      header=true, quote='"', ignore_errors=true)
        WHERE UPPER(TRIM(projectstate)) = '{PROJECT_STATE}'
          AND UPPER(TRIM(projectcounty)) IN ({counties_sql})
          AND TRIM(franchisename) != ''
          AND TRIM(franchisename) IS NOT NULL
        ORDER BY franchise_name, project_county
    """).fetchall()

    cols = ["franchise_code", "franchise_name", "borr_city", "project_county",
            "loan_status", "gross_approval", "jobs_supported"]
    return [dict(zip(cols, r)) for r in rows]


def _enrich_with_zip(rows: list[dict]) -> list[dict]:
    """Geocode each unique (borr_city, project_county) once; attach zip_approx to all rows."""
    unique_pairs: set[tuple[str, str]] = {
        (r["borr_city"], r["project_county"]) for r in rows if r["borr_city"]
    }
    zip_cache: dict[tuple[str, str], dict] = {}
    total = len(unique_pairs)
    for i, (city, county) in enumerate(sorted(unique_pairs), 1):
        result = get_zip_approx(city, county, PROJECT_STATE, ZCTA_ASSET_PATH)
        zip_cache[(city, county)] = result
        print(f"\r  geocoding city {i}/{total}: {city}, {county} → "
              f"{result.get('zip_approx') or 'None'}", end="", flush=True)
    print()

    for r in rows:
        key = (r["borr_city"], r["project_county"])
        zr = zip_cache.get(key, {"zip_approx": None, "zip_is_approx": True,
                                  "approx_method": "city_missing"})
        r["zip_approx"] = zr.get("zip_approx")
        r["zip_is_approx"] = True  # always True — never exact project ZIP
        r["approx_method"] = zr.get("approx_method", "unknown")
    return rows


def _aggregate_county(rows: list[dict]) -> list[dict[str, Any]]:
    """Aggregate county-grain brand table: one row per (franchise_code, franchise_name)."""
    buckets: dict[tuple[str, str], dict] = {}
    for r in rows:
        key = (r["franchise_code"] or "", r["franchise_name"])
        if key not in buckets:
            buckets[key] = dict(franchise_code=r["franchise_code"],
                                franchise_name=r["franchise_name"],
                                n_loans=0, n_paid_in_full=0, n_charged_off=0,
                                total_gross_approval=0.0)
        b = buckets[key]
        b["n_loans"] += 1
        if r["loan_status"] == STATUS_PAID_IN_FULL:
            b["n_paid_in_full"] += 1
        elif r["loan_status"] == STATUS_CHARGED_OFF:
            b["n_charged_off"] += 1
        if r["gross_approval"]:
            b["total_gross_approval"] += r["gross_approval"]

    result = []
    for b in buckets.values():
        resolved = b["n_paid_in_full"] + b["n_charged_off"]
        b["n_resolved"] = resolved
        b["survival_rate"] = (b["n_paid_in_full"] / resolved * 100) if resolved > 0 else None
        b["chargeoff_rate"] = (b["n_charged_off"] / resolved * 100) if resolved > 0 else None
        result.append(b)
    return sorted(result, key=lambda x: x["franchise_name"])


def _aggregate_zip(rows: list[dict]) -> list[dict[str, Any]]:
    """ZIP-approx grain: brand × zip_approx, N_MIN_RESOLVED≥3 enforced, zip_is_approx=True.

    Rows with zip_approx=None are excluded (geocode failed).
    Rows with n_resolved < N_MIN_RESOLVED are suppressed (thin sample).
    Citation must reflect zip_is_approx=True — never claim exact project ZIP.
    """
    buckets: dict[tuple[str, str, str], dict] = {}
    for r in rows:
        if not r.get("zip_approx"):
            continue
        key = (r["franchise_code"] or "", r["franchise_name"], r["zip_approx"])
        if key not in buckets:
            buckets[key] = dict(franchise_code=r["franchise_code"],
                                franchise_name=r["franchise_name"],
                                zip_approx=r["zip_approx"],
                                zip_is_approx=True,
                                approx_method=r["approx_method"],
                                n_loans=0, n_paid_in_full=0, n_charged_off=0,
                                total_gross_approval=0.0)
        b = buckets[key]
        b["n_loans"] += 1
        if r["loan_status"] == STATUS_PAID_IN_FULL:
            b["n_paid_in_full"] += 1
        elif r["loan_status"] == STATUS_CHARGED_OFF:
            b["n_charged_off"] += 1
        if r["gross_approval"]:
            b["total_gross_approval"] += r["gross_approval"]

    result = []
    for b in buckets.values():
        resolved = b["n_paid_in_full"] + b["n_charged_off"]
        b["n_resolved"] = resolved
        if resolved < N_MIN_RESOLVED:
            continue  # suppress thin-sample ZIP cells per SOURCED.md#sba-foia-franchise-row-counts
        b["survival_rate"] = b["n_paid_in_full"] / resolved * 100
        b["chargeoff_rate"] = b["n_charged_off"] / resolved * 100
        result.append(b)
    return sorted(result, key=lambda x: (x["zip_approx"], x["franchise_name"]))


def _write_parquet_from_rows(con: duckdb.DuckDBPyConnection, rows: list[dict],
                              target: str, label: str) -> int:
    """Write rows to a Parquet file via DuckDB using a temp CSV approach."""
    if not rows:
        print(f"  {label}: 0 rows — skipping", file=sys.stderr)
        return 0

    import csv
    import io
    cols = list(rows[0].keys())
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=cols)
    w.writeheader()
    w.writerows(rows)
    buf.seek(0)

    con.execute("DROP TABLE IF EXISTS _tmp_out")
    # Write to temp file then read with DuckDB
    with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False,
                                     encoding="utf-8") as tf:
        tf.write(buf.getvalue())
        tmp_path = tf.name

    try:
        con.execute(f"CREATE TABLE _tmp_out AS SELECT * FROM read_csv('{tmp_path}', header=true)")
        con.execute(f"COPY _tmp_out TO '{target}' (FORMAT PARQUET, COMPRESSION ZSTD)")
        count = con.execute("SELECT COUNT(*) FROM _tmp_out").fetchone()[0]
        print(f"  {label}: {count} rows → {target}")
    finally:
        os.unlink(tmp_path)

    return count


def run(*, county_target: str = COUNTY_PARQUET_TARGET,
        zip_target: str = ZIP_PARQUET_TARGET) -> None:
    _load_env()
    vintage = date.today().isoformat()

    print("franchise-outcomes: starting SBA FOIA ingest")
    print(f"  county target: {county_target}")
    print(f"  zip target:    {zip_target}")

    con = duckdb.connect()
    if county_target.startswith("s3://"):
        _configure_s3(con)

    with tempfile.TemporaryDirectory() as tmp_dir:
        csv_paths: list[Path] = []
        for i, url in enumerate(SBA_FOIA_URLS):
            dest = Path(tmp_dir) / f"foia_{i}.csv"
            _download_csv(url, dest)
            csv_paths.append(dest)

        print("  filtering to Lee + Collier franchise rows…")
        rows = _filter_franchise_rows(con, csv_paths)
        print(f"  franchise rows: {len(rows)} (expected ~453; see SOURCED.md#sba-foia-franchise-row-counts)")

        if len(rows) == 0:
            print("  ERROR: zero franchise rows in Lee+Collier — aborting", file=sys.stderr)
            sys.exit(1)

        print("  enriching with ZIP approximation (Census Geocoder)…")
        rows = _enrich_with_zip(rows)

        # County-grain aggregation
        county_rows = _aggregate_county(rows)
        print(f"  county brands: {len(county_rows)} unique brands")

        # ZIP-approx aggregation
        zip_rows = _aggregate_zip(rows)
        print(f"  zip-approx brand×ZIP cells: {len(zip_rows)} qualifying "
              f"(N_MIN_RESOLVED={N_MIN_RESOLVED}; thin cells suppressed)")

    county_count = _write_parquet_from_rows(con, county_rows, county_target, "county-grain")
    zip_count = _write_parquet_from_rows(con, zip_rows, zip_target, "zip-approx-grain")

    if county_target.startswith("s3://"):
        upsert_inventory_row(
            bucket=BUCKET,
            path=COUNTY_PARQUET_PATH,
            vintage=vintage,
            byte_size=None,
            pack_id=PACK_ID,
            source_url=SBA_FOIA_CITATION_URL,
        )
        upsert_inventory_row(
            bucket=BUCKET,
            path=ZIP_PARQUET_PATH,
            vintage=vintage,
            byte_size=None,
            pack_id=PACK_ID,
            source_url=SBA_FOIA_CITATION_URL,
        )
        print("  inventory rows upserted")

    print(f"franchise-outcomes: complete ({county_count} county brands, {zip_count} zip cells)")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true",
                   help="Print what would be downloaded/written without executing")
    args = p.parse_args(argv)

    if args.dry_run:
        print("franchise-outcomes dry-run:")
        for url in SBA_FOIA_URLS:
            print(f"  would download: {url.rsplit('/', 1)[-1]}")
        print(f"  would write county Parquet to: {COUNTY_PARQUET_TARGET}")
        print(f"  would write zip Parquet to:    {ZIP_PARQUET_TARGET}")
        print(f"  geography filter: projectstate='{PROJECT_STATE}' "
              f"AND projectcounty IN {sorted(PROJECT_COUNTIES)}")
        print(f"  N_MIN_RESOLVED={N_MIN_RESOLVED} (see SOURCED.md#sba-foia-franchise-row-counts)")
        return 0

    _load_env()
    try:
        run()
    except KeyboardInterrupt:
        print("interrupted", file=sys.stderr)
        return 130
    return 0


if __name__ == "__main__":
    sys.exit(main())
