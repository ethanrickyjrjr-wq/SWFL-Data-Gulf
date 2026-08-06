"""
Normalize and upsert Crexi listing rows into data_lake.active_listings_cre.

Primary key: sha256(source_name + source_url) truncated to 32 chars,
or sha256(source_name + address + city) when source_url is absent.
The UNIQUE (source_name, source_url) constraint deduplicates cleanly
on re-runs; rows without a URL are always re-inserted.
"""
from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from typing import Any

import psycopg

_TABLE = "data_lake.active_listings_cre"
_SOURCE_NAME = "crexi"

_VALID_STATUSES = {"available", "leased", "sale"}


def _get_conn() -> psycopg.Connection:
    db_url = os.environ.get("CREXI_DB_URL") or os.environ.get("DATABASE_URL")
    if not db_url:
        try:
            import tomllib
            from pathlib import Path
            s = Path(".dlt/secrets.toml")
            if s.exists():
                with s.open("rb") as f:
                    data = tomllib.load(f)
                pg = data.get("destination", {}).get("postgres", {}).get("credentials", {})
                host = pg.get("host", "")
                pw = pg.get("password", "")
                db = pg.get("database", "postgres")
                user = pg.get("username", "postgres")
                port = pg.get("port", 5432)
                if host and pw:
                    db_url = f"postgresql://{user}:{pw}@{host}:{port}/{db}"
        except Exception:
            pass
    if not db_url:
        raise RuntimeError(
            "No DB URL found. Set CREXI_DB_URL or DATABASE_URL, "
            "or ensure .dlt/secrets.toml is present."
        )
    return psycopg.connect(db_url)


def _make_id(row: dict[str, Any]) -> str:
    src_url = (row.get("source_url") or "").strip()
    addr = (row.get("address") or "").strip()
    city = (row.get("city") or "").strip()
    key = f"{_SOURCE_NAME}:{src_url or addr + ':' + city}"
    return hashlib.sha256(key.encode()).hexdigest()[:32]


def _parse_status(raw: str | None) -> str:
    if not raw:
        return "available"
    s = raw.strip().lower()
    if s in _VALID_STATUSES:
        return s
    if "avail" in s or "lease" in s:
        return "available"
    if "sold" in s or "sale" in s:
        return "sale"
    return "available"


