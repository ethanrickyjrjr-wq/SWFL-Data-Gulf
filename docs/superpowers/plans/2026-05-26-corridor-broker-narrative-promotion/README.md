# Corridor Broker Narrative Promotion — quarantine → live

## Context

The 2026-05-25 firecrawl-pipeline plan landed the `character_broker_narrative_pending` quarantine column and wired the corridor_narratives ingest to write only to `_pending`. The cre-swfl pack reads the **non-pending** column, so newly-ingested broker positioning is inert until promoted.

**Verified state in repo (2026-05-26):**

- DDL: `docs/sql/20260525_corridor_broker_narrative_pending.sql` — `ALTER TABLE corridor_profiles ADD COLUMN IF NOT EXISTS character_broker_narrative_pending JSONB`. Idempotent. Live-DB applied: **unverified.**
- Ingest writes only to `_pending` via `UPDATE_SQL` at `ingest/pipelines/corridor_narratives/pipeline.py:104-111`.
- Pack reads the live column at `refinery/sources/cre-source.mts:324-326`; `composeCharacterRender` (`cre-source.mts:240-253`) layers broker positioning over hand-authored `character` without overwriting.
- GHA cron: `.github/workflows/corridor-narratives-quarterly.yml` (cron `0 13 2 1,4,7,10 *`).
- **Pipeline is currently producing zero rows.** Last 3 GHA runs (`workflow_dispatch` from 2026-05-26) all failed with "Firecrawl returned zero rows across all broker pages" — agent extraction from `creconsultants.com`, `lsicompanies.com`, `ipcswfl.com`, `svnswfl.com` returns nothing.

**What "refinery pack wiring" means here:** zero new wiring on the pack side. The pack already reads the live column and renders broker narrative correctly. The missing pieces are the _operator-facing_ promotion path, a paragraph in the consumption contract, and confirmation that the DDL is live.

## The two real problems

1. **No data to promote.** Firecrawl agent extraction returns 0 rows from all four broker URLs. Until this is fixed, the promotion tool runs against an empty table.
2. **No promotion path.** Today the only documented way to promote is a hand-written `UPDATE corridor_profiles SET character_broker_narrative = _pending, _pending = NULL WHERE corridor_name IN ('…')` in the Supabase SQL editor. That's a footgun (no diff, no dry-run, no audit trail) and it's not in the consumption contract.

Steps 1 and 2 are **independent** — a manually-inserted `_pending` row is enough to validate the promotion tool. Build in parallel, don't serialize.

## Plan (parallel where possible)

### Step 1 — Diagnose & fix the Firecrawl ingest (Opus)

**Why Opus:** the broker pages are JS-rendered, sometimes PDF-gated; figuring out _what Firecrawl sees_ and re-scoping the source list against live vendor surface is the kind of judgment-heavy work that benefits from the bigger model.

1. For each of the four URLs, run a one-shot Firecrawl `/scrape` from the local CLI and inspect the markdown returned. Use the `firecrawl-scrape` skill — do **not** call `/v2/agent` first; we want to see what raw text the agent has to work with.
   - `https://www.creconsultants.com/research/`
   - `https://lsicompanies.com/market-reports/`
   - `https://ipcswfl.com/research/`
   - `https://svnswfl.com/market-reports`
2. Three likely outcomes per URL:
   - **List page only:** the URL is a list of report links (PDFs / sub-pages). The agent needs the deep link, not the list. Update `BROKER_SOURCES` to point at the most-recent quarterly report URL directly.
   - **JS-rendered, scrape sees a shell:** swap to Firecrawl `/scrape` with `actions: [waitFor]` or to `/v2/agent` with `strict_constrain_to_urls: true` (already on, but worth re-checking).
   - **PDF-only:** Firecrawl handles PDFs natively via `/scrape` — point the agent at the PDF URL.
