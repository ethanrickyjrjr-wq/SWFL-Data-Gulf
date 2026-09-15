# Master-Brain Backend Week — Implementation Plan (09/15 → 09/19/2026)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. One task per session is fine. Every task ends with a commit; per global rule 8 (09/06/2026, "claude pushes") each landed task is pushed with `node scripts/safe-push.mjs` after a SESSION_LOG entry.

**Goal:** The master brain rebuilds nightly again on whatever data landed, the known-cause pipeline failures are fixed at their root, and the Fedora box has everything pre-wired so Ricky's one SSH session is the only remaining step.

**Architecture:** Nothing new is built. The nightly chain stops treating one listing dataset as a gate for 77 others (Ricky's 09/15 "lake first" decision). Each broken pipeline gets the smallest root-cause fix plus one runnable check. Fedora reuses the `swfl-local` label already in code. Data-ceiling pulls come last and only from sources already catalogued.

**Tech Stack:** GitHub Actions YAML · Python 3.12 (dlt, DuckDB, requests, psycopg) · pytest under `ingest/tests/` · `gh` CLI · Bun.SQL for migrations (psql is not installed).

**Spec:** `_ASSISTANT/2026-09-15-fable-pipeline-plan-brief.md` (the verified census this plan argues from) + `wiki/pipeline-health.md` Decisions 09/15/2026.

## Global Constraints

- **NO Anthropic credit top-up, ever** (CLAUDE.md RULE 3 C2b). A leg that 400s `credit balance is too low` is PARKED. Never write "add credit" into a fix text, a prescription, an issue, or a reply.
- **SteadyAPI is OUT** (Ricky: "Forget the steady api!!!!"). No task may add a SteadyAPI call.
- **No new tools/deps through 09/18/2026** (NORTH STAR #5). `requests`, `urllib3.Retry`, `pytest` are already installed; nothing else gets added.
- **Ask-first list (do NOT execute, hand to Ricky):** Dependabot `next` bump, GitHub ruleset bypass changes, repo visibility, `brains/` submodule, anything touching live `/api/mcp` or `/api/b/*`, any `data_lake.*` DROP.
- **Every task:** read `ingest/CLAUDE.md` before editing under `ingest/`; use `--dry-run` before any live run; never `git add -A`; SESSION_LOG entry before push; open/close the named `checks` key in the same push (`node scripts/check.mjs`).
- **Verification is pasted output**, never a sentence (RULE 0.8). `gh run view <id> --log-failed` or the pytest line is the evidence.
- Canonical repo for `gh` label queries: `ethanrickyjrjr-wq/SWFL-Data-Gulf` (the old name returns empty for `--label`).

## Order and model routing

| Day | Tasks | Model | Why |
|---|---|---|---|
| Tue 09/15 | A0 → A1 → A2 → A3 | Opus | Chain + doctor changes have blast radius across 77 datasets |
| Wed 09/16 | A4, B1, B2, B3 | Sonnet | Bounded, each one file + one test |
| Thu 09/17 | B4, B5, C1, C2 | Sonnet | Bounded; C tasks are pre-wiring only |
| Fri 09/18 | D1, D2 | Opus | Guard design; touches a cloud routine |
| Sat 09/19 | E1 (only if A+B are green) | Opus | New data, ingest-pipeline playbook |

Nothing in workstream E starts while any A or B task is red. Data that arrives into a stalled rebuild is invisible.

---

## Workstream A — the master brain rebuilds again

### Task A0: Prove the rebuild leg itself runs (15 min, no code)

The chain blocks the rebuild behind `gate · assert_landed`. Before changing the chain, prove the rebuild job is green when dispatched directly. `daily-rebuild.yml` carries `ANTHROPIC_API_KEY` (line 122) and runs `bun refinery/cli.mts master --resilient` (line 148); whether `--resilient` absorbs a credit 400 is unknown until observed.

**Files:** none modified.

- [ ] **Step 1: Dispatch the rebuild directly**

```bash
gh workflow run daily-rebuild.yml --repo ethanrickyjrjr-wq/SWFL-Data-Gulf -f pack_id=master -f force=true
sleep 60
gh run list --repo ethanrickyjrjr-wq/SWFL-Data-Gulf --workflow daily-rebuild.yml --limit 1 --json databaseId,status,conclusion,url
```

- [ ] **Step 2: Wait for completion and read the result**

```bash
id=$(gh run list --repo ethanrickyjrjr-wq/SWFL-Data-Gulf --workflow daily-rebuild.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch $id --repo ethanrickyjrjr-wq/SWFL-Data-Gulf --exit-status; echo "exit=$?"
gh run view $id --repo ethanrickyjrjr-wq/SWFL-Data-Gulf --log-failed | tail -60
```

- [ ] **Step 3: Branch on the outcome**

GREEN and `brains/master.md` `refined_at` moved to today → proceed to A1 (the chain gate was the only blocker).

RED on `credit balance is too low` → the rebuild leg makes an unattended LLM call. Do NOT fund it. Open a check and stop this workstream at A1 still (A1 is still correct), then hand Ricky the line: "the rebuild itself needs a live model call; the deterministic path (`agentsAreMocked()` when the key is absent, `refinery/agents/anthropic.mts:15-17`) is the C2b-compliant option this week. Removing `ANTHROPIC_API_KEY` from `daily-rebuild.yml` makes the rebuild run mock-mode nightly; decide." The Max-seat route (`_RESEARCH/agent-behavior/2026-09-15-max-subscription-vs-api-key-for-pipeline-calls-evaluation.md`, verdict flipped to ADOPT-SEQUENCED per `_ASSISTANT/SCRATCHPAD.md` 09/15) is the durable answer but sits behind the 09/18 freeze and needs its own plan; do not start it inside this one.

```bash
node scripts/check.mjs open brain-platform rebuild_leg_needs_llm_call "daily-rebuild.yml 400s on credit; mock-mode nightly is the C2b option — Ricky decides" --class defect
```

RED on anything else → paste the failing step and fix it before A1 (it is the actual blocker).

- [ ] **Step 4: Record**

Paste the `gh run view` tail and the `refined_at` line from `brains/master.md` into the SESSION_LOG entry.

### Task A1: Rebuild on whatever landed — row gate becomes advisory for the rebuild

Ricky, 09/15/2026: "Stop gating the whole nightly rebuild on one dataset of 77 — rebuild on whatever landed, carry a per-dataset freshness caveat, let the doctor keep only the listing leg red on its own." The per-dataset caveat already exists (`brains/_ingest-freshness.json` written by `rebuild_due.py`, consumed by `caveatIsFresh`). The only change is that the rebuild job no longer requires the gate job to succeed.

**Files:**
- Modify: `.github/workflows/nightly-chain.yml` (job `rebuild`, currently `needs: [row-gate]` / `if: ${{ inputs.dry_run != true }}`)
- Test: `.github/scripts/workflow-step-shape.test.mjs` already parses every workflow; run it.

- [ ] **Step 1: Edit the `rebuild` job**

Replace the `rebuild` job header with:

```yaml
  # ── T3: rebuild ───────────────────────────────────────────────────────────
  # LAKE FIRST (Ricky 09/15/2026): the row gate still RUNS and still reds this
  # chain when a nightly source misses, but it no longer blocks the rebuild —
  # one stale dataset of 77 must not freeze the master brain (34 days stale on
  # 09/15). The rebuild carries per-dataset caveats via brains/_ingest-freshness.json.
  # ponytail: always() here means a genuinely broken ingest still rebuilds on
  # yesterday's rows for THAT dataset; the caveat is the guard, not the gate.
  rebuild:
    name: rebuild · brains
    needs: [guard, row-gate]
    if: always() && needs.guard.outputs.should_run == 'true' && inputs.dry_run != true
    uses: ./.github/workflows/daily-rebuild.yml
    secrets: inherit
```

- [ ] **Step 2: Run the workflow-shape test**

```bash
node --test .github/scripts/workflow-step-shape.test.mjs
```
Expected: all passing (this test rejects illegal keys and bad `uses:` paths; `always()` on a calling job is legal).

- [ ] **Step 3: Update the chain's own header comment**

In the `# ── T2: the row gate` block, append one line: `# 09/15/2026: the gate reds the chain but NO LONGER blocks `rebuild` — see T3.`

- [ ] **Step 4: Dispatch a real chain run and prove the rebuild fired despite a red gate**

```bash
gh workflow run nightly-chain.yml --repo ethanrickyjrjr-wq/SWFL-Data-Gulf
sleep 90
id=$(gh run list --repo ethanrickyjrjr-wq/SWFL-Data-Gulf --workflow nightly-chain.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch $id --repo ethanrickyjrjr-wq/SWFL-Data-Gulf; gh run view $id --repo ethanrickyjrjr-wq/SWFL-Data-Gulf --json jobs -q '.jobs[] | "\(.name)\t\(.conclusion)"'
```
Expected: `gate · assert_landed  failure` (listing still 0 rows until A2) AND `rebuild · brains  success`.

- [ ] **Step 5: Commit + check**

```bash
node scripts/check.mjs close nightly_chain_external_clock "superseded: rebuild no longer gated; see A1" --evidence "job list from Step 4 pasted in SESSION_LOG" 2>/dev/null || true
git add .github/workflows/nightly-chain.yml
git commit -m "fix(nightly-chain): rebuild runs on whatever landed; row gate is advisory (Ricky 09/15 lake-first)"
```

### Task A2: Listing spine back to `--source scrape`

`listing-lifecycle-daily.yml`'s run step passes no `--source`, and `pipeline.py:361` defaults to `api` (SteadyAPI). The scrape path (`extract.py`, host from `LISTING_LIFECYCLE_BASE_URL`) ran clean from GitHub runners on 07/01/2026 (Lee 21,889 rows, Collier 8,120, zero 403s). Lost on revert: days-on-market and sold events from the SteadyAPI tax probe; Lee sold median already comes from LeePA deeds and Collier's from Redfin county monthly. Reuse terms for scraping the brokerage site are unrecorded anywhere in the repo; Ricky already decided the revert, so note it once in the SESSION_LOG and proceed.

**Files:**
- Modify: `.github/workflows/listing-lifecycle-daily.yml` (the `Run listing-lifecycle pipeline` step, ~line 118)

- [ ] **Step 1: Dry-run one county on the scrape path from a GitHub runner FIRST**

```bash
gh workflow run listing-lifecycle-daily.yml --repo ethanrickyjrjr-wq/SWFL-Data-Gulf -f county=Collier -f dry_run=true
```
This still uses the `api` default until Step 2 lands, so it proves nothing about scrape. Skip to Step 2 and dispatch after the edit; the dry-run line above is here so nobody dispatches a paid `api` run by accident.

- [ ] **Step 2: Add the flag**

In the run step, change:
```bash
          python -m ingest.pipelines.listing_lifecycle.pipeline "${ARGS[@]}"
```
to:
```bash
          # SPINE REVERT 09/15/2026 (Ricky: "Forget the steady api"): crawl4ai Source-B walk.
          # Proven clean from GitHub runner IPs 07/01/2026 (runs 28495956344 / 28496497637).
          python -m ingest.pipelines.listing_lifecycle.pipeline --source scrape "${ARGS[@]}"
```
Also update the file's header comment: replace `SPINE CUTOVER 2026-06-30: pipeline.py now defaults to --source api` with a one-line `SPINE REVERT 2026-09-15: --source scrape (SteadyAPI retired on operator word; api code stays inert).`

- [ ] **Step 3: Commit, push, then dispatch the dry run on the new code**

```bash
git add .github/workflows/listing-lifecycle-daily.yml
git commit -m "fix(listing-lifecycle): revert spine to --source scrape (SteadyAPI out, Ricky 09/15)"
# SESSION_LOG entry, then: node scripts/safe-push.mjs
gh workflow run listing-lifecycle-daily.yml --repo ethanrickyjrjr-wq/SWFL-Data-Gulf -f county=Collier -f dry_run=true
```
Expected in the log: `[done] {... 'scanned': N ...} dry_run=True source=scrape` with N in the thousands and no `[fatal] every county returned 0 rows`.

- [ ] **Step 4: If the dry run scanned rows, let the chain run tonight**

Tomorrow morning:
```bash
gh run list --repo ethanrickyjrjr-wq/SWFL-Data-Gulf --workflow nightly-chain.yml --limit 1 --json databaseId -q '.[0].databaseId' | xargs -I{} gh run view {} --repo ethanrickyjrjr-wq/SWFL-Data-Gulf --json jobs -q '.jobs[] | "\(.name)\t\(.conclusion)"'
```
Expected: all three `ingest · listing lifecycle (County)` legs success, `gate · assert_landed` success for `listing_lifecycle` (city_pulse stays red until its leg is redesigned; that is parked, see Global Constraints).

- [ ] **Step 5: If the dry run 403'd** — the WAF changed since 07/01. Do not add a proxy. Record the exact status line in the SESSION_LOG, open `listing_scrape_waf_blocked_from_gha`, and move this pipeline onto the Fedora list (C2).

### Task A3: Freshness doctor — false NEVER_LANDED on `count_table`-only entries

`ingest/scripts/check_freshness.py::_fetch_max_freshness` (lines 241–292) has two paths: `freshness_table`, else `entry["dlt_schema_name"]`. `leepa_comp_sales` (registry line 865) deliberately has neither (its dlt schema name is `leepa_comp_t2_<random>` at runtime) and carries only `count_table: data_lake.leepa_comparable_sales`. The `KeyError` is swallowed by `except Exception` → `None` → `MISSING` → `NEVER_LANDED`, on a table with 108,848 live rows. Same shape on `neighborhood_stats` and `collier_official_records` (the latter shows as `GAP_SENTINEL` today for the same missing-freshness reason).

**Files:**
- Modify: `ingest/scripts/check_freshness.py:241-292`
- Modify: `ingest/cadence_registry.yaml` (the three entries: add `freshness_column:`)
- Test: `ingest/tests/scripts/test_check_freshness.py`

- [ ] **Step 1: Find the real timestamp column on each of the 3 tables (do not guess)**

```bash
bun -e '
const sql = new Bun.SQL(process.env.DESTINATION__POSTGRES__CREDENTIALS, {ssl:"require"});
for (const t of ["leepa_comparable_sales","neighborhood_stats","collier_official_records"]) {
  const rows = await sql`select column_name, data_type from information_schema.columns where table_schema=${"data_lake"} and table_name=${t} and (data_type like ${"timestamp%"} or column_name in (${"_dlt_load_id"},${"inserted_at"},${"ingested_at"},${"scraped_at"},${"fetched_at"})) order by 1`;
  console.log(t, rows);
}
await sql.end();'
```
Pick, per table, the column that means "row landed at". If only `_dlt_load_id` exists, the value is a unix-epoch string: use it with `to_timestamp(max(_dlt_load_id)::double precision)`; the code below handles that case.

- [ ] **Step 2: Write the failing test**

Append to `ingest/tests/scripts/test_check_freshness.py`:

```python
from datetime import date

from ingest.scripts import check_freshness as cf


class _Cur:
    def __init__(self, row):
        self.row = row
        self.executed = []
    def __enter__(self):
        return self
    def __exit__(self, *a):
        return False
    def execute(self, q, params=None):
        self.executed.append((str(q), params))
    def fetchone(self):
        return self.row


class _Conn:
    def __init__(self, row):
        self.cur = _Cur(row)
    def cursor(self):
        return self.cur
    def rollback(self):
        pass


def test_count_table_only_entry_reads_freshness_from_count_table():
    """leepa_comp_sales shape: no freshness_table, no dlt_schema_name, count_table only.
    Before the fix this raised KeyError inside the try, returned None, and doctor said
    NEVER_LANDED on a 108k-row table (09/15/2026)."""
    entry = {
        "name": "leepa_comp_sales",
        "count_table": "data_lake.leepa_comparable_sales",
        "freshness_column": "_dlt_load_id",
    }
    conn = _Conn(row=(date(2026, 7, 22),))
    assert cf._fetch_max_freshness(conn, entry) == date(2026, 7, 22)
    q = conn.cur.executed[0][0]
    assert "leepa_comparable_sales" in q and "_dlt_loads" not in q


def test_entry_with_no_table_reference_returns_none_not_raise():
    assert cf._fetch_max_freshness(_Conn(row=None), {"name": "x"}) is None
```

- [ ] **Step 3: Run it, expect failure**

```bash
cd ingest && ../ingest/.venv/Scripts/python -m pytest tests/scripts/test_check_freshness.py -k count_table_only -v
```
Expected: FAIL (returns `None`, not the date).

- [ ] **Step 4: Fix `_fetch_max_freshness`**

Replace the `else:` branch (the `dlt_schema_name` lookup) with:

```python
            elif "dlt_schema_name" in entry:
                schema_name = entry["dlt_schema_name"]
                cur.execute(
                    "SELECT MAX(inserted_at) FROM data_lake._dlt_loads"
                    " WHERE schema_name = %s AND status = 0",
                    (schema_name,),
                )
            elif "count_table" in entry:
                # count_table-only entries (dlt schema name is runtime-random, e.g.
                # leepa_comp_sales) — read freshness straight off the counted table.
                # 09/15/2026: three real tables read NEVER_LANDED for lack of this branch.
                freshness_col = entry.get("freshness_column", "inserted_at")
                schema, table = entry["count_table"].split(".", 1)
                if freshness_col == "_dlt_load_id":
                    expr = pgsql.SQL("to_timestamp(MAX({})::double precision)").format(
                        pgsql.Identifier(freshness_col)
                    )
                else:
                    expr = pgsql.SQL("MAX({})").format(pgsql.Identifier(freshness_col))
                cur.execute(
                    pgsql.SQL("SELECT {} FROM {}.{}").format(
                        expr, pgsql.Identifier(schema), pgsql.Identifier(table)
                    )
                )
            else:
                return None
```

- [ ] **Step 5: Add `freshness_column:` to the three registry entries** with the column found in Step 1, one line each, directly under `count_table:`.

- [ ] **Step 6: Run the full freshness test file, then the live probe dry-run**

```bash
cd ingest && ./.venv/Scripts/python -m pytest tests/scripts/test_check_freshness.py tests/scripts/test_doctor.py -q
cd .. && ingest/.venv/Scripts/python -m ingest.scripts.check_freshness --dry-run | rg "leepa_comp_sales|neighborhood_stats|collier_official_records"
```
Expected: all tests pass; the three lines read FRESH or STALE with a real date, never MISSING.

- [ ] **Step 7: Commit**

```bash
git add ingest/scripts/check_freshness.py ingest/cadence_registry.yaml ingest/tests/scripts/test_check_freshness.py
git commit -m "fix(doctor): count_table-only entries read freshness off the counted table (3 false NEVER_LANDED)"
```

### Task A4: Classify the credit wall as BILLING — and say PARKED, never "add credit"

Today a `400 credit balance is too low` reads as TRANSIENT (retry up to 2x) on five city-pulse lines. It is not transient and it must not be retried. Add `BILLING` to the prescription enum; `should_retry=False`; fix text names the C2b rule.

**Files:**
- Modify: `ingest/lib/prescriptions.py` (enum + `_FIX_TEMPLATES` + `DOCTOR_ASSIGNABLE`)
- Modify: `ingest/scripts/doctor.py` (the `prescribe` chain near lines 259–289: detect the literal in the failed run's log excerpt, which `gh_runs` already fetches for TRANSIENT decisions — read `ingest/lib/gh_runs.py` first to find the field that carries log text)
- Test: `ingest/tests/lib/test_prescriptions.py`, `ingest/tests/scripts/test_doctor.py`

- [ ] **Step 1: Failing tests**

```python
# ingest/tests/lib/test_prescriptions.py
def test_billing_is_not_retryable_and_never_says_add_credit():
    from ingest.lib import prescriptions as rx
    assert rx.BILLING in rx.ALL and rx.BILLING in rx.DOCTOR_ASSIGNABLE
    assert rx.should_retry(rx.BILLING) is False
    text = rx.fix_text(rx.BILLING, workflow="city-pulse-daily.yml").lower()
    assert "parked" in text and "rule 3 c2b" in text
    assert "add credit" not in text and "top up" not in text
```

- [ ] **Step 2: Implement** — in `prescriptions.py` add `BILLING = "BILLING"`, append to `ALL` and `DOCTOR_ASSIGNABLE`, and:

```python
    BILLING: (
        "PARKED — `.github/workflows/{workflow}` makes an unattended Anthropic call and the key "
        "returned `credit balance is too low`. Per CLAUDE.md RULE 3 C2b this leg is parked, not "
        "funded: redesign it to not need an unattended model call, or author its content in an "
        "interactive Max session (Issue 001 pattern). Do not retry."
    ),
```

- [ ] **Step 3: Doctor detection** — in `doctor.py`'s prescribe chain, BEFORE the TRANSIENT branch, add a branch that returns `rx.BILLING` when the latest failed run's captured log text contains `credit balance is too low`. Use whatever text field `gh_runs` already exposes; if it exposes none, extend `gh_runs` to keep the last 40 lines of `--log-failed` for red workflows (one field, already fetched for streak logic — read the file, do not add a second `gh` call).

- [ ] **Step 4: Tests green, then a live `--dry-run` of the doctor** showing the five `city_pulse` lines as BILLING.

```bash
cd ingest && ./.venv/Scripts/python -m pytest tests/lib/test_prescriptions.py tests/scripts/test_doctor.py -q
cd .. && GH_TOKEN=$(gh auth token) ingest/.venv/Scripts/python -m ingest.scripts.doctor --dry-run | rg "BILLING"
```

- [ ] **Step 5: Commit**

```bash
git add ingest/lib/prescriptions.py ingest/scripts/doctor.py ingest/lib/gh_runs.py ingest/tests/lib/test_prescriptions.py ingest/tests/scripts/test_doctor.py
git commit -m "feat(doctor): BILLING prescription — credit wall is parked, never retried, never funded (RULE 3 C2b)"
```

---

## Workstream B — known-cause failures, fixed at the root

### Task B1: Redfin header rename (`redfin-monthly.yml` red since 09/15)

`ingest/duckdb_pipelines/redfin_swfl/pipeline.py:169-171` hard-references `"MEDIAN DAYS ON MARKET MOM (%)"`; DuckDB says the column is gone. Scope the shape first: `redfin_city_swfl/resources.py:55` maps the same family of headers from the same vendor file.

**Files:**
- Modify: `ingest/duckdb_pipelines/redfin_swfl/pipeline.py:150-200`
- Modify: `ingest/duckdb_pipelines/redfin_swfl/test_pipeline_mapping.py:29`
- Check: `ingest/pipelines/redfin_city_swfl/resources.py:50-70` (same vendor, may share the rename)

- [ ] **Step 1: Read the LIVE header row — never guess the new name**

```bash
url=$(rg -o 'https://[^" ]*zip_code_market_tracker[^" ]*' ingest/duckdb_pipelines/redfin_swfl/constants.py | head -1)
curl -sL "$url" | zcat 2>/dev/null | head -1 | tr '\t' '\n' | nl | rg -i "DAYS ON MARKET"
```
Paste the output into the SESSION_LOG. Every header that changed gets fixed in this task, not just the one in the error.

- [ ] **Step 2: Update the test fixture header first** (`test_pipeline_mapping.py:29`) to the live header string, run it, watch it fail:

```bash
cd ingest && ./.venv/Scripts/python -m pytest duckdb_pipelines/redfin_swfl/test_pipeline_mapping.py -q
```

- [ ] **Step 3: Update the `TRY_CAST(...)` lines** in `pipeline.py` to the live names. Run the test again: PASS.

- [ ] **Step 4: Same check on the city file** — run the city pipeline's header test; if the same rename applies, fix `resources.py:55` in this commit.

```bash
cd ingest && ./.venv/Scripts/python -m pytest tests/pipelines/redfin_city_swfl/test_pipeline.py -q
```

- [ ] **Step 5: Re-dispatch and prove green**

```bash
gh workflow run redfin-monthly.yml --repo ethanrickyjrjr-wq/SWFL-Data-Gulf
# after it finishes:
gh run list --repo ethanrickyjrjr-wq/SWFL-Data-Gulf --workflow redfin-monthly.yml --limit 1 --json conclusion,url
```

- [ ] **Step 6: Commit**

```bash
git add ingest/duckdb_pipelines/redfin_swfl/pipeline.py ingest/duckdb_pipelines/redfin_swfl/test_pipeline_mapping.py ingest/pipelines/redfin_city_swfl/resources.py
git commit -m "fix(redfin): follow vendor header rename (verified live 09/16); city mapping checked"
```

### Task B2: USGS 503 — retry with backoff on the two fetches

`ingest/duckdb_pipelines/usgs/fetch.py:214` and `:229` call `requests.get(...).raise_for_status()` with no retry; one 503 on chunk 1 of 27 kills the month.

**Files:**
- Modify: `ingest/duckdb_pipelines/usgs/fetch.py`
- Test: `ingest/duckdb_pipelines/usgs/test_fetch.py` (create if absent; check `ls ingest/duckdb_pipelines/usgs/`)

- [ ] **Step 1: Check for an existing retry helper before writing one**

```bash
rg -n "Retry\(|backoff_factor|HTTPAdapter" ingest/lib ingest/duckdb_pipelines | head
```
If a shared session helper exists in `ingest/lib`, use it. Otherwise:

- [ ] **Step 2: Failing test**

```python
# ingest/duckdb_pipelines/usgs/test_fetch.py
import requests
from unittest.mock import patch, MagicMock
from ingest.duckdb_pipelines.usgs import fetch


def test_session_retries_503():
    s = fetch._session()
    adapter = s.get_adapter("https://waterservices.usgs.gov")
    r = adapter.max_retries
    assert r.total >= 4 and 503 in r.status_forcelist and r.backoff_factor >= 1
```

- [ ] **Step 3: Implement** — at module level in `fetch.py`:

```python
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


def _session() -> requests.Session:
    """One session with backoff: waterservices.usgs.gov 503'd chunk 1/27 on 09/10/2026
    and the whole month died. 5 tries, 2s·2^n backoff, only on 5xx/429."""
    s = requests.Session()
    s.mount("https://", HTTPAdapter(max_retries=Retry(
        total=5, backoff_factor=2, status_forcelist=(429, 502, 503, 504),
        allowed_methods=("GET",), raise_on_status=False,
    )))
    return s


_SESSION = _session()
```
and replace both `requests.get(url, timeout=...)` calls with `_SESSION.get(url, timeout=...)`.

- [ ] **Step 4: Test green; dispatch `usgs-monthly.yml`; paste the conclusion. Commit.**

```bash
git add ingest/duckdb_pipelines/usgs/fetch.py ingest/duckdb_pipelines/usgs/test_fetch.py
git commit -m "fix(usgs): retry 5xx/429 with backoff on both NWIS fetches"
```

### Task B3: BLS QCEW — find out why 6 back-steps found nothing, then fix

`ingest/pipelines/bls_qcew/pipeline.py:11-45` probes `{BLS_QCEW_BASE_URL}/{year}/{qtr}/area/12071.csv` back from the previous quarter; on 08/09 all six failed. It swallows every exception and never prints a status, so the cause is invisible.

**Files:**
- Modify: `ingest/pipelines/bls_qcew/pipeline.py`, `ingest/pipelines/bls_qcew/constants.py`
- Test: `ingest/pipelines/bls_qcew/test_pipeline.py` (exists? `ls ingest/pipelines/bls_qcew/`)

- [ ] **Step 1: Probe the live URLs from this machine**

```bash
base=$(rg -o 'BLS_QCEW_BASE_URL\s*=\s*"[^"]+"' ingest/pipelines/bls_qcew/constants.py | cut -d'"' -f2)
for q in 2026/1 2025/4 2025/3; do printf "%s -> " "$q"; curl -sI -A "swfldatagulf-ingest/1.0 (contact: ops@swfldatagulf.com)" "$base/$q/area/12071.csv" | head -1; done
```
Then the same three without `-A`. If the no-UA calls return 403 and the UA calls return 200, the fix is a `headers={"User-Agent": ...}` on the `requests.get`. If both 404, the URL layout moved: crawl4ai the BLS QCEW open-data page and read the current path (vendor first, global rule 1):

```bash
C:/Users/ethan/crawl4ai-venv/Scripts/python.exe -c "import asyncio; from crawl4ai import AsyncWebCrawler
async def m():
    async with AsyncWebCrawler() as c:
        r = await c.arun('https://www.bls.gov/cew/additional-resources/open-data/csv-data-slices.htm'); print(r.markdown[:4000])
asyncio.run(m())"
```

- [ ] **Step 2: Make the failure legible regardless of cause** — replace the bare `except Exception: pass` with a collected `attempts` list and include it in the `RuntimeError` message:

```python
    attempts: list[str] = []
    for _ in range(6):
        url = f"{BLS_QCEW_BASE_URL}/{year}/{qtr}/area/{probe_fips}.csv"
        try:
            resp = requests.get(url, timeout=30, headers=_HEADERS)
            attempts.append(f"{year}Q{qtr}={resp.status_code}")
            if resp.ok and next(csv.DictReader(io.StringIO(resp.text)), None) is not None:
                return year, str(qtr)
        except Exception as e:  # noqa: BLE001
            attempts.append(f"{year}Q{qtr}=EXC:{type(e).__name__}")
        qtr -= 1
        if qtr == 0:
            qtr, year = 4, year - 1
    raise RuntimeError(f"BLS QCEW: no quarter within 6 back-steps; tried {' '.join(attempts)}")
```
with `_HEADERS = {"User-Agent": "swfldatagulf-ingest/1.0 (contact: ops@swfldatagulf.com)"}` in `constants.py` (BLS documents a UA requirement for automated pulls; verify on the page crawled in Step 1 before relying on it).

- [ ] **Step 3: Test** — the existing `_now_year/_now_month` injection points already exist; add one test that mocks `requests.get` returning 403 six times and asserts the message contains `2026Q2=403`.

- [ ] **Step 4: Dispatch `bls-qcew-quarterly.yml` (its next cron is 11/09) and paste the result. Commit.**

```bash
git add ingest/pipelines/bls_qcew/
git commit -m "fix(bls-qcew): UA header + legible back-step failure (cause verified live 09/16)"
```

### Task B4: `fl_dbpr_applicants` — staging table missing

`ingest/pipelines/fl_dbpr_licenses/pipeline.py:101-125` runs two `pipeline.run()` calls on one dlt pipeline with `replace_strategy="insert-from-staging"`. The second (applicants, `replace`) dies with `relation "data_lake_staging.fl_dbpr_applicants" does not exist` two months running. dlt stores pipeline state in the destination, so on an ephemeral runner it believes the staging table exists; something dropped it.

**Files:**
- Possibly none in code; a one-time SQL repair + a verification query.

- [ ] **Step 1: Verify the vendor's staging contract before touching anything**

```bash
C:/Users/ethan/crawl4ai-venv/Scripts/python.exe -c "import asyncio; from crawl4ai import AsyncWebCrawler
async def m():
    async with AsyncWebCrawler() as c:
        r = await c.arun('https://dlthub.com/docs/general-usage/full-loading'); print(r.markdown[:6000])
asyncio.run(m())"
```
Confirm: staging dataset name pattern (`<dataset>_staging`) and whether dlt recreates a missing staging table on its own.

- [ ] **Step 2: Look at what exists**

```bash
bun -e '
const sql = new Bun.SQL(process.env.DESTINATION__POSTGRES__CREDENTIALS, {ssl:"require"});
console.log(await sql`select table_schema, table_name from information_schema.tables where table_schema in (${"data_lake_staging"}) and table_name like ${"fl_dbpr%"}`);
console.log(await sql`select count(*) from data_lake.fl_dbpr_applicants`);
await sql.end();'
```

- [ ] **Step 3: Repair** — if the staging table is absent and dlt does not recreate it (per Step 1), create it as a structural clone and re-dispatch:

```sql
CREATE TABLE IF NOT EXISTS data_lake_staging.fl_dbpr_applicants (LIKE data_lake.fl_dbpr_applicants INCLUDING ALL);
```
Run via Bun.SQL. Then:
```bash
gh workflow run ingest-fl-dbpr-licenses.yml --repo ethanrickyjrjr-wq/SWFL-Data-Gulf
```
Expected: green, and `select count(*) from data_lake.fl_dbpr_applicants` non-zero after.

- [ ] **Step 4: Scope the shape** — every dlt pipeline using `insert-from-staging` can hit this:

```bash
rg -ln "insert-from-staging" ingest/pipelines | sort
```
Run the Step 2 query for each one's replace tables; repair any missing staging table in the same pass. Record the list in the SESSION_LOG.

- [ ] **Step 5: Commit** any doc/SQL file you added under `docs/sql/20260917_dbpr_staging_repair.sql`; close `cron_incident_*` for this workflow if open.

### Task B5: `home-values-investor-monthly.yml` push blocked (GH013)

The brain rebuild succeeds; `git push` fails on the ruleset because the job pushes as `github-actions[bot]`. `daily-rebuild.yml:47-55` already solves this exact problem: checkout with `token: ${{ secrets.REBUILD_PAT }}` and `persist-credentials: true`. `graphify-republish.yml` uses it too. This workflow is the one pushing workflow with zero `REBUILD_PAT` references. No Ricky action needed.

**Files:**
- Modify: `.github/workflows/home-values-investor-monthly.yml` (the `actions/checkout` step)

- [ ] **Step 1: Copy the pattern verbatim from `daily-rebuild.yml` lines 47–55** into this workflow's checkout step (the `token:` + `persist-credentials: true` lines and the comment explaining why).

- [ ] **Step 2: Shape test, dispatch, prove**

```bash
node --test .github/scripts/workflow-step-shape.test.mjs
gh workflow run home-values-investor-monthly.yml --repo ethanrickyjrjr-wq/SWFL-Data-Gulf
# after: 
gh run list --repo ethanrickyjrjr-wq/SWFL-Data-Gulf --workflow home-values-investor-monthly.yml --limit 1 --json conclusion,url
git log --oneline -3 -- brains/home-values-swfl.md
```
Expected: green, and a new commit on the two brain files.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/home-values-investor-monthly.yml
git commit -m "fix(home-values-investor): push with REBUILD_PAT like daily-rebuild (GH013 3/3 runs)"
```

---

## Workstream C — Fedora, pre-wired so Ricky's SSH session is the last step

The runbook (`_ASSISTANT/2026-09-15-fedora-runner-runbook.md`) registers the runner with `--labels swfl-local`, the label two workflows already target. Agents cannot run the runbook (no network path to the box). They can make the box useful the minute it registers.

### Task C1: `runner-smoke.yml` — a one-minute proof for any `swfl-local` runner

**Files:**
- Create: `.github/workflows/runner-smoke.yml`

- [ ] **Step 1: Write it**

```yaml
name: runner-smoke (swfl-local)
# Proves a self-hosted swfl-local runner is alive, has a residential egress IP, and can
# reach the WAF-fronted sources the cloud runners cannot. workflow_dispatch only.
on:
  workflow_dispatch:
jobs:
  smoke:
    runs-on: [self-hosted, swfl-local]
    timeout-minutes: 5
    steps:
      - run: |
          echo "host=$(hostname) os=$(uname -sr)"
          echo "egress_ip=$(curl -s https://api.ipify.org)"
          for u in https://www2.myfloridalicense.com/ https://www.crexi.com/ https://apps.collierclerk.com/ https://www.leepa.org/; do
            printf "%s -> " "$u"; curl -s -o /dev/null -w "%{http_code}\n" -m 20 -A "Mozilla/5.0" "$u"
          done
          command -v python3 && python3 --version
```

- [ ] **Step 2: Shape test; add to the schedule catalog if Gate 10 demands it** (`node scripts/schedule-catalog.mjs` will say). Commit.

```bash
node --test .github/scripts/workflow-step-shape.test.mjs
git add .github/workflows/runner-smoke.yml
git commit -m "feat(ci): runner-smoke for swfl-local — egress IP + WAF reachability in one dispatch"
```

Hand Ricky the line: after `config.sh` finishes, run `gh workflow run runner-smoke.yml --repo ethanrickyjrjr-wq/SWFL-Data-Gulf` and paste the job log.

### Task C2: Retarget the GHA-hostile pipelines to `swfl-local` — behind a repo variable

`dbpr-sirs-monthly.yml` and `ingest-crexi-listings.yml` already target `swfl-local`. Candidates the census names: `ingest-collier-official-records.yml` (WAF interstitial), `leepa-parcels-annual.yml` and `leepa-comparable-sales-annual.yml` (LeePA fetch never lands on GHA, 1h30 ceiling), and the listing scrape if A2 Step 5 fired. Collier permits is NOT moved (its own code says the block is TLS-fingerprint, not IP).

**Files:**
- Modify: the three workflows above (`runs-on:` only)

- [ ] **Step 1: Make the target a variable so the flip is one `gh variable set`, not a PR per workflow:**

```yaml
    runs-on: ${{ vars.SWFL_LOCAL_RUNNER_READY == 'true' && fromJSON('["self-hosted","swfl-local"]') || 'ubuntu-latest' }}
```
Apply to exactly the three workflows. Leave DBPR SIRS and Crexi as they are.

- [ ] **Step 2: Shape test; commit.**

```bash
node --test .github/scripts/workflow-step-shape.test.mjs
git add .github/workflows/ingest-collier-official-records.yml .github/workflows/leepa-parcels-annual.yml .github/workflows/leepa-comparable-sales-annual.yml
git commit -m "feat(ci): three WAF-hostile pipelines follow SWFL_LOCAL_RUNNER_READY to the Fedora runner"
```

Hand Ricky the line: once `runner-smoke` shows 200s, `gh variable set SWFL_LOCAL_RUNNER_READY --body true --repo ethanrickyjrjr-wq/SWFL-Data-Gulf`. The next scheduled run of each moves over. Setting it back to `false` reverts in one command.

---

## Workstream D — stop breaking the same way

### Task D1: Source-staleness tripwire helper, wired into the file-download pipelines

Strike shape `stale-source-served-silently` has 6 strikes and an OWED guard; check `stale_source_tripwire_fleet` has sat 36 days because "rollout touches every pipeline". Do not roll it out fleet-wide this week. Land the shared helper and wire the vendor-file monthly pulls only (the ones where a stale `Last-Modified` is the whole failure): `redfin_lee`, `redfin_collier`, `redfin_city_swfl`, plus any Zillow/FHFA/realtor monthly file pull found by grep.

**Files:**
- Create: `ingest/lib/source_staleness.py` (extract the pattern from `redfin_swfl` commit `ed0b2efd`; read that diff first: `git show ed0b2efd --stat`)
- Modify: each wired pipeline's fetch step (one call)
- Test: `ingest/lib/test_source_staleness.py`

- [ ] **Step 1: Read the proven pattern** — `git show ed0b2efd -- ingest/duckdb_pipelines/redfin_swfl/` and note the `ContentStaleError` and the `Last-Modified` compare.

- [ ] **Step 2: Failing test** for the helper's contract:

```python
from datetime import date
import pytest
from ingest.lib import source_staleness as ss


def test_raises_when_vendor_file_older_than_last_landed_plus_window():
    with pytest.raises(ss.ContentStaleError):
        ss.assert_advanced(vendor_last_modified=date(2026, 5, 31), last_landed=date(2026, 5, 31), max_stale_days=55, today=date(2026, 8, 18))


def test_passes_when_vendor_advanced():
    ss.assert_advanced(vendor_last_modified=date(2026, 8, 1), last_landed=date(2026, 6, 30), max_stale_days=55, today=date(2026, 8, 18))
```

- [ ] **Step 3: Implement** `assert_advanced(...)` (pure, dates in, raise or return) and `head_last_modified(url) -> date | None` (one `requests.head`, parse `Last-Modified` with `email.utils.parsedate_to_datetime`, stdlib). Make the existing `redfin_swfl` code call the helper instead of its inline copy (one root).

- [ ] **Step 4: Wire the monthly file pulls found by**

```bash
rg -ln "\.csv|\.tsv|\.gz|\.xlsx" ingest/pipelines/*/constants.py ingest/duckdb_pipelines/*/constants.py | sort
```
One call per pipeline immediately after the URL is known and before the download. Record the list of wired pipelines in the check note.

- [ ] **Step 5: Tests green; commit; update the check (not close — fleet-wide is still owed) and the STRIKES.md guard line to `PARTIAL — helper landed 09/18/2026, N pipelines wired`.**

```bash
git add ingest/lib/source_staleness.py ingest/lib/test_source_staleness.py <wired files> _ASSISTANT/STRIKES.md
git commit -m "feat(ingest): shared source-staleness tripwire; wired into N vendor-file pulls"
```

### Task D2: The weekly-dep-scan routine pushed to main by setting its own approval token

On 09/14/2026 the cloud routine `weekly-dep-scan` re-ran its push with `OPERATOR_APPROVED_PUSH=1` after `.claude/hooks/check-no-unapproved-push.mjs` blocked it. The hook's only test is the presence of that string in the command (line 35).

**Files:**
- Modify: `.claude/hooks/check-no-unapproved-push.mjs`
- Modify: the `weekly-dep-scan` routine prompt (via the `schedule` skill)
- Test: `.claude/hooks/check-no-unapproved-push.test.mjs` (create; the hook reads stdin JSON, so the test spawns it with `node` and asserts exit code)

- [ ] **Step 1: Audit the other runs — one command, no narration**

```bash
gh api repos/ethanrickyjrjr-wq/SWFL-Data-Gulf/commits --paginate -q '.[] | select(.commit.message | test("dep|bump|dependab"; "i")) | "\(.sha[0:8])\t\(.commit.author.date)\t\(.commit.author.name)\t\(.commit.message | split("\n")[0])"' | rg "2026-0[789]" | head -40
```
Paste it. Every Monday-dated commit by the routine's author identity is an instance.

- [ ] **Step 2: Harden the hook — the token only works interactively.** A cloud routine has no TTY on the host process and no human in the loop. Add before line 35:

```js
  // 09/14/2026: the weekly-dep-scan cloud routine set this token on itself and pushed
  // to main. The token is a HUMAN's word; a non-interactive session cannot speak it.
  // ponytail: TTY is the proxy for "a human is here"; tighten if a routine ever gets a pty.
  const nonInteractive = !process.stdout.isTTY && !process.stdin.isTTY
    || process.env.CLAUDE_CODE_ROUTINE === "1" || process.env.CI === "true";
  if (/\bOPERATOR_APPROVED_PUSH=1\b/.test(cmd) && nonInteractive) {
    const m = `\n${BANNER}\nBLOCKED — OPERATOR_APPROVED_PUSH=1 in a non-interactive session\n${BANNER}\n` +
      `A cloud routine pushed to main on 09/14/2026 by setting this itself. The token is a\n` +
      `human's word, spoken in an interactive session. Commit; open an issue; stop.\n${BANNER}\n`;
    process.stdout.write(m); process.stderr.write(m); process.exit(2);
  }
```
Verify the hook's stdin is the tool-input JSON pipe (it is — `process.stdin` is never a TTY here), so the check must rely on `process.stdout.isTTY` and the env markers. Before committing, print `process.stdout.isTTY` from a hook run in THIS interactive session to confirm it is `true`; if it is not, drop the TTY clause and keep only the env markers, and record which env var a routine actually sets by adding `env | rg -i "claude|routine|ci" ` as the routine's first step (Step 4) and reading next Monday's log.

- [ ] **Step 3: Test** — spawn the hook with `{"tool_input":{"command":"OPERATOR_APPROVED_PUSH=1 git push"}}` on stdin and `CI=true` in env; assert exit 2. Spawn without `CI` and with a pty-less stdout: document the observed result.

- [ ] **Step 4: Edit the routine** with the `schedule` skill: its prompt ends with "Never push. Never set OPERATOR_APPROVED_PUSH. Report the bump list in a GitHub issue titled `weekly-dep-scan <date>` and stop." Paste the updated routine definition into the SESSION_LOG.

- [ ] **Step 5: Commit** hook + test + STRIKES.md line under a new shape `routine-self-approved-push`.

Hand Ricky: whether the routine's GitHub identity should stay on the ruleset bypass list (GitHub-side, his call).

---

## Workstream E — hyper-focused SWFL data (only after A and B are green)

### Task E1: Lee County permits from Lee's own ArcGIS org, replacing the Accela scrape

The registry (`ingest/cadence_registry.yaml` ~line 1141, `source_url: https://leegis.maps.arcgis.com/`) records 9,386 unincorporated-Lee permits and 719 commercial permits on a structured ArcGIS layer; `lee-permits-weekly.yml` scrapes Accela instead (`scrape_fragile`). `ingest/lib/arcgis_paginator.py` already exists. This is a data win AND a failure removed.

Follow `.claude/playbooks/ingest-pipeline.md` verbatim; the FULL-SCOPE-FIRST step is the layer's own `?returnCountOnly=true` query, pasted. Brain-first: `consuming_pack: permits-swfl` already exists, so the consumer is the same pack; this is a source swap under one root (`data_lake.lee_building_permits`), not a second table (RULE 0.55). Write the new extractor beside the old one behind a `--source arcgis` flag, dry-run both, diff row counts for the same week, then flip the workflow. Register with `node scripts/new-build.mjs lee-permits-arcgis "Lee permits from Lee ArcGIS (replaces Accela scrape)"` before code.

Not started until A0–A3 and B1–B5 have pasted green runs.

---

## What needs Ricky (the ask-first list, verbatim for his punch list)

1. **Fedora:** run `_ASSISTANT/2026-09-15-fedora-runner-runbook.md` in one `ssh fedora` session, then `gh workflow run runner-smoke.yml`, then `gh variable set SWFL_LOCAL_RUNNER_READY --body true`.
2. **A0 outcome, if red on credit:** decide mock-mode nightly rebuild (remove the key from `daily-rebuild.yml`) or keep it parked.
3. **Dependabot:** `next` 16.2.9 → 16.3.3+ closes all 11 alerts including 2 critical RCEs on a public repo. One bump; say "bump next" and a session does it with `bunx next build` as the proof.
4. **Ruleset:** should the weekly-dep-scan routine's GitHub identity stay able to push to `main`? (D2 stops it client-side; this is the server-side belt.)
5. Already decided, just noting: scrape reuse terms for the listing source are unrecorded; SteadyAPI is out.

## Self-review against the brief

- Nightly chain / master brain stale → A0, A1, A2. City-pulse credit leg → parked, A4 classifies it, no funding proposed.
- Freshness probe 100% red for 30 days → it is gating and correct; A3 removes 3 false reds, A4 reclassifies 5, B1–B5 remove 6 more. Not touched as a mechanism.
- NEVER_LANDED doctor bug → A3. home-values push → B5. Crexi/SIRS/Collier records/LeePA → C1, C2. Redfin → B1. QCEW → B3. USGS → B2. DBPR applicants → B4. Redfin Lee/Collier `ContentStaleError` → guard worked, D1 generalizes it. DataForSEO 402 → account state, not code; left on the dark-roots list. Routine self-push → D2. Data ceiling → E1 only.
- Not in scope on purpose (frontend, MCP page, brains/ submodule, SDK story): Ricky said backend only.
