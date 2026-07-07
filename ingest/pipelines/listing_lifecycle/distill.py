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
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_SUFFIXES = ["BLVD","PKWY","TRAIL","HWY","CIR","TER","PL","CT","LN","RD","DR","AVE","ST","WAY","TRL","CV","PT","LOOP"]
_DIR_RE = re.compile(r"^(SW|NW|SE|NE|[NSEW])(?=\d)")
_ORD_RE = re.compile(r"^(\d+)(TH|ST|ND|RD)$", re.I)


def _ord_suffix(n: int) -> str:
    if 11 <= n % 100 <= 13:
        return "th"
    return {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")


def _humanize_street(raw: str) -> str:
    dm = _DIR_RE.match(raw)
    if dm:
        d = dm.group(1)
        rest = raw[len(d):]
        om = _ORD_RE.match(rest)
        if om:
            n = int(om.group(1))
            return d + " " + str(n) + _ord_suffix(n)
        return d + " " + rest.title()
    om = _ORD_RE.match(raw)
    if om:
        n = int(om.group(1))
        return str(n) + _ord_suffix(n)
    return raw.title()


def address_key_to_street(address_key: str) -> str:
    """Reconstruct a display street address from a normalized address_key."""
    addr = address_key.split(":")[0]
    unit = ""
    um = re.search(r"(UNIT[A-Z0-9-]+)$", addr)
    if um:
        unit = " #" + um.group(1)[4:]
        addr = addr[:um.start()]
    nm = re.match(r"^(\d+)", addr)
    num = nm.group(1) if nm else ""
    street = addr[len(num):]
    suffix = ""
    for sfx in sorted(_SUFFIXES, key=len, reverse=True):
        if street.endswith(sfx):
            suffix = " " + sfx.title()
            street = street[:-len(sfx)]
            break
    return (num + " " + _humanize_street(street) + suffix + unit).strip()

# psycopg is imported LAZILY inside _get_conn so the pure callers (and dry-runs) don't require the
# DB driver to be installed in the running interpreter (e.g. a crawl4ai-venv dry-run with no psycopg).

_STATE_TABLE = "data_lake.listing_state"
_TRANS_TABLE = "data_lake.listing_transitions"
SOURCE_NAME = "lifecycle_seed"  # neutral; never a vendor/board name (real origin lives in the secret)

# Wide state columns the diff engine fills (everything except the SQL-managed first_seen/last_seen/
# scraped_at and the source_name stamped here). Capture wide, slice late. The trailing block is the
# API-feed superset (RentCast spine + SteadyAPI photos, source_name='api_feed') — NULL for the
# Source-B scrape rows that predate them, real for the API feed.
_STATE_COLS = [
    "address_key", "sale_or_rent", "state", "listing_id", "list_price", "list_suffix",
    "beds", "baths", "sqft", "lot_acres", "property_type", "zip_code", "county", "city",
    "subdivision", "brokerage", "listed_date", "days_on_market", "days_in_state",
    "street_address",
    "photo_url", "lat", "lon", "county_fips", "mls_number", "mls_name", "listing_type",
    # Budget-fix superset (migrations/20260630b_listing_state_budget_fix_columns.sql): property_id
    # is what makes known_ids threading possible — without it pipeline.py has no prior identity to
    # diff against, and every sweep re-enriches everything. NULL for rows that predate it.
    "property_id", "status", "reduced_amount",
    "flag_pending", "flag_contingent", "flag_coming_soon", "flag_foreclosure",
    "flag_new_construction", "flag_price_reduced", "flag_new_listing",
]
# Read-only extras the diff/hook needs but the MERGE never writes (SQL-managed / written out-of-band):
#   last_seen     — stamped once when the absent->holding upsert lands, then frozen (diff never re-upserts
#                   a still-absent holding), so (today - last_seen) is the holding AGE the re-check keys on.
#   sold_check_at — last /property-tax-history probe (written ONLY by stamp_sold_checked's targeted UPDATE,
#                   which deliberately does NOT touch last_seen — routing it through the MERGE would reset
#                   the age signal). Drives re-check interval + rotation.
_STATE_READ_EXTRA = ["last_seen", "sold_check_at"]
_TRANS_COLS = [
    "address_key", "sale_or_rent", "from_state", "to_state", "at", "listing_id",
    "price", "price_delta", "days_in_prev_state", "seed",
    # Sold-capture: the confirmed sale price + real close date (both NULL unless to_state='sold').
    "sold_price", "sold_date",
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
    read_cols = _STATE_COLS + _STATE_READ_EXTRA
    cols = ", ".join(read_cols)
    out: dict[tuple[str, str], dict[str, Any]] = {}
    try:
        with _get_conn() as conn, conn.cursor() as cur:
            cur.execute(f"SELECT {cols} FROM {_STATE_TABLE} WHERE source_name = %s", (source_name,))
            for row in cur.fetchall():
                rec = dict(zip(read_cols, row))
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


def transition_count(source_name: str = SOURCE_NAME) -> int:
    """Live transition-history count for a source. Zero => this source has never emitted a diff, so
    the NEXT run IS its baseline (see pipeline.run is_seed): a state-only migrate populates listing_state
    but leaves transitions empty, and without this the first automated sweep would stamp the whole
    cutover as real flow (the 2026-07-01 SteadyAPI incident). Fails safe to 0 (treat as baseline) —
    a transient read error stamping a run seed=True is harmless; the opposite fabricates churn."""
    try:
        with _get_conn() as conn, conn.cursor() as cur:
            cur.execute(f"SELECT count(*) FROM {_TRANS_TABLE} WHERE source_name = %s", (source_name,))
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


def log_source_total(value: int, source_label: str, *, dry_run: bool = False) -> None:
    """Insert one row into data_lake.source_totals — the source's own current-total claim, read by
    /ops/census to detect silent ingestion drift (Task 11 of the pipeline-data-census plan)."""
    if dry_run:
        print(f"[dry-run] would log source_total={value} ({source_label})", flush=True)
        return
    with _get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO data_lake.source_totals (pipeline_name, source_label, value, method) "
            "VALUES (%s, %s, %s, %s)",
            ("listing_lifecycle", source_label, value, "api_meta_total"),
        )
        conn.commit()


def load_price_pending_solds(
    source_name: str = SOURCE_NAME, *, max_age_days: int = 60
) -> list[dict[str, Any]]:
    """Sold transitions holding NO positive price (deed record not yet posted — or never will be),
    young enough to still be worth a leftover-budget re-probe. Joined to state for the probe identity
    (property_id), the priority signal (list_price) and the interval stamp (sold_check_at). The close
    anchor is sold_date, falling back to `at` (detection day). ODD-tolerant: any failure reads as
    "no candidates", never a crash — backfill is strictly best-effort."""
    sql = f"""
        SELECT t.address_key, t.sale_or_rent, t.at, t.sold_date,
               s.property_id, s.list_price, s.sold_check_at
        FROM {_TRANS_TABLE} t
        JOIN {_STATE_TABLE} s
          ON s.source_name = t.source_name
         AND s.address_key = t.address_key
         AND s.sale_or_rent = t.sale_or_rent
        WHERE t.source_name = %(src)s
          AND t.to_state = 'sold'
          AND (t.sold_price IS NULL OR t.sold_price <= 0)
          AND COALESCE(t.sold_date, t.at) >= current_date - %(days)s * interval '1 day'
    """
    cols = ["address_key", "sale_or_rent", "at", "sold_date", "property_id", "list_price", "sold_check_at"]
    try:
        with _get_conn() as conn, conn.cursor() as cur:
            cur.execute(sql, {"src": source_name, "days": max_age_days})
            return [dict(zip(cols, row)) for row in cur.fetchall()]
    except Exception:
        return []


def update_sold_price(
    upgrades: list[dict[str, Any]], *, source_name: str = SOURCE_NAME, dry_run: bool = False
) -> int:
    """Fold a recovered closing price back onto the EXISTING sold transition(s) — a targeted in-place
    UPDATE, never a new row (one sold event per listing per spell stays one row). Guarded: only rows
    still price-less are touched, and only with a positive price, so a double-fire or a stale plan can
    never clobber a real recorded price. sold_date upgrades only when the probe returned one."""
    if not upgrades:
        return 0
    if dry_run:
        print(f"[dry-run] would backfill sold_price on {len(upgrades)} transitions")
        return len(upgrades)
    sql = (f"UPDATE {_TRANS_TABLE} SET sold_price = %(price)s, "
           f"sold_date = COALESCE(%(sold_date)s, sold_date) "
           f"WHERE source_name = %(src)s AND address_key = %(addr)s AND sale_or_rent = %(sor)s "
           f"AND to_state = 'sold' AND (sold_price IS NULL OR sold_price <= 0)")
    params = [
        {"price": u["sold_price"], "sold_date": u.get("sold_date"), "src": source_name,
         "addr": u["key"][0], "sor": u["key"][1]}
        for u in upgrades
        if isinstance(u.get("sold_price"), int) and u["sold_price"] > 0
    ]
    if not params:
        return 0
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, params)
        conn.commit()
    return len(params)


def stamp_sold_checked(
    keys: list[tuple[str, str]], *, source_name: str = SOURCE_NAME, checked_at: Any = None,
    dry_run: bool = False,
) -> int:
    """Record that the off-market hook probed these (address_key, sale_or_rent) listings, WITHOUT
    touching last_seen — a targeted UPDATE, not the MERGE, precisely so the holding-age signal the
    re-check reads (today - last_seen) is preserved. Idempotent; safe on an empty list."""
    if not keys:
        return 0
    if dry_run:
        print(f"[dry-run] would stamp sold_check_at on {len(keys)} listings")
        return len(keys)
    ts = checked_at or datetime.now(timezone.utc)
    sql = (f"UPDATE {_STATE_TABLE} SET sold_check_at = %(ts)s "
           f"WHERE source_name = %(src)s AND address_key = %(addr)s AND sale_or_rent = %(sor)s")
    params = [{"ts": ts, "src": source_name, "addr": a, "sor": s} for (a, s) in keys]
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, params)
        conn.commit()
    return len(keys)
