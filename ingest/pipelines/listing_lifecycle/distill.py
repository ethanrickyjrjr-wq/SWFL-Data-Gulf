"""DB layer for the listing lifecycle state machine — load current state, MERGE state upserts, and
APPEND transitions idempotently.

- `load_current_state` returns the prior state keyed on (address_key, sale_or_rent) — the diff input.
- `upsert_state` MERGEs on (source_name, address_key, sale_or_rent); first_seen is preserved (set on
  insert only), last_seen/scraped_at refreshed. Never deletes — a change is a move, not a discard.
- `append_transitions` is idempotent: ON CONFLICT (source_name, address_key, sale_or_rent, to_state, at)
  DO NOTHING, so a cron double-fire / overlapping manual run can't double-count headline transitions.

Mirrors ingest/pipelines/active_listings/distill.py for the connection + executemany pattern."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# psycopg is imported LAZILY inside _get_conn so the pure callers (and dry-runs) don't require the
# DB driver to be installed in the running interpreter (e.g. a crawl4ai-venv dry-run with no psycopg).

_STATE_TABLE = "data_lake.listing_state"
_TRANS_TABLE = "data_lake.listing_transitions"
SOURCE_NAME = "lifecycle_seed"  # neutral; never a vendor/board name (real origin lives in the secret)

# Wide state columns the diff engine fills (everything except the SQL-managed first_seen/last_seen/
# scraped_at and the source_name stamped here). Capture wide, slice late.
_STATE_COLS = [
    "address_key", "sale_or_rent", "state", "listing_id", "list_price", "list_suffix",
    "beds", "baths", "sqft", "lot_acres", "property_type", "zip_code", "county", "city",
    "subdivision", "brokerage", "listed_date", "days_on_market", "days_in_state",
]
_TRANS_COLS = [
    "address_key", "sale_or_rent", "from_state", "to_state", "at", "listing_id",
    "price", "price_delta", "days_in_prev_state", "seed",
]


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


def load_current_state(source_name: str = SOURCE_NAME) -> dict[tuple[str, str], dict[str, Any]]:
    """Current state per (address_key, sale_or_rent) — the `prior` input to diff_states. Empty dict
    on the first-ever run (the seed) or when the table is empty (ODD-tolerant)."""
    cols = ", ".join(_STATE_COLS)
    out: dict[tuple[str, str], dict[str, Any]] = {}
    try:
        with _get_conn() as conn, conn.cursor() as cur:
            cur.execute(f"SELECT {cols} FROM {_STATE_TABLE} WHERE source_name = %s", (source_name,))
            for row in cur.fetchall():
                rec = dict(zip(_STATE_COLS, row))
                out[(rec["address_key"], rec["sale_or_rent"])] = rec
    except Exception:
        # ODD-tolerant: a missing/empty table reads as "no prior state", not a crash.
        return {}
    return out


def current_state_count(source_name: str = SOURCE_NAME) -> int:
    """Live row count — the baseline for assert_vs_baseline (0 on bootstrap)."""
    try:
        with _get_conn() as conn, conn.cursor() as cur:
            cur.execute(f"SELECT count(*) FROM {_STATE_TABLE} WHERE source_name = %s", (source_name,))
            return int(cur.fetchone()[0])
    except Exception:
        return 0


def upsert_state(
    upserts: list[dict[str, Any]], *, source_name: str = SOURCE_NAME, dry_run: bool = False
) -> int:
    """MERGE wide state rows. first_seen is NOT updated on conflict (preserves the original)."""
    if not upserts:
        return 0
    if dry_run:
        print(f"[dry-run] would upsert {len(upserts)} rows to {_STATE_TABLE}")
        for r in upserts[:5]:
            print(f"  {r.get('address_key')} [{r.get('sale_or_rent')}] -> {r.get('state')} ${r.get('list_price')}")
        return len(upserts)

    placeholders = ", ".join(f"%({c})s" for c in _STATE_COLS)
    set_clause = ",\n          ".join(
        f"{c} = EXCLUDED.{c}" for c in _STATE_COLS if c not in ("address_key", "sale_or_rent")
    )
    sql = f"""
        INSERT INTO {_STATE_TABLE}
          (source_name, {", ".join(_STATE_COLS)}, last_seen, scraped_at)
        VALUES
          (%(source_name)s, {placeholders}, %(now)s, %(now)s)
        ON CONFLICT (source_name, address_key, sale_or_rent) DO UPDATE SET
          {set_clause},
          last_seen  = EXCLUDED.last_seen,
          scraped_at = EXCLUDED.scraped_at
        -- first_seen intentionally NOT updated: preserves the original first-seen across merges.
    """
    now = datetime.now(timezone.utc)
    params = [{**{c: r.get(c) for c in _STATE_COLS}, "source_name": source_name, "now": now} for r in upserts]
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, params)
        conn.commit()
    return len(upserts)


def append_transitions(
    transitions: list[dict[str, Any]], *, source_name: str = SOURCE_NAME, dry_run: bool = False
) -> int:
    """APPEND transition history idempotently — ON CONFLICT (the daily-grain natural key) DO NOTHING."""
    if not transitions:
        return 0
    if dry_run:
        print(f"[dry-run] would append {len(transitions)} transitions to {_TRANS_TABLE}")
        for t in transitions[:8]:
            arrow = f"{t.get('from_state')}→{t.get('to_state')}"
            print(f"  {t.get('address_key')} [{t.get('sale_or_rent')}] {arrow} @{t.get('at')} "
                  f"Δ{t.get('price_delta')} seed={t.get('seed')}")
        return len(transitions)

    placeholders = ", ".join(f"%({c})s" for c in _TRANS_COLS)
    sql = f"""
        INSERT INTO {_TRANS_TABLE}
          (source_name, {", ".join(_TRANS_COLS)}, scraped_at)
        VALUES
          (%(source_name)s, {placeholders}, %(now)s)
        ON CONFLICT (source_name, address_key, sale_or_rent, to_state, at) DO NOTHING
    """
    now = datetime.now(timezone.utc)
    params = [{**{c: t.get(c) for c in _TRANS_COLS}, "source_name": source_name, "now": now} for t in transitions]
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, params)
        conn.commit()
    return len(transitions)
