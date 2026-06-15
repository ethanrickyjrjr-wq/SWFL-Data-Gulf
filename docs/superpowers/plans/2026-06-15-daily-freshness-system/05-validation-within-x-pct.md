# 05 — Validation: within X% of the vendor anchor (Wave 3)

> Build file for the Daily Freshness System. **Read `README.md` §2 (the second "is it right?" check), §7.1 (the X% default).** This is the "we don't knowingly ship a bad number" backstop: when the **authoritative vendor** number lands, grade the days the engine guessed it against the truth. Within tolerance → CONFIRMED (board green). Outside → FLAG (board red + a `checks` entry).

**Model:** Opus · **Repo:** brain-platform · **Wave:** 3 · **Depends:** 01, 04, and a vendor pipeline landing (Redfin county tracker is monthly).

**Goal:** `validate_daily_truth.py` compares each search-mode metric's `daily_truth` values for a period to the vendor anchor for that period; within `tolerance_pct` → CONFIRMED, else FLAG + `scripts/check.mjs open`.

---

## §0 facts to honor

- **Checks ledger CLI** (`scripts/check.mjs`, verified): `open <project> <check_key> "<label>" [--detail "…"] [--due YYYY-MM-DD]`, `close <key|id> [note] [--drop]`, `list`, `update`. Creds from `.dlt/secrets.toml`. `open` is create-only and **fails loud (exit 1) if the key already exists** — so generate a deterministic, idempotent `check_key` (re-flagging the same period must not crash).
- **Vendor anchors** (verified): `data_lake.redfin_lee_market` / `redfin_collier_market` — dlt merge, cols `property_type` (PK, filter `'All Residential'`), `median_sale_price`, `period_end` (county-grain). Lee tracker covers Cape Coral + Fort Myers; Collier covers Naples.
- **`api`-mode metrics need no validation:** for mortgage, FRED *is* the authority — there is nothing more authoritative to grade it against. Validation runs only for `fetch_mode: search` metrics that declare a non-null `vendor_anchor_table`.
- **`checks` is prod evidence** (memory): only open/close on the runtime signal (the actual comparison), never on "the code looks right."

---

## Files

- **Create:** `ingest/scripts/validate_daily_truth.py` — the comparator + flag/confirm.
- **Create:** `ingest/scripts/tests/test_validate_daily_truth.py`.
- **Create/Modify:** a GHA step — add a "validate" job to each vendor anchor's existing workflow (e.g. `redfin-monthly.yml`) that runs `validate_daily_truth.py` **after** the vendor merge lands, OR a standalone `validate-daily-truth.yml` that triggers on `workflow_run: { workflows: ["<vendor workflow>"], types: [completed] }`.

---

## Task 1 — The comparator (TDD)

- [ ] **Step 1.1: Write failing tests** (`ingest/scripts/tests/test_validate_daily_truth.py`):

```python
from ingest.scripts import validate_daily_truth as V

def test_within_tolerance_confirms():
    r = V.grade(daily_value=362000, vendor_value=360000, tolerance_pct=10)
    assert r.status == "CONFIRMED" and abs(r.delta_pct) < 1

def test_outside_tolerance_flags():
    r = V.grade(daily_value=410000, vendor_value=360000, tolerance_pct=10)
    assert r.status == "FLAG" and r.delta_pct > 10

def test_check_key_is_deterministic_and_idempotent():
    k1 = V.check_key("median_sale_price", "naples", "2026-05-31")
    k2 = V.check_key("median_sale_price", "naples", "2026-05-31")
    assert k1 == k2 and k1.startswith("daily_truth_validate_")

def test_area_maps_to_anchor():
    assert V.anchor_for("cape_coral") == ("data_lake.redfin_lee_market", "Lee County, FL")
    assert V.anchor_for("fort_myers") == ("data_lake.redfin_lee_market", "Lee County, FL")
    assert V.anchor_for("naples")     == ("data_lake.redfin_collier_market", "Collier County, FL")

def test_api_mode_metric_is_skipped():
    assert V.needs_validation({"fetch_mode": "api"}) is False
    assert V.needs_validation({"fetch_mode": "search", "vendor_anchor_table": "data_lake.redfin_lee_market"}) is True
```

- [ ] **Step 1.2: Run — expect fail.** (`pytest ingest/scripts/tests/test_validate_daily_truth.py -x`).

