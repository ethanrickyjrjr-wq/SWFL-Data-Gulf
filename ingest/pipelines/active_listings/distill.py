"""Normalize and upsert active residential listing rows into data_lake.active_listings_residential.

PK (source_name, mls_id) → idempotent merge. The per-field detail comes from the
.listing__property-details aggregate string ("5 Beds 8 Baths 0.34 Acres 6,822 SqFt 244 Days on
Market" or "Land 5.39 Acres 77 Days on Market") parsed by regex.
"""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

import psycopg

_TABLE = "data_lake.active_listings_residential"
_SOURCE_NAME = "active_listings_seed"

_RE_BEDS = re.compile(r"([\d.]+)\s*Beds?", re.I)
_RE_BATHS = re.compile(r"([\d.]+)\s*Baths?", re.I)
_RE_ACRES = re.compile(r"([\d.,]+)\s*Acres?", re.I)
_RE_SQFT = re.compile(r"([\d,]+)\s*SqFt", re.I)
_RE_DOM = re.compile(r"([\d,]+)\s*Days?\s+on\s+Market", re.I)
# A per-period token in the card's price-suffix span marks a RENTAL (lease) listing.
_RE_RENT_SUFFIX = re.compile(r"\bmo\b|month|week|day|season|year|annual", re.I)
# Backstop floor for no-suffix rentals (Naples-MLS cards omit the suffix span). Below this, a
# residential listing in this feed is a lease, not a sale — confirmed live: every sub-$50k
# residential card sampled was a monthly/seasonal rental; the cheapest real for-sale home is $50k+.
_RENT_PRICE_FLOOR = 50000


@lru_cache(maxsize=1)
def _zip_to_county() -> dict[str, str]:
    """zip -> primary SWFL county name, from the canonical fixture (authoritative — never the
    scrape's query param, which can leak a mislabel)."""
    fx = json.loads(Path("fixtures/swfl-zip-county.json").read_text())
    out: dict[str, str] = {}
    for e in fx.get("entries", []):
        names = e.get("county_names") or []
        if e.get("zip") and names:
            out[e["zip"]] = names[0]
    return out


def _get_conn() -> psycopg.Connection:
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        try:
            import tomllib
            from pathlib import Path

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


def _num(raw: str | None) -> float | None:
    if not raw:
        return None
    cleaned = re.sub(r"[^\d.]", "", raw)
    try:
        return float(cleaned) if cleaned else None
    except ValueError:
        return None


def _int_from(rx: re.Pattern, text: str) -> int | None:
    m = rx.search(text)
    if not m:
        return None
    v = _num(m.group(1))
    return int(v) if v is not None else None


def _float_from(rx: re.Pattern, text: str) -> float | None:
    m = rx.search(text)
    return _num(m.group(1)) if m else None


def current_row_count() -> int:
    """Live count of listing rows — the baseline for assert_vs_baseline (0 on bootstrap)."""
    try:
        with _get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                f"SELECT count(*) FROM {_TABLE} WHERE source_name = %s", (_SOURCE_NAME,)
            )
            return int(cur.fetchone()[0])
    except Exception:
        return 0