3. Once one URL produces rows in `--dry-run`, re-evaluate the alias table at `ingest/pipelines/corridor_narratives/pipeline.py:52-61`. Any new broker shorthand → canonical `corridor_name` mapping goes here. **Grow CORRIDOR_ALIASES; never rename in `corridor_profiles`.**
4. Commit a fix that gets at least one broker source returning ≥1 row. Don't try to fix all four in one PR — `partial coverage is the steady state` per pipeline header comment.
5. Manually `workflow_dispatch` the GHA workflow with `dry_run=true`, confirm rows print, then real-run.

**Acceptance:** at least one canonical corridor has a non-null `character_broker_narrative_pending` value in live Supabase.

**Out of scope:** rewriting the agent prompt. The AGENT_PROMPT at `pipeline.py:64-73` is good; the problem is what the agent is being fed, not what it's being told.

### Step 2 — Build `promote-broker-narratives.mts` (Sonnet, parallel with Step 1)

**File:** `refinery/tools/promote-broker-narratives.mts`

**Why this can run in parallel:** the tool reads/writes Supabase. It does not depend on the agent extraction working. Validation needs exactly **one** hand-inserted `_pending` row in a dev/local Supabase or in production with a synthetic test corridor.

**CLI surface:**

```
npm run promote-broker-narratives                       # list pending (default — dry-run, no writes)
npm run promote-broker-narratives -- --diff <corridor>  # side-by-side diff of live vs pending for one corridor
npm run promote-broker-narratives -- --apply <corridor>...  # promote: live ← pending; pending ← NULL
npm run promote-broker-narratives -- --reject <corridor>... # discard: pending ← NULL only
npm run promote-broker-narratives -- --apply-all       # promote every pending row; refuses to run if any diffs cross a sanity threshold (see below)
```

**Behaviors:**

1. **Default (no flags) — list mode.** Query `select corridor_name, character_broker_narrative, character_broker_narrative_pending from corridor_profiles where character_broker_narrative_pending is not null and deleted_at is null and verification_status = 'verified'`. Print: corridor name, pending quarter, "first time" vs "replaces Qn YYYY", and a one-line preview of pending `market_positioning` (truncate at 80 chars).
2. **`--diff <corridor>` — full inspection.** Pretty-print both JSONB blobs side-by-side. Exit 0 always; no writes.
3. **`--apply <corridor>... ` — promote.** Within a single transaction per corridor: `UPDATE corridor_profiles SET character_broker_narrative = character_broker_narrative_pending, character_broker_narrative_pending = NULL WHERE corridor_name = $1 AND character_broker_narrative_pending IS NOT NULL RETURNING corridor_name, character_broker_narrative`. Print the new value. If `RETURNING` is empty, fail loudly — caller named a corridor with no pending row.
4. **`--reject <corridor>... ` — discard.** Same as apply but `SET character_broker_narrative_pending = NULL` only. Confirm before running (per-corridor prompt; `--yes` to skip).
5. **`--apply-all` — bulk promote.** Iterate every pending corridor through `--apply`. **Sanity gate:** if any pending row has all four narrative fields `null`, refuse. If the quarter string doesn't match `^\d{4}-Q[1-4]$`, refuse. (Defensive — `normalizeBrokerNarrative` would drop these anyway, but better to surface in the operator tool than silently no-op the pack.)
6. **Audit trail (minimum viable):** every `--apply` and `--reject` appends one JSON line to `refinery/tools/.promote-broker-narratives.log` (gitignored) with timestamp, action, corridor_name, old value, new value. Throwaway local log — sufficient until we feel the pain of needing a DB audit table.

**Implementation notes:**

