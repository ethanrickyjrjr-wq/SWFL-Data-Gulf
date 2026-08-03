"""Family B of SteadyAPI Step 3 (08/03/2026) — parse the stored raw bodies in
data_lake.steadyapi_property_history_raw into the typed data_lake.steadyapi_tax_history table.
ZERO paid calls. Mirrors parse_listing_events.py's shape (family A).

Design: docs/superpowers/specs/2026-08-03-steadyapi-tax-history-design.md
Migration (run first, separately): migrations/20260803_steadyapi_tax_history.sql

NOT a valuation root, ever — leepa_parcels (Lee) / collier_parcels (Collier) stay the assessed/
market-value authority. This table's jobs: annual tax PAID (no built root today) + a future
address-join cross-source contract (deferred, tracked separately — see design spec).

Same envelope trap as family A: body->'body'->'tax_history', NOT top-level.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

_RAW_TABLE = "data_lake.steadyapi_property_history_raw"
_TAX_TABLE = "data_lake.steadyapi_tax_history"

FLOOR_SQL = f"""
    SELECT COALESCE(sum(jsonb_array_length(body->'body'->'tax_history')), 0)
    FROM {_RAW_TABLE}
    WHERE jsonb_typeof(body->'body'->'tax_history') = 'array'
"""

COUNT_SQL = f"SELECT count(*) FROM {_TAX_TABLE}"

PARSE_SQL = rf"""
    TRUNCATE {_TAX_TABLE};
    INSERT INTO {_TAX_TABLE} (
      property_id, address_key, county, tax_year, tax_amount,
      assessment_total, assessment_building, assessment_land,
      market_value_total, market_value_building, market_value_land, fetched_at
    )
    SELECT
      r.property_id, r.address_key, r.county,
      (e.value->>'year')::integer,
      (e.value->>'tax_amount')::numeric,
      (e.value->'assessment'->>'total')::numeric,
      (e.value->'assessment'->>'building')::numeric,
      (e.value->'assessment'->>'land')::numeric,
      (e.value->'market_value'->>'total')::numeric,
      (e.value->'market_value'->>'building')::numeric,
      (e.value->'market_value'->>'land')::numeric,
      r.fetched_at
    FROM {_RAW_TABLE} r,
         LATERAL jsonb_array_elements(r.body->'body'->'tax_history') e
    WHERE jsonb_typeof(r.body->'body'->'tax_history') = 'array'
"""


def _get_conn():
    import psycopg

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        try:
            import tomllib

            s = Path(".dlt/secrets.toml")
            if s.exists():
                with s.open("rb") as f:
                    data = tomllib.load(f)
                pg = data.get("destination", {}).get("postgres", {}).get("credentials", {})
                host, pw = pg.get("host", ""), pg.get("password", "")
                db, user = pg.get("database", "postgres"), pg.get("username", "postgres")
                port = pg.get("port", 5432)
                if host and pw:
                    db_url = f"postgresql://{user}:{pw}@{host}:{port}/{db}?sslmode=require"
        except Exception:
            pass
    if not db_url:
        raise RuntimeError("No DB URL. Set DATABASE_URL or ensure .dlt/secrets.toml is present.")
    return psycopg.connect(db_url)


def run_parse(*, dry_run: bool = False) -> dict[str, Any]:
    """Re-derive data_lake.steadyapi_tax_history from stored raw bodies. Idempotent: a second run
    produces byte-identical output to the first.

    Raises RuntimeError if the post-insert row count falls below the pre-measured floor."""
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(FLOOR_SQL)
            floor = cur.fetchone()[0]

        if dry_run:
            print(f"[dry-run] floor (raw tax-year count) = {floor}; would TRUNCATE + re-insert {_TAX_TABLE}")
            return {"floor": floor, "row_count": None, "dry_run": True}

        with conn.cursor() as cur:
            cur.execute(PARSE_SQL)
            cur.execute(COUNT_SQL)
            row_count = cur.fetchone()[0]
        conn.commit()

    if row_count < floor:
        raise RuntimeError(
            f"steadyapi_tax_history parse landed {row_count} rows, below the floor of {floor} "
            "computed from jsonb_array_length on the raw table. Aborting loud — do not trust this "
            "result. Likely cause: an envelope-path regression."
        )

    print(f"[parse] {_TAX_TABLE}: {row_count} rows (floor {floor})")
    return {"floor": floor, "row_count": row_count, "dry_run": False}


if __name__ == "__main__":
    import sys

    run_parse(dry_run="--dry-run" in sys.argv)
