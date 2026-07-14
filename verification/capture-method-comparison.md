# Capture method comparison — our gathering vs LLM-alone

**Operator ask (07/05/2026):** "make sure we have a follow up to compare the two
different styles and if the information we gather is as good as LLM alone or better."

Two different questions, two files:
- `haiku-vs-sonnet-distill.md` = WRITING quality (same input, model swapped). Done.
- THIS FILE = INFORMATION quality: does our own discovery (news_swfl crawl +
  deterministic matching + crawl4ai article fetch) FIND as much as the old
  method where Sonnet ran paid web searches on its own?

## Baselines (freeze these before the retrofit overwrites anything)

- CITY: the 07/05/2026 08:55 UTC run — last web_search-era city capture.
  Rows in `data_lake.city_pulse` (captured_at = that run) + Tier-1 raw captures.
- CORRIDOR: the 06/14/2026 weekly run — last successful web_search corridor run.
  Rows in `data_lake.city_pulse_corridors` + Tier-1 raw.
- TTL WARNING: transactions rows expire in 7d, development/business in 14d —
  the corridor baseline is already partially pruned; Tier-1 cold storage holds
  the full raw record. Comparisons should read Tier-1 for the old side.

## When to run — and the hard scope line (operator, 07/05/2026)

**"We have old reports from sonnet, so don't run a bunch of only-LLMs — just a
little comparison."** The old side is ALWAYS the stored reports above — the
Tier-1 raw captures and surviving lake rows that already exist. ZERO new
LLM-with-web-search runs are ever fired for this comparison (that path is
locked anyway). The only fresh thing in the comparison is the retrofit's own
normal scheduled output, which happens regardless.

Scale: a LITTLE comparison — spot-check ~3 cities + ~5 corridors against
their stored baselines, once after the retrofit's first live run (gate:
`pulse_crawl4ai_retrofit_live_verify` green) and once ~2 weeks later. Two
sittings total, then verdict and close. Check: `capture_method_quality_compare`.

## Metrics per unit (city / corridor)

1. **Fact count** — new-method facts vs old-method facts for a comparable window.
2. **Source breadth** — distinct outlets/domains cited by each method.
3. **Missed stories** — stories the old method surfaced that the new one lacks.
   For EACH miss, diagnose which of two very different gaps caused it:
   (a) the article never entered news_swfl → OUTLET GAP → fix = add the outlet
       to the crawl list (cheap, permanent);
   (b) the article was in the lake but didn't match the unit → MATCHER GAP →
       fix = alias/city-rule tuning.
4. **New-only stories** — what crawl4ai+matching found that paid search missed
   (search snippets skew to big outlets; our crawl reads locals end-to-end).
5. **Freshness** — captured_at minus article publish date, both methods.

## Verdict rubric (no vibes)

- PARITY: ≥80% story overlap on the old method's stories AND no missed
  breaking/transactions story for any unit.
- BETTER: new-only stories ≥ missed stories, at parity or better freshness.
- WORSE: systematic misses → fix the named gap (outlet list or matcher) and
  re-run the comparison. Paid web_search does NOT return to crons regardless —
  that path is locked (ingest/CLAUDE.md); the fix is always better gathering.

## Results

### CORRECTION 07/14/2026 (read before trusting the CORRIDOR half of sitting 1 below)

The corridor retrofit commit (`f4cad5ec`) landed 07/07/2026 10:43 ET. Sitting 1 below used
07/05/2026 as the "new" corridor run — that's BEFORE the cutover, still the old web_search method.
Verified live: `pg.data_lake.city_pulse_corridors` has **zero rows** captured after the retrofit
landed — corridor hasn't run on the new method even once yet (weekly cadence, next run pending).
So the corridor "source concentration" finding below compared two OLD-method runs (06/14 vs 07/05)
against each other, not old vs. new. The CITY half is unaffected (07/05 old / 07/08–07/14 new
straddles the same 07/07 cutover correctly).

