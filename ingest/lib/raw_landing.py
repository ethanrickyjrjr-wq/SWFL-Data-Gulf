"""Generic raw-body landing writer — the ONE shared mechanism for keeping 100% of every paid
vendor response (operator decree 08/02/2026: every paid SteadyAPI surface raw-lands, not just
/property-tax-history).

Pattern is the proven Step-1 design (listing_lifecycle/distill.insert_raw_bodies, playbook
docs/superpowers/plans/2026-08-02-steadyapi-raw-landing-playbook.md §1c), generalized:
  • idempotent PK upsert, latest body wins — a re-fetch refreshes, never duplicates
  • Jsonb-wrapped body (psycopg3 does NOT auto-adapt dict → jsonb)
  • `write_isolated` = best-effort: a raw-landing failure is logged and swallowed, NEVER raised —
    it must not abort a run whose primary typed write succeeded (Step-1 failure-modes table).
Tables live in migrations/20260802_steadyapi_raw_landings.sql. Cold landing only — NEVER a served
root; typed tables parse OUT of these with zero paid calls."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence


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


def upsert_raw(
    table: str,
    key_cols: Sequence[str],
    rows: list[dict[str, Any]],
    *,
    dry_run: bool = False,
) -> int:
    """UPSERT raw vendor bodies. Each row: key cols + optional context cols + `body` (full vendor
    dict). ON CONFLICT(key_cols) every non-key column refreshes (latest wins). Empty rows = noop;
    dry_run writes nothing. Raises on failure — callers wanting best-effort use write_isolated."""
    if not rows:
        return 0
    if dry_run:
        print(f"[dry-run] would upsert {len(rows)} raw bodies to {table}", flush=True)
        return len(rows)
    from psycopg.types.json import Jsonb

    cols = [c for c in rows[0].keys() if c != "body"] + ["body", "fetched_at"]
    updatable = [c for c in cols if c not in key_cols]
    placeholders = ", ".join(f"%({c})s" for c in cols)
    sql = (
        f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({placeholders}) "
        f"ON CONFLICT ({', '.join(key_cols)}) DO UPDATE SET "
        + ", ".join(f"{c} = EXCLUDED.{c}" for c in updatable)
    )
    now = datetime.now(timezone.utc)
    params = [
        {**{c: r.get(c) for c in cols if c not in ("body", "fetched_at")},
         "body": Jsonb(r["body"]), "fetched_at": now}
        for r in rows
    ]
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, params)
        conn.commit()
    return len(rows)


def write_isolated(
    table: str,
    key_cols: Sequence[str],
    rows: list[dict[str, Any]],
    *,
    dry_run: bool = False,
    label: str = "raw-landing",
) -> int:
    """Best-effort upsert_raw: any exception is logged and swallowed (returns 0). A raw-landing
    write must never kill the run or block the typed write that already succeeded."""
    if not rows:
        return 0
    try:
        return upsert_raw(table, key_cols, rows, dry_run=dry_run)
    except Exception as e:  # noqa: BLE001 — isolation by design, this write is best-effort
        print(f"[{label}] raw-body write failed for {len(rows)} row(s) to {table} ({e}); "
              f"typed write unaffected, bodies re-land on the next sweep", flush=True)
        return 0
