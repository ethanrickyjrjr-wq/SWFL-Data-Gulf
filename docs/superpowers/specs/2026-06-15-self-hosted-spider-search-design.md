# Self-hosted Spider + Search — "Our Own Firecrawl" Box

**Date:** 2026-06-15
**Status:** Design approved (brainstorming) — pending spec review → implementation plan
**Author:** Claude (Opus 4.8) + Ricky Cooper

---

## Problem

Two distinct failures, currently conflated into one ask ("gut spider-rs/spider and run free"):

1. **The Google/Gemini wall (a SEARCH problem).** `ingest/pipelines/live_search/engine.py`'s
   `gemini_grounded()` leg returns `RESOURCE_EXHAUSTED` / "prepayment credits are depleted"
   (per SESSION_LOG 2026-06-15). The daily freshness path is effectively dead.
2. **~100k Firecrawl credits in 20 days (a SCRAPE problem).** Pacing ~150k/mo ≈ **$300+/mo**.
   Two known cost vectors in the code: `city-pulse-daily.yml` runs daily × 7 cities with
   Firecrawl `/v2/search` **primary** + `scrape_markdown=True`; and `firecrawl_client.agent()`
   defaults to **`max_credits=1000` per call** (a blank check per extraction).

**Key correction discovered during brainstorming:** `spider-rs/spider` is a **crawler**, not a
search engine — it cannot solve #1. The Python binding (`spider_rs` on PyPI, v0.0.57, Jan 2025)
is a stale stub exposing only `crawl()`/`get_links()` — none of the capabilities we need. The
real engine (Chrome/JS, HTML→markdown, stealth, proxies) lives in the **Rust crate** (MIT,
verified live 2026-06-15: `features=["chrome"]` + `crawl_smart()`, "export pages as Markdown",
`with_stealth(true)`).

## Decision

Stand up **one small always-on box** that is our own Firecrawl, then **migrate behind a
reversible flag, one pipeline at a time** — not a big-bang rewrite.

- **SEARCH** → **SearXNG**, self-hosted (free, prebuilt, queries ~10 engines, `format=json`).
  Replaces the Gemini-grounded leg and Firecrawl `/v2/search`.
- **SCRAPE** → a thin **Rust HTTP service wrapping the `spider` crate** (chrome + stealth +
  markdown). Replaces Firecrawl `/v2/scrape`.
- **EXTRACT** → our own **Claude (Haiku) call** over the scraped markdown. Replaces Firecrawl
  `/v2/agent` (`max_credits=1000`) with per-call cost control. We already pay Anthropic.
- **WALLED 10%** → keep **Firecrawl as a hard-capped last resort** for an explicit
  walled-domain allowlist (broker 525s, Collier 403 xlsx). No new proxy vendor day 1.

## Core principles

1. **Prove it works before cutting anything over.** Phase 0 changes zero pipelines.
2. **Reversible.** A single env flag (`SCRAPE_PRIMARY=ourbox|firecrawl`,
   `SEARCH_PRIMARY=searxng|firecrawl`) flips the whole system back to the vendor.
3. **Extend, don't gate.** We extend the existing `ingest/lib/extract_client.py` vendor cascade
   — we do NOT erect a new mandatory pre-materialization gate (CLAUDE.md RULE 3 C2).
4. **Free has a floor.** Anti-bot-walled pages still cost something (capped Firecrawl now,
   metered residential proxy later). SearXNG can be rate-limited by a single engine and survives
   by rotating; it is resilient, not bulletproof. Both facts get monitored, not hidden.
5. **The box is a dependency, so it gets a freshness signal** (health + cadence + ops tile).

## Architecture

```
                         ┌──────────────────────────────────────────────┐
   GHA crons (Python) ──▶│  Caddy  (HTTPS + bearer-token auth)           │
   refinery (TS, GHA) ──▶│   ├─ /search  → SearXNG    (Docker, free)     │
   (MCP / app, later) ──▶│   └─ /scrape  → spider-svc (Rust axum)        │
                         │                  └─ `spider` crate:           │
                         │                     chrome + stealth + md       │
                         └──────────────────────────────────────────────┘
                              one Hetzner VPS, US region (~$5/mo)
                              walled page → capped Firecrawl last-resort
```

All three callers reach the box at `https://<box>/{search,scrape}` with a shared bearer token.
The box is **not** part of the Vercel build; it deploys via Docker Compose
(SearXNG + spider-svc + Caddy) pulled to the VPS.

## Components & interfaces

### A. SearXNG (search)
- Prebuilt Docker image; `settings.yml` enables `formats: [json]` (off by default → 403 otherwise).
- Interface: `GET /search?q=<query>&format=json[&time_range=month]` →
  `{"results":[{"title","url","content"}, …]}`.
- We tune the engine list for resilience (Google/Bing/Brave/DDG/Mojeek/Startpage…).

### B. spider-svc (scrape) — the "gutted MIT project"
- New in-repo Rust crate `spider-service/` (axum). We write a *thin* wrapper; the `spider` crate
  does the work.
- Interface (v1): `POST /scrape {url, render?: "auto"|"chrome", stealth?: bool}` →
  `{markdown, status, final_url, title}`.
