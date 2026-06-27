# Handoff — seed Sarasota + Charlotte into the listing-lifecycle tables (Source B)

> **PARKED (deferred 2026-06-27).** Operator: "don't think we need sarasota and charlotte right now …
> save it for when we get this to work." Lee/Collier/Hendry are seeded and the brain is wired on those.
> Run this only when we come back to widen coverage to the region's other two counties.

**For:** a fresh Claude session, run in parallel.
**Task:** seed two SWFL counties into `data_lake.listing_state` + `data_lake.listing_transitions`
using the EXISTING listing-lifecycle pipeline. **Run-only — write NO code, commit nothing, push
nothing.** Another session is editing `refinery/*` concurrently; your job touches neither.

## What this is
Source B is a hosted real-estate listings site; its origin is **not in the repo** —
it lives in the `LISTING_LIFECYCLE_BASE_URL` secret/env (the operator will give you the value). The
pipeline scrapes its active for-sale listings via crawl4ai (HTTP strategy, no browser) and runs an
address-keyed state machine (see `ingest/pipelines/listing_lifecycle/`). Hendry, Collier, and Lee
are already seeded and correct. You are adding **Sarasota** and **Charlotte**.

## Critical facts (so you don't re-derive or break anything)
- **The source caps deep pagination at ~3,000 results per query** (pages past ~150 return empty
  200s). The pipeline ALREADY handles this: `extract.scan_county` partitions each county by **price
  band** (each band < cap) and unions, recovering the full inventory. You do not need to do anything
  special — just run it. Expected totals: **Sarasota ≈ 5,273**, **Charlotte ≈ 3,339**.
- **Sarasota + Charlotte are MLS region 240** (alphanumeric MLS ids, e.g. `C7527801`), and that feed
  carries a small Tampa-Bay "TB…" bleed. The pipeline drops out-of-area rows via the SWFL ZIP scope
  filter (`fixtures/swfl-zip-county.json`), so the seeded counts may sit a little under the
  page-printed totals — that's correct, not a bug.
- **Coverage guard is truncation-safe.** If a county's pull is incomplete (a 403/WAF throttle, or a
  count far below the page-printed total), the run **skips that county and writes nothing** rather
  than seeding a partial set. A clean run logs `[ok] <County>: scanned=… seed=True …`. If you see
  `[skip]` or a `[warn] … 403`, the site throttled — wait and re-run; do NOT lower the page delay
  below 1.5s.
- **Interpreter:** `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe` (has crawl4ai + bs4 + psycopg).
  DB creds come from `.dlt/secrets.toml` automatically. crawl4ai is the only crawl tool — never
  Firecrawl. Any crawl4ai/scratch files stay local (gitignored `*crawl4ai*`); never `git add` them.

## Run it (from the repo root; each is ~10–15 min, so background them)
```bash
export LISTING_LIFECYCLE_BASE_URL=<the Source B origin the operator gives you>
PY="C:/Users/ethan/crawl4ai-venv/Scripts/python.exe"
$PY -m ingest.pipelines.listing_lifecycle.pipeline --county Sarasota 2>&1 | grep -E "\[ok\]|\[done\]|\[skip\]|\[warn\]|\[fatal\]"
$PY -m ingest.pipelines.listing_lifecycle.pipeline --county Charlotte 2>&1 | grep -E "\[ok\]|\[done\]|\[skip\]|\[warn\]|\[fatal\]"
```
Tip: a dry run first (`--dry-run --county Sarasota`) prints what it WOULD write without touching the
DB — good for a quick sanity check before the real seed.

## Verify (counts by county)
```bash
C:/Users/ethan/crawl4ai-venv/Scripts/python.exe -c "import sys;sys.path.insert(0,'.');from ingest.pipelines.listing_lifecycle import distill;c=distill._get_conn();cur=c.cursor();cur.execute(\"SELECT county,count(*) FROM data_lake.listing_state WHERE source_name='lifecycle_seed' GROUP BY 1 ORDER BY 1\");print(cur.fetchall())"
```
Success = Sarasota ≈ 5,273 and Charlotte ≈ 3,339 appear (alongside the existing Hendry 298 / Collier
~2,749 / Lee ~7,400). If Sarasota or Charlotte come in dramatically low (e.g. ~3,000), that's the cap
leaking through — report it; do not "fix" the code (the other session owns the extractor).

## Hard constraints (collision avoidance — non-negotiable)
- **RUN-ONLY.** Do not edit any file under `ingest/`, `refinery/`, `migrations/`, or anywhere else.
  Do not commit. Do not push. Do not run a refinery/brain build. The other session is mid-edit on
  `refinery/*` and the shared extractor.
- If you genuinely must edit something, STOP and coordinate — or work in a local worktree
  (`node scripts/worktree.mjs new <label>`), per CLAUDE.md RULE 1.5. You should not need to.
- Only Sarasota + Charlotte. Do not re-run or delete Hendry / Collier / Lee — they're already seeded.
- Report back: the per-county `[ok]` lines + the verify counts. That's the whole deliverable.
