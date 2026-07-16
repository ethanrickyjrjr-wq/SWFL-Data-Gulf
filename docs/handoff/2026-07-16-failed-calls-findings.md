# FINDINGS — the tank, what burns it, and the failure UX (07/16/2026, failed-calls track)

Input to tomorrow's `beta_readiness_and_offer` audit. Companion to
`docs/handoff/2026-07-16-failed-calls-and-readiness-handoff.md` (the work list this executes).
Every number below names its source; estimates are labeled estimates.

## 1. THE HEADLINE — burn rate ≈ the believed cap. Quota exhaustion is the prime 429 suspect.

**The real-estate key (`PHOTOS_API`) burns ~8,600–10,300 requests/month on scheduled scans
alone**, against a BELIEVED cap of 10,000/mo ("Starter tier", claimed in `lib/listings/steadyapi.ts`
header + `pipeline.py`'s budget print — neither cites a dashboard read). If that cap is real, we are
living at the ceiling, and the 07/07 zero-row 429 days stop being mysterious: end-of-cycle
exhaustion throttles exactly the way we observed. The in-code "~4,700/mo steady-state target"
(`pipeline.py` budget line) is stale by ~2x versus the arithmetic below.

**Burn math (daily listing_lifecycle, post county-migration):**
- Unfiltered county walks — pages = ceil(meta.total/200), meta.totals probed live 07/16/2026:
  Lee 22,158 → 111 · Collier 7,877 → 40 · Hendry 1,077 → 6.
- Type sweeps (4 filters/county): Hendry MEASURED 07/16 — whole county incl. sweeps = 20 calls.
  Lee ≈ 71, Collier ≈ 36 (estimates from the 07/07 per-type inventory in
  `docs/handoff/2026-07-07-steadyapi-full-scope-handoff.md`).
- Enrich (`/nearby-home-values`): ≤60/run hard cap, small at steady state (new listings only).
  Sold probes (`/property-tax-history`): ≤8/run (`SOLD_CHECK_CAP`).
- Daily ≈ 111+71+40+36+20 + enrich + sold ≈ **~285–345/day ≈ 8.6k–10.3k/mo**.
- Plus monthly: rentals ~466 calls/run (cadence_registry, run 28559510045) + market_aggregates
  weekly/monthly (small) + on-demand comps (≤3/ask, hour-cached) + photo search (1/city/hour max).
- All real-estate endpoints are **weight 1** (docs.steadyapi.com crawled live 07/16/2026), so
  requests ≈ quota units on this surface. Social endpoints are a different key/tier — their zero-429
  research days say nothing about this tank.

**Biggest available tank win (not built, recommend for the sequence):** cache the type sweeps
weekly instead of daily — ~107 pages/day ≈ **3.2k requests/mo saved (~35%)**. Flagged 07/07
(handoff todo #2); the county migration it was waiting on landed today, so it can be costed now.

## 2. P0-A — quota: exactly what Ricky must fetch (the one open blocker)

No API-side signal exists: **no rate-limit/quota headers on any response** (probed live 07/16,
3 calls — confirms `steadyapi_quota_unknown`), docs publish no per-plan numbers, and the pricing
page's 200-req/mo row may not be the Real Estate API. The account dashboard is the only authority.

**Operator ask:** log into steadyapi.com → account (upper-right) → plan/usage, and capture:
1. plan name + monthly request quota for the Real Estate API key (`PHOTOS_API`),
2. current cycle usage + reset date,
3. per-API usage split if shown (real-estate vs social).
A screenshot or pasted numbers into the session both work. Until then, treat ~10k/mo as the
planning ceiling and every bulk-call proposal (e.g. the 3,349-community amenity pre-cache) as
blocked on this read.

**Key health today:** healthy. 3-call probe + a ~20-call Hendry dry-run + the ~23:45 UTC scans all
returned 200s on 07/16; `listing_state.last_seen` max = today. The 07/07 429 incident profile
(both counties, scheduled runs) is consistent with cycle exhaustion or a vendor transient — NOT a
UA problem (browser UA is sent; a bad UA 403s, it doesn't 429) and NOT in-run concurrency (our
requests are sequential).

## 3. What shipped today (code, tested; live after the next deploy)

1. **User-facing comps client retry+degrade** (`lib/listings/steadyapi.ts`): bounded jittered
   retry (3 attempts, ~0.4–1.6s backoff, 10s/attempt timeout) on 429/5xx/network only —
   deterministic 4xx still fails fast, burning nothing. New `onDegrade` seam distinguishes
   "throttled" from "no data": the chat comp lane now says *"the comp lookup is briefly busy —
   ask me again in a minute"* instead of falsely claiming no comps exist. 25+2 tests.
2. **Scheduled-scan resilience** (`extract_api.py` + `pipeline.py`): per-page bounded retry
   (4 attempts, ~1–12s jittered backoff; retries count in the budget log), **partial-progress**
   (an incomplete steady-state scan lands the rows it paid for; absence never infers a departure;
   a truncated seed still lands nothing), sold-probe budget skipped on degraded days, type sweeps
   skipped for empty cities (~15 vs ~75 wasted calls on a dead-key day). 124 pipeline tests green.
3. **County-seed migration** (check `steadyapi_migrate_city_seed_to_county_level`): one
   county-level `/search` per county replaces the 15-city list; recovers the ~4% of Lee listings
   the city list dropped (unincorporated: Alva, Pine Island, Captiva…). Verified live 07/16:
   Hendry full dry-run — 1,042 rows, coverage guard green vs last-trusted 1,089, 20 calls; per-row
   city now derived from the permalink slug (also fixes the old neighbor-city mislabel).
4. **source_totals writing 0 rows — ROOT-CAUSED + FIXED**: the ledger write was gated on
   `not only_county`, and every scheduled run passes `--county` (Lee 09/Collier 12/Hendry 15 UTC)
   — unreachable in production since it landed. Now logs per county inside the loop.
5. **Street-less key collisions** (check `listing_state_streetless_address_key_collision`):
   732 street-less keys live (693 active; the check's 216 counted only exact CITY:ZIP shapes —
   street-name-no-house-number keys collide identically). Scans now key these on the vendor
   `property_id` (`L<pid>:<zip>` identity keys); old keys are held out of the diff (builder-plan
   choreography) so nothing fabricates departures; **one-time re-key migration drafted at
   `docs/sql/20260716_listing_state_streetless_rekey.sql` — RUN ONLY AFTER DEPLOY** (against old
   code it would duplicate rows). ~27 property_id-NULL rows stay inert.
6. **Stuck property_type buckets — RE-SCOPED with live evidence** (check
   `listing_state_property_type_stuck_buckets`): the 2,696 'residential' rows are ALL
   state='holding', ALL property_id NULL, frozen 06/27→07/01 — pre-cutover legacy, touching no
   active metric; purge candidates alongside the builder-plan purge (operator sign-off), nothing
   to re-sweep. The 'other' bucket is NOT stuck: 1,599/1,673 are active with last_seen = today,
   re-upserted daily — they stay 'other' honestly because manufactured/mobile is not filterable
   on the vendor side (vendor ceiling, not a backfill gap).

## 4. Failure UX per external-call surface (what a user sees when a call dies)

- **Chat comp ask**: retry ×3 → honest "briefly busy, try in a minute" (was: false "no comps
  found"). Build never dies; answer still streams.
- **Email/deliverable builds** (under-contract recipe, address spine, photo feed, sold-price
  lane): any miss → that section's cells become open slots or the section drops; the build ships.
  Four-lane rule holds — omission, never invention, never a dead page. Now retried underneath.
- **Scheduled county scans**: one throttled page no longer zeroes a county — retries, then lands
  partial progress with no fabricated departures; coverage guard still blocks untrusted diffs.
- **Anthropic (authored builds)**: unchanged, guards verified present — RunBudget $1/run +
  $5/day ceiling preflight on every scheduled LLM path (`ingest/lib/api_usage.py`). Reported
  only; changing limits is an operator call.
- **Resend (sends)**: untouched; operator-gated.

## 5. Loose ends for the audit (tracked)

- `bunx next build` is RED on main — `lib/deliverable/factuality-grader.ts:17` type error from
  commit 0ee9c623 (factuality-CI session, which held the file claim all evening). My changes are
  type-clean (`tsc --noEmit`: only that file + pre-existing pdf test fixtures error). One-line fix
  ready if their session doesn't land one.
- Post-deploy steps bundled in NEW check `steadyapi_failed_calls_post_deploy` (run re-key
  migration; watch first county-level Lee/Collier scheduled runs; confirm source_totals rows;
  then close the parent checks).
- 429-throttle check (`steadyapi-429-rate-limited`): key healthy today (evidence above); leave
  open until the dashboard read rules cycle-exhaustion in or out.