def normalize(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Validate + type-cast raw active residential listing rows. Drops rows missing mls_id or
    zip_code (can't place / key) and broken placeholder cards. Classifies listing_type (sale vs
    rent) from the card's price-suffix span so MONTHLY RENTALS never contaminate the for-sale
    list_price column — the recurring bug where a $1,200/mo lease read as a $1,200 "home"."""
    out = []
    for raw in rows:
        mls_id = (raw.get("mls_id") or "").strip()
        zip_code = (raw.get("zip_code") or "").strip()
        if not mls_id or not zip_code:
            continue
        details = raw.get("details") or ""
        beds = _int_from(_RE_BEDS, details)
        list_price = _num(raw.get("list_price"))
        # Broken placeholder cards ("$18"/"$19" with no detail string) are not real listings — they
        # shipped the absurd min(list_price)=$18 in the contaminated feed. Drop before classifying.
        if not details and (list_price is None or list_price < 1000):
            continue
        property_type = "land" if (beds is None and "land" in details.lower()) else "residential"
        # PRIMARY rent/sale signal: the site renders <span class="listing__price-suffix"> ("/ month",
        # "/ week", ...) ONLY on lease listings; for-sale cards have no suffix. Confirmed live on the
        # cards 2026-06-26 — but ONLY Stellar-MLS (Sarasota) rental cards carry it.
        suffix = (raw.get("price_suffix") or "").strip()
        listing_type = "rent" if (suffix and _RE_RENT_SUFFIX.search(suffix)) else "sale"
        # BACKSTOP: Naples-MLS (Collier) rental cards omit the suffix span — byte-identical to a sale
        # card, so price is the only card-visible signal left. A residential listing below the sale
        # floor is a lease. Land is never reclassified (a cheap lot is a real for-sale parcel). A
        # small residual of $50k+/season luxury rentals stays mislabeled — immaterial to the for-sale
        # median, and the authoritative fix (detail-page "Rental Price:" label) is skipped to keep the
        # index scrape light (no per-listing detail fetch).
        if (
            listing_type == "sale"
            and property_type == "residential"
            and list_price is not None
            and list_price < _RENT_PRICE_FLOOR
        ):
            listing_type = "rent"
        out.append(
            {
                "source_name": _SOURCE_NAME,
                "mls_id": mls_id,
                "list_price": list_price,
                "street_address": (raw.get("street_address") or "").strip() or None,
                "city": (raw.get("city") or "").strip().rstrip(",").strip() or None,
                "community": (raw.get("community") or "").strip() or None,
                "beds": beds,
                "baths": _float_from(_RE_BATHS, details),
                "sqft": _int_from(_RE_SQFT, details),
                "acres": _float_from(_RE_ACRES, details),
                "days_on_market": _int_from(_RE_DOM, details),
                "status": "active",
                "property_type": property_type,
                "listing_type": listing_type,
                "zip_code": zip_code,
                "county": _zip_to_county().get(zip_code) or (raw.get("county") or "").strip() or None,
                "state": (raw.get("state") or "FL").strip() or "FL",
                "listing_url": (raw.get("listing_url") or "").strip() or None,
            }
        )
    return out


def upsert_rows(rows: list[dict[str, Any]], *, dry_run: bool = False) -> int:
    """Write normalized rows to data_lake.active_listings_residential. Returns row count."""
    if not rows:
        return 0
    if dry_run:
        print(f"[dry-run] would upsert {len(rows)} rows to {_TABLE}")
        for r in rows[:5]:
            print(
                f"  {r['county']} {r['zip_code']} | {(r.get('street_address') or '')[:32]} | "
                f"[{r.get('listing_type')}] ${r.get('list_price')} {r.get('beds')}bd/{r.get('baths')}ba "
                f"{r.get('sqft')}sf dom={r.get('days_on_market')}"
            )
        if len(rows) > 5:
            print(f"  ... and {len(rows) - 5} more")
        return len(rows)

    sql = f"""
        INSERT INTO {_TABLE}
          (source_name, mls_id, list_price, street_address, city, community,
           beds, baths, sqft, acres, days_on_market, status, property_type, listing_type,
           zip_code, county, state, listing_url, scraped_at, _ingested_at)
        VALUES
          (%(source_name)s, %(mls_id)s, %(list_price)s, %(street_address)s, %(city)s, %(community)s,
           %(beds)s, %(baths)s, %(sqft)s, %(acres)s, %(days_on_market)s, %(status)s, %(property_type)s, %(listing_type)s,
           %(zip_code)s, %(county)s, %(state)s, %(listing_url)s, %(now)s, %(now)s)
        ON CONFLICT (source_name, mls_id) DO UPDATE SET
          list_price     = EXCLUDED.list_price,
          street_address = EXCLUDED.street_address,
          city           = EXCLUDED.city,
          community      = EXCLUDED.community,
          beds           = EXCLUDED.beds,
          baths          = EXCLUDED.baths,
          sqft           = EXCLUDED.sqft,
          acres          = EXCLUDED.acres,
          days_on_market = EXCLUDED.days_on_market,
          status         = EXCLUDED.status,
          property_type  = EXCLUDED.property_type,
          listing_type   = EXCLUDED.listing_type,
          zip_code       = EXCLUDED.zip_code,
          county         = EXCLUDED.county,
          state          = EXCLUDED.state,
          listing_url    = EXCLUDED.listing_url,
          scraped_at     = EXCLUDED.scraped_at,
          _ingested_at   = EXCLUDED._ingested_at
    """
    now = datetime.now(timezone.utc)
    params = [{**r, "now": now} for r in rows]
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, params)
        conn.commit()
    return len(rows)
