# Sell-Odds Phase 0 — `listing_week` Person-Period Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 6 tasks, 13 files, keywords: migration, schema, architecture

**Goal:** Build the append-only `data_lake.listing_week` table — one row per (address_key, sale_or_rent, week_start) with features frozen as-of that week and next-week outcome labels — plus its reconstruction backfill from 06/27/2026 and weekly GHA cron.

**Architecture:** Pure replay engine (no I/O) rebuilds any listing's state at any week-end from its `listing_transitions` history + current `listing_state` row, mirroring the lifecycle pipeline's pure-diff/db-layer split. A thin psycopg db layer merges rows idempotently; a CLI wires backfill/weekly/dry-run; a weekly workflow runs it. Labels for week W are filled by the run that observes week W+1 — the last observed week always carries NULL labels (censoring is native).

**Tech Stack:** Python 3.12 (`ingest/` island — psycopg, pytest), Postgres (`data_lake` schema), GitHub Actions cron. Zero TS coupling, zero LLM calls, zero paid surfaces.

**Spec:** `docs/superpowers/specs/2026-07-19-sell-odds-model-design.md` (Phase 0 section).

## Global Constraints

- **Merge key is `(address_key, sale_or_rent, week_start)`** — NOT `(listing_id, week_start)` as the spec draft said. The tracker's identity is (address_key, sale_or_rent) (`transitions.py:24`); `listing_id` can be a minted composite fallback (`pipeline.py:58`). Task 6 corrects the spec line in the same commit.
- **Append-only merge, never replace** (`write` = `INSERT … ON CONFLICT … DO UPDATE`). Gate 4 satisfied by construction; a 0-row write on a non-dry run exits 1 loud.
- **`seed = TRUE` transitions are baseline stamps, not events** — they establish state during replay but NEVER count as a cut/sold/holding label or in `cuts_to_date`.
- **Sale side only** (`sale_or_rent = 'sale'`). Rentals are out of scope for sell odds.
- **Week = Monday-start UTC (ISO)**. First backfill week_start: 2026-06-29 (first Monday on/after tracker start 06/27/2026).
- **No invented values:** every column is copied from `listing_state`, replayed from `listing_transitions`, or arithmetic on those. A value that can't be reconstructed is NULL, never estimated.
- **psycopg imported lazily** inside the connection helper (dry-run must not require it) — same pattern as `distill.py:66`.
- **Creds:** `DATABASE_URL` env, fallback `.dlt/secrets.toml` — copy `distill._get_conn` exactly.
- **After table creation:** `GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role; NOTIFY pgrst,'reload schema';`
- **Same-PR shipments:** GHA cron wrapper + `--dry-run` (pipeline-freshness), cadence_registry entry with full `source_scope` (FULL-SCOPE-FIRST), data-roots row.
- **Brain-first gate note (conscious, documented):** no brain consumes this table in this PR — its consumers are the Phase 1 cohort loader and the Phase 2 training job per the approved spec. The cadence entry's `note:` carries this and points at check `sell_odds_model_live_verify`.
- Python tests: `python -m pytest ingest/tests/pipelines/listing_week/ -v` (repo-root cwd).

---

### Task 1: Pure replay engine — state/price/DOM at any week-end

**Files:**
- Create: `ingest/pipelines/listing_week/__init__.py` (empty)
- Create: `ingest/pipelines/listing_week/builder.py`
- Test: `ingest/tests/pipelines/listing_week/test_builder.py` (+ empty `__init__.py` beside it)

**Interfaces:**
- Consumes: transition dicts shaped exactly like `listing_transitions` rows (keys: `address_key, sale_or_rent, from_state, to_state, at, listing_id, price, price_delta, days_in_prev_state, seed, days_off_market`) and `listing_state` row dicts (keys as in the DB: `address_key, sale_or_rent, state, list_price, listed_date, zip_code, county, property_type, beds, baths, sqft, lot_acres, flag_foreclosure, flag_new_construction, listing_id`).
- Produces: `week_start_of(d: date) -> date`, `build_week_rows(state_rows: list[dict], transitions: list[dict], week_start: date) -> list[dict]`, `label_updates(transitions: list[dict], week_start: date) -> list[dict]`. Row dict keys are the `listing_week` columns of Task 2.

- [ ] **Step 1: Write the failing tests**

