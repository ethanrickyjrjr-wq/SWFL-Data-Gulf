"""
MHS (Maxwell Hendry & Simmons) SWFL Data Book — Recipe 2: Issued Permits.

Downloads the annual MHS PDF and upserts CRE permit rows into
data_lake.mhs_permits_swfl with source_name='mhs_databook'.

ODD-window pipeline — annual cadence (~March each year).
Run once per year after MHS publishes the new Data Book.

Usage
-----
    python -m ingest.pipelines.mhs_permits_swfl.pipeline [--dry-run] [--url URL] [--year YEAR]

The URL and year are optional overrides; defaults point to the 2026 book (2025 data).
Add a new --url + --year pair each March as new PDFs are published.

Table DDL: docs/sql/20260605_mhs_permits_swfl.sql
Crosswalk note: jurisdiction strings are raw PDF text — a consumer brain is
required to map them to submarket slugs. Do NOT blend with lee_building_permits
or collier_building_permits until that crosswalk is verified.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# ── DB helpers ────────────────────────────────────────────────────────────────


def _get_db_url() -> str:
    # 1. env var (GHA secrets)
    for key in ("MHS_DB_URL", "DATABASE_URL"):
        if os.environ.get(key):
            return os.environ[key]
    # 2. .dlt/secrets.toml
    try:
        import tomllib
        secrets = tomllib.loads(Path(".dlt/secrets.toml").read_text())
        creds = secrets["destination"]["postgres"]["credentials"]
        if isinstance(creds, str):
            return creds
        return (
            f"postgresql://postgres:{creds['password']}"
            f"@{creds['host']}:5432/postgres"
        )
    except Exception:
        pass
    raise RuntimeError("No DB URL found. Set DATABASE_URL or MHS_DB_URL env var.")


def _upsert_rows(rows: list[dict], db_url: str, dry_run: bool) -> int:
    if not rows:
        return 0
    if dry_run:
        print(f"[dry-run] Would upsert {len(rows)} rows", file=sys.stderr)
        for r in rows[:5]:
            print(f"  {r['issued_date']} | {r['jurisdiction']:<35} | {r['project_name'][:40]}", file=sys.stderr)
        if len(rows) > 5:
            print(f"  ... and {len(rows)-5} more", file=sys.stderr)
        return len(rows)

    import psycopg
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO data_lake.mhs_permits_swfl
                  (id, source_name, jurisdiction, calendar_year, issued_date,
                   asset_class, project_address, project_name,
                   permit_value_usd, building_sf, verified, source_url)
                VALUES
                  (%(id)s, %(source_name)s, %(jurisdiction)s, %(calendar_year)s,
                   %(issued_date)s, %(asset_class)s, %(project_address)s,
                   %(project_name)s, %(permit_value_usd)s, %(building_sf)s,
                   %(verified)s, %(source_url)s)
                ON CONFLICT (id) DO NOTHING
                """,
                rows,
            )
            inserted = cur.rowcount
        conn.commit()
    return inserted


# ── main ──────────────────────────────────────────────────────────────────────


def main() -> None:
    from ingest.pipelines.mhs_permits_swfl.extract import (
        SOURCE_URL_2026,
        download_pdf,
        extract_from_pdf,
    )

    parser = argparse.ArgumentParser(description="MHS permits pipeline (Recipe 2)")
    parser.add_argument("--dry-run", action="store_true", help="Print rows, no DB write")
    parser.add_argument(
        "--url",
        default=SOURCE_URL_2026,
        help="Override PDF URL (use for new annual book)",
    )
    parser.add_argument(
        "--year",
        type=int,
        default=2025,
        help="Calendar year of the permit data in the PDF (default: 2025)",
    )
    args = parser.parse_args()

    print(f"Downloading PDF: {args.url}", file=sys.stderr)
    pdf_bytes = download_pdf(args.url)
    print(f"Downloaded {len(pdf_bytes):,} bytes", file=sys.stderr)

    rows = extract_from_pdf(pdf_bytes, source_url=args.url)
    print(f"Extracted {len(rows)} permit rows", file=sys.stderr)

    if not rows:
        print("ERROR: No rows extracted — check PDF layout or update extractor", file=sys.stderr)
        sys.exit(1)

    # Jurisdiction summary
    from collections import Counter
    jur_counts = Counter(r["jurisdiction"] for r in rows)
    for jur, n in jur_counts.most_common():
        print(f"  {n:3d}  {jur}", file=sys.stderr)

    db_url = _get_db_url()
    inserted = _upsert_rows(rows, db_url, dry_run=args.dry_run)
    action = "Would insert" if args.dry_run else "Inserted"
    print(f"{action} {inserted} new rows into data_lake.mhs_permits_swfl", file=sys.stderr)

    # Verify (skip on dry-run)
    if not args.dry_run:
        import psycopg
        with psycopg.connect(db_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT count(*) FROM data_lake.mhs_permits_swfl WHERE calendar_year=%s",
                    (args.year,),
                )
                total = cur.fetchone()[0]
        print(f"Total rows for calendar_year={args.year}: {total}", file=sys.stderr)


if __name__ == "__main__":
    main()
