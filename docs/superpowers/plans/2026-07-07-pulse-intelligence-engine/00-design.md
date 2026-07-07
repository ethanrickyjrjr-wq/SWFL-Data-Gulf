# Pulse Intelligence Engine — crawl4ai capture, durable event-thread memory, per-user delivery

**Date:** 2026-07-07
**Supersedes:** `docs/superpowers/specs/2026-07-05-pulse-native-fetch-retrofit-design.md` (that spec's *direction* was right — kill paid web_search capture — but three of its load-bearing claims are wrong against live code; corrected below).
**Checks:** Phase 1 = existing `pulse_crawl4ai_retrofit_live_verify`. Phase 2 = `pulse_event_thread_ledger`. Phase 3 = `pulse_per_user_delivery_memory` + `pulse_aggressive_gather_gapfill`.
**Operator design session:** 2026-07-07 (this brainstorm). Verbatim intents woven in below.

---

## Why this exists

Two pulse pipelines — `ingest/pipelines/city_pulse/` (daily, 13 cities) and `ingest/pipelines/city_pulse_corridors/` (weekly, 25 corridors) — capture current events with the **paid `web_search_20250305`** server tool. That path drained the account (~$6/run, caught live 07/05/2026) and lost three weekly runs to 45-minute timeout kills. Both crons are **dark** (`schedule:` commented out) until capture moves off paid search.

The fix is not just "swap the capture." The operator's design reframes the whole cost model and adds a memory the current pipeline can't hold. This spec captures the **full target architecture**, then scopes **Phase 1** (the piece that turns the crons back on, free) for immediate build. Phases 2–3 are design-locked here and tracked as checks so they cannot silently slip.

---

## Corrections to the 2026-07-05 spec (evidence, not memory)

Verified live this session:

1. **Re-fetch is redundant.** `news_articles_swfl` already stores `body_text` capped at 3000 chars, fully populated (`ingest/pipelines/news_swfl/normalizer.py:49`). The 07-05 spec's step 2 ("fetch the article URL with crawl4ai for rows lacking full text") is unnecessary for the common case — 3000 chars is plenty for a distill. **We feed the stored `body_text` straight to Sonnet; re-fetch drops out of v1.**
2. **The named corridor matcher is the wrong module.** The 07-05 spec says match via `refinery/lib/corridor-aliases`. That file is a **slug↔centroid-id identity map** (a drift sentinel for permit joins), not a text matcher — it cannot map an article mention to a corridor. Real matching comes from `public.corridor_profiles.corridor_name` (+ road-name aliases) and is **Python-side** (the pipelines are Python; corridor-aliases is TS). A small new deterministic matcher is required.
3. **crawl4ai already reaches the two big papers web_search was blocked from.** Both pipelines carry hard comments: "Do NOT add news-press.com or naplesnews.com (block the crawler)." But `news_articles_swfl` is 91% those two papers (naples_daily_news 38 + fort_myers_news_press 41 of 87 total rows). crawl4ai's stealth fetch gets past what the Anthropic crawler cannot — so on **local news the retrofit is higher coverage, not merely cheaper.**

Coverage reality (measured): ~9 SWFL articles/day in the lake. City names match well; specific road names rarely appear in general news, so **corridors go sparse** — which is why the escalation ladder (below) climbs *free* rungs before spending.

---

## Target architecture

### The cost inversion

Today: expensive paid **hunt** per unit + cheap distill. Target: **gather free, think cheap, spend surgically.** Free crawling has unlimited capacity, so idle crawl is the real waste; the only genuine cost is the LLM and paid search, rationed to where they earn it.

Four layers, ordered by cost:

1. **Gather (free, aggressive, always-on).** crawl4ai (`AsyncWebCrawler().arun(url) → result.markdown`, the proven `news_swfl/fetcher.py` pattern) crawls broadly, day and night. No reason to be stingy with $0.
2. **Store (cheap, complete, self-cleaning).** Everything crawled lands compact and URL-deduped; a TTL sweep keeps the pool small so we never build a Google-sized lake.
3. **Rank (Sonnet as editor).** Per unit, Sonnet weighs the pool — what matters, ranked — then breaks winners into pulse rows. Bounded: rank over compact records first, deep-read only the top few. `claude-sonnet-4-6` (operator decree 07/05; Haiku dropped facts — `verification/haiku-vs-sonnet-distill.md`).
4. **Improve (paid search = last resort).** Only after the free rungs are exhausted do we fire a targeted paid search for a specific still-empty thread we care about. Budgeted, logged, off by default.

### Coverage escalation ladder — free places first, money last

When a thread we care about has no fresh data:
1. Free: read sources we already hold (`news_articles_swfl`).
2. Free: look **more places** — extend the crawl source list (outlets, county/gov, brokerage pages) and entity/corridor-name search pages on those sites. Still $0. *("just because we aren't getting data doesn't mean we can't add a crawl4ai at a different source first before we pay.")*
3. Last resort: targeted paid `web_search` for the specific gap. Off by default; fires only when 1–2 are exhausted.

### Three stores + promotion (retention / "keep it in order")

Reuses live machinery: `prune_expired()` (TTL eviction), `reconcile_supersession()` + `story_key` (thread collapse), `project_events` (durable events home).

- **Store 1 — Raw pool** (`news_articles_swfl`, widened). Everything crawled, compact, URL-deduped. Daily eviction sweep drops rows never promoted and never used. **Window: 45 days** (operator "a month or two"). "Not useful now" items expire here unless a later story promotes them.
- **Store 2 — Event-thread ledger** (extend `project_events`). Sonnet **promotes** a pool item here when it judges the event has a **follow-up coming** ("Walmart bought land"). Each thread holds: `story_key` spine, lifecycle `state` (announced → permitting → construction → opening → open → closed), `status` **open vs terminal**, all source URLs, and a **maintained rolling summary + latest small note** — so a new article appends O(1), never a full re-read of history *("so we aren't dropping back to each specific save every time a new article comes out")*. Open = active watch list, never evicted. Terminal ("Walmart closed", no follow-up expected) = record closing state, settle. **Retention: open kept while open; terminal archived +90 days; important longer.**
- **Store 3 — Used / delivered record** (per-user memory + emitted pulse facts). What we actually **told a user**. "Used data always" → **permanent** (tiny — only what was sent).

Sonnet's per-item decision: follow-up coming → promote (open + active check); terminal → close, settle; not useful now → leave in pool to expire; told to a user → write to Store 3, permanent.

### Two-tier memory — the split is the whole point

- **Tier A (global, Store 2):** the event thread is shared — the news is the news, one sourced copy.
- **Tier B (per-user, Store 3):** `(user, story_key, state-we-told-them, when, deliverable_id)`, written when user U's email actually includes that thread.

**The backward-reference is gated on Tier B, never Tier A.** Composing U's next pulse, thread T now "opening": check *U's* delivery memory. U received an earlier state → "the Walmart at Corkscrew Rd I flagged in January now opens next week." U never received it → present fresh, no false "I told you." *("You can't say 'that Walmart I told you about 6 months ago' to someone you didn't tell.")* Cross-user isolated — U's memory never leaks into V's.

---

## Phase 1 — what we build NOW (turns the crons back on, free)

Scope: **capture retrofit + matcher + dedup + raw-pool eviction + re-enable crons.** No memory tiers yet (those are Phase 2–3), but Store-1 eviction ships here so we don't start hoarding unbounded.

1. **Capture = read the lake, not paid search.** Replace the `web_search_20250305` call in both `pipeline.py` files with a read of `data_lake.news_articles_swfl` (recent window), plus an optional Phase-1 supplemental crawl of extra sources for thin units (escalation rung 2, crawl4ai, free). Rung 3 (paid) is **not** wired in Phase 1.
2. **New Python matcher** (`ingest/pipelines/_shared/pulse_match.py` or per-pipeline): deterministic city-name and corridor-name (+ road aliases) token/substring match over `headline + body_text`. City list = the existing `CITIES`; corridor list = `corridor_profiles.corridor_name`. No LLM, no fees. Unit tests with fixture articles.
3. **Distill unchanged in shape**, input swapped: Sonnet (`claude-sonnet-4-6`, already the constant) distills the **matched stored `body_text`**, not a captured blob. Zero matched articles for a unit → **zero LLM calls**, no-op merge (Dumbo-Drop tolerant).
4. **Three dedup layers** (two already exist): URL dedup (`dedup_key(city,url)` + `news_swfl` novelty guard) · story dedup (`story_key` + `reconcile_supersession`) · temporal dedup is Phase 2 (needs the durable ledger) — Phase 1 relies on the existing non-expired `live_story_keys` reuse.
5. **Store-1 eviction sweep:** a `prune`-pattern pass over `news_articles_swfl` dropping rows older than **45 days** that are unpromoted/unused. Ships with its own `--dry-run`.
6. **Budget + re-enable:** both pipelines already build `RunBudget` (default $1/run) and the daily-ceiling preflight; keep them. Re-enable each cron **only after its `--dry-run` is green on the runner** with **zero web-search billing segments**. Corridors first (bigger burner), then city (pipeline-freshness: cron wrapper + `--dry-run` in the same PR).

**Phase 1 done =** `pulse_crawl4ai_retrofit_live_verify` closed with a real run URL showing rows written and a console view with zero web-search billing.

---

## Phase 2 (tracked: `pulse_event_thread_ledger`) — the durable memory

Extend `project_events` into the event-thread ledger: promotion from the pool, lifecycle state machine, open/terminal status, rolling summary + append-note, active watch checks, tiered retention (open kept, terminal +90d). Adds **temporal dedup** ("did we already say this?") — the thing Phase 1's TTL'd `live_story_keys` can't do past expiry. Its own brainstorm → spec → plan when its turn comes. **Do not half-ass — build 2 correctly** (operator).

## Phase 3 (tracked: `pulse_per_user_delivery_memory`, `pulse_aggressive_gather_gapfill`)

Per-user delivery memory (Store 3, Tier B) + backward-reference composer in the send/deliverable layer (`deliverables.user_id` is `NOT NULL`; `email_sends`/`email_events` already record sends — the per-story-per-user write is new). Plus aggressive all-day crawl cadence and the rung-3 targeted paid gap-fill. Own brainstorm → spec when 1–2 land.

---

## Invariants (so it "doesn't fuck up on all of this")

- **No-invention preserved end-to-end.** Every kept fact carries its source URL; the existing facts-only / no-unbacked-claim distill guarantee stays. Empty unit → emits nothing, costs nothing.
- **Cross-user isolation.** Store 3 is guarded on the cross-USER boundary (the one security line the platform enforces); a back-reference fires only on a real delivery row.
- **Budget hard-stops stay.** `RunBudget` $1/run + daily-ceiling preflight on every LLM call site.
- **Extend, don't erect a new gate** (RULE C2): reuses `prune_expired`, `reconcile_supersession`, `story_key`, `project_events`, `RunBudget`.

## Out of scope

- No change to downstream tables/brains/`--- OUTPUT ---` shapes in Phase 1.
- `web_search_20250305` stays for compose-chart `external_points` (different lane, tiny volume).
- `news_swfl` fetcher internals untouched in Phase 1 (we **read** its output). Widening its `SOURCES` coordinates with the parallel novelty-guard session (RULE 1.5) or lands as a pulse-owned supplemental fetch.

## Execution notes

- `ingest/CLAUDE.md` read-first: NO paid web_search in scheduled pipelines; $1/run + daily-ceiling; probe <1 min; brain-first; grant + reload after DDL; Bun.SQL migrations (psql absent).
- `news_articles_swfl` is **read-only** for Phase 1 (avoids the parallel-session claim); only the eviction sweep writes to it — coordinate that one write.
- Ship order: corridors → city. Each: `--dry-run` + cron wrapper update in the same PR; re-enable only after green dry-run on the runner.