```python
# ingest/tests/pipelines/listing_week/test_builder.py
"""Pure replay engine tests — no DB. Fixture history: one listing appears, gets a
price cut, departs to holding, relists, then sells. Weeks are Monday-start UTC."""
from datetime import date

from ingest.pipelines.listing_week.builder import (
    build_week_rows,
    label_updates,
    week_start_of,
)

STATE_ROW = {
    "address_key": "123 MAIN ST:33904", "sale_or_rent": "sale", "state": "sold",
    "list_price": 400_000, "listed_date": date(2026, 6, 30), "zip_code": "33904",
    "county": "Lee", "property_type": "single_family", "beds": 3, "baths": 2.0,
    "sqft": 1500, "lot_acres": 0.25, "flag_foreclosure": False,
    "flag_new_construction": False, "listing_id": "L1",
}

def _t(at, from_state, to_state, price, delta=None, seed=False):
    return {"address_key": "123 MAIN ST:33904", "sale_or_rent": "sale",
            "from_state": from_state, "to_state": to_state, "at": at,
            "listing_id": "L1", "price": price, "price_delta": delta,
            "days_in_prev_state": None, "seed": seed, "days_off_market": None}

# Tue 06/30 appear @420k · Wed 07/08 cut to 400k · Tue 07/14 -> holding ·
# Thu 07/16 relist (active) · Fri 07/17 sold.
HISTORY = [
    _t("2026-06-30", None, "active", 420_000),
    _t("2026-07-08", "active", "active", 400_000, delta=-20_000),
    _t("2026-07-14", "active", "holding", 400_000),
    _t("2026-07-16", "holding", "active", 400_000),
    _t("2026-07-17", "active", "sold", 400_000),
]

def test_week_start_of_is_monday():
    assert week_start_of(date(2026, 7, 19)) == date(2026, 7, 13)  # Sun -> prior Mon
    assert week_start_of(date(2026, 7, 13)) == date(2026, 7, 13)  # Mon -> itself

def test_week1_row_frozen_features():
    # Week 06/29–07/05: listing appeared 06/30 at 420k, no cut yet.
    rows = build_week_rows([STATE_ROW], HISTORY, date(2026, 6, 29))
    assert len(rows) == 1
    r = rows[0]
    assert r["week_start"] == date(2026, 6, 29)
    assert r["list_price"] == 420_000          # price BEFORE the 07/08 cut
    assert r["cuts_to_date"] == 0
    assert r["state_at_week_end"] == "active"
    assert r["dom_days"] == 5                  # 07/05 - 06/30
    assert r["sold_next_week"] is None         # labels never set at build time
    assert r["beds"] == 3 and r["zip_code"] == "33904"

def test_week2_row_sees_cut():
    # Week 07/06–07/12: cut on 07/08 has landed.
    r = build_week_rows([STATE_ROW], HISTORY, date(2026, 7, 6))[0]
    assert r["list_price"] == 400_000
    assert r["cuts_to_date"] == 1
    assert r["cut_depth_pct_to_date"] == round(20_000 / 420_000 * 100, 2)

def test_week3_holding_then_relist_then_sold():
    # Week 07/13–07/19: holding 07/14, relist 07/16, sold 07/17 -> week-end state sold.
    r = build_week_rows([STATE_ROW], HISTORY, date(2026, 7, 13))[0]
    assert r["state_at_week_end"] == "sold"
    assert r["relists_to_date"] == 1

def test_not_yet_appeared_gets_no_row():
    rows = build_week_rows([STATE_ROW], HISTORY, date(2026, 6, 22))
    assert rows == []

def test_seed_transitions_are_baseline_not_events():
    seeded = [_t("2026-06-30", None, "active", 420_000, seed=True),
              _t("2026-07-08", "active", "active", 400_000, delta=-20_000, seed=True)]
    r = build_week_rows([STATE_ROW], seeded, date(2026, 7, 6))[0]
    assert r["state_at_week_end"] == "active"  # seed DOES establish state/price
    assert r["list_price"] == 400_000
    assert r["cuts_to_date"] == 0              # seed does NOT count as a cut event

def test_rental_rows_excluded():
    rent_state = dict(STATE_ROW, sale_or_rent="rent")
    rent_hist = [dict(h, sale_or_rent="rent") for h in HISTORY]
    assert build_week_rows([rent_state], rent_hist, date(2026, 6, 29)) == []

def test_label_updates_for_prior_week():
    # Labels for week 07/06 come from events in week 07/13–07/19 (sold on 07/17).
    ups = label_updates(HISTORY, date(2026, 7, 6))
    assert ups == [{
        "address_key": "123 MAIN ST:33904", "sale_or_rent": "sale",
        "week_start": date(2026, 7, 6),
        "sold_next_week": True, "holding_next_week": True,  # 07/14 holding also in window
        "price_cut_next_week": False,
    }]

def test_label_updates_ignore_seed():
    seeded = [_t("2026-07-17", "active", "sold", 400_000, seed=True)]
    assert label_updates(seeded, date(2026, 7, 6)) == []

def test_idempotent_same_input_same_rows():
    a = build_week_rows([STATE_ROW], HISTORY, date(2026, 7, 6))
    b = build_week_rows([STATE_ROW], HISTORY, date(2026, 7, 6))
    assert a == b
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest ingest/tests/pipelines/listing_week/test_builder.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ingest.pipelines.listing_week'`

