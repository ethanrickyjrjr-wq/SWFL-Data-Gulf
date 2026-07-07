# Lee permits sequential CapDetail fetch + shared fetch-health guard (WAF fix)

**Date:** 2026-07-07
**Check:** `lee_permits_sequential_fetch_live_verify`
**Related open check:** `lee_permits_capdetail_waf_429` (the underlying WAF block — this build reduces the trigger and detects the failure; it does not by itself "beat" a pure IP ban).

## Problem

The Lee permits pipeline has two crawl4ai fetch paths with very different WAF exposure:

- **List view** (`scraper.fetch_permit_pages`) drives **one reused `Crawl4aiSession`** (UndetectedAdapter, Next-click pagination). Proven to survive GHA datacenter IPs (2026-06-16).
- **Detail enrichment** (`scraper.enrich_rows_with_details`) fetches each permit's `CapDetail.aspx` via `crawl_client.fetch_many` — **N independent parallel browser contexts** (`arun_many`). From a GHA datacenter IP this burst trips Accela's sustained-burst HTTP 429 anti-bot throttle (root-caused 2026-07-06, run #28798608078).

The detail page is where `issued_date`, `declared_value_usd`, and `permit_type_raw` come from. A blocked detail fetch returns `""` (crawl_client line ~525), the row keeps no real `issued_date`, and the pipeline **drops it** (`on_cursor_value_missing="exclude"` — we never invent a date). So a partial block silently removes permits while the run still looks green. It stayed invisible for ~2 weeks until `assert_content_fresh`'s 14-day gate finally tripped.

## Goal

1. Stop the burst that trips the WAF — fetch detail pages **sequentially through one reused session**, the pattern the list view already proves survives the datacenter IP.
2. Make a blocked/empty detail sweep fail **loud on run #1**, not 14 days later — a same-run fetch-health count.
3. Do both as **shared ingest primitives** so the next crawl4ai pipeline inherits the fix and the detector for free.

## What we're building

### 1. `crawl_client.fetch_sequential(urls, *, wait_for=None, jitter=(1.5, 3.5), timeout=45_000, retry_once=True) -> dict[str, str]`

New shared primitive, sibling to `fetch_many`. Opens **one** `Crawl4aiSession` (UndetectedAdapter, stealth) and navigates to each URL in turn via `session.step(url, ...)`, with a small randomized inter-request delay (`jitter`) so the traffic reads as a human clicking records rather than a burst. Returns `{url: html}` with `""` for any URL that failed/blocked — **contract-identical to `fetch_many`**, so it is a drop-in replacement.

- Per-URL failures are caught (a `Crawl4aiError` from a 429/challenge does not abort the whole sweep); on failure, optionally retry once after a short backoff, then record `""` and continue. This lets the health guard aggregate rather than the run dying on the first flaky page.
- `anti_bot_gate` stays off here on purpose: we want to *count* blocks across the sweep, not raise on the first one. (A total block still surfaces — every URL records `""` → guard fails.)
- Sequential is fine on volume: Lee runs ~1.2 permits/day; with the 30-day self-healing re-scan that's ~30–40 detail fetches/run (more if it has been broken a while). At ~2–4s each that is ~2–3 min — no GHA-timeout risk.

### 2. `guards.assert_fetch_health(succeeded, attempted, floor=0.8, label="") -> None`

New shared guard beside `assert_content_fresh` / `assert_min_rows`. Raises a new `FetchHealthError` when `attempted > 0 and succeeded / attempted < floor`.

- **Logs the ratio every call** (`log.info`), pass or fail, so the success rate is a visible per-run trend (100% → 92% → 85% warns of a tightening WAF before it breaches).
- `attempted == 0` (no rows had a `cap_detail_url`) → log and return, never raise (bootstrap/empty-window safe, matching the other guards' no-baseline behavior).
- `FetchHealthError` is its own class (like `ContentStaleError`) so cron-incident capture classifies it as **source/scrape blocked — investigate, do not blind-retry**, not a generic flake.

### 3. Rewrite `scraper.enrich_rows_with_details`

- Swap `fetch_many` → `fetch_sequential`.
- After the sweep: `succeeded = count of non-empty htmls`, `attempted = len(targets)`; call `assert_fetch_health(succeeded, attempted, floor=0.8, label="lee_permits")` **before** parsing/returning — so a blocked sweep aborts before any dlt merge, leaving yesterday's good data serving.
- Drop the now-meaningless `concurrency` param; add `jitter` passthrough. Parsing/fill logic downstream is unchanged.

### Locked decisions

- **Threshold: Balanced, floor 0.8** — fail below 80% of detail pages fetched. The 30-day self-healing window re-covers a few missed permits next run, so a blip should not redden CI; a real block fails on run #1.
- **Scope: shared primitives** (`fetch_sequential` in crawl_client, `assert_fetch_health` in guards), wired into Lee now; other pipelines adopt later.

## Error handling / flow

`assert_fetch_health` raises inside `enrich_rows_with_details` → `_fetch_enrich_geo` → the `permits_resource` generator → `pipeline.run()` raises → process exits 1 **before** the load. No partial write; the prior table keeps serving. Runs only on the live path (tests inject `rows=` and skip enrichment). `assert_content_fresh` (14-day, post-merge) stays as the backstop for stalls the fetch guard can't see.

## Testing

- **`assert_fetch_health`** (pure, primary new coverage): raises below floor, passes at/above floor, no-raise when `attempted == 0`. Mirrors existing guard tests.
- **`enrich_rows_with_details`**: monkeypatch `fetch_sequential` to return a mostly-empty map → asserts `FetchHealthError`; mostly-full map → passes and fills fields. No live network in tests (existing pattern).
- **`fetch_sequential`**: light unit test with a stubbed `Crawl4aiSession` confirming sequential order + `""`-on-failure contract; not a live crawl.
- Local gates: `pytest ingest/pipelines/lee_permits/` + `ingest/lib/`, `python -m ingest.pipelines.lee_permits.pipeline --dry-run`.

## Verification (live)

The decisive test is a **GHA run of `lee-permits-weekly` from the datacenter IP**: does the reused sequential session avoid the 429, and does `assert_fetch_health` report ≥ 80%? Operator-run (no unattended live/paid runs from a session) — this is the `lee_permits_sequential_fetch_live_verify` check. Two outcomes:
- Clean (≥80%, no 429) → sequential-session clears the burst-WAF; close the check and `lee_permits_capdetail_waf_429`.
- Still 429'd → the block is pure IP-reputation, not burst; fall back to the residential-proxy path (`CRAWL4AI_PROXY` is already wired) or the Accela API. Either way the guard now makes it loud on run #1.

## Out of scope

- The Accela developer API (anonymous citizen-app) path — operator pursuing the key separately; a future upgrade, not this build.
- Any change to concurrency/backoff/egress beyond going sequential, and any other pipeline's fetch path (they adopt the shared primitives later).
