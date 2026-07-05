# corridor+city pulse on crawl4ai — kill paid web_search captures

**Date:** 2026-07-05
**Check:** `pulse_crawl4ai_retrofit_live_verify`
**Operator decree (07/05/2026, verbatim intent):** "Why are we just not using crawl4ai and having Claude write about it or summarize it?" — after the console showed the corridor run billing ~2.5M input tokens in a two-hour window (operator's pasted usage log) via the paid web-search tool.

## Problem (evidence)

Both `ingest/pipelines/city_pulse/` (DAILY) and `ingest/pipelines/city_pulse_corridors/` (weekly, 25 corridors) capture with **`claude-sonnet-4-6` + the paid `web_search_20250305` server tool, `max_uses: 8`**. Each capture bills every search iteration against the ever-growing context (the operator's console paste shows one request id billed in 4+ segments of 20–60k input tokens each), PLUS per-search fees. The corridor job also lost three full weekly spends to 45-minute timeout kills (06/21, 06/28, 07/05) because rows only write at the end. Today's earlier "cost mode" change only downgraded the small distill call to Haiku — the expensive capture path was untouched.

**Both workflows are DISABLED as of 07/05/2026 (`disabled_manually`)** — zero further spend until this retrofit ships. The brains they feed tolerate the gap per Operation Dumbo Drop posture (empty-tolerant consumers).

## Goal

Same rows, same tables, same downstream contract — at the "actual pennies" tier: our own fetch (crawl4ai, free) + one small SONNET summarize per unit that has news, zero LLM calls for units that don't. (Model amended Haiku→Sonnet by operator decree 07/05/2026 — see item 3.)

## What we're building

1. **Discovery from what we already ingest.** `news_swfl` crawls the local outlets daily into the lake (crawl4ai, already live). Match each article to cities/corridors with the existing deterministic matchers — `refinery/lib/corridor-aliases` for corridors, city-name rules for cities. No LLM, no fees.
2. **Fetch with crawl4ai, not the search tool.** For matched articles whose stored row lacks full text, fetch the article URL with the pinned crawl4ai venv (stealth/HTTP-strategy patterns already proven on swfl_inc/dbpr). Optionally add 1–2 outlet-search listing pages per run (an outlet's own search URL for a corridor name) — still crawl4ai, still free.
3. **One SONNET distill per city/corridor WITH MATCHES.** `claude-sonnet-4-6` (operator decree 07/05/2026, "just do sonnet" — the day-1 comparison in `verification/haiku-vs-sonnet-distill.md` showed Haiku drops facts, compresses names/addresses, and misattributed an $835M sale to a $26.6M one; in the no-tools distill shape Sonnet is ~$0.03–0.07/unit). `MODEL` lives in `ingest/pipelines/city_pulse/distill.py` and the corridor distill imports it — already flipped. Input = the matched article texts only (a few thousand tokens), output = the same rows the current distill emits. A unit with zero matched articles this period = **zero LLM calls** and a no-op merge. BUDGET: 25–27 corridors × Sonnet can reach ~$0.75–1.90 on a busy week — measure at dry-run; if > $1, the corridor workflow carries a visible `CORRIDOR_PULSE_MAX_USD=2` env line (the decree's reviewable exception mechanism), never a silent code default.
4. **Checkpoint per unit.** Rows upsert as each city/corridor finishes, so a kill loses one unit, never a run's spend. Timeout drops back to something sane.
5. **Provenance unchanged:** every kept fact still carries its source URL; no-invention lint path and freshness columns stay as-is so ops tiles keep working.
6. **$1 hard budget (operator decree 07/05/2026).** Both pipelines already construct `ingest.lib.api_usage.RunBudget` (the one metering root, wired 07/05 into all ingest call sites + the `api_usage_log` ledger); the decree sets `default_usd=1.0` on BOTH — no env override in these workflows. Under the retrofit $1 is laughably generous; under the old web_search capture it kills the run early by design.

## Cost math (from the operator's own paste + the pipelines' constants)

Today: corridor run ≈ 2.5M+ Sonnet input tokens + up to 200 paid searches per WEEK (25 corridors × max_uses 8); the city job is the same shape per DAY. Retrofit: discovery + fetch = $0 (crawl4ai); distill = a handful of SONNET calls per run at ~3–6k tokens each (~$0.03–0.07/unit; rates: sonnet $3/$15 per MTok, verified 07/05/2026). Worst week (every corridor has news) ≈ 25 Sonnet calls ≈ $0.75–1.90 — still ~70–100× cheaper than the web_search capture it replaces.

## Out of scope

- No change to downstream tables, brains, or `--- OUTPUT ---` shapes.
- `web_search_20250305` stays for surfaces where model-driven search IS the product (compose-chart external_points — different lane, tiny volume).
- dbpr/swfl_inc/news_swfl pipelines untouched (already crawl4ai).

## Execution notes

- `ingest/CLAUDE.md` read-first applies; `news_swfl` + `cadence_registry.yaml` are actively claimed by a parallel session (novelty-guard work) — coordinate or isolate in a worktree per RULE 1.5 before touching shared ingest files.
- Ship order: corridors first (weekly, bigger burner, currently dark), then city (daily). Each ships `--dry-run` + its cron wrapper update in the same PR (pipeline-freshness rule).
- Re-enable each workflow ONLY after its retrofit's dry-run is green on the runner. Closing `pulse_crawl4ai_retrofit_live_verify` requires a real run URL showing rows written and a console view with zero web-search billing segments.
