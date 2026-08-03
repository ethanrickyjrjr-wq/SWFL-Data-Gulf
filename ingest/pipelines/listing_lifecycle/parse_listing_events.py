"""Family A of SteadyAPI Step 3 (08/03/2026) — parse the stored raw bodies in
data_lake.steadyapi_property_history_raw into the typed data_lake.steadyapi_listing_events table.
ZERO paid calls: a pure SQL transform over bytes already landed by Steps 1/2. Idempotent by
construction (TRUNCATE + full re-derive each run) — not a merge, so there is no drift to reconcile.

Design: docs/superpowers/specs/2026-08-03-steadyapi-listing-events-design.md
Migration (run first, separately): migrations/20260803_steadyapi_listing_events.sql

TRAP #1 (playbook §STEP 3): the stored jsonb is the FULL {meta, body} envelope — every family array
lives at body->'body'->'<family>', NOT top-level. body->'property_history' returns NULL on every
row and a naive parser reads the whole table as empty with no error. PARSE_SQL below is deliberately
kept as a plain string (not built via string concatenation of fragments) so a regression to the
top-level path is directly greppable/testable — see test_parse_sql_reads_nested_envelope_path.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

_RAW_TABLE = "data_lake.steadyapi_property_history_raw"
_EVENTS_TABLE = "data_lake.steadyapi_listing_events"

# Floor query: total events the raw table CLAIMS to hold, computed from jsonb_array_length before
# TRUNCATE touches anything. This is the guard against the "0 rows, green" failure — a fixture test
# proves the SQL reads the right path; this proves production data didn't silently short-parse.
FLOOR_SQL = f"""
    SELECT COALESCE(sum(jsonb_array_length(body->'body'->'property_history')), 0)
    FROM {_RAW_TABLE}
    WHERE jsonb_typeof(body->'body'->'property_history') = 'array'
"""

COUNT_SQL = f"SELECT count(*) FROM {_EVENTS_TABLE}"

# Sentinel for the NULL-listing_id / NULL-price side of dedupe_key — see migration comment for why
# this can't be a GENERATED STORED column (date/numeric->text casts aren't immutable in Postgres).
_NULL_SENTINEL = "::NULL::"

PARSE_SQL = rf"""
    TRUNCATE {_EVENTS_TABLE};
    INSERT INTO {_EVENTS_TABLE} (
      property_id, address_key, county, event_date, event_name, price, price_change,
      price_change_percentage, price_sqft, days_after_listed, source_name, listing_id,
      listing_list_price, listing_status, listing_list_date, listing_last_status_change_date,
      listing_last_update_date, event_seq, dedupe_key, fetched_at
    )
    SELECT
      r.property_id, r.address_key, r.county,
      (e.value->>'date')::date,
      e.value->>'event_name',
      (e.value->>'price')::numeric,
      (e.value->>'price_change')::numeric,
      -- RAW TEXT, not numeric: vendor mixes real percentages ("-9.09%") with dollar amounts
      -- ("+$1,000", "$0") under this one field name. Found live 08/03/2026 mid-parse — see
      -- migration column comment.
      e.value->>'price_change_percentage',
      (e.value->>'price_sqft')::numeric,
      -- TRAP (found live 08/03/2026, not in the original 64-field census): days_after_listed is a
      -- vendor STRING like "111 days" / "1 day" (200,499 of 235,383 rows are NULL; the rest are
      -- this "N day(s)" shape), never a raw integer — a bare ::integer cast aborts the whole
      -- TRUNCATE+INSERT transaction on the first non-null row. Extract the leading digit run.
      NULLIF(substring(e.value->>'days_after_listed' from '^\d+'), '')::integer,
      e.value->>'source_name',
      e.value->'listing'->>'listing_id',
      (e.value->'listing'->>'list_price')::numeric,
      e.value->'listing'->>'status',
      (e.value->'listing'->>'list_date')::date,
      (e.value->'listing'->>'last_status_change_date')::timestamptz,
      (e.value->'listing'->>'last_update_date')::timestamptz,
      e.ordinality,
      -- dedupe_key built from the RAW JSON text fields (deterministic ISO date string), not the
      -- casted date/numeric columns above — measured live 08/03/2026: zero collisions on
      -- (property_id, date, event_name, price, listing_id) across all 235,383 rows.
      r.property_id || '|' || (e.value->>'date') || '|' || (e.value->>'event_name') || '|' ||
        COALESCE(e.value->>'price', '{_NULL_SENTINEL}') || '|' ||
        COALESCE(e.value->'listing'->>'listing_id', '{_NULL_SENTINEL}'),
      r.fetched_at
    FROM {_RAW_TABLE} r,
         LATERAL jsonb_array_elements(r.body->'body'->'property_history') WITH ORDINALITY AS e(value, ordinality)
    WHERE jsonb_typeof(r.body->'body'->'property_history') = 'array'
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
    """Re-derive data_lake.steadyapi_listing_events from stored raw bodies. Idempotent: a second
    run produces byte-identical output to the first (same source, same deterministic transform).

    Raises RuntimeError if the post-insert row count falls below the pre-measured floor — the
    guard against a silent envelope-path regression landing zero (or partial) rows green."""
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(FLOOR_SQL)
            floor = cur.fetchone()[0]

        if dry_run:
            print(f"[dry-run] floor (raw event count) = {floor}; would TRUNCATE + re-insert {_EVENTS_TABLE}")
            return {"floor": floor, "row_count": None, "dry_run": True}

        with conn.cursor() as cur:
            cur.execute(PARSE_SQL)
            cur.execute(COUNT_SQL)
            row_count = cur.fetchone()[0]
        conn.commit()

    if row_count < floor:
        raise RuntimeError(
            f"steadyapi_listing_events parse landed {row_count} rows, below the floor of {floor} "
            "computed from jsonb_array_length on the raw table. Aborting loud — do not trust this "
            "result. Likely cause: an envelope-path regression (see TRAP #1 in the module docstring)."
        )

    print(f"[parse] {_EVENTS_TABLE}: {row_count} rows (floor {floor})")
    return {"floor": floor, "row_count": row_count, "dry_run": False}


if __name__ == "__main__":
    import sys

    run_parse(dry_run="--dry-run" in sys.argv)