- Use `getSupabase()` from `refinery/sources/supabase.mts` for the read. **Write** path must use the same client — service-role JWT, server-side only.
- Reuse `normalizeBrokerNarrative` from `cre-source.mts` for parse-validate on read. Don't reimplement.
- After any `--apply` or `--apply-all` that touches at least one row, optionally trigger `daily-rebuild.yml` for `cre-swfl`. The ingest pipeline already does this (`pipeline.py:145-167`); pull that helper into a shared util if straightforward. **Default: don't dispatch** (operator runs `npm run refinery cre-swfl` locally first to eyeball). `--dispatch` flag opts in.
- Tests: `refinery/tools/promote-broker-narratives.test.mts` — fixture-mode end-to-end (list → diff → apply → reject), using a `corridor_profiles` fixture with one row that has pending data. Mirror the pattern in `refinery/packs/cre-swfl.test.mts`.

**Acceptance:** with one manually-inserted `_pending` row, the four commands above behave as documented and tests pass.

### Step 3 — Consumption contract paragraph (Sonnet, fast)

**File:** `docs/consumption-contract.md`

Add a short subsection (existing doc structure dictates where — likely under whatever section already covers cre-swfl or "data freshness"). Content:

> **Broker narratives are quarantined before they reach you.** The corridor_narratives ingest writes Firecrawl-extracted broker positioning to `corridor_profiles.character_broker_narrative_pending`. The cre-swfl brain only reads the non-pending column. New broker narrative is invisible to the brain until an operator runs `npm run promote-broker-narratives -- --apply <corridor>` after spot-checking the diff. If a corridor's `broker_positioning` line is missing or out of date, that's by design — promotion is the human-in-the-loop gate, not a bug.

Also: add a one-line cross-reference in `ingest/pipelines/corridor_narratives/pipeline.py` header pointing to the new tool path, so the operator hitting the failing GHA logs gets a pointer.

**Acceptance:** `grep -n "promote-broker-narratives" docs/consumption-contract.md` finds the paragraph; `grep` in `pipeline.py` header finds the pointer.

### Step 4 — Confirm DDL applied to live Supabase (either, blocks Step 2 acceptance)

One-shot SQL via Supabase SQL editor or `psql`:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'corridor_profiles'
  and column_name = 'character_broker_narrative_pending';
```

If empty: paste `docs/sql/20260525_corridor_broker_narrative_pending.sql` into the Supabase SQL editor and re-run the query. If full: write the verification result into the PR description for Step 2 so reviewer can see the migration is actually live.

## Out of scope

- **Audit table in Postgres.** The throwaway log file is enough until we feel the pain.
- **Replacing the consumer pattern with a view.** A pending-aware view is tempting (`coalesce(_pending, live)` with a column flag), but it inverts the current default and would force every brain consumer to opt OUT of pending data. The current pattern — brain reads live, operator promotes — is correct.
- **Multi-source merge.** If two brokers cover the same corridor in the same quarter, the second write to `_pending` overwrites the first (`pipeline.py:106` is plain `SET = …`). Out of scope; revisit only when we actually see two brokers cover the same corridor in one quarter.
- **GHA workflow auto-promotes.** No. The whole point of `_pending` is the human-in-the-loop gate.

## Success test

A new contributor runs:

```
npm run promote-broker-narratives                                # sees N pending rows
npm run promote-broker-narratives -- --diff "Daniels Parkway Fort Myers"
npm run promote-broker-narratives -- --apply "Daniels Parkway Fort Myers"
npm run refinery cre-swfl
```

…and `brains/cre-swfl.md` now contains the promoted broker positioning line under the Daniels Parkway corridor block.

## Pointers

- Quarantine column DDL: `docs/sql/20260525_corridor_broker_narrative_pending.sql`
- Ingest pipeline (writes only `_pending`): `ingest/pipelines/corridor_narratives/pipeline.py`
- Pack source (reads live, layers narrative): `refinery/sources/cre-source.mts:240-253`, `cre-source.mts:319-359`
- GHA cron: `.github/workflows/corridor-narratives-quarterly.yml`
- Originating plan (firecrawl skeleton + Part 6b consumer): `docs/superpowers/plans/2026-05-25-firecrawl-pipeline-skeleton/README.md`
- Memory: `[[corridor-pipeline-mcp-bundle]]`, `[[firecrawl-pipeline-skeleton-merged]]`