- [ ] **Step 3: Implement the replay engine**

```python
# ingest/pipelines/listing_week/builder.py
"""Pure person-period replay — no DB, no I/O. Rebuilds any listing's state at any
week-end from its transition history; emits one training row per listing-week.

Label semantics: labels for week W describe events in week W+1 and are written by
label_updates() on the run that has OBSERVED week W+1. build_week_rows() always
emits labels as None — the last observed week is censored by construction.

seed=True transitions are day-1 baseline stamps (transitions.py is_seed): they
establish state and price during replay but are never counted as events."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

_LIVE = frozenset({"active", "new", "coming_soon", "back_on_market"})


def week_start_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _at(t: dict[str, Any]) -> date:
    v = t["at"]
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def _history_for(transitions: list[dict], key: tuple[str, str]) -> list[dict]:
    hs = [t for t in transitions
          if (t["address_key"], t["sale_or_rent"]) == key]
    return sorted(hs, key=_at)


def _replay(history: list[dict], upto: date) -> dict[str, Any] | None:
    """State snapshot from all transitions with at <= upto. None if the listing
    hasn't appeared yet. Counters skip seed rows; state/price honor them."""
    seen = [t for t in history if _at(t) <= upto]
    if not seen:
        return None
    state, price, first_price = None, None, None
    cuts, cut_depth_abs, relists = 0, 0, 0
    last_cut: date | None = None
    for t in seen:
        state = t["to_state"]
        if t["price"] is not None:
            price = t["price"]
            if first_price is None:
                first_price = t["price"]
        if t["seed"]:
            continue
        delta = t.get("price_delta")
        if delta is not None and delta < 0:
            cuts += 1
            cut_depth_abs += -delta
            last_cut = _at(t)
        if t["from_state"] == "holding" and t["to_state"] in _LIVE:
            relists += 1
    return {"state": state, "price": price, "first_price": first_price,
            "cuts": cuts, "cut_depth_abs": cut_depth_abs, "relists": relists,
            "last_cut": last_cut}


def build_week_rows(state_rows: list[dict], transitions: list[dict],
                    week_start: date) -> list[dict[str, Any]]:
    week_end = week_start + timedelta(days=6)
    rows: list[dict[str, Any]] = []
    for s in state_rows:
        if s.get("sale_or_rent") != "sale":
            continue
        key = (s["address_key"], "sale")
        snap = _replay(_history_for(transitions, key), week_end)
        if snap is None:
            continue
        listed = s.get("listed_date")
        depth_pct = (round(snap["cut_depth_abs"] / snap["first_price"] * 100, 2)
                     if snap["cut_depth_abs"] and snap["first_price"] else 0.0)
        rows.append({
            "address_key": s["address_key"], "sale_or_rent": "sale",
            "week_start": week_start,
            "listing_id": s.get("listing_id"),
            "zip_code": s.get("zip_code"), "county": s.get("county"),
            "property_type": s.get("property_type"),
            "beds": s.get("beds"), "baths": s.get("baths"),
            "sqft": s.get("sqft"), "lot_acres": s.get("lot_acres"),
            "listed_date": listed,
            "dom_days": (week_end - listed).days if listed else None,
            "state_at_week_end": snap["state"],
            "list_price": snap["price"],
            "cuts_to_date": snap["cuts"],
            "cut_depth_pct_to_date": depth_pct,
            "weeks_since_last_cut": ((week_end - snap["last_cut"]).days // 7
                                     if snap["last_cut"] else None),
            "relists_to_date": snap["relists"],
            "flag_foreclosure": s.get("flag_foreclosure"),
            "flag_new_construction": s.get("flag_new_construction"),
            "sold_next_week": None, "holding_next_week": None,
            "price_cut_next_week": None,
        })
    return rows


def label_updates(transitions: list[dict], week_start: date) -> list[dict[str, Any]]:
    """Labels for rows of `week_start`, from events in the FOLLOWING week."""
    nxt_start = week_start + timedelta(days=7)
    nxt_end = nxt_start + timedelta(days=6)
    by_key: dict[tuple[str, str], dict[str, bool]] = {}
    for t in transitions:
        if t["seed"] or t.get("sale_or_rent") != "sale":
            continue
        at = _at(t)
        if not (nxt_start <= at <= nxt_end):
            continue
        lab = by_key.setdefault((t["address_key"], t["sale_or_rent"]),
                                {"sold_next_week": False,
                                 "holding_next_week": False,
                                 "price_cut_next_week": False})
        if t["to_state"] == "sold":
            lab["sold_next_week"] = True
        if t["to_state"] == "holding":
            lab["holding_next_week"] = True
        delta = t.get("price_delta")
        if delta is not None and delta < 0:
            lab["price_cut_next_week"] = True
    return [{"address_key": k[0], "sale_or_rent": k[1], "week_start": week_start, **lab}
            for k, lab in sorted(by_key.items())]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest ingest/tests/pipelines/listing_week/test_builder.py -v`
