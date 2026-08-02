# PLAYBOOK — SteadyAPI raw-body landing + 17.9k DOM re-pull + typed families

**Status: READY TO EXECUTE. Operator decree 08/02/2026, verbatim:** "build this out correctly so
everyone can fucking find the fucking data and we get everything … i want a fucking playbook, i want
data root updated and I want everything we know about it listed so it is found and we can figure out
problems in a second, not a fucking month. set it all up and i will have sonnet run because it will
take HOURS."

This is the execution brief. A fresh session should be able to run Steps 1–5 top to bottom without
re-deriving anything. Every claim here has a named source. **The operator's go is already given** —
do not re-ask for permission to build; only the paid RUN (Step 2) confirms quota headroom first.

---

## 0. WHY (one paragraph, so you don't re-litigate it)

`extract_api.py` `fetch_sold_event()` ends `return classify_off_market(data, ...)` — **the raw
`/property-tax-history` body goes out of scope at that `return`** (line ~586). Every caller sees only
a small classification dict. 7+ audits (06/30 → 08/02) each re-found the same unread data and none
could ship it, because the fields are UNREACHABLE downstream of that line. The response carries **64
field paths; we persist 3** (`listed_date`, `sold_price`, `sold_date`), read-and-discard 3, never
touch 58 (39 genuinely distinct+useful). Full census: `_RESEARCH/data-and-ingest/2026-08-02-property-tax-history-full-scope.md`.
Root-cause narrative: `docs/superpowers/handoffs/2026-08-02-steadyapi-dom-full-scope-handoff.md`.
The fix is NOT "parse more fields" — it is **stop discarding the body**; then every future field is a
free SQL query against bytes already paid for.

## 0.1 EVERYTHING-WE-KNOW INDEX (find any SteadyAPI fact in one hop)

- **Vendor capability census (all 18 endpoints, quota, rate, ceilings, should-get ranking):**
  `docs/steadyapi-capability-census.md` — updated 08/02/2026.
- **The 64-field census of `/property-tax-history` (the endpoint this playbook lands):**
  `_RESEARCH/data-and-ingest/2026-08-02-property-tax-history-full-scope.md` (gitignored — Read by path).
- **Root cause + build-order handoff:** `docs/superpowers/handoffs/2026-08-02-steadyapi-dom-full-scope-handoff.md`.
- **Data roots (which table serves what):** `docs/standards/data-roots.md` — listing spine §SOURCES
  `listing_lifecycle`; raw landing root added 08/02 (🔴 until Step 1 ships).
- **Registry entry (cadence, floors, source_scope incl. the 4 unread families):**
  `ingest/cadence_registry.yaml` → `listing_lifecycle`.
- **Code:** `ingest/pipelines/listing_lifecycle/` — `extract_api.py` (fetch, line ~564), `distill.py`
  (`upsert_state` `_ENRICH_ONLY_COLS` line ~195), `backfill_listed_date.py` (the runner Sonnet executes).
- **Checks (live tracking):** `steadyapi_pth_raw_landing_before_backfill` (Step 1) ·
  `dom_backfill_repull_17k` (Step 2 — USE THIS, do not open a new one) ·
  `engine_enabled_kill_switch_owed` (operator-owed) · `should_i_sell_property_tax_source` (false
  premise, fixable at Step 3) · `permits_spine_thin_collier_missing` (served by Step 3).
- **Provenance rule (operator decree):** user-facing `source_tag`/citations say **"realtor.com"**,
  NEVER "SteadyAPI" (access layer). `docs/steadyapi-capability-census.md` header.

## 0.2 LIVE STATE (verified 08/02/2026, this session — re-verify before Step 2)

- `to_regclass('data_lake.steadyapi_property_history_raw')` → **NULL — table does not exist yet.**
- `listing_state` api_feed: **34,904 rows · 21,458 undated · 17,880 backfill-reachable**
  (active+sale, has property_id, has zip). 3,576 undated rows are out of scope by design (holding/
  sold/withdrawn/rentals — operator decision, not a bug).
