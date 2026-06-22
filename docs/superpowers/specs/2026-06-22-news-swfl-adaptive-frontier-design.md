# news_swfl adaptive frontier (SOLO-14) — design

**Date:** 2026-06-22 · **Plan:** `docs/audit/2026-06-21-full-platform-audit/PLAN/phase-3-probe-first-upgrades/SOLO-14-news-swfl-crawl-rework--OPUS.md`

## Problem (probed, not remembered)

`ingest/pipelines/news_swfl/fetcher.py:55` rolls a bare `AsyncWebCrawler()` — bypasses the shared
client (`Crawl4aiSession`/`fetch_many`, no dispatcher / rate-limiter / stealth) — and caps yield at
`MAX_ARTICLES_PER_SOURCE = 10` × 4 sources ≈ **40 total**, with relevance decided by a regex
`LINK_RE` sieve over the listing-page markdown. It also does N+1 `arun()` calls (one listing + one
per article).

## Decision (approved 2026-06-22)

**Option A behind a default-off `NEWS_ADAPTIVE` flag.** Baseline `fetcher.py` stays byte-identical
when the flag is unset → zero risk to the live `news-swfl-ingest` cron. The battle-test numbers
decide whether to recommend flipping the flag / closing the check. Option B (migrate the default
baseline onto the shared client) is a riskier default-behavior change and is **deferred**.

## What gets built

1. **`adaptive_fetcher.py`** (new, isolated). Per source, one crawl with:
   - `BestFirstCrawlingStrategy(max_depth=1, include_external=False, url_scorer=KeywordRelevanceScorer(SWFL keywords), filter_chain=FilterChain([DomainFilter(host), URLPatternFilter(article patterns)]), max_pages=MAX_PAGES_PER_SOURCE)`
   - Pure keyword math, **zero API cost** (no LLM, no embeddings).
   - Each depth-1 result → existing `normalize()` → same `ArticleRow`. Depth-0 (the listing page)
     is dropped. `swfl_relevance` is re-checked exactly as the baseline does → **precision contract
     preserved**.
   - Runs through an `UndetectedAdapter` + stealth browser (folds in the shared client's stealth
     free-win within the adaptive path), one crawler per source mirroring the proven baseline
     isolation pattern.
2. **Flag wiring in `fetcher.py`** — `fetch_all_sources()` lazily dispatches to
   `fetch_all_sources_adaptive()` only when `NEWS_ADAPTIVE` is set. Lazy import keeps the baseline
   import surface (and the deep_crawling dependency) untouched when off.
3. **Offline fixture test** — mocked crawler; asserts the adaptive path yields `ArticleRow`s with
   `article_url` preserved, depth-0 dropped, and out-of-area pages filtered out.
4. **Battle-test (the gate)** — baseline vs adaptive live against the 4 sources; record
   yield / freshness / precision. Network blocks are reported, never silently swallowed.

## Contract invariants (must not break)

- dlt `primary_key="article_url"` — `article_url` is the page's own URL (depth-1), unique per row.
- `ArticleRow` shape unchanged (reuses `normalize()`).
- `published_date` stays TEXT (build-01 fix `79f924c9`); adaptive passes `None` → `normalize()`
  defaults to `date.today()`, identical to baseline.
- Default path (flag off) byte-identical to today.

## Done when

Battle-test numbers recorded; Option A behind the default-off flag; `primary_key=article_url`
preserved; offline test green; `--dry-run` exits 0.

## Battle-test results (live, home IP, 2026-06-22)

`python -m ingest.pipelines.news_swfl.battletest`

| metric | BASELINE (~40-cap + regex) | ADAPTIVE (BestFirst frontier) |
| --- | --- | --- |
| yield (swfl rows) | 30 | **48** |
| distinct URLs | 28 (2 dupes) | **48 (0 dupes)** |
| by source | naples 10, news-press 10, lee 5, collier 5 | naples 24, news-press 24, lee 0, collier 0 |
| distinct pub dates | 1 (today) | 1 (today) |
| wall | 21.5s | 18.3s |
| URLs adaptive found that baseline missed | — | **29** (19 overlap) |

**Verdict: ADAPTIVE wins** on the two sources that actually work (Gannett). +18 yield, zero dupes,
faster, and every row is a real pattern-matched `/story/` article.

**County-source rot (pre-existing, affects baseline too — NOT a mechanism defect):**
- `leegov.com/news/releases` is a dead **404** (`PageNotFoundError.aspx`); `leegov.com/news` sits
  behind a SharePoint **auth wall** (`_layouts/15/Authenticate.aspx`, `ERR_INVALID_AUTH_CREDENTIALS`).
- `colliercountyfl.gov` **301-redirects to a new domain `collier.gov`**; the new `/news` listing is a
  JS SPA with no `<a href>` article links the frontier can follow.
- The baseline's 5+5 county rows are **nav-chrome false positives** (menu links whose anchor text
  contains "Lee County"/"Collier" passing the headline SWFL filter). Adaptive correctly yields 0
  real articles there. Fixing these needs a different ingest path (RSS / API / ODD manual scaffold),
  tracked separately as `news_county_sources_rotted` — out of SOLO-14 scope.

**Freshness follow-up (noted, not in scope):** both paths stamp `published_date = today` because
`normalize(published_date=None)`. A real per-article date parse (from `<time>`/JSON-LD) is a separate
improvement; recorded so the "distinct pub dates = 1" above isn't mistaken for a frontier defect.

## Deviation from plan (justified by the mandated gate)

The plan named `filter_chain=[DomainFilter, URLPatternFilter]`. The battle-test proved a start-host
`DomainFilter` (and `include_external=False`) both measure against the *start* domain, so they reject
a 301 to a new domain (Collier). `DomainFilter` is retained (harmless, plan-specified, and protects
the non-redirecting Gannett sources), but the takeaway is recorded: domain redirects are a
source-list-repair concern, not something the filter chain can paper over.