Expected: 9 passed

- [ ] **Step 5: Commit**

```bash
git add ingest/pipelines/listing_week/__init__.py ingest/pipelines/listing_week/builder.py ingest/tests/pipelines/listing_week/__init__.py ingest/tests/pipelines/listing_week/test_builder.py
git commit -m "feat(listing-week): pure person-period replay engine (state/price/DOM at any week-end)" -- ingest/pipelines/listing_week/ ingest/tests/pipelines/listing_week/
```

---

### Task 2: DB layer + migration SQL

**Files:**
- Create: `ingest/pipelines/listing_week/db.py`
- Create: `docs/sql/20260719_listing_week.sql`
- Test: `ingest/tests/pipelines/listing_week/test_db_sql.py`

**Interfaces:**
- Consumes: row dicts / label dicts from Task 1 (`build_week_rows`, `label_updates`).
- Produces: `load_sale_state(conn) -> list[dict]`, `load_transitions(conn) -> list[dict]`, `merge_week_rows(conn, rows: list[dict]) -> int`, `apply_label_updates(conn, updates: list[dict]) -> int`, `get_conn()`. SQL-string constants `MERGE_SQL`, `LABEL_SQL` (tested pure).

- [ ] **Step 1: Write the migration SQL**

```sql
-- docs/sql/20260719_listing_week.sql — idempotent. Person-period training panel
-- for the sell-odds hazard model (spec 2026-07-19-sell-odds-model-design.md).
-- Append-only via merge; labels for week W are written by the run observing W+1.
CREATE TABLE IF NOT EXISTS data_lake.listing_week (
  address_key            text        NOT NULL,
  sale_or_rent           text        NOT NULL,
  week_start             date        NOT NULL,
  listing_id             text,
  zip_code               text,
  county                 text,
  property_type          text,
  beds                   numeric,
  baths                  numeric,
  sqft                   integer,
  lot_acres              numeric,
  listed_date            date,
  dom_days               integer,
  state_at_week_end      text,
  list_price             bigint,
  cuts_to_date           integer,
  cut_depth_pct_to_date  numeric,
  weeks_since_last_cut   integer,
  relists_to_date        integer,
  flag_foreclosure       boolean,
  flag_new_construction  boolean,
  sold_next_week         boolean,
  holding_next_week      boolean,
  price_cut_next_week    boolean,
  built_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (address_key, sale_or_rent, week_start)
);
CREATE INDEX IF NOT EXISTS listing_week_week_idx ON data_lake.listing_week (week_start);
CREATE INDEX IF NOT EXISTS listing_week_zip_idx  ON data_lake.listing_week (zip_code);
GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Write the failing SQL-shape tests**

```python
# ingest/tests/pipelines/listing_week/test_db_sql.py
"""Pure tests over the SQL strings + row->params packing. No live DB."""
from datetime import date

from ingest.pipelines.listing_week.db import LABEL_SQL, MERGE_SQL, _merge_params

ROW = {"address_key": "123 MAIN ST:33904", "sale_or_rent": "sale",
       "week_start": date(2026, 6, 29), "listing_id": "L1", "zip_code": "33904",
       "county": "Lee", "property_type": "single_family", "beds": 3, "baths": 2.0,
       "sqft": 1500, "lot_acres": 0.25, "listed_date": date(2026, 6, 30),
       "dom_days": 5, "state_at_week_end": "active", "list_price": 420_000,
       "cuts_to_date": 0, "cut_depth_pct_to_date": 0.0, "weeks_since_last_cut": None,
       "relists_to_date": 0, "flag_foreclosure": False,
       "flag_new_construction": False, "sold_next_week": None,
       "holding_next_week": None, "price_cut_next_week": None}

def test_merge_is_upsert_not_replace():
    s = MERGE_SQL.lower()
    assert "insert into data_lake.listing_week" in s
    assert "on conflict (address_key, sale_or_rent, week_start) do update" in s
    assert "delete" not in s and "truncate" not in s