- Crons: `Nightly Chain` + `ingest-listing-lifecycle` both `disabled_manually`. The Vercel cron
  `/api/cron/nightly-chain-dispatch` STILL fires nightly; only `ENGINE_ENABLED=false` (job-level
  `if:` in `listing-lifecycle-daily.yml:76`) holds against that path — **operator must set it**
  (classifier blocks the agent): `gh variable set ENGINE_ENABLED --body false --repo ethanrickyjrjr-wq/SWFL-Data-Gulf`.
- Quota: 50,000/mo, burn ~13–16k/mo. **No quota headers exist on responses — the vendor dashboard is
  the only authority. Confirm ≥20k headroom there before Step 2.**

---

## STEP 1 — kill the discard, land raw bodies (code, ~0 paid calls)

### 1a. Migration — `migrations/20260802_steadyapi_property_history_raw.sql`

```sql
CREATE TABLE IF NOT EXISTS data_lake.steadyapi_property_history_raw (
  property_id  text PRIMARY KEY,
  address_key  text,
  county       text,
  body         jsonb NOT NULL,
  fetched_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role;
NOTIFY pgrst, 'reload schema';
```

Idempotent. Run via `new Bun.SQL` (psql NOT installed), `sslmode=require`, creds `.dlt/secrets.toml`.
Verify: `SELECT to_regclass('data_lake.steadyapi_property_history_raw')` non-null. This is a COLD
LANDING table (provenance store, Operation-Dumbo-Drop pattern), not a served root — consuming packs
arrive in Step 3 per the operator-chosen build order (08/02 handoff §7). Register it in
`cadence_registry.yaml` as the second table of `listing_lifecycle`'s backfill lane in the same PR.

### 1b. Extractor — raw-returning sibling, zero behavior change for existing callers

In `extract_api.py`, refactor `fetch_sold_event` into:

```python
def fetch_sold_event_raw(property_id, *, since, at, key=None) -> tuple[dict, dict | None]:
    """Same fetch; returns (classification, raw_body). raw_body is None on any gap."""
    # ... identical fetch/guard chain; on success:
    return classify_off_market(data, since=since, at=at), data

def fetch_sold_event(property_id, *, since, at, key=None) -> dict:
    return fetch_sold_event_raw(property_id, since=since, at=at, key=key)[0]
```

All existing callers/tests unchanged. Gap paths return `({...gap...}, None)` — a failed call must
never land a body, and classification semantics must be byte-identical.

### 1c. Writer — `distill.insert_raw_bodies(rows)`

`INSERT ... ON CONFLICT (property_id) DO UPDATE SET body = EXCLUDED.body, address_key =
EXCLUDED.address_key, county = EXCLUDED.county, fetched_at = EXCLUDED.fetched_at`. Idempotent —
a re-probe refreshes, never duplicates. Own short-lived connection like `update_listed_date`.

### 1d. Backfill wiring — `backfill_listed_date.py`

In `run()`'s chunk loop: call `fetch_sold_event_raw`, keep passing classifications to `fold_updates`
(unchanged — it discards the body by design and stays pure), and separately collect
`(property_id, address_key, county, body)` for non-None bodies; write via `insert_raw_bodies` inside
the same `_write_with_retry`-style retry (raw insert failure must NOT abort the run or block the
`listed_date` write — log and continue; the row stays `listed_date IS NULL` only if THAT write failed).

### 1e. TDD (RULE 3.5 — write these failing FIRST, in `ingest/tests/pipelines/listing_lifecycle/`)

1. `fetch_sold_event_raw` returns `(classification, body)` on 200; `(gap, None)` on non-200/bad-body/no-key.
2. `fetch_sold_event` output byte-identical to pre-refactor for sold/holding/withdrawn/gap fixtures.
3. `insert_raw_bodies` upsert idempotency (two inserts, one row, second body wins).
4. Backfill chunk: raw-write failure → `listed_date` still written, run continues.
5. Existing suites stay green: `test_extract_api.py`, `test_pipeline_api.py`, `test_sold_capture.py`.

### FAILURE MODES → GUARDS (named before build, per RULE 3.5)

