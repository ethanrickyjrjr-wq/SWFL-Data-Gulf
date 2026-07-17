# Back on Market read — Phase 2 (flicker-resistant relist detector) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — keywords: migration, schema, architecture

**Goal:** Stamp each relist event (a `holding → active` transition) with its TRUE off-market duration, so Phase 3's per-home read can separate a real relist-after-departure from same-week scan flicker — and never claim a relist it can't stand behind.

**Architecture:** The lifecycle diff engine (`transitions.py`) already holds the prior state row, whose `last_seen` is the frozen holding-entry date. When a holding listing reappears, compute `today − last_seen` and stamp it onto the transition as a new `days_off_market` column. Additive migration + one write-column + one branch in the pure diff. Forward-only (no retroactive backfill is possible — a holding row's `last_seen` is overwritten to today the moment it goes active).

**Tech Stack:** Python (dlt ingest island), `pytest`, Postgres (`data_lake.listing_transitions`), migration applied via `bun scripts/run-migration.ts`.

**Spec:** `docs/superpowers/specs/2026-07-17-back-on-market-read-design.md`
**Research (LOCAL/gitignored):** `docs/steadyapi-research/2026-07-17-back-on-market-surface-research.md` §6 (the lake probe that proved the flicker problem)
**Depends on:** Phase 1 (shipped). **Unblocks:** Phase 3 (per-home relist overlay).

## Global Constraints

- **Additive + idempotent migration only** (`ADD COLUMN IF NOT EXISTS`); `psql` is NOT installed — apply via `bun scripts/run-migration.ts`. After any DDL: `GRANT … TO service_role; NOTIFY pgrst, 'reload schema';`
- **The pure diff engine stays pure** — no DB, no I/O in `transitions.py`. It computes; `distill.py` writes.
- **No fabricated flow.** A relist we can't measure the duration of is not surfaced — never guessed. Forward-only: pre-existing `holding→active` rows keep `days_off_market = NULL` and simply don't qualify (Phase 3 filters `NOT NULL AND >= threshold`).
- **The relist threshold is a documented judgment floor, not a derived value** — default **≥ 7 days** off-market (clears same-week scan flicker; the persistence probe showed genuine departures cluster at 7–30 days, flicker at 0–2). Named constant, one place.
- **`$1` run-budget + daily-ceiling wiring is untouched** — this change fires zero new API calls (it reads `last_seen` already in `prior`).

## Scope note — what this plan does NOT include (deliberate)

The spec's Phase 2 also mentioned a ZIP relist-count column on `listing_transitions_recent_zip_stats` + a consuming-pack metric. **Deferred (YAGNI):** Lane 1's ZIP relist RATE is already published by `seller-stress-swfl` (`share_relisted_pct`, Redfin). A second, ZIP-grain relist rate from our own transitions would be *fresher* (2 days vs Redfin's ~4-month lag) but is a nice-to-have cross-check, not needed for the surface — and it carries the brain-first-gate cost. Pull it into a small Phase 2b only if the operator wants the fresher own-count surfaced. This plan ships the per-event detector, which is the piece Phase 3 actually requires.

---

### Task 1: Add the `days_off_market` column (migration + write-column)

**Files:**
- Create: `migrations/20260717_listing_transitions_days_off_market.sql`
- Modify: `ingest/pipelines/listing_lifecycle/distill.py:97-102` (`_TRANS_COLS`)
- Test: `ingest/tests/pipelines/listing_lifecycle/test_trans_cols.py`

**Interfaces:**
- Produces: a nullable `data_lake.listing_transitions.days_off_market integer` column, written by `append_transitions` (via `_TRANS_COLS`).

- [ ] **Step 1: Write the migration** (mirrors `20260701_listing_transitions_sold_capture.sql`)

```sql
-- migrations/20260717_listing_transitions_days_off_market.sql
-- Phase-2 (back-on-market read): stamp a relist event with its TRUE off-market duration.
--
-- A `holding → active` transition is a relist. Its `days_in_prev_state` is frozen at 0 (the diff
-- never re-upserts a still-absent holding, so days_in_state never ages), so the raw relist count is
-- contaminated by same-week scan flicker. This column carries `at − holding-entry last_seen` (days),
-- computed in transitions.diff_states, so Phase 3 can surface only relists after a real departure
-- (>= 7 days) and never a scan-gap flicker. NULL for every non-relist transition (and for relists
-- detected before this shipped — forward-only, no backfill: last_seen is overwritten on reappearance).
--
-- Additive + idempotent. Apply via: bun scripts/run-migration.ts migrations/20260717_listing_transitions_days_off_market.sql
ALTER TABLE data_lake.listing_transitions ADD COLUMN IF NOT EXISTS days_off_market integer;

GRANT SELECT, INSERT, UPDATE, DELETE ON data_lake.listing_transitions TO service_role;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Write the failing `_TRANS_COLS` test**

```python
# ingest/tests/pipelines/listing_lifecycle/test_trans_cols.py
from ingest.pipelines.listing_lifecycle import distill

def test_trans_cols_includes_days_off_market():
    # append_transitions writes exactly _TRANS_COLS; the new column must be listed or it is
    # silently dropped on every write (t.get() returns None and the column never populates).
    assert "days_off_market" in distill._TRANS_COLS
```

- [ ] **Step 3: Run it to verify it fails**

Run: `python -m pytest ingest/tests/pipelines/listing_lifecycle/test_trans_cols.py -v`
Expected: FAIL — `days_off_market` not in `_TRANS_COLS`.

- [ ] **Step 4: Add the column to `_TRANS_COLS`**

In `ingest/pipelines/listing_lifecycle/distill.py`, extend `_TRANS_COLS` (currently ends with `"sold_price", "sold_date"`):

```python
_TRANS_COLS = [
    "address_key", "sale_or_rent", "from_state", "to_state", "at", "listing_id",
    "price", "price_delta", "days_in_prev_state", "seed",
    # Sold-capture: the confirmed sale price + real close date (both NULL unless to_state='sold').
    "sold_price", "sold_date",
    # Relist detector (back-on-market Phase 2): true off-market duration on a holding->live
    # transition (at - holding-entry last_seen). NULL for every non-relist transition.
    "days_off_market",
]
```

- [ ] **Step 5: Run it to verify it passes**

Run: `python -m pytest ingest/tests/pipelines/listing_lifecycle/test_trans_cols.py -v`
Expected: PASS.

- [ ] **Step 6: Apply the migration**

Run: `bun scripts/run-migration.ts migrations/20260717_listing_transitions_days_off_market.sql`
Expected: column added; `NOTIFY pgrst` reloads the schema. Idempotent — safe to re-run.

- [ ] **Step 7: Commit**

```bash
git add migrations/20260717_listing_transitions_days_off_market.sql ingest/pipelines/listing_lifecycle/distill.py ingest/tests/pipelines/listing_lifecycle/test_trans_cols.py
git commit -m "feat(listing-lifecycle): add days_off_market column for relist detector"
```

---

### Task 2: Stamp the true off-market duration in the diff engine

**Files:**
- Modify: `ingest/pipelines/listing_lifecycle/transitions.py` (`_transition` signature + the state-change branch of `diff_states`, and a new `_days_off_market` helper)
- Test: `ingest/tests/pipelines/listing_lifecycle/test_relist_days_off_market.py`

**Interfaces:**
- Consumes: `diff_states(prior, scanned, today, scan_complete, is_seed)` (existing).
- Produces: each `holding → <live>` transition carries `days_off_market = (today − prev.last_seen).days`; every other transition carries `days_off_market = None`.

- [ ] **Step 1: Write the failing test**

```python
# ingest/tests/pipelines/listing_lifecycle/test_relist_days_off_market.py
from ingest.pipelines.listing_lifecycle.transitions import diff_states

def _relist(prior_last_seen: str):
    prior = {("123MAINST:33904", "sale"): {
        "state": "holding", "last_seen": prior_last_seen, "list_price": 300000, "days_in_state": 0}}
    scanned = {("123MAINST:33904", "sale"): {
        "state": "active", "list_price": 300000, "listing_id": "L1"}}
    _ups, trans = diff_states(prior, scanned, "2026-07-17", scan_complete=True, is_seed=False)
    return next(t for t in trans if t["from_state"] == "holding" and t["to_state"] == "active")

def test_real_relist_carries_true_off_market_duration():
    t = _relist("2026-07-07")  # 10 days off-market
    assert t["days_off_market"] == 10

def test_flicker_relist_reads_as_short():
    t = _relist("2026-07-16")  # 1 day — a scan-gap flicker, below the 7-day floor
    assert t["days_off_market"] == 1

def test_new_listing_has_no_off_market_duration():
    scanned = {("999OAKLN:34102", "sale"): {"state": "active", "list_price": 500000, "listing_id": "L2"}}
    _ups, trans = diff_states({}, scanned, "2026-07-17", scan_complete=True, is_seed=False)
    appeared = next(t for t in trans if t["from_state"] is None)
    assert appeared["days_off_market"] is None
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python -m pytest ingest/tests/pipelines/listing_lifecycle/test_relist_days_off_market.py -v`
Expected: FAIL — `KeyError: 'days_off_market'` (the transition dict has no such key yet).

- [ ] **Step 3: Add the `days_off_market` param to `_transition`**

In `transitions.py`, change `_transition` to accept and emit it (default `None` so the two other call sites need no change):

```python
def _transition(addr, sor, from_state, to_state, at, row, price, price_delta, days_in_prev_state, seed,
                days_off_market=None):
    return {
        "address_key": addr,
        "sale_or_rent": sor,
        "from_state": from_state,
        "to_state": to_state,
        "at": at,
        "listing_id": row.get("listing_id"),
        "price": price,
        "price_delta": price_delta,
        "days_in_prev_state": days_in_prev_state,
        "seed": seed,
        "days_off_market": days_off_market,
    }
```

- [ ] **Step 4: Add the `_days_off_market` helper**

In `transitions.py`, add this helper (place it just below the existing `_as_date`, which it reuses; both are module-level so `diff_states` resolves it at call time):

```python
# LIVE states a holding listing can reappear into — a relist. Mirrors _LIVE_STATES, minus the
# fact that the SteadyAPI feed labels a returned listing "active" (not "back_on_market").
_RELIST_TO = _LIVE_STATES

def _days_off_market(prev: dict[str, Any], today: str) -> int | None:
    """True off-market duration of a reappearing holding: today - the FROZEN holding-entry
    last_seen (days_in_state is frozen at 0 on a holding, so it can't measure this). None unless
    the prior state was 'holding' and both dates parse."""
    if prev.get("state") != HOLDING:
        return None
    entered = _as_date(prev.get("last_seen"))
    td = _as_date(today)
    if entered is None or td is None:
        return None
    return (td - entered).days
```

- [ ] **Step 5: Stamp it in the state-change branch of `diff_states`**

In `diff_states`, the STATE CHANGE branch currently reads:

```python
            else:
                # STATE CHANGE — the headline signal.
                delta = price - prev_price if (price is not None and prev_price is not None) else None
                upserts.append(_upsert(addr, sor, cur, state, days_in_state=0))
                transitions.append(
                    _transition(addr, sor, prev_state, state, today, cur,
                                price, delta, _to_int(prev.get("days_in_state")), is_seed)
                )
```

Change it to compute and pass `days_off_market` for a relist:

```python
            else:
                # STATE CHANGE — the headline signal.
                delta = price - prev_price if (price is not None and prev_price is not None) else None
                # RELIST: a holding listing reappearing into a live state carries its TRUE
                # off-market duration (today - frozen holding-entry last_seen), so a real
                # relist-after-departure can be told apart from same-week scan flicker.
                dom = _days_off_market(prev, today) if (prev_state == HOLDING and state in _RELIST_TO) else None
                upserts.append(_upsert(addr, sor, cur, state, days_in_state=0))
                transitions.append(
                    _transition(addr, sor, prev_state, state, today, cur,
                                price, delta, _to_int(prev.get("days_in_state")), is_seed,
                                days_off_market=dom)
                )
```

- [ ] **Step 6: Run it to verify it passes**

Run: `python -m pytest ingest/tests/pipelines/listing_lifecycle/test_relist_days_off_market.py -v`
Expected: PASS (3 tests).

- [ ] **Step 7: Run the existing lifecycle suite (no regressions)**

Run: `python -m pytest ingest/tests/pipelines/listing_lifecycle/ -v`
Expected: all existing transition tests still PASS (the new param defaults to None; other call sites unchanged).

- [ ] **Step 8: Commit**

```bash
git add ingest/pipelines/listing_lifecycle/transitions.py ingest/tests/pipelines/listing_lifecycle/test_relist_days_off_market.py
git commit -m "feat(listing-lifecycle): stamp true off-market duration on relist transitions"
```

---

### Task 3: Dry-run the pipeline (code path exercised, zero cost)

**Files:** none (verification only).

- [ ] **Step 1: Dry-run one county**

Run: `python -m ingest.pipelines.listing_lifecycle.pipeline --dry-run --county Collier`
Expected: completes without error; `[dry-run] would append N transitions` prints. No DB write, no paid API calls (dry-run gates both). This exercises `diff_states` → `_transition` with the new field on real data shapes.

- [ ] **Step 2: Confirm the column exists**

Run: `bun scripts/run-migration.ts migrations/20260717_listing_transitions_days_off_market.sql` (re-run — idempotent) OR a one-off `SELECT column_name FROM information_schema.columns WHERE table_schema='data_lake' AND table_name='listing_transitions' AND column_name='days_off_market';`
Expected: one row.

## Phase-2 exit

- [ ] `python -m pytest ingest/tests/pipelines/listing_lifecycle/ -v` all green.
- [ ] Migration applied; `days_off_market` present on `data_lake.listing_transitions`.
- [ ] SESSION_LOG entry before push.
- [ ] **Live-run note (operator):** `days_off_market` populates only on the NEXT authorized live sweep (paid SteadyAPI). Pre-existing relist rows stay NULL forever (last_seen was overwritten) — Phase 3 filters them out, so the read shows relist facts only for events detected from the first post-deploy live run onward. Honest by construction.

## Self-review

- **Spec coverage:** Phase 2's load-bearing requirement — a flicker-resistant relist signal with true off-market duration — is delivered (Tasks 1–2). The optional view-count + pack-metric is explicitly deferred with reasoning (scope note). ✓
- **Placeholder scan:** every step has real SQL/Python/commands. ✓
- **Type consistency:** `_transition`'s new `days_off_market` param and the `days_off_market` dict key / `_TRANS_COLS` entry / migration column name are identical across all three tasks; `_days_off_market` returns `int | None` matching an `integer` nullable column. ✓