def test_merge_never_overwrites_labels():
    # A feature re-merge must not null out labels a later run already filled.
    assert "sold_next_week" not in MERGE_SQL.lower().split("do update")[1]

def test_label_sql_updates_only_labels():
    s = LABEL_SQL.lower()
    assert s.strip().startswith("update data_lake.listing_week")
    assert "list_price" not in s

def test_merge_params_order_matches_placeholders():
    params = _merge_params(ROW)
    assert params[0] == "123 MAIN ST:33904"
    assert len(params) == MERGE_SQL.count("%s")
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `python -m pytest ingest/tests/pipelines/listing_week/test_db_sql.py -v`
Expected: FAIL — `ImportError` (db module missing)

- [ ] **Step 4: Implement the db layer**

```python
# ingest/pipelines/listing_week/db.py
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest ingest/tests/pipelines/listing_week/test_db_sql.py -v`
Expected: 4 passed

- [ ] **Step 6: Commit**

```bash
git add ingest/pipelines/listing_week/db.py docs/sql/20260719_listing_week.sql ingest/tests/pipelines/listing_week/test_db_sql.py
git commit -m "feat(listing-week): db layer (label-preserving merge) + idempotent migration SQL" -- ingest/pipelines/listing_week/db.py docs/sql/20260719_listing_week.sql ingest/tests/pipelines/listing_week/test_db_sql.py
```

---

### Task 3: CLI — weekly run, backfill, dry-run

**Files:**
- Create: `ingest/pipelines/listing_week/pipeline.py`
- Test: `ingest/tests/pipelines/listing_week/test_pipeline.py`

**Interfaces:**
- Consumes: Task 1 `week_start_of/build_week_rows/label_updates`; Task 2 `get_conn/load_sale_state/load_transitions/merge_week_rows/apply_label_updates`.
- Produces: `run(*, dry_run: bool = False, backfill_from: date | None = None, today: date | None = None, _io: dict | None = None) -> dict` returning `{"weeks": [...], "rows_merged": int, "labels_applied": int}`. CLI: `python -m ingest.pipelines.listing_week.pipeline [--dry-run] [--backfill-from YYYY-MM-DD]`.

- [ ] **Step 1: Write the failing tests**

```python
# ingest/tests/pipelines/listing_week/test_pipeline.py
"""Orchestration tests with injected I/O (no DB, no psycopg)."""
from datetime import date

from ingest.pipelines.listing_week.pipeline import run
from ingest.tests.pipelines.listing_week.test_builder import HISTORY, STATE_ROW

FAKE_IO = {"load_state": lambda: [STATE_ROW], "load_transitions": lambda: HISTORY,
           "merge": lambda rows: len(rows), "label": lambda ups: len(ups)}

def test_weekly_run_builds_last_completed_week_and_labels_prior():
    # today Mon 07/20 -> build week 07/13 (just completed), label week 07/06.
    out = run(dry_run=False, today=date(2026, 7, 20), _io=FAKE_IO)
    assert out["weeks"] == [date(2026, 7, 13)]
    assert out["rows_merged"] == 1
    assert out["labels_applied"] == 1          # 07/06 labels from 07/13 events

def test_backfill_walks_all_weeks():
    out = run(dry_run=False, today=date(2026, 7, 20),
              backfill_from=date(2026, 6, 29), _io=FAKE_IO)
    assert out["weeks"] == [date(2026, 6, 29), date(2026, 7, 6), date(2026, 7, 13)]
    assert out["rows_merged"] == 3

def test_dry_run_writes_nothing():
    writes = []
    io = dict(FAKE_IO, merge=lambda rows: writes.append(rows) or 0,
              label=lambda ups: writes.append(ups) or 0)
    run(dry_run=True, today=date(2026, 7, 20), _io=io)
    assert writes == []

def test_zero_rows_on_real_run_raises():
    io = dict(FAKE_IO, load_state=lambda: [], load_transitions=lambda: [])
    try:
        run(dry_run=False, today=date(2026, 7, 20), _io=io)
        raise AssertionError("should have raised")
    except SystemExit as e:
        assert e.code == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest ingest/tests/pipelines/listing_week/test_pipeline.py -v`
Expected: FAIL — `ImportError` (pipeline module missing)

- [ ] **Step 3: Implement the CLI**