What this changes: the diagnosis is still right, but the evidence for corridor specifically is
stronger than sitting 1 gives it credit for, not weaker. Corridor's `city_pulse_corridors`
pipeline reads from the exact same `data_lake.news_articles_swfl` lake as city (confirmed live:
`news_articles_swfl`'s only source_name values are `fort_myers_news_press`, `naples_daily_news`,
`lee_county_govt`, `collier_county_govt` — the same 4 entries in `news_swfl/fetcher.py`'s
`SOURCES`). Corridor's rich 07/05 source mix (`gulfshorebusiness.com`, `businessobserverfl.com`,
`colliers.com`, etc.) came entirely from the old web_search method. Corridor's FIRST live run on
the new pipeline — whenever the weekly cron next fires — will draw from the same narrow 4-source
lake city already shows, and will very likely collapse to the same concentration, or worse (corridor
had 6 diverse sources historically vs. city's 2). Fix this BEFORE that first live run, not after.

### Sitting 1 — 07/14/2026

**Method note (read before trusting the verdict below):** the rubric's missed-story/new-only
diagnosis assumes both methods can run over the SAME calendar window. That's no longer possible —
the old web_search method was retired wholesale when the retrofit landed, so there is no live old
run to diff against a live new run for the same day. What follows is a volume + source-breadth
comparison (old baseline run vs. new method's recent runs), which is a weaker signal than the
rubric intended but is real, queried data, not vibes. Story-level miss/new-only diagnosis cannot
be honestly run anymore; do not force a PARITY/BETTER/WORSE score from it.

**CITY — old (07/05/2026 single run) vs. new (07/08–07/14/2026, 7 days aggregated), 3 cities:**

- Cape Coral: old 3 facts / 2 source domains (1 run) vs. new 9 facts / 2 source domains (7 days).
- Marco Island: old 3 facts / 1 domain vs. new 5 facts / 2 domains.
- Naples: old 3 facts / 1 domain (`gulfshorebusiness.com`) vs. new 51 facts / 2 domains
  (`naplesnews.com`, `news-press.com` — both Gannett/USA Today Network SWFL papers, effectively one
  newsroom family).

**CORRIDOR — old (06/14/2026) vs. new (07/05/2026):**

- Old: 8 facts across 6 distinct domains (`mhsappraisal.com`, `capecoral.gov`, `linkedin.com`,
  `naiburnsscalo.com`, `gulfshorebusiness.com`, `bizjournals.com`) — no single source over 25%.
- New: 86 facts across 5 domains, but `gulfshorebusiness.com` alone supplies 57 of 86 (66%);
  `businessobserverfl.com` 15, `leegov.com` 11, `colliercountyfl.gov` 2, `colliers.com` 1.

**Fact count: NEW wins clearly, by a wide margin, at both grains.**

**Source breadth: this is where it's not a clean win.** Both grains show the same shape — far more
facts, but concentrated in 1–2 dominant sources rather than spread across the mix the old method
drew from. Root-caused, not guessed: `ingest/pipelines/news_swfl/fetcher.py`'s `SOURCES` list —
the outlet list both city_pulse and city_pulse_corridors match against — has exactly **4** entries:
`naplesnews.com`, `news-press.com`, `leegov.com`, `colliercountyfl.gov`. `gulfshorebusiness.com`,
`businessobserverfl.com`, `colliers.com`, `bizjournals.com`, `mhsappraisal.com`, `naiburnsscalo.com`
— every non-Gannett, non-government source that shows up in the new-method rows above — are NOT in
that list, meaning corridor's wider domain mix comes from a different discovery path than city's
fixed 4-URL section scrape (not traced further here — out of scope for this comparison). For city
specifically, Gulfshore Business (a real outlet the OLD method cited for Naples) is now absent
entirely — not because it stopped covering Naples, but because city_pulse never looks at it.

**Verdict: BETTER on volume, an OUTLET GAP on breadth (rubric category (a), not a matcher problem).**
The fix named in the rubric applies directly: add the missing outlets to `SOURCES` (Gulfshore
Business is the highest-value addition — it already proved itself relevant in both the old baseline
and the new corridor capture, just not the city one). Tracked: `news_swfl_outlet_list_narrow`.

Second sitting (~2 weeks out, per the original scale) should re-check source breadth after that fix
lands, not before — re-running the same query against an unchanged 4-source list would just repeat
this finding.