| Failure | Guard |
|---|---|
| Gap/error response lands as a body | 1b returns `None` on every gap path + test 1 |
| Behavior drift in sold classification | thin-wrapper refactor + byte-identical test 2 |
| Raw write failure kills a 5-hour run | 1d isolates raw insert in its own retry; never aborts |
| Duplicate rows on resume | PK `property_id` + ON CONFLICT DO UPDATE + test 3 |
| JSONB bloat | ~17.9k bodies × ~10–30 KB ≈ 200–500 MB — fine; it's the cheapest insurance we own. No TOAST tuning needed |
| New scalar later wiped by nightly sweep | **`_ENRICH_ONLY_COLS` trap (§STEP 4)** — the twice-fired gun |
| PostgREST can't see the table | GRANT + NOTIFY in the migration itself |

## STEP 2 — the paid run (~17,880 calls ≈ ~5h at the enforced ~1.05 s/call) ← the HOURS part

1. **Dashboard first:** confirm ≥20k monthly headroom (only authority). Confirm crons still disabled
   + `ENGINE_ENABLED=false` (operator-owed) so the nightly sweep can't race the run.
2. Dry-run: `python -m ingest.pipelines.listing_lifecycle.backfill_listed_date --dry-run`
   (expect ~17,880 targets).
3. Canary: `--limit 15` → verify BOTH writes: `listed_date` count rises AND
   `SELECT count(*) FROM data_lake.steadyapi_property_history_raw` ≈ probes.
4. Full run, chunked: `--limit 5000` repeatedly (idempotent/resumable — target query and UPDATE both
   filter `listed_date IS NULL`; `_write_with_retry` survives the pooler blip that killed the 07/18
   run at row ~18k). GHA is NOT the venue (15-min job timeout) — run in a local terminal.
5. Evidence to paste (RULE 0.8): final chunk log line + `undated_active_sale` before/after +
   raw-table count. Track under **`dom_backfill_repull_17k`** — close it with this evidence.
   Note: a probe with no 'Listed' event writes no `listed_date` but STILL lands its raw body —
   those rows stay in the target set and will be re-probed on any later pass (bounded re-spend;
   acceptable, they refresh the body).

## STEP 3 — typed tables from stored bytes (ZERO paid calls, NOT yet specced)

Parse `tax_history[]` (9-yr per-parcel tax+valuation, covers Collier where LEEPA doesn't),
`building_permits[]` (should-get #2 since 07/16; serves `permits_spine_thin_collier_missing`),
`property_history[]` (full event/price-cut history incl. `days_after_listed`, `source_name` MLS
board, `last_status_change_date`) out of the JSONB. One-to-many → own tables, NEVER onto
`listing_state`. **Brain-first gate: each table ships with its consuming `PackDefinition` in the
same PR. RULE 3.5 brainstorm + failure-modes + TDD owed per table.**
**Landmine:** `building_permits[].effective_date` = `"Mar 8, 2021"` (human string, NOT ISO — every
other date is ISO). Parse explicitly or it lands as garbage. Also fixes the false premise in check
`should_i_sell_property_tax_source` (`fetchPropertyTaxAnnual` stub — vendor annual tax ≠ county bill;
validate against a known parcel, caveat before serving).

## STEP 4 — scalars onto `listing_state` (`days_after_listed`, `last_status_change_date`, `source_name`)

**THE TWICE-FIRED GUN:** every `_STATE_COLS` column not in `distill.upsert_state._ENRICH_ONLY_COLS`
gets a blanket `EXCLUDED` overwrite on the nightly merge, and `/search` sets it `None` — wiped
`listed_date` (17,127 rows, 07/19) and `baths` (34,139 rows, 07/26). **Any new scalar goes into
`_ENRICH_ONLY_COLS` in the SAME commit, with a test.** Never write `listing_state.days_on_market`
(0% populated, DELETE-marked; the root is the `listing_dom` view).

## STEP 5 — re-enable (operator or agent-with-approval)

`gh variable set ENGINE_ENABLED --body true` → `gh workflow enable ingest-listing-lifecycle` →
`gh workflow enable nightly-chain.yml`. Do not leave the kill switch off silently (freshness stops).

---

## RULES THAT BIND THIS WORK

Provenance = "realtor.com", never "SteadyAPI" · Gate 4: no destructive write without non-null guard ·
SESSION_LOG entry before any push, `node scripts/safe-push.mjs`, explicit paths only · every
unfinished part opens/keeps a check same session (RULE 0.8) · pacing stays ~1 req/s
(`_MIN_INTERVAL_S = 1.05`) — the 15 req/s docs claim is UNVERIFIED on our account.