```python
# ingest/pipelines/listing_week/pipeline.py
"""Weekly person-period panel builder for the sell-odds model (Phase 0).

Steady state (weekly cron, Monday): build rows for the just-completed week
(features frozen at its Sunday), then fill labels for the week before it from
the events the completed week revealed. Backfill replays every week from
--backfill-from (2026-06-29 = first Monday of tracker history) to now.

Run:
  python -m ingest.pipelines.listing_week.pipeline [--dry-run] [--backfill-from YYYY-MM-DD]
"""
from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta

from ingest.pipelines.listing_week.builder import (
    build_week_rows, label_updates, week_start_of,
)

TRACKER_EPOCH = date(2026, 6, 29)  # first Monday on/after tracker start 06/27/2026


def run(*, dry_run: bool = False, backfill_from: date | None = None,
        today: date | None = None, _io: dict | None = None) -> dict:
    today = today or date.today()
    last_completed = week_start_of(today) - timedelta(days=7)
    first = backfill_from or last_completed
    if first < TRACKER_EPOCH:
        first = TRACKER_EPOCH

    if _io is None:
        from ingest.pipelines.listing_week import db
        conn = db.get_conn()
        _io = {"load_state": lambda: db.load_sale_state(conn),
               "load_transitions": lambda: db.load_transitions(conn),
               "merge": lambda rows: db.merge_week_rows(conn, rows),
               "label": lambda ups: db.apply_label_updates(conn, ups)}

    state = _io["load_state"]()
    transitions = _io["load_transitions"]()

    weeks, rows_merged, labels_applied = [], 0, 0
    w = first
    while w <= last_completed:
        weeks.append(w)
        rows = build_week_rows(state, transitions, w)
        ups = label_updates(transitions, w - timedelta(days=7))
        print(f"[listing-week] {w}: {len(rows)} rows, {len(ups)} label fills"
              + (" (dry-run)" if dry_run else ""), flush=True)
        if not dry_run:
            rows_merged += _io["merge"](rows)
            labels_applied += _io["label"](ups)
        w += timedelta(days=7)

    if not dry_run and rows_merged == 0:
        print("[listing-week] FATAL: 0 rows merged on a real run — refusing to "
              "report success (empty listing_state/transitions read?)", flush=True)
        sys.exit(1)
    return {"weeks": weeks, "rows_merged": rows_merged,
            "labels_applied": labels_applied}


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--backfill-from", type=date.fromisoformat, default=None)
    a = p.parse_args()
    run(dry_run=a.dry_run, backfill_from=a.backfill_from)
```

- [ ] **Step 4: Run all listing_week tests**

Run: `python -m pytest ingest/tests/pipelines/listing_week/ -v`
Expected: 17 passed

- [ ] **Step 5: Commit**

```bash
git add ingest/pipelines/listing_week/pipeline.py ingest/tests/pipelines/listing_week/test_pipeline.py
git commit -m "feat(listing-week): CLI with weekly tick, backfill walk, dry-run, 0-row loud-fail" -- ingest/pipelines/listing_week/pipeline.py ingest/tests/pipelines/listing_week/test_pipeline.py
```

---

### Task 4: Apply migration + run the backfill + verify

**Files:**
- Modify: none (execution + verification task)

**Interfaces:**
- Consumes: Task 2 migration SQL, Task 3 CLI.
- Produces: live `data_lake.listing_week` populated 2026-06-29 → last completed week.

- [ ] **Step 1: Apply the migration** via the Supabase MCP `apply_migration` tool with the exact contents of `docs/sql/20260719_listing_week.sql` (migration name `listing_week`), or `bun -e` with `new Bun.SQL` if MCP is unavailable (psql is NOT installed).

- [ ] **Step 2: Dry-run first** (probe-before-ingest)

Run: `python -m ingest.pipelines.listing_week.pipeline --dry-run --backfill-from 2026-06-29`
Expected: one `[listing-week] <monday>: N rows` line per week, N in the tens of thousands (~33k sale-side actives), exit 0, no DB writes.

- [ ] **Step 3: Real backfill**

Run: `python -m ingest.pipelines.listing_week.pipeline --backfill-from 2026-06-29`
Expected: same lines, exit 0.

- [ ] **Step 4: Verify row counts and label censoring** (lake MCP or psycopg one-liner)

```sql
SELECT week_start, COUNT(*) AS rows,
       COUNT(sold_next_week) AS labeled,
       SUM(CASE WHEN sold_next_week THEN 1 ELSE 0 END) AS solds
FROM data_lake.listing_week GROUP BY week_start ORDER BY week_start;
```
Expected: every week except the LAST has `labeled > 0`; the last week has `labeled = 0` (censored); `solds` across labeled weeks roughly totals the sold transitions to date (195 as of 07/19/2026 — event-day dedupe means slight undercount is fine, mismatch >20% is not: stop and investigate before proceeding).

