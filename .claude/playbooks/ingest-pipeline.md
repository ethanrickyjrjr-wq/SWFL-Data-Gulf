---
name: ingest-pipeline
for: adding, extending, or backfilling a data source into data_lake.* — ingest/, cadence_registry, GHA cron wrappers
---
### Ingest pipeline

**You own the source's FULL scope before one row lands.** Read `ingest/CLAUDE.md` on entry.

1. FULL-SCOPE-FIRST: enumerate the source's complete field list (schema endpoint / docs / live probe — READ the ceiling, not information_schema), write it into the pipeline's `source_scope` block in `ingest/cadence_registry.yaml`, and show the operator BEFORE coding (RULE 0.4).
2. `docs/standards/data-roots.md`: which concept this feeds; one root per concept per cadence; a duplicate root is never DROPped until the replacement runs and consumers repoint (RULE 0.55).
3. Brain-first: no bulk ingest lands without its consuming brain's PackDefinition in the same PR. A registry entry with `consuming_pack: none` is a DARK ROOT (SessionStart prints them).
4. ZIP three gates: situs address / lat-lon only, never mailing ZIP; derivable now → derive + backfill + wire; a new Tier-2 zip_code needs its consumer in the same PR.
5. Backfills copy `backfill_listed_date.py` — per-property, resumable, free dry-run; never a sampling grid (memory: backfill pattern, 2,600 wasted calls 08/05/2026).
6. Paid sources follow RULE 0.7a's ladder; no paid search in scheduled ingest; SteadyAPI 1 req/s, 50k/mo.
7. Schedule membership: `jobs:` in `cadence_registry.yaml` + `node scripts/schedule-catalog.mjs` (Gate 10). Pipeline-freshness per `docs/standards/pipeline-freshness.md`.
8. Migrations: run directly via `new Bun.SQL` (creds `.dlt/secrets.toml`), idempotent, verify the row count after and paste it (RULE 1).
9. Writes to `data_lake.*` are ASK-FIRST (RULE 1) — stage the push, hand the operator the verify line, do not push.
10. Update `docs/standards/repo-inventory-audit.md` before leaving the area if the source list changed.

**Rules carried:** FULL-SCOPE-FIRST · RULE 0.55 · brain-first + ZIP gates (ingest/CLAUDE.md) · RULE 0.7a · RULE 1 ask-first (data_lake) + migrations · Gate 10.

**Reply:** the full field list vs what we ingest, the root it feeds and its consumer, row counts pasted, the ask-first items awaiting the operator.
