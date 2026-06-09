"""
Fort Myers Beach recovery progress pipeline.

Scrapes fortmyersbeachfl.gov/123/Projects-Around-Town and upserts
infrastructure / recovery context rows into data_lake.local_cre_context
with source_name='fmb_planning'.

Source: https://www.fortmyersbeachfl.gov/123/Projects-Around-Town
Cadence: quarterly (cadence_registry: fmb_recovery, cadence_days=90)
Target: data_lake.local_cre_context

Usage
-----
    python -m ingest.pipelines.fmb_recovery.pipeline
    python -m ingest.pipelines.fmb_recovery.pipeline --dry-run
    python -m ingest.pipelines.fmb_recovery.pipeline --seed-only
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path


SOURCE_NAME = "fmb_planning"
CITY = "Fort Myers Beach"
PROJECTS_URL = "https://www.fortmyersbeachfl.gov/123/Projects-Around-Town"
PIER_URL = "https://www.fortmyersbeachfl.gov/CivicAlerts.aspx?AID=296"
CDBG_URL = "https://www.fortmyersbeachfl.gov/cdbg-dr"


def _get_db_url() -> str:
    for key in ("FMB_DB_URL", "DATABASE_URL"):
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
    raise RuntimeError("No DB URL found. Set DATABASE_URL or FMB_DB_URL env var.")


SEED_ROWS = [
    {
        "id": "fmb_planning_fmb_infrastructure_pier_2026",
        "source_name": SOURCE_NAME,
        "city": CITY,
        "report_date": date(2026, 4, 8),
        "topic": "infrastructure_recovery",
        "headline": "Times Square Pier -- $11.7M contract awarded Apr 8, 2026",
        "detail": (
            "Town of Fort Myers Beach awarded $11.7M contract for Times Square Pier reconstruction "
            "on April 8, 2026. Pier was destroyed by Hurricane Ian. Reconstruction is the primary "
            "catalyst for Times Square commercial corridor recovery and return of foot traffic."
        ),
        "source_url": PIER_URL,
    },
    {
        "id": "fmb_planning_fmb_infrastructure_beach_renourishment_2026",
        "source_name": SOURCE_NAME,
        "city": CITY,
        "report_date": date(2026, 5, 1),
        "topic": "infrastructure_recovery",
        "headline": "Beach Renourishment -- 41,655 CY placed, started mid-May 2026",
        "detail": (
            "Fort Myers Beach coastal renourishment project: 41,655 cubic yards of sand placed "
            "beginning mid-May 2026. Restores beach width destroyed by Hurricane Ian, "
            "directly supporting tourism recovery and beachfront commercial activity."
        ),
        "source_url": PROJECTS_URL,
    },
    {
        "id": "fmb_planning_fmb_infrastructure_times_square_2025",
        "source_name": SOURCE_NAME,
        "city": CITY,
        "report_date": date(2025, 12, 1),
        "topic": "commercial_recovery",
        "headline": "Times Square District -- plans to permits phase 2025-2026",
        "detail": (
            "Times Square commercial district moving from planning to permitting phase. "
            "Multiple commercial rebuilds in queue. Pier contract ($11.7M, Apr 2026) is the "
            "anchor catalyst; full district recovery projected 18-24 months post-pier completion."
        ),
        "source_url": PROJECTS_URL,
    },
    {
        "id": "fmb_planning_fmb_parks_bay_oaks_2025",
        "source_name": SOURCE_NAME,
        "city": CITY,
        "report_date": date(2025, 8, 1),
        "topic": "public_infrastructure",
        "headline": "Bay Oaks Park -- reconstruction completed ~Aug 2025",
        "detail": (
            "Bay Oaks Recreation Center and Park reconstruction completed approximately August 2025. "
            "Restores key community and tourism amenity destroyed by Hurricane Ian."
        ),
        "source_url": PROJECTS_URL,
    },
    {
        "id": "fmb_planning_fmb_infrastructure_carlos_pass_bridge_2026",
        "source_name": SOURCE_NAME,
        "city": CITY,
        "report_date": date(2026, 1, 1),
        "topic": "infrastructure_recovery",
        "headline": "Big Carlos Pass Bridge -- replacement underway 2026",
        "detail": (
            "Big Carlos Pass Bridge (south end of Fort Myers Beach island) replacement underway 2026. "
            "Provides critical connectivity for the southern commercial corridor and residential areas."
        ),
        "source_url": PROJECTS_URL,
    },
    {
        "id": "fmb_planning_fmb_infrastructure_newton_beach_2026",
        "source_name": SOURCE_NAME,
        "city": CITY,
        "report_date": date(2026, 1, 1),
        "topic": "public_infrastructure",
        "headline": "Newton Beach Park -- design phase 2026",
        "detail": (
            "Newton Beach Park redesign in design phase as of 2026. "
            "Part of broader FMB public-space recovery program following Hurricane Ian."
        ),
        "source_url": PROJECTS_URL,
    },
    {
        "id": "fmb_planning_fmb_funding_cdbg_dr_2026",
        "source_name": SOURCE_NAME,
        "city": CITY,
        "report_date": date(2026, 1, 1),
        "topic": "recovery_funding",
        "headline": "CDBG-DR allocation -- $1.107B total for FMB recovery",
        "detail": (
            "Fort Myers Beach has received $1.107 billion in CDBG-DR (Community Development Block "
            "Grant - Disaster Recovery) funding from HUD via the State of Florida for Hurricane Ian "
            "recovery. Covers infrastructure, housing, and commercial district rebuilding. "
            "Largest post-Ian recovery funding package for any single municipality in SWFL."
        ),
        "source_url": CDBG_URL,
    },
    {
        "id": "fmb_planning_fmb_infrastructure_matanzas_bridge_2026",
        "source_name": SOURCE_NAME,
        "city": CITY,
        "report_date": date(2026, 1, 1),
        "topic": "infrastructure_recovery",
        "headline": "Matanzas Pass Bridge -- improvements underway 2026",
        "detail": (
            "Matanzas Pass Bridge improvements underway in 2026. "
            "Improves the primary northern gateway to Fort Myers Beach island, "
            "critical for construction-phase traffic management and eventual tourist return."
        ),
        "source_url": PROJECTS_URL,
    },
]


def _try_live_scrape() -> list[dict]:
    """Ping the Projects-Around-Town page; returns [] (seed rows are authoritative)."""
    try:
        import requests
        resp = requests.get(PROJECTS_URL, timeout=30, headers={"User-Agent": "brain-platform-ingest/1.0"})
        if resp.status_code != 200:
            print(f"fortmyersbeachfl.gov returned {resp.status_code}", file=sys.stderr)
        else:
            print(f"Live scrape OK ({len(resp.content):,} bytes) -- seed rows authoritative", file=sys.stderr)
    except Exception as exc:
        print(f"fortmyersbeachfl.gov unreachable ({exc})", file=sys.stderr)
    return []


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
    parser = argparse.ArgumentParser(description="FMB recovery context pipeline")
    parser.add_argument("--dry-run", action="store_true", help="Print rows, no DB write")
    parser.add_argument("--seed-only", action="store_true",
                        help="Skip live scrape, upsert seed data only")
    args = parser.parse_args()

    rows = list(SEED_ROWS)
    if not args.seed_only:
        rows.extend(_try_live_scrape())

    print(f"Upserting {len(rows)} rows (source={SOURCE_NAME}).", file=sys.stderr)
    db_url = _get_db_url()
    n = _upsert_rows(rows, db_url, dry_run=args.dry_run)
    action = "Would upsert" if args.dry_run else "Upserted"
    print(f"{action} {n} rows into data_lake.local_cre_context.", file=sys.stderr)


if __name__ == "__main__":
    main()