- [ ] **Step 5: Spot-check one trajectory** — pick one address_key with a price cut in `listing_transitions`; confirm its `listing_week` rows show the pre-cut price in earlier weeks, `cuts_to_date` incrementing, and `price_cut_next_week = TRUE` on the week before the cut.

- [ ] **Step 6: Commit nothing** — this task produces DB state only. Record outcome in the SESSION_LOG entry of Task 6.

---

### Task 5: Weekly GHA cron wrapper

**Files:**
- Create: `.github/workflows/listing-week-weekly.yml`

**Interfaces:**
- Consumes: Task 3 CLI.
- Produces: scheduled weekly run, Monday 08:00 UTC (after the nightly chain's listing sweep has landed Sunday's state).

- [ ] **Step 1: Write the workflow**

```yaml
name: listing-week-weekly

# Person-period panel for the sell-odds model (Phase 0) ->
# data_lake.listing_week. Builds the just-completed week's rows + fills the
# prior week's labels. Monday 08:00 UTC: the nightly chain finishes ~06:00, so
# Sunday's listing_state/transitions are landed. Derivation over our own lake —
# no external fetch, no LLM, no paid surface ($1-budget rule not applicable).
# Spec: docs/superpowers/specs/2026-07-19-sell-odds-model-design.md

on:
  schedule:
    - cron: "0 8 * * 1"
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Dry-run (build + print, no DB write)"
        type: boolean
        default: false
      backfill_from:
        description: "Rebuild all weeks from this Monday (YYYY-MM-DD, blank = last week only)"
        required: false
        default: ""

jobs:
  build:
    if: ${{ vars.ENGINE_ENABLED != 'false' || github.event_name == 'workflow_dispatch' }}
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      DATABASE_URL: ${{ secrets.DESTINATION__POSTGRES__CREDENTIALS }}
    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip

      - name: Install dependencies
        run: pip install -r ingest/requirements.txt

      - name: Build listing_week panel
        env:
          DRY_INPUT: ${{ inputs.dry_run }}
          BACKFILL_INPUT: ${{ inputs.backfill_from }}
        run: |
          ARGS=()
          if [ "$DRY_INPUT" = "true" ]; then ARGS+=(--dry-run); fi
          if [ -n "$BACKFILL_INPUT" ]; then ARGS+=(--backfill-from "$BACKFILL_INPUT"); fi
          python -m ingest.pipelines.listing_week.pipeline "${ARGS[@]}"

      - name: Healthchecks.io heartbeat
        if: always()
        run: |
          curl -fsS -m 10 --retry 3 \
            "https://hc-ping.com/${{ secrets.HEALTHCHECKS_PING_KEY }}/listing-week-weekly?create=1" || true
```