- [ ] **Step 1.3: Implement `validate_daily_truth.py`:**

```python
"""Grade landed daily_truth values against the vendor anchor for the same period."""
from dataclasses import dataclass
import subprocess, psycopg, yaml
from ingest.scripts.migrate_nfip_flood_zone_current import _uri

AREA_ANCHOR = {  # search-mode city areas → (anchor table, vendor region)
  "cape_coral": ("data_lake.redfin_lee_market", "Lee County, FL"),
  "fort_myers": ("data_lake.redfin_lee_market", "Lee County, FL"),
  "naples":     ("data_lake.redfin_collier_market", "Collier County, FL"),
}

@dataclass
class Grade: status: str; delta_pct: float

def grade(daily_value, vendor_value, tolerance_pct) -> Grade:
    if vendor_value in (None, 0): return Grade("SKIP", 0.0)
    delta = (daily_value - vendor_value) / vendor_value * 100.0
    return Grade("CONFIRMED" if abs(delta) <= tolerance_pct else "FLAG", delta)

def anchor_for(area): return AREA_ANCHOR[area]
def needs_validation(cfg): return cfg.get("fetch_mode") == "search" and bool(cfg.get("vendor_anchor_table"))
def check_key(metric_key, area, period): return f"daily_truth_validate_{metric_key}_{area}_{period}"

def flag(metric_key, area, period, delta_pct, daily_value, vendor_value):
    key = check_key(metric_key, area, period)
    label = f"daily_truth {metric_key}/{area} {period} off vendor by {delta_pct:.1f}%"
    detail = f"engine={daily_value}, vendor={vendor_value}, period={period}"
    # idempotent: `open` fails-loud if key exists → update instead of crash
    p = subprocess.run(["node", "scripts/check.mjs", "open", "freshness", key, label,
                        "--detail", detail], capture_output=True, text=True)
    if p.returncode != 0 and "exists" in (p.stdout + p.stderr).lower():
        subprocess.run(["node", "scripts/check.mjs", "update", key, "--detail", detail], check=True)

def confirm(metric_key, area, period):
    # close any prior FLAG for this period (the engine got it right this round)
    subprocess.run(["node", "scripts/check.mjs", "close", check_key(metric_key, area, period),
                    "within tolerance after vendor landed", "--drop"], check=False)
```

The runner: for each `search`-mode metric with an anchor, for each `area`, read the vendor `median_sale_price` for the latest `period_end` (filter `property_type='All Residential'`, `region = AREA_ANCHOR[area][1]`), read the matching `daily_truth` value(s) for that period, `grade()` with the metric's `tolerance_pct`, then `flag()` or `confirm()` and write a status row the board reads (write a `validation_status` column on `daily_truth` or a small `daily_truth_validation` table — keep it queryable by file 06).

- [ ] **Step 1.4: Run tests — expect pass.**

---

## Task 2 — Wire it to fire when the vendor lands

- [ ] **Step 2.1:** Add a `validate-daily-truth.yml` triggered on `workflow_run` completion of the vendor anchor workflows (`redfin-monthly.yml`), `permissions: contents: read` + checks creds in env, running `python -m ingest.scripts.validate_daily_truth`.

- [ ] **Step 2.2: Dry-run against the last landed Redfin period** to prove the loop:

```bash
python -m ingest.scripts.validate_daily_truth --dry-run
# Expected: per (metric, area) a CONFIRMED/FLAG line with delta_pct vs the Redfin county median. No checks written under --dry-run.
node scripts/check.mjs list   # after a live run: a FLAG opened a check; a CONFIRMED left none
```

- [ ] **Step 2.3: Commit** (`git add ingest/scripts/validate_daily_truth.py ingest/scripts/tests/ .github/workflows/validate-daily-truth.yml`).

---

## Definition of Done

- When the Redfin county tracker lands, `validate_daily_truth.py` grades each search-mode metric/area for that period; within `tolerance_pct` → CONFIRMED, outside → a `checks` entry opens (idempotent `check_key`, no crash on re-flag).
- `api`-mode metrics (mortgage) are skipped (FRED is the authority).
- The board can read each metric's latest validation delta + status.
- **Board row:** `05-validation` GREEN — the within-X% backstop runs on vendor landing; a deliberately-wrong test value opens a red flag.
