"""psycopg I/O for the listing_week panel. Mirrors listing_lifecycle/distill.py:
lazy psycopg import (dry-run needs no driver), DATABASE_URL then .dlt/secrets.toml."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

_FEATURE_COLS = [
    "address_key", "sale_or_rent", "week_start", "listing_id", "zip_code",
    "county", "property_type", "beds", "baths", "sqft", "lot_acres",
    "listed_date", "dom_days", "state_at_week_end", "list_price",
    "cuts_to_date", "cut_depth_pct_to_date", "weeks_since_last_cut",
    "relists_to_date", "flag_foreclosure", "flag_new_construction",
    "sold_next_week", "holding_next_week", "price_cut_next_week",
]
# ON CONFLICT updates FEATURES only — labels are owned by apply_label_updates and
# must survive an idempotent feature re-merge (test: test_merge_never_overwrites_labels).
_UPDATE_COLS = [c for c in _FEATURE_COLS
                if c not in ("address_key", "sale_or_rent", "week_start",
                             "sold_next_week", "holding_next_week",
                             "price_cut_next_week")]

MERGE_SQL = (
    f"INSERT INTO data_lake.listing_week ({', '.join(_FEATURE_COLS)}) "
    f"VALUES ({', '.join(['%s'] * len(_FEATURE_COLS))}) "
    "ON CONFLICT (address_key, sale_or_rent, week_start) DO UPDATE SET "
    + ", ".join(f"{c} = EXCLUDED.{c}" for c in _UPDATE_COLS)
)

LABEL_SQL = (
    "UPDATE data_lake.listing_week SET sold_next_week = %s, "
    "holding_next_week = %s, price_cut_next_week = %s "
    "WHERE address_key = %s AND sale_or_rent = %s AND week_start = %s"
)


def _merge_params(row: dict[str, Any]) -> list[Any]:
    return [row[c] for c in _FEATURE_COLS]


def get_conn():
    import psycopg  # lazy: pure callers and --dry-run never import the driver

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        import tomllib
        secrets = Path(__file__).resolve().parents[2] / ".dlt" / "secrets.toml"
        with open(secrets, "rb") as f:
            db_url = tomllib.load(f)["destination"]["postgres"]["credentials"]
    return psycopg.connect(db_url)


def load_sale_state(conn) -> list[dict[str, Any]]:
    cols = ("address_key, sale_or_rent, state, list_price, listed_date, zip_code, "
            "county, property_type, beds, baths, sqft, lot_acres, flag_foreclosure, "
            "flag_new_construction, listing_id")
    with conn.cursor() as cur:
        cur.execute(f"SELECT {cols} FROM data_lake.listing_state "
                    "WHERE sale_or_rent = 'sale'")
        names = [d.name for d in cur.description]
        return [dict(zip(names, r)) for r in cur.fetchall()]


def load_transitions(conn) -> list[dict[str, Any]]:
    cols = ("address_key, sale_or_rent, from_state, to_state, at, listing_id, "
            "price, price_delta, days_in_prev_state, seed, days_off_market")
    with conn.cursor() as cur:
        cur.execute(f'SELECT {cols} FROM data_lake.listing_transitions '
                    "WHERE sale_or_rent = 'sale' ORDER BY at")
        names = [d.name for d in cur.description]
        return [dict(zip(names, r)) for r in cur.fetchall()]


def merge_week_rows(conn, rows: list[dict[str, Any]]) -> int:
    if not rows:
        return 0
    with conn.cursor() as cur:
        cur.executemany(MERGE_SQL, [_merge_params(r) for r in rows])
    conn.commit()
    return len(rows)


def apply_label_updates(conn, updates: list[dict[str, Any]]) -> int:
    if not updates:
        return 0
    with conn.cursor() as cur:
        cur.executemany(LABEL_SQL, [
            (u["sold_next_week"], u["holding_next_week"], u["price_cut_next_week"],
             u["address_key"], u["sale_or_rent"], u["week_start"]) for u in updates])
    conn.commit()
    return len(updates)