- [ ] **Step 2: Validate + dispatch a dry-run** (after this lands on main via the operator's push)

Run: `gh workflow run listing-week-weekly.yml --repo ethanrickyjrjr-wq/SWFL-Data-Gulf -f dry_run=true` then watch with `gh run watch`.
Expected: green; log shows per-week row counts, no writes. (Free run — no paid surface — but it still needs the workflow on main first; note this ordering for the operator.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/listing-week-weekly.yml
git commit -m "feat(listing-week): weekly GHA cron (Mon 08:00 UTC) + dry-run/backfill dispatch inputs" -- .github/workflows/listing-week-weekly.yml
```

---

### Task 6: Registry entry, data-roots row, spec correction, session log

**Files:**
- Modify: `ingest/cadence_registry.yaml` (new entry in the weekly lane)
- Modify: `docs/standards/data-roots.md` (new concept row)
- Modify: `docs/superpowers/specs/2026-07-19-sell-odds-model-design.md` (merge-key line)
- Modify: `SESSION_LOG.md` (entry before the operator-approved push)

**Interfaces:**
- Consumes: everything prior.
- Produces: the panel is discoverable (registry → /ops/census, data-roots → consumers) and the spec matches shipped reality.

- [ ] **Step 1: Add the cadence_registry entry** (weekly lane, beside the other tier-2 weekly entries; run `python -m pytest ingest/tests/test_cadence_registry_spine.py -v` after — expected PASS)

```yaml
  listing_week:
    # data_lake.listing_week — person-period training panel for the sell-odds
    # hazard model (spec 2026-07-19-sell-odds-model-design.md). Derivation over
    # listing_state + listing_transitions, no external fetch. CONSCIOUS brain-first
    # deviation: consumers are the Phase 1 cohort loader + Phase 2 training job
    # (operator-approved spec), not a brain — check sell_odds_model_live_verify.
    lane: tier-2
    cadence_days: 7
    tolerance_multiplier: 2.0
    freshness_table: data_lake.listing_week
    freshness_column: built_at
    expected_rows_min: 20000  # ~33k sale-side actives 07/19/2026; floor set conservative
    note: "Weekly person-period panel: one row per (address_key, sale_or_rent, week_start), features frozen as-of week-end, next-week outcome labels filled one week in arrears (last week always NULL-labeled = censored). Monday 08:00 UTC after the nightly chain. Pipeline: ingest/pipelines/listing_week/. Workflow: .github/workflows/listing-week-weekly.yml."
    source_scope:
      confirmed_total:
        summary: "address_key, sale_or_rent, week_start, listing_id, zip_code, county, property_type, beds, baths, sqft, lot_acres, listed_date, dom_days, state_at_week_end, list_price, cuts_to_date, cut_depth_pct_to_date, weeks_since_last_cut, relists_to_date, flag_foreclosure, flag_new_construction, sold_next_week, holding_next_week, price_cut_next_week — replayed from our own listing_state + listing_transitions"
        source: "our ingest (derivation)"
      source_ceiling:
        summary: "listing_state columns held but not snapshotted: city, subdivision, brokerage, street_address, photo_url, lat/lon, county_fips, mls_number/mls_name, listing_type, status, reduced_amount, flag_pending/contingent/coming_soon/new_listing, sold_check_at, list_suffix, first_seen/last_seen/scraped_at. Candidate later features (spec cross-link): homestead/SOH gap via parcel address-key join."
        source_url: "docs/superpowers/specs/2026-07-19-sell-odds-model-design.md"
        as_of: "07/19/2026"
```

- [ ] **Step 2: Add the data-roots row** — in the READ-THIS-FIRST table of `docs/standards/data-roots.md`, after the "Price cut — EVENT (per-listing)" row (matching its column format exactly):

```markdown
| **Listing outcomes — training panel (weekly)** | `listing_week` 🟡 (labels one week in arrears; last week censored) | no brain (feeds sell-odds model, spec 07/19) | never read as a served count — `listing_active_stats` is the active-count root |
```

- [ ] **Step 3: Correct the spec's merge-key line** — in `docs/superpowers/specs/2026-07-19-sell-odds-model-design.md`, replace `Idempotent merge on (listing_id, week_start).` with `Idempotent merge on (address_key, sale_or_rent, week_start) — the tracker's identity key; listing_id is a carried column, not the key (corrected from the draft during planning).`

- [ ] **Step 4: Run the full gate locally**

Run: `python -m pytest ingest/tests/pipelines/listing_week/ ingest/tests/test_cadence_registry_spine.py -v`
Expected: all passed.

- [ ] **Step 5: Append the SESSION_LOG entry** (top of file: what shipped — panel table, backfill result counts from Task 4, cron, registry/data-roots rows — and that `sell_odds_model_live_verify` stays open pending Phase 2 serve) and commit docs together:

```bash
git add ingest/cadence_registry.yaml docs/standards/data-roots.md docs/superpowers/specs/2026-07-19-sell-odds-model-design.md SESSION_LOG.md
git commit -m "docs(listing-week): cadence entry (full source_scope), data-roots row, spec merge-key correction, session log" -- ingest/cadence_registry.yaml docs/standards/data-roots.md docs/superpowers/specs/2026-07-19-sell-odds-model-design.md SESSION_LOG.md
```

- [ ] **Step 6: HOLD for the operator's push decision.** Do not push. Local main carries foreign commits (ask-before-bundling); the operator green-lights the bundle, then `node scripts/safe-push.mjs`.

---

## Out of scope for this plan (later phases, per spec)

Phase 1 cohort SQL + suppression, Phase 2 training job + coefficients JSON + serving math + display, Phase 3 seller-stress weight comparison. Each gets its own plan when its gate opens (Phase 1: ~8–12 weeks of labels; Phase 2: calibration gate).

## Self-review notes

- Spec coverage: Phase 0's five bullets (table, backfill, cron+dry-run, data-roots, registry w/ source_scope) map to Tasks 2/4, 1+3+4, 5, 6, 6. Merge-key spec drift handled in Task 6 Step 3.
- Labels survive feature re-merges (Task 2 `_UPDATE_COLS` exclusion + test) — the backfill can be re-run any time without erasing observed outcomes.
- `build_week_rows` reads static attrs (beds/sqft/type) from CURRENT listing_state — acceptable: these are stable listing attributes; price/state/DOM, the fields that genuinely move, are replayed from transitions. Documented in builder docstring.
- Rentals excluded at every layer (builder guard, db WHERE, tests).
