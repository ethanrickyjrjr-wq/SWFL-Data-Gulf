# news_swfl novelty (new-URL) content guard

**Date:** 2026-07-05

- **Slug:** `news-novelty-guard` · **Check:** `news_novelty_guard_live_verify`
- **Follow-up to:** `2026-07-05-content-freshness-guards-design.md` (news_swfl was EXCLUDED from
  phase 1 by the RULE 0.5 probe; operator directive 2026-07-05: build the novelty guard)

## Problem (verified against live code 2026-07-05)

news_swfl merges into `data_lake.news_articles_swfl` (`primary_key="article_url"`) with **no content
date at all**:

1. `fetcher.py:66` passes `published_date=None` for every article; `normalizer._coerce_pub_date`
   (normalizer.py:39) silently coerces `None` → **`date.today()`**. The stored `published_date` is a
   scrape timestamp in disguise — an age guard on it would trivially PASS every run and protect
   nothing (the spec's "fails every run" premise was one layer off: the None never reaches the row).
2. dlt `merge` uses the **delete-insert** strategy (verified in-session via crawl4ai, dlt
   merge-loading docs): a re-seen `article_url` has its whole row deleted and re-inserted, so
   `published_date` re-bumps to today and `scraped_at` (DB default) re-stamps on every run. Nothing
   DB-side preserves when an article was FIRST seen.
3. Source errors are swallowed (`fetcher.py` prints and continues). All 4 sources failing → 0
   articles → merge writes nothing → **exit 0, cron green**. The daily probe reads `scraped_at`
   (load time, cadence 1×1.5d) so it only catches the cron not running — not a scrape that runs
   green while finding nothing new (LINK_RE regression, markup change, WAF block).

Staleness for news therefore means: **no NEW article_url has appeared** — a novelty question, not an
age question.

## Mechanism — carry first-seen forward, then reuse `assert_content_fresh`

No new guard function. Make `published_date` mean what it already pretends to mean — **the date we
first saw the article** — and the existing age guard becomes a novelty guard:

1. **Materialize the batch** in `pipeline.run()` (mirror the zhvi/zori `rows=` pattern) instead of
   fetching lazily inside the dlt resource.
2. **Carry-forward** (new `novelty.py`): one query for the batch's URLs against
   `data_lake.news_articles_swfl (article_url, published_date)`. A re-seen URL keeps its stored
   `published_date`; a new URL keeps today. This is what makes first-seen survive delete-insert.
3. **Guard:** `newest = MAX(published_date across the carried batch)` →
   `assert_content_fresh(newest, NEWS_NOVELTY_MAX_AGE_DAYS, label="news_swfl")`. If nothing on the
   listing pages first appeared within the window, or the batch is empty (`newest=None`, closes
   hole 3), raise `ContentStaleError` → non-zero exit → cron red with the CONTENT_STALE class.
4. **Bootstrap/degraded:** if the pre-query fails (no DB reachable, bootstrap), log a
   `BASELINE_UNAVAILABLE`-style warning and skip the carry (all rows keep today → guard passes) —
   same fail-open-on-infra spirit as `assert_vs_baseline`. The subsequent write would surface a real
   connection problem anyway.

**Threshold: 7 days.** Cadence is 1d, but the registry itself notes a quiet day may legitimately
publish 0–1 SWFL-relevant articles, and the two govt sources are weekday-only. Zero new URLs across
all 4 sources for a full week = scrape broken, not a slow news week. Tighter than nothing existed
before (the probe's 1.5d load check is orthogonal); loose enough to never trip on a holiday lull.

**Semantic repair, for free:** `published_date` stops re-bumping on re-merge. Its only consumer
(`app/api/cron/news-crawl` → `lib/signals/news-event-extractor.ts` `event_date`) processes each row
once near first-seen, so a stable first-seen date is strictly more accurate than the current
re-bumped value. The news-swfl brain pack reads DBPR sources, not this table — unaffected.

## Approaches considered

- **A. Strict per-run "≥1 new URL":** stateless, but false-reds on quiet weekends/holidays (registry
  documents 0–1 article days). Rejected.
- **B. Carry first-seen + reuse `assert_content_fresh` (chosen):** novelty age with a grace window;
  state lives in the table itself; zero new guard machinery (RULE 3 C2 — extend existing seams);
  fixes the `published_date` semantic lie as a side effect.
- **C. Separate novelty-state table/file:** new state surface to maintain for one pipeline.
  Rejected as over-machinery.

## Changes

1. `ingest/pipelines/news_swfl/novelty.py` — `carry_first_seen(rows)` (query + carry, fail-open with
   warning) + `NEWS_NOVELTY_MAX_AGE_DAYS = 7`.
2. `ingest/pipelines/news_swfl/pipeline.py` — materialize batch, carry, guard, then
   `pipeline.run(news_articles(rows=batch))`. `--dry-run` unchanged (no DB touch).
3. Tests `ingest/tests/pipelines/news_swfl/test_novelty_guard.py` — carry keeps stored first-seen /
   leaves new URLs at today; all-re-seen-and-old trips `ContentStaleError`; empty batch trips;
   DB-unavailable warns and passes; fresh-new-URL passes.
4. `ingest/cadence_registry.yaml` news_swfl note — record the novelty guard.
5. Parent spec `2026-07-05-content-freshness-guards-design.md` — mark the news_swfl follow-up built.

## Non-goals

- No real publish-date extraction from article pages (meta tags/JSON-LD) — separate enrichment, not
  needed for staleness detection.
- No change to the NEWS_ADAPTIVE fetcher — the guard operates on the returned batch, covering both
  fetch paths.
- The daily probe stays on `scraped_at` and stays non-gating.

## Done when (live proof)

Deterministic tests prove: a batch with zero never-seen-before URLs whose stored first-seen dates
are all >7d old raises `ContentStaleError` before the merge; an empty batch raises immediately. The
live cron-red is the operator-run `news_novelty_guard_live_verify` check.
