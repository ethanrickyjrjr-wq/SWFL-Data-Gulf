"""condo_baseline_swfl — SWFL 3+-story condo building baseline + SIRS cross-reference.

Usage:
    python -m ingest.pipelines.condo_baseline_swfl.pipeline [--dry-run] [--skip-llm] [--stage fetch|match|all]

Closes the one caveat brains/condo-sirs-swfl has repeated since June: "Compliance
rate cannot be derived — no baseline registry of all SWFL 3-story+ condominium
associations exists in this dataset."

Stages
  fetch  Lee footprints (3+ stories, condo-named) + Collier milestone list (+ the
         county PDF for CO / next-due dates) → data_lake.condo_buildings_swfl
  match  each Lee/Collier DBPR SIRS filing → the building association it belongs
         to → data_lake.condo_association_xref (see match.py for the ladder)
  view   data_lake.condo_compliance_swfl_v joins the two (migration-defined)

Local-model band (the "batch worker"): the ambiguous slice of `match` runs on the
operator machine's Ollama (gpt-oss:20b primary, gemma4:12b judge) at $0 — hence the
self-hosted runner in the workflow. --skip-llm (or LOCAL_LLM_DISABLED=1) makes the
whole pipeline deterministic: ambiguous filings land as needs_review, never guessed.

Writes with psycopg + explicit DDL (migrations/20260830_condo_baseline_swfl.sql),
same shape as dbpr_sirs — not dlt — because the view and the xref PK are part of
the contract and belong in a reviewable .sql file. Full-snapshot upserts keyed on
building_id / (dbpr_row_hash, database_period): both sources republish the whole
list each run and neither has a monotonic cursor.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

import psycopg
from psycopg.rows import dict_row

from ingest.lib import local_llm

from .constants import (
    BUILDINGS_TABLE,
    COLLIER_PDF_MIN_JOIN_RATE,
    COMPLIANCE_VIEW,
    LLM_CALL_TYPE,
    SIRS_TABLE,
    XREF_TABLE,
)
from .match import build_assoc_index, match_filings
from .resources import (
    fetch_collier_milestone,
    fetch_collier_pdf_rows,
    fetch_lee_buildings,
    normalize_collier,
    normalize_lee,
)

TAG = "[condo-baseline]"

BUILDINGS_COLS = [
    "building_id", "county", "source", "association_name", "assoc_name_norm", "building_label",
    "street_address", "city", "zip", "residential_units", "stories", "year_built", "co_date",
    "milestone_status", "milestone_status_detail", "next_milestone_year", "next_milestone_due",
    "permit_number", "parcel_strap", "folio_id", "site_address_id", "source_object_id",
    "source_url", "source_as_of", "row_hash", "scraped_at",
]
XREF_COLS = [
    "dbpr_row_hash", "database_period", "county", "dbpr_association_name", "dbpr_project_name",
    "dbpr_query_norm", "assoc_name_norm", "match_method", "confidence", "candidates",
    "primary_model", "judge_model", "reason", "matched_at",
]


def _upsert_sql(table: str, cols: list[str], pk: list[str]) -> str:
    names = ", ".join(cols)
    vals = ", ".join(f"%({c})s" for c in cols)
    updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols if c not in pk)
    return (
        f"INSERT INTO data_lake.{table} ({names}) VALUES ({vals}) "
        f"ON CONFLICT ({', '.join(pk)}) DO UPDATE SET {updates}"
    )


UPSERT_BUILDINGS = _upsert_sql(BUILDINGS_TABLE, BUILDINGS_COLS, ["building_id"])
UPSERT_XREF = _upsert_sql(XREF_TABLE, XREF_COLS, ["dbpr_row_hash", "database_period"])

SELECT_FILINGS = f"""
SELECT row_hash, database_period, association_name, project_name, city, zip, county_normalized
FROM data_lake.{SIRS_TABLE}
WHERE county_normalized IN ('LEE', 'COLLIER')
"""

SELECT_BUILDINGS = f"""
SELECT county, association_name, assoc_name_norm, street_address, city, zip
FROM data_lake.{BUILDINGS_TABLE}
"""

SELECT_COMPLIANCE = f"""
SELECT county,
       COUNT(*)                                     AS buildings,
       COUNT(*) FILTER (WHERE has_sirs_filing)      AS with_sirs,
       COUNT(*) FILTER (WHERE milestone_delinquent) AS delinquent
