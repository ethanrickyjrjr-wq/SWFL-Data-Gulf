"""
Normalize and upsert Brevitas listing rows into data_lake.active_listings_cre.

Lease vs. for-sale detection:
  Brevitas's /api/search returns a `price` field that is ambiguous — it is the PSF/year
  rate for lease listings and the sale price for for-sale listings. We distinguish them
  via a threshold: any price <= MAX_LEASE_PSF is treated as a per-sqft-per-year lease rate;
  anything above is a sale price and is dropped. For SWFL commercial, $500/sqft/yr is an
  extreme ceiling (typical rates are $15–50/sqft/yr); sale prices are always $50K+.

Primary key: sha256("brevitas:" + source_url) truncated to 32 chars.
Deduplication: UNIQUE (source_name, source_url) — same as the Crexi sibling rows.
"""
from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from typing import Any

import psycopg

_TABLE = "data_lake.active_listings_cre"
_SOURCE_NAME = "brevitas"

# Prices above this threshold are sale prices, not lease rates (PSF/yr).
_MAX_LEASE_PSF = 500.0


def _get_conn() -> psycopg.Connection:
    db_url = os.environ.get("DATABASE_URL") or os.environ.get("BREVITAS_DB_URL")
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
            "No DB URL found. Set DATABASE_URL, or ensure .dlt/secrets.toml is present."
        )
    return psycopg.connect(db_url)


def _make_id(row: dict[str, Any]) -> str:
    src_url = (row.get("source_url") or "").strip()
    addr = (row.get("address") or "").strip()
    city = (row.get("city") or "").strip()
    key = f"{_SOURCE_NAME}:{src_url or addr + ':' + city}"
    return hashlib.sha256(key.encode()).hexdigest()[:32]


def normalize(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Filter to confirmed lease listings and map to the active_listings_cre schema.
    Drops: missing address/city/state, and for-sale listings (price > MAX_LEASE_PSF).
    """
    out = []
    for raw in rows:
        addr = (raw.get("address") or "").strip()
        city = (raw.get("city") or "").strip()
        state = (raw.get("state") or "").strip().upper()
        if not addr or not city or not state:
            continue

        price = raw.get("price")

        # Skip for-sale listings. A None price or zero means undisclosed lease rate — keep it.
        if price is not None and price > _MAX_LEASE_PSF:
            continue

        asking_psf = float(price) if price else None

        out.append({
            "id": _make_id(raw),
            "source_name": _SOURCE_NAME,
            "corridor_name": None,
            "address": addr,
            "city": city,
            "state": state,
            "property_type": (raw.get("property_type") or "").strip().lower().replace(" ", "_") or None,
            "sqft": raw.get("sqft"),
            "asking_price_psf": asking_psf,
            "status": "available",   # Brevitas for_lease search returns only active listings
            "listed_date": None,     # Brevitas does not expose listed_date in the search API
            "source_url": (raw.get("source_url") or "").strip() or None,
        })
    return out


def upsert_rows(rows: list[dict[str, Any]], *, dry_run: bool = False) -> int:
    """Write normalized rows to data_lake.active_listings_cre. Returns row count written."""
    if not rows:
        return 0
    if dry_run:
        print(f"[dry-run] would upsert {len(rows)} rows to {_TABLE}")
        for r in rows[:5]:
            print(
                f"  {r['city']} | {r.get('address', '')[:40]} | "
                f"psf={r.get('asking_price_psf')} sqft={r.get('sqft')} type={r.get('property_type')}"
            )
        if len(rows) > 5:
            print(f"  ... and {len(rows) - 5} more")
        return len(rows)

    sql = f"""
        INSERT INTO {_TABLE}
          (id, source_name, corridor_name, address, city, state,
           property_type, sqft, asking_price_psf, status, listed_date,
           source_url, _ingested_at)
        VALUES
          (%(id)s, %(source_name)s, %(corridor_name)s, %(address)s, %(city)s, %(state)s,
           %(property_type)s, %(sqft)s, %(asking_price_psf)s, %(status)s, %(listed_date)s,
           %(source_url)s, %(now)s)
        ON CONFLICT (source_name, source_url) DO UPDATE SET
          address          = EXCLUDED.address,
          city             = EXCLUDED.city,
          property_type    = EXCLUDED.property_type,
          sqft             = EXCLUDED.sqft,
          asking_price_psf = EXCLUDED.asking_price_psf,
          status           = EXCLUDED.status,
          _ingested_at     = EXCLUDED._ingested_at
        WHERE active_listings_cre.source_url IS NOT NULL
    """
    now = datetime.now(timezone.utc)
    params = [{**r, "now": now} for r in rows]

    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, params)
        conn.commit()
    return len(rows)