def normalize(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Validate and normalize raw Crexi rows. Drops rows missing address, city, or state."""
    out = []
    for raw in rows:
        addr = (raw.get("address") or "").strip()
        city = (raw.get("city") or "").strip()
        # state is recorded from the listing's own location.state.code (build 11) — NEVER hardcoded.
        # The old `state = "FL"` mislabeled nationwide rows; drop a row we can't place rather than
        # invent a state (MOAT: the system cannot invent a location).
        state = (raw.get("state") or "").strip().upper()
        if not addr or not city or not state:
            continue

        sqft = raw.get("sqft")
        asking_psf = raw.get("asking_price_psf")

        out.append({
            "id": _make_id(raw),
            "source_name": _SOURCE_NAME,
            "corridor_name": None,
            "address": addr,
            "city": city,
            "state": state,
            "property_type": (raw.get("property_type") or "").strip().lower() or None,
            "sqft": int(sqft) if sqft is not None else None,
            "asking_price_psf": float(asking_psf) if asking_psf is not None else None,
            "status": _parse_status(raw.get("status")),
            "listed_date": raw.get("listed_date") or None,
            "source_url": (raw.get("source_url") or "").strip() or None,
        })
    return out


def upsert_rows(rows: list[dict[str, Any]], *, dry_run: bool = False) -> int:
    """Write normalized rows to data_lake.active_listings_cre. Returns row count."""
    if not rows:
        return 0
    if dry_run:
        print(f"[dry-run] would upsert {len(rows)} rows to {_TABLE}")
        for r in rows[:5]:
            print(f"  {r['city']} | {r.get('address', '')[:40]} | "
                  f"psf={r.get('asking_price_psf')} sqft={r.get('sqft')} status={r['status']}")
        if len(rows) > 5:
            print(f"  ... and {len(rows) - 5} more")
        return len(rows)

    sql = f"""
        INSERT INTO {_TABLE}
          (id, source_name, corridor_name, address, city, state,
           property_type, sqft, asking_price_psf, status, listed_date,
           source_url, _ingested_at, first_seen_at, last_seen_at)
        VALUES
          (%(id)s, %(source_name)s, %(corridor_name)s, %(address)s, %(city)s, %(state)s,
           %(property_type)s, %(sqft)s, %(asking_price_psf)s, %(status)s, %(listed_date)s,
           %(source_url)s, %(now)s, %(now)s, %(now)s)
        ON CONFLICT (source_name, source_url) DO UPDATE SET
          address        = EXCLUDED.address,
          city           = EXCLUDED.city,
          property_type  = EXCLUDED.property_type,
          sqft           = EXCLUDED.sqft,
          asking_price_psf = EXCLUDED.asking_price_psf,
          status         = EXCLUDED.status,
          listed_date    = EXCLUDED.listed_date,
          _ingested_at   = EXCLUDED._ingested_at,
          -- first_seen_at is WRITE-ONCE: COALESCE keeps the original sighting, so
          -- days-on-market stays measurable across every later run.
          first_seen_at  = COALESCE({_TABLE.split('.')[-1]}.first_seen_at, EXCLUDED.first_seen_at),
          last_seen_at   = EXCLUDED.last_seen_at,
          -- A listing that comes BACK is live again. Clearing gone_at here is what
          -- makes a relist visible instead of looking like it never left.
          gone_at        = NULL
        WHERE active_listings_cre.source_url IS NOT NULL
    """
    now = datetime.now(timezone.utc)
    params = [{**r, "now": now} for r in rows]

    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, params)
            _insert_observations(cur, rows, now)
        conn.commit()
    return len(rows)


def _insert_observations(cur, rows: list[dict[str, Any]], observed_at: datetime) -> int:
    """Append one observation per listing per run — the price/size time series.

    Append-only and never updated. The active row holds only TODAY's asking price;
    without this, a price cut is silently overwritten and unmeasurable. UNIQUE
    (listing_id, observed_at) makes a re-run of the same batch a no-op.
    """
    if not rows:
        return 0
    cur.executemany(
        """
        INSERT INTO data_lake.cre_listing_observations
          (listing_id, source_name, city, observed_at, status, sqft, asking_price_psf)
        VALUES (%(id)s, %(source_name)s, %(city)s, %(now)s, %(status)s, %(sqft)s,
                %(asking_price_psf)s)
        ON CONFLICT (listing_id, observed_at) DO NOTHING
        """,
        [{**r, "now": observed_at} for r in rows],
    )
    return len(rows)


def close_unseen(cities: list[str], seen_ids: list[str], *, dry_run: bool = False) -> int:
    """Mark listings this run COVERED but did not return as gone. Returns rows closed.

    Scoped to `cities` on purpose: a --corridor run only covers one city, and closing
    listings in a city this run never looked at would fabricate an off-market event.

    NOTHING IS DELETED. The row keeps its address, size, last asking price and
    first_seen_at, and gains gone_at — that is the record we learn from: what the
    market cleared at, where, and how long it took.

    Guard: an empty `seen_ids` for a covered city means the scrape FAILED (Cloudflare,
    shape change), not that every listing vanished. Closing on that would wipe the
    city's live set in one run, so it is refused.
    """
    if not cities:
        return 0
    if not seen_ids:
        print("[close_unseen] refused: 0 listings seen — treating as a failed scrape, "
              "not an empty market. No rows closed.", flush=True)
        return 0
    if dry_run:
        print(f"[dry-run] would close unseen listings in {cities} (saw {len(seen_ids)})")
        return 0

    now = datetime.now(timezone.utc)
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                UPDATE {_TABLE}
                   SET status  = 'off_market',
                       gone_at = %s
                 WHERE source_name = %s
                   AND city = ANY(%s)
                   AND gone_at IS NULL
                   AND NOT (id = ANY(%s))
                """,
                (now, _SOURCE_NAME, cities, seen_ids),
            )
            closed = cur.rowcount
        conn.commit()
    return closed
