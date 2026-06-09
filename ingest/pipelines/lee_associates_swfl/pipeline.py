"""
Lee & Associates SWFL market report pipeline.

Downloads quarterly Fort Myers PDF reports for all 4 sectors
(Office, Retail, Industrial, Multifamily) and upserts into
data_lake.marketbeat_swfl with source_name='lee_associates'.

Usage
-----
    python -m ingest.pipelines.lee_associates_swfl.pipeline --year 2026 --quarter 1
    python -m ingest.pipelines.lee_associates_swfl.pipeline --year 2026 --quarter 1 --dry-run

Cadence: quarterly, ~4–6 weeks after quarter-end.
Published at: https://www.lee-associates.com/research/ (Fort Myers section)
Table DDL: data_lake.marketbeat_swfl (source_name='lee_associates')
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


def _get_db_url() -> str:
    for key in ("LEE_DB_URL", "DATABASE_URL"):
        if os.environ.get(key):
            return os.environ[key]
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
    raise RuntimeError("No DB URL found. Set DATABASE_URL or LEE_DB_URL env var.")


def _upsert_rows(rows: list[dict], db_url: str, dry_run: bool) -> int:
    if not rows:
        return 0
    if dry_run:
        print(f"[dry-run] Would upsert {len(rows)} rows", file=sys.stderr)
        for r in rows[:8]:
            print(
                f"  {r['quarter']:>8} | {r['sector']:<12} | "
                f"vacancy={r.get('vacancy_rate') or '-'}%  "
                f"rent={r.get('asking_rent_nnn') or r.get('asking_rent_mf') or '-'}",
                file=sys.stderr,
            )
        return len(rows)

    import psycopg
    now = datetime.now(timezone.utc)
    _nullable = ("vacancy_rate", "asking_rent_nnn", "asking_rent_mf",
                 "absorption_sqft", "sale_price_psf", "under_construction", "inventory_sf")
    for r in rows:
        r["ingested_at"] = now
        for col in _nullable:
            r.setdefault(col, None)

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO data_lake.marketbeat_swfl
                  (id, source_name, submarket, sector, quarter,
                   vacancy_rate, asking_rent_nnn, asking_rent_mf, absorption_sqft,
                   sale_price_psf, under_construction, inventory_sf,
                   geographic_type, report_label, verified, _ingested_at)
                VALUES
                  (%(id)s, %(source_name)s, %(submarket)s, %(sector)s, %(quarter)s,
                   %(vacancy_rate)s, %(asking_rent_nnn)s, %(asking_rent_mf)s, %(absorption_sqft)s,
                   %(sale_price_psf)s, %(under_construction)s, %(inventory_sf)s,
                   %(geographic_type)s, %(report_label)s, %(verified)s, %(ingested_at)s)
                ON CONFLICT (id) DO UPDATE SET
                  vacancy_rate      = EXCLUDED.vacancy_rate,
                  asking_rent_nnn   = EXCLUDED.asking_rent_nnn,
                  asking_rent_mf    = EXCLUDED.asking_rent_mf,
                  absorption_sqft   = EXCLUDED.absorption_sqft,
                  sale_price_psf    = EXCLUDED.sale_price_psf,
                  under_construction= EXCLUDED.under_construction,
                  inventory_sf      = EXCLUDED.inventory_sf,
                  _ingested_at      = EXCLUDED._ingested_at
                """,
                rows,
            )
        conn.commit()
    return len(rows)


def main() -> None:
    from ingest.pipelines.lee_associates_swfl.extract import (
        SECTORS, URL_TEMPLATE, SOURCE_NAME,
        download_pdf, extract_from_pdf,
    )

    parser = argparse.ArgumentParser(description="Lee & Associates SWFL quarterly pipeline")
    parser.add_argument("--year", type=int, required=True, help="Report year (e.g. 2026)")
    parser.add_argument("--quarter", type=int, required=True, choices=[1, 2, 3, 4],
                        help="Report quarter (1–4)")
    parser.add_argument("--month", type=int, default=None,
                        help="Upload month for URL (defaults: Q1=4, Q2=7, Q3=10, Q4=1)")
    parser.add_argument("--dry-run", action="store_true", help="Extract only, no DB write")
    args = parser.parse_args()

    if args.month is None:
        # Reports publish ~4–6 weeks after quarter close
        args.month = {1: 4, 2: 7, 3: 10, 4: 1}[args.quarter]

    all_rows: list[dict] = []
    errors: list[str] = []

    for sector in SECTORS:
        url = URL_TEMPLATE.format(
            yyyy=args.year, mm=args.month, q=args.quarter, sector=sector
        )
        print(f"Downloading {sector}: {url}", file=sys.stderr)
        try:
            pdf_bytes = download_pdf(url)
            print(f"  {len(pdf_bytes):,} bytes", file=sys.stderr)
        except Exception as exc:
            print(f"  ERROR downloading {sector}: {exc}", file=sys.stderr)
            errors.append(f"{sector}: {exc}")
            continue

        rows = extract_from_pdf(pdf_bytes, sector)
        print(f"  → {len(rows)} quarters extracted", file=sys.stderr)
        all_rows.extend(rows)

    if not all_rows:
        print("ERROR: No rows extracted from any sector.", file=sys.stderr)
        if errors:
            for e in errors:
                print(f"  {e}", file=sys.stderr)
        sys.exit(1)

    print(f"\nTotal: {len(all_rows)} rows ({len(SECTORS)} sectors × up to 5 quarters)", file=sys.stderr)

    db_url = _get_db_url()
    written = _upsert_rows(all_rows, db_url, dry_run=args.dry_run)
    action = "Would upsert" if args.dry_run else "Upserted"
    print(f"{action} {written} rows into data_lake.marketbeat_swfl (source={SOURCE_NAME})", file=sys.stderr)

    if errors:
        print(f"Completed with {len(errors)} sector error(s):", file=sys.stderr)
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
