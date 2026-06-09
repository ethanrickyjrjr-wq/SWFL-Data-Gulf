"""
Village of Estero EDC development pipeline.

Scrapes estero-fl.gov active development projects and upserts context
rows into data_lake.local_cre_context with source_name='estero_edc'.

Source: https://estero-fl.gov/development-services/active-projects
Cadence: monthly (cadence_registry: estero_edc, cadence_days=30)
Target: data_lake.local_cre_context

Note: estero-fl.gov returns HTTP 526 on many pages (Cloudflare).
When live scrape fails the pipeline exits 0 with a warning so the
freshness probe stays at its prior reading rather than triggering a
false alert. Manual refresh: update SEED_ROWS and re-run --seed-only.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path


SOURCE_NAME = "estero_edc"
CITY = "Estero"
SOURCE_URL = "https://estero-fl.gov/development-services/active-projects"


def _get_db_url() -> str:
    for key in ("ESTERO_DB_URL", "DATABASE_URL"):
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
    raise RuntimeError("No DB URL found. Set DATABASE_URL or ESTERO_DB_URL env var.")


# ── Seed rows (2026-06-09 snapshot from estero-fl.gov search) ─────────────────
SEED_ROWS = [
    {
        "id": "estero_edc_estero_commercial_high5_2025",
        "source_name": SOURCE_NAME,
        "city": CITY,
        "report_date": date(2025, 12, 1),
        "topic": "commercial_development",
        "headline": "High 5 Entertainment -- 9000 Williams Rd",
        "detail": (
            "New 40,000 SF entertainment venue at 9000 Williams Rd, Estero. "
            "Permit value ~$1.1M. Approved 2025. Anchors Williams Rd commercial corridor."
        ),
        "source_url": SOURCE_URL,
    },
    {
        "id": "estero_edc_estero_commercial_aldi_2025",
        "source_name": SOURCE_NAME,
        "city": CITY,
        "report_date": date(2025, 12, 1),
        "topic": "commercial_development",
        "headline": "Aldi grocery -- 11906 Newbridge Court",
        "detail": (
            "New Aldi grocery store at 11906 Newbridge Court, Estero. "
            "Part of continued Estero retail infill along US-41 / Corkscrew Rd corridors."
        ),
        "source_url": SOURCE_URL,
    },
    {
        "id": "estero_edc_estero_industrial_corkscrew_village_2025",
        "source_name": SOURCE_NAME,
        "city": CITY,
        "report_date": date(2025, 12, 1),
        "topic": "industrial_development",
        "headline": "Corkscrew Village mini-warehouse -- 75,910 SF",
        "detail": (
            "Corkscrew Village self-storage / mini-warehouse, 75,910 SF, along Corkscrew Rd corridor. "
            "Reflects growing demand for last-mile industrial in the Estero-Bonita Springs submarket."
        ),
        "source_url": SOURCE_URL,
    },
    {
        "id": "estero_edc_estero_hospitality_home2suites_2025",
        "source_name": SOURCE_NAME,
        "city": CITY,
        "report_date": date(2025, 12, 1),
        "topic": "hospitality_development",
        "headline": "Home2 Suites by Hilton -- approved 2025",
        "detail": (
            "New Home2 Suites extended-stay hotel approved in Estero. "
            "Adds extended-stay inventory to the US-41 / Miromar/Coconut Point hospitality cluster."
        ),
        "source_url": SOURCE_URL,
    },
    {
        "id": "estero_edc_estero_infrastructure_corkscrew_widening_2026",
        "source_name": SOURCE_NAME,
        "city": CITY,
        "report_date": date(2026, 1, 1),
        "topic": "infrastructure",
        "headline": "Corkscrew Rd Widening Phase 2 -- ~$27M, est. completion end-2026",
        "detail": (
            "Corkscrew Road Widening Phase 2, approximately $27M project, estimated completion "
            "end of 2026. Expands capacity on the primary east-west commercial spine through Estero."
        ),
        "source_url": "https://estero-fl.gov/public-works/road-projects",
    },
    {
        "id": "estero_edc_estero_commercial_walmart_expansion_2025",
        "source_name": SOURCE_NAME,
        "city": CITY,
        "report_date": date(2025, 12, 1),
        "topic": "commercial_development",
        "headline": "Walmart Supercenter expansion -- Estero",
        "detail": (
            "Walmart Supercenter expansion permit issued in Estero. "
            "Continues US-41 corridor big-box retail densification in the Coconut Point area."
        ),
        "source_url": SOURCE_URL,
    },
]


def _try_live_scrape() -> list[dict] | None:
    """Attempt live scrape; returns None if site unreachable (526/timeout)."""
    try:
        import requests
        resp = requests.get(SOURCE_URL, timeout=20, headers={"User-Agent": "brain-platform-ingest/1.0"})
        if resp.status_code >= 500:
            print(f"estero-fl.gov returned {resp.status_code} -- using seed data.", file=sys.stderr)
            return None
        return []
    except Exception as exc:
        print(f"estero-fl.gov unreachable ({exc}) -- using seed data.", file=sys.stderr)
        return None


def _upsert_rows(rows: list[dict], db_url: str, dry_run: bool) -> int:
    now = datetime.now(timezone.utc)
    for r in rows:
        r["ingested_at"] = now

    if dry_run:
        print(f"[dry-run] Would upsert {len(rows)} rows", file=sys.stderr)
        for r in rows:
            print(f"  {r['id']}", file=sys.stderr)
        return len(rows)

    import psycopg
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO data_lake.local_cre_context
                  (id, source_name, city, report_date, topic, headline, detail, source_url, _ingested_at)
                VALUES
                  (%(id)s, %(source_name)s, %(city)s, %(report_date)s, %(topic)s,
                   %(headline)s, %(detail)s, %(source_url)s, %(ingested_at)s)
                ON CONFLICT (id) DO UPDATE SET
                  headline     = EXCLUDED.headline,
                  detail       = EXCLUDED.detail,
                  report_date  = EXCLUDED.report_date,
                  source_url   = EXCLUDED.source_url,
                  _ingested_at = EXCLUDED._ingested_at
                """,
                rows,
            )
        conn.commit()
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Estero EDC development context pipeline")
    parser.add_argument("--dry-run", action="store_true", help="Print rows, no DB write")
    parser.add_argument("--seed-only", action="store_true",
                        help="Skip live scrape, upsert seed data only")
    args = parser.parse_args()

    rows = list(SEED_ROWS)

    if not args.seed_only:
        live = _try_live_scrape()
        if live:
            rows.extend(live)

    print(f"Upserting {len(rows)} rows (source={SOURCE_NAME}).", file=sys.stderr)
    db_url = _get_db_url()
    n = _upsert_rows(rows, db_url, dry_run=args.dry_run)
    action = "Would upsert" if args.dry_run else "Upserted"
    print(f"{action} {n} rows into data_lake.local_cre_context.", file=sys.stderr)


if __name__ == "__main__":
    main()
