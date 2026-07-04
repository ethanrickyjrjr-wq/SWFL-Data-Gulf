# 18 — Content-freshness guards on the merge pipelines (P3)

- **Status:** ⬜ Not started — **brainstorm/plan first (RULE 3.5)**
- **Owner:** ingest-engineer
- **Source:** autopsy §9.3 + §5-C (lee_permits landmine)

## What

11 merge ingest pipelines (redfin, zhvi, zori, permits, bls, noaa, news, …) have **no content-freshness
guard** — they check *load* date, not *content* date. So `lee_permits` sat **18 days stale behind 3
green cron runs.** Add a `MAX(content_date)` freshness guard + a volume floor to every merge pipeline.

Also: `home-values` / `investor-zip` narrate ZHVI ~10–16 days after it lands in the lake — tighten that
cadence so a scheduled send cites the freshest pull.

## Why it's a plan, not a quick edit

11 pipelines + the cadence registry. Read `ingest/CLAUDE.md`, `docs/standards/pipeline-freshness.md`,
and the Bible before touching. Probe each pipeline's normalizer for the content-date column first.

## Steps

1. `superpowers:brainstorming` + crawl4ai research pass (RULE 0.4) on freshness-guard patterns.
2. `node scripts/new-build.mjs <slug> "<label>"`.
3. Add `MAX(content_date)` guard + volume floor per merge pipeline (guard via `ingest.lib.guards`).
4. Tighten the ZHVI narration cadence.

## Done when (live proof)

- A deliberately stale/short load is **blocked** by the guard on at least one pipeline (e.g. re-run
  `lee_permits` against stale content → guard trips, cron goes red instead of green-but-0-fresh).

---
When done: flip Status to ✅ and `git mv` this file to `../Operation-July-DONE/`.
