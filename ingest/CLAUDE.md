# ingest/ — data ingest conventions (loads when you edit here)

This is the Python ingest island (dlt + DuckDB), zero TS coupling. Rules for working here:

- **Incremental, not re-fetch-everything.** Append/event sources (permits, listings, licenses) use
  `dlt.sources.incremental(<cursor>)` + `write_disposition="merge"` + `primary_key`. Full-snapshot
  sources (Census ACS, FHFA, realtor.com monthly) keep `replace` — and document WHY. Never blanket-flip.
  See `docs/superpowers/specs/2026-06-28-focus-restructure/03-incremental-ingest.md`.
- **Aggregate at source.** Push COUNT/AVG/median/grouping to SQL/DuckDB. Never haul raw rows to count
  them in TS. `selectAllPaged` is legacy, not the target.
- **NO paid model web_search in scheduled pipelines (LOCKED 07/05/2026, operator decree).** Capture =
  crawl4ai fetch of sources we discover ourselves (news_swfl lake matching, outlet pages); LLM = one
  small SONNET distill per unit WITH matched content (model amended Haiku→`claude-sonnet-4-6` by operator
  decree later 07/05/2026 — evidence in `verification/haiku-vs-sonnet-distill.md`; the cost was never the
  model, it was the search-tool capture shape), zero calls for quiet units. `web_search_*` on a
  cron drained the account twice (06/18 freeze, 07/05 caught live at ~$6/run). Before re-enabling any
  paused workflow: grep its pipeline for `web_search` — retrofit first, re-enable second. Spec:
  `docs/superpowers/specs/2026-07-05-pulse-native-fetch-retrofit-design.md`.
- **$1 HARD BUDGET PER RUN (LOCKED 07/05/2026, operator decree).** Every scheduled pipeline that calls
  an LLM wires `ingest.lib.api_usage.RunBudget` (the ONE root — metering + `api_usage_log` ledger the
  ops /spend page reads) and charges EVERY API call; crossing the cap raises `RunBudgetExceeded` and
  the run exits 1 loud. Default cap = **$1.00 per run** for every job; the ONLY job allowed higher is
  the daily brain rebuild, via its explicit per-pipeline env var in the workflow file (a visible,
  reviewable line — never a code default). Rates verified from docs.claude.com pricing 07/05/2026
  (sonnet $3/$15 per MTok, haiku $1/$5, web search $10/1k).
- **DAILY CEILING PREFLIGHT (operator gap-call 07/05/2026: "what does a cap do when they just run it
  again and again").** A per-run cap alone meters a retry loop into $1 slices — so every scheduled
  LLM pipeline ALSO preflights the shared ledger before its first API call: sum today's
  `api_usage_log` spend; at/over the day ceiling (`INGEST_DAILY_CEILING_USD`, default $5) → exit 1
  LOUD without calling the API. Retries, re-dispatches, and heal-crons all hit the same ledger, so N
  runs can never multiply past the day ceiling. Vendor-side backstop (operator-only, console): a
  monthly workspace spend limit — the only layer that also catches spend our code never sees.
- **Probe < 1 min before any multi-minute ingest.** Fetch only the columns the normalizer reads, at the
  largest page the API honors (`docs/standards/data-and-build-bible.md` §0.1–0.2).
- **Gate 4 (pre-push):** a destructive write with no non-null guard is BLOCKED. Guard load-bearing
  columns via `ingest.lib.guards` before any `replace`. Override only: `ALLOW_REPLACE_WITHOUT_GUARD=1`.
- **Brain-first:** no Tier-2 (`data_lake.*`) table without its consuming brain's `PackDefinition` in the
  SAME PR.
- **After table creation:** `GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role; NOTIFY pgrst,'reload schema';`
- **Pipeline-freshness:** ship the GHA cron wrapper + `--dry-run` in the same PR.
- **Creds** in `.dlt/secrets.toml`. **Migrations** via `new Bun.SQL` (psql is NOT installed), `sslmode=require`.
- **Deno imports** only in `supabase/functions` (not here, but don't cross them).
- New pipeline? Start from `ingest/scaffold.py` — fix it to default incremental-aware (it's the root of the replace spread).
- **Python version is pinned 3.12 here and at repo root (`.python-version`, both places, 07/20/2026).**
  `crawl4ai`'s dep chain (`lxml`) has no prebuilt wheel for 3.14 — a bare `uv venv` run without the pin
  grabs the newest installed toolchain and silently builds a broken environment. The real, working venv
  is `ingest/.venv` (`uv venv && uv pip install -r ingest/requirements.txt`). If you ever see a `.venv`
  at the repo root again, it's not this one — check it's pinned 3.12 before trusting it, or delete it.