- v2 endpoints (Phase 2): `/scrape_with_actions` (Accela click-through via spider Chrome
  automation) and `/download_binary` (Collier xlsx). **Verify exact spider APIs in planning.**

### C. extract_client extension (the cutover seam)
- Add `our_box` as a vendor in `ingest/lib/extract_client.py`'s cascade.
- New order (flag-controlled): **our_box → (capped) Firecrawl → spider-cloud**. The existing
  paid spider-cloud fallback (`SPIDER_API_KEY`, `api.spider.cloud`) is **kept as an even-deeper
  backstop through Phase 2** — it is currently the only proven path for some hard pages
  (e.g. `download_binary` for the Collier xlsx) — and is **retired in Phase 3** alongside
  Firecrawl, once our box's stealth + binary paths are proven.
- `extract()` (LLM extraction): our_box `/scrape` → **Claude Haiku** structured extraction,
  replacing `firecrawl_client.agent()`. Keep the same `{data:{rows:[…]}, _provenance}` return
  shape so existing call sites (`extract_agent_rows`) are untouched.

### D. Search cutover
- `live_search/engine.py`: add a `searxng_search()` leg as **primary**; demote/remove the dead
  `gemini_grounded()` and the Firecrawl `/v2/search` leg to backstop.
- `city_pulse/pipeline.py`: `provider="auto"` points at SearXNG first instead of Firecrawl.

## Data flow (a freshness metric, end to end)

```
SearXNG /search "Naples FL median sale price"  →  candidate URLs + snippets
   → spider-svc /scrape <best url>             →  clean markdown
   → Claude Haiku extract                      →  {value, source_url}  (+ integrity gate: real URL)
   → data_lake.daily_truth                     (same row contract as today)
```

## Walled 10% (day-1 strategy)

Keep Firecrawl **only** for an explicit allowlist (broker 525 pages, Collier xlsx 403), with a
**hard monthly credit cap set in the Firecrawl dashboard** so it can never run away again.
Graduate to a metered residential proxy (Webshare/IPRoyal, ~$/GB) in Phase 3 only if the
allowlist grows or the cap bites.

## Ops / freshness for the box

- spider-svc `/health` (returns version + a self-scrape smoke result).
- `ingest/cadence_registry.yaml` watchdog entry for box liveness.
- Ops dashboard tile (swfldatagulf-ops) — RED if the box is unreachable.
- Update `docs/standards/pipeline-freshness.md §6` (the firecrawl→spider routing rule) to
  put the box first.

## Phasing — prove it, then widen

- **Phase 0 — Spike (zero pipeline changes).** Provision Hetzner box. Docker Compose:
  SearXNG + Caddy (auth) + spider-svc (`/scrape` only). Smoke: `/search` returns JSON;
  `/scrape` returns clean markdown on one EASY SWFL page and one HARD (stealth) page.
  Acceptance: both endpoints answer through Caddy auth on real targets. **← "make sure it works"**
- **Phase 1 — First real cutover (one pipeline).** Extend `extract_client` + add `SEARCH_PRIMARY`
  flag. Cut over **`live_search`** (smallest, currently broken). Run green for several days;
  Firecrawl capped last-resort. Acceptance: `daily_truth` rows land sourced, via the box.
- **Phase 2 — Expand.** `city_pulse` (kills the daily×7 burn), then the remaining scrape
  pipelines; add `/scrape_with_actions` (Accela) + `/download_binary` (Collier).
- **Phase 3 — Hard cases + retire.** Residential proxy for the allowlist; retire **both**
  Firecrawl and the paid spider-cloud backstop.

## Cost

| | Before | After |
|---|---|---|
| Firecrawl | ~$300+/mo (150k credits/mo pace) | capped scrap (allowlist only) |
| Gemini | depleting prepay | $0 (removed) |
| Box | — | Hetzner ~$5/mo |
| Extraction | (in Firecrawl agent credits) | Claude Haiku, pennies/page |
| **All-in** | **$300+/mo** | **~$15–40/mo** |

## What the operator provides

- A **Hetzner account** (the box). That's the only hard prerequisite.
- No local Rust install — Docker builds it on the box. No Rust written by the operator.

## Non-goals

- Not rebuilding all pipelines now (one-at-a-time, flag-gated).
- Not retiring Firecrawl day 1 (it stays as capped last-resort).
- Not building a search engine (SearXNG is prebuilt; we run it).
- Not touching the brain/refinery contracts — only the fetch layer underneath them.

## Verify in planning (Vendor First — RULE 1, do NOT assume)

- Exact `spider` crate API for HTML→markdown (built-in vs `spider_transformations`) and the
  `crawl_smart()` / single-URL scrape signature.
- `spider` browser-actions API for the Accela click-through case.
- SearXNG `settings.yml` JSON-enable + engine selection; Docker image tag.
- Caddy reverse-proxy + bearer-auth config; where the auth token lives (GH secret + box env).
- Hetzner instance size for headless-Chrome memory headroom (start 2 vCPU / 2–4 GB).
- Claude model id + structured-output approach for the extractor (load `claude-api` skill).
