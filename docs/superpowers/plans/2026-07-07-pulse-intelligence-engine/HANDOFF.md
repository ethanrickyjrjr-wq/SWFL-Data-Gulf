# Pulse Intelligence Engine — HANDOFF (as of 2026-07-07)

> **Recommended model:** ⚡ Sonnet — keywords: architecture

Pick-up doc for whoever re-enables the crons or builds Phase 2/3. Everything for this build is in this folder:
`00-design.md` (target architecture), `01-phase1-plan.md` (the executed plan), `README.md` (follow-on uses), this file.

## State in one line
**Phase 1 code is BUILT, REVIEWED, LIVE-CONFIRMED, and on `origin/main`. The crons are still DARK. Re-enabling is the one remaining operator step (Task 6), and it should enable CITY only (corridor is near-empty until Phase 3).**

## What Phase 1 does
Both pulse pipelines (`ingest/pipelines/city_pulse/`, `ingest/pipelines/city_pulse_corridors/`) now capture current-events facts by reading the FREE `data_lake.news_articles_swfl` lake (crawl4ai-fed by the `news_swfl` cron) and matching articles to a city/corridor, instead of the paid `web_search_20250305` tool. Sonnet (`claude-sonnet-4-6`) distills the matched article text into cited facts — unchanged fact-extraction, just a different source of spans. A unit with no matches makes zero LLM calls.

New shared modules: `ingest/lib/pulse_match.py` (deterministic matcher), `ingest/lib/pulse_lake.py` (lake reader + capture builder + `known_urls_by_unit` dedup + 45-day `evict_stale_pool`). `distill.py` fact logic is untouched except it now charges `RunBudget` (caps lowered 8/16 → **1.0**).

## Commits (all on origin/main)
`9a5e583e` matcher · `ace41607` lake reader · `b1b5bbd1`+`ff93dd23` city retrofit · `f4cad5ec` corridor retrofit · `451c6bb6` eviction · `fae055f2` **C1 dedup-before-distill** · `80e59b39` doc corrections. (Plus session-log/plan-doc commits.)

## Live-confirm evidence (real lake, operator-authorized paid dry-runs 07/07/2026)
- Bonita Springs: 12 matched → **9 real dated sourced facts** (Oakes Landing venue proposed→withdrawn, Bonita Beach Rd data center, 2,000 homes) at **$0.065**.
- Estero: 3 matched → 3 facts (Coconut Point retailers) at **$0.02**, with the new dedup DB query running clean.
- Zero invention — every fact carries its news-press/naplesnews URL.

## Task 6 — re-enable the crons (OPERATOR-RUN, and now free)
Do NOT uncomment a schedule until its dry-run is green on the runner with **zero web-search billing**.
1. `gh workflow run city-pulse-daily.yml -f dry_run=true` → confirm the log shows "N lake articles", per-city matched counts, distilled facts, and `api_usage_log` shows only Sonnet distill calls (no `searches`).
2. Uncomment the `schedule:` block in `.github/workflows/city-pulse-daily.yml` (`- cron: "0 9 * * *"`), delete the PAUSED comment.
3. Close `pulse_crawl4ai_retrofit_live_verify` with the run URL.
4. **Corridor: HOLD.** Live data shows only 1 of 27 corridors matches any article — re-enabling would ship a near-empty pulse. Leave `corridor-pulse-weekly.yml` dark until Phase 3's active gather lands. (It's safe to run — ~$0 — but produces almost nothing.)

## Open checks (the source of truth — `node scripts/check.mjs list`)
- `pulse_crawl4ai_retrofit_live_verify` — Phase 1 live-verify (close after Task 6 city dry-run).
- `pulse_dedup_before_distill` — **DONE in code** (commit `fae055f2`); close after the first real city run shows no re-pay.
- `ingest_daily_ceiling_preflight` — pre-existing platform gap: the locked daily-ceiling preflight in `ingest/CLAUDE.md` is NOT wired in `api_usage.py`. Bounds retry-loop re-spend per-day. Worth building before high-volume LLM crons.
- `pulse_pool_evict_enable` — schedule the eviction + first real `apply=true` once coordinated with the `news_swfl` owner (shared table).
- `pulse_event_thread_ledger` (Phase 2), `pulse_per_user_delivery_memory` (Phase 3), `pulse_aggressive_gather_gapfill` (Phase 3).

## Known limitations (real, measured — not rules)
1. **Hub cities over-match.** "fort myers"/"naples" appear in ~60/63 articles, so those distills get large payloads (more cost, less focused). C1 dedup bounds the *repeat* cost; a per-unit recency cap or Phase-3 Sonnet ranking would bound the *first-run* payload. Not a blocker.
2. **Corridors near-empty (1/27).** Passive news rarely names a specific road. Fixed by Phase-3 active gather (free-crawl outlet search pages per corridor name) — the escalation ladder in `00-design.md`.
3. **Mirror-source dupes.** naplesnews + news-press carry the same wire story → the distill emits it twice with different URLs. Partly collapsed by `story_key` + `reconcile_supersession` on real writes; fully fixed by Phase 2's event-thread ledger.
4. **Daily-ceiling preflight missing** (see check above).

## Phase 2 / 3 — the memory (design-locked in 00-design.md, not built)
- **Phase 2 (`pulse_event_thread_ledger`):** durable event-thread ledger extending `project_events` — one thread per `story_key`, lifecycle state (announced→…→terminal), open/terminal watch flag, rolling summary appended O(1), tiered retention (open kept, terminal +90d). Delivers temporal dedup + the "Walmart we flagged in January now opens" awareness. **Build 2 correctly** (operator emphasis) — own brainstorm first.
- **Phase 3 (`pulse_per_user_delivery_memory` + `pulse_aggressive_gather_gapfill`):** per-USER delivery memory so a back-reference fires only for a user we actually told; aggressive all-day free crawl + rung-3 targeted paid search only for measured gaps.

## Gotchas for the next session
- Test interpreter: `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe -m pytest ingest/...` (it carries the ingest deps).
- `news_articles_swfl` is owned by a parallel `news_swfl` session — pulse only READS it; the eviction is the one write, dispatch-only.
- This session ran interleaved with several parallel sessions on `main`; commits are interleaved but linear.
