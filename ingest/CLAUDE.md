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
  small Haiku distill per unit WITH matched content, zero calls for quiet units. `web_search_*` on a
  cron drained the account twice (06/18 freeze, 07/05 caught live at ~$6/run). Before re-enabling any
  paused workflow: grep its pipeline for `web_search` — retrofit first, re-enable second. Spec:
  `docs/superpowers/specs/2026-07-05-pulse-native-fetch-retrofit-design.md`.
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