FROM data_lake.{COMPLIANCE_VIEW}
GROUP BY county ORDER BY county
"""


def get_db_conn() -> psycopg.Connection:
    uri = os.environ.get("DESTINATION__POSTGRES__CREDENTIALS")
    if not uri:
        raise RuntimeError("DESTINATION__POSTGRES__CREDENTIALS not set.")
    return psycopg.connect(uri)


# ── stages ───────────────────────────────────────────────────────────────────


def fetch_all(scraped_at: datetime) -> tuple[list[dict], float]:
    lee = normalize_lee(fetch_lee_buildings(), scraped_at)
    pdf_as_of, pdf_rows = fetch_collier_pdf_rows()
    collier, join_rate = normalize_collier(fetch_collier_milestone(), pdf_rows, pdf_as_of, scraped_at)
    if join_rate < COLLIER_PDF_MIN_JOIN_RATE:
        raise RuntimeError(
            f"{TAG} Collier PDF↔service join rate {join_rate:.1%} < {COLLIER_PDF_MIN_JOIN_RATE:.0%} — "
            "the PDF layout or the service changed; refusing to write a half-joined baseline"
        )
    rows = lee + collier
    print(f"{TAG} baseline: {len(lee)} Lee + {len(collier)} Collier = {len(rows)} buildings")
    return rows, join_rate


def write_buildings(conn: psycopg.Connection, rows: list[dict]) -> None:
    with conn.cursor() as cur:
        cur.executemany(UPSERT_BUILDINGS, rows)
    conn.commit()
    print(f"{TAG} upserted {len(rows)} rows into data_lake.{BUILDINGS_TABLE}")


def run_match(conn: psycopg.Connection, *, use_llm: bool, matched_at: datetime) -> dict[str, int]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(SELECT_FILINGS)
        filings = cur.fetchall()
        cur.execute(SELECT_BUILDINGS)
        buildings = cur.fetchall()
    print(f"{TAG} match: {len(filings)} SWFL SIRS filings vs {len(buildings)} buildings")
    index = build_assoc_index(buildings)
    print(f"{TAG} match: distinct associations — "
          + ", ".join(f"{c}: {len(v)}" for c, v in sorted(index.items())))

    primary = judge = None
    if use_llm and not local_llm.is_disabled():
        primary, judge = local_llm.make_clients(call_type=LLM_CALL_TYPE)
        print(f"{TAG} match: LLM band on — primary={primary.model} judge={judge.model} @ {primary.base_url}")
    else:
        print(f"{TAG} match: LLM band OFF — ambiguous filings → needs_review")

    xref, stats = match_filings(filings, index, primary=primary, judge=judge, matched_at=matched_at)
    with conn.cursor() as cur:
        cur.executemany(UPSERT_XREF, xref)
    conn.commit()
    print(f"{TAG} upserted {len(xref)} rows into data_lake.{XREF_TABLE}: {stats.as_dict()}")
    return stats.as_dict()


def print_compliance(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(SELECT_COMPLIANCE)
        for county, n, s, d in cur.fetchall():
            share = (s / n) if n else 0
            print(f"{TAG} {county}: {n} buildings, {s} with a matched SIRS filing ({share:.1%}), "
                  f"{d} milestone-delinquent")


# ── CLI ──────────────────────────────────────────────────────────────────────


def run(*, dry_run: bool, use_llm: bool, stage: str) -> int:
    now = datetime.now(timezone.utc)
    print(f"{TAG} run_ts={now.isoformat()} dry_run={dry_run} stage={stage} llm={use_llm}")

    rows: list[dict] = []
    if stage in ("fetch", "all"):
        rows, _ = fetch_all(now)
        if dry_run:
            print(f"{TAG} dry-run: would upsert {len(rows)} buildings; first row: {rows[0] if rows else None}")

    if dry_run:
        print(f"{TAG} dry-run: skipping DB writes and the match stage (needs the SIRS table)")
        return 0

    with get_db_conn() as conn:
        if stage in ("fetch", "all"):
            write_buildings(conn, rows)
        if stage in ("match", "all"):
            run_match(conn, use_llm=use_llm, matched_at=now)
        print_compliance(conn)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="SWFL condo baseline + SIRS cross-reference.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Fetch and validate only; no DB writes, no match stage.")
    parser.add_argument("--skip-llm", action="store_true",
                        help="Deterministic ladder only; ambiguous → needs_review.")
    parser.add_argument("--stage", choices=["fetch", "match", "all"], default="all")
    args = parser.parse_args(argv)
    return run(dry_run=args.dry_run, use_llm=not args.skip_llm, stage=args.stage)


if __name__ == "__main__":
    sys.exit(main())
