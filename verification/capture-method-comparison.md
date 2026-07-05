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

## When to run

After the retrofit's FIRST LIVE run of each pipeline (gate:
`pulse_crawl4ai_retrofit_live_verify` green), and again ~2 weeks later once
several runs accumulated. Check: `capture_method_quality_compare`.

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

(appended per run — nothing yet; retrofit not landed as of 07/05/2026)
