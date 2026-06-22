# 01 — news_swfl `published_date` schema mismatch

**Model: Sonnet.** Single-file + one idempotent migration; the fix direction is pinned below.
**Priority: P0.**

> **STATUS — ALREADY RESOLVED (audit re-verify 2026-06-22).** This red was fixed on
> **2026-06-20** by commit `79f924c9` (idempotent `date→text` ALTER), the day before this
> doc was authored. A live read-only `information_schema` probe (2026-06-22) confirms
> `data_lake.news_articles_swfl.published_date` is **already `text`** with **28 rows**, and
> `daily-rebuild` is **green** (run 27879193913). **Do NOT re-run the ALTER as a "fix" — it
> is a confirmed no-op.** Re-scoped to: (1) confirm green (done), (2) close the still-OPEN
> `news-swfl-ingest` ledger row (done — `docs/cron-rebuild-failures.md`), (3) carry the
> durable recurrence-prevention to Phase-7 build 22 (dlt `schema_contract`). The original
> migration spec is retained below for the record.

## The defect (verified)
`news-swfl` crawl SUCCEEDS; the dlt LOAD fails every run:
`psycopg2.errors.DatatypeMismatch: column "published_date" is of type date but expression is of type
character varying`. Misattributed to crawl4ai in the ledger — it's a schema drift.

**Fix direction is the opposite of the obvious read.** The pipeline already commits to **text**:
`ingest/pipelines/news_swfl/pipeline.py:12-14` sets `columns={"published_date": {"data_type": "text"}}`
(with a documented dlt insert-values reason) and `normalizer.py` emits an ISO `YYYY-MM-DD` **string**.
The live table column is legacy `date`. dlt never ALTERs an existing column → mismatch forever.

## Steps
1. **Probe first.** Read `pipelines/news_swfl/pipeline.py`, `normalizer.py`, and confirm the live column
   type: `SELECT data_type FROM information_schema.columns WHERE table_schema='data_lake' AND
   table_name='news_articles_swfl' AND column_name='published_date';` (the real table is
   `news_articles_swfl` — words in that order; an earlier draft of this doc had it backwards)
2. **Idempotent ALTER `date → text`** (align the DB to the pipeline's committed intent). Run it directly
   (creds in `.dlt/secrets.toml`, psycopg3 — RULE 1 SQL-migrations-run-directly):
   `ALTER TABLE data_lake.<news table> ALTER COLUMN published_date TYPE text USING published_date::text;`
   Guard it so re-running is a no-op (check current type first; skip if already `text`).
3. **Decision note:** ALTER→text is the minimal, intent-aligned fix. If downstream wants real `date`
   semantics, the *larger* alternative is normalizer→`date` + resolving the dlt insert-values reason the
   `pipeline.py:12` comment documents — out of scope for this P0; note it for later if a consumer needs it.

## Done when
- ✅ `news-swfl-ingest` / `daily-rebuild` completes the dlt LOAD with **exit 0** and rows land — confirmed green (run 27879193913), 28 rows in `data_lake.news_articles_swfl` (live probe 2026-06-22).
- ✅ The still-OPEN `news-swfl-ingest` ledger row closed with the real root cause (`docs/cron-rebuild-failures.md`, triaged 2026-06-22). No `scripts/check.mjs` row exists for this — it was only ever a cron-ledger row.

## Best-practice fold-in
dlt's `schema_contract` setting is the durable recurrence-prevention complement to this one-off ALTER.
Setting `data_type: "evolve"` lets dlt handle new variant columns without crashing; `"freeze"` surfaces a
clean `DataValidationError` instead of a silent mismatch. Wire it on the `news_swfl` pipeline (build 22)
so future column-type drift fails loud rather than re-opening this red. (REPORT three-things row 1.)

## Risk
Low. One column, idempotent, intent-aligned. The only data-write — verify row count after; do not truncate.

## References (added 2026-06-22 — crawl4ai-live + best-practices fold-in)
**crawl4ai-live (tool-usage reference, docs/audit/2026-06-21-crawl4ai-live/):**
- (n/a — the crawl SUCCEEDS; this is a dlt LOAD/schema-drift bug, misattributed to crawl4ai in the ledger)
**best-practices-research (how to build/operate what we build, docs/audit/2026-06-21-best-practices-research/):**
- `docs/audit/2026-06-21-best-practices-research/round1/data-dlt-schema-contracts.md` (REPORT "three things that break" row 1) — schema_contract data_type:"evolve" -> variant column, no crash; "freeze" -> clean DataValidationError
- `docs/audit/2026-06-21-best-practices-research/round1/data-dlt-schema-evolution.md` — how dlt evolves columns; why it never ALTERs an existing one
- `docs/audit/2026-06-21-best-practices-research/round3/q-dlt-data-types-coercion.md` — date vs varchar coercion on load
**Verified:** V-5 — the idempotent ALTER is date->text (pipeline already commits to text), NOT text->date — folded into Steps above where applicable.
