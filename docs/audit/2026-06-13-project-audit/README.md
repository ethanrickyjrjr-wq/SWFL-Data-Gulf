# SWFL Data Gulf — Whole-Project Audit (2026-06-13)

Thirteen lane auditors read the code (not the plan docs) and verified claims against `git`, live tests, and vendor docs. This is the consolidated report.

## Executive summary

The platform is structurally sound where it counts: the brain factory honors its hard invariants (thin-pipe through one OUTPUT parser, validators gate every write, deterministic math with no LLM touching numbers, cycle detection, the silent-master-freeze watchdog), user-data surfaces (projects/deliverables/mcp-key) are correctly RLS-gated, and the grading kernel's point-in-time discipline is genuinely careful. The honest read is "well-engineered engine, leaky seams." The real risk is not in the math — it is in (1) **uncapped paid-LLM endpoints** (`/api/converse`, `/api/welcome/chat`) that are public, unauthenticated, and un-rate-limited, a direct billing-DoS that three lanes independently flagged; (2) **a critical multi-tenant data-bleed in the in-flight email funnel** (Resend segments keyed by bare slug → one tenant's broadcast hits another's recipients) that must be fixed before any go-live; (3) **latent ingest traps that detonate on the next scheduled run, not today** — FDOT `year_`/`yearx` column drift silently zeroes traffic on the annual re-ingest, LeePA's randomized dlt schema name blinds its freshness probe, and Census CBP is frozen at vintage 2022 while 2023 is live. Cross-cutting, the same failure class recurs everywhere: **silent-empty / silent-stale loads** (seed pipelines bump timestamps so the probe can never see a frozen snapshot; Crexi/fgcu bypass the spider-fallback wrapper and swallow errors; lee_associates writes orphan `verified=false` rows the consumer drops) and **orphan-slug discipline gaps** (sector-credit can emit ~10 unregistered NAICS slugs that will orphan master's normalize, the recurring nightly-rebuild breaker). The moat engine is built but **not yet accumulating fuel**: the retrodicted corpus is a manual one-shot on a pinned snapshot, the live loop has banked zero outcomes, and the backtestable universe is effectively one revised macro series. Finally there is real **tracker/CI drift on `main`**: the BRAIN_CATALOG drift test is RED (two shipped brains invisible to the MCP inventory), the incident logger watches only 24 of 50 crons, and a SessionStart gate has failed every session for 12 days. None of this is fatal; most of it is mechanical to fix; but the email funnel must not ship until the segment-namespacing and usage-headroom holes are closed.

## Health by lane (bottom-up: ingest → email)

| # | Lane | Health | Findings | Headline issue |
|---|------|--------|----------|----------------|
| 01 | Ingest — structured / dlt + duckdb | mostly-ok | 9 | FDOT `year_`/`yearx` drift silently zeroes traffic on next annual re-ingest |
| 02 | Ingest — scrape / ODD / CRE-broker | shaky | 10 | Active CRE pipelines silently fail between table and consumer (lee_associates orphan, Crexi bypass) |
| 03 | Refinery core — stages 1-4 / DAG / confidence | mostly-ok | 7 | master conclusion prose uses legacy confidence formula; published uses new weighted-mean — they disagree |
| 04 | Refinery validators + render + ROE | mostly-ok | 8 | Lean rules block never reaches the model on claude.ai; the real contract is a divergent untested string |
| 05 | Refinery vocab + ledger + constitution | mostly-ok | 6 | Dual slug-inversion (raw_slugs vs slug_index) can silently diverge and a constitution rule goes dark |
| 06 | Packs — economy/labor/macro/credit/etc | mostly-ok | 8 | sector-credit can emit ~10 unregistered NAICS slugs → master normalize orphan |
| 07 | Packs — real-estate / CRE / env + MASTER | mostly-ok | 7 | BRAIN_CATALOG out of sync with registry — catalog drift test is RED on main |
| 08 | Backtest / grading / flywheel | mostly-ok | 8 | Moat engine sound but no fuel flowing: manual one-shot corpus, zero live outcomes, N≈1 series |
| 09 | App API (non-email) | mostly-ok | 9 | `/api/converse` + `/api/welcome/chat` uncapped/unauth paid-LLM routes (billing-DoS) |
| 10 | App pages + components | mostly-ok | 9 | Broken `/pricing` link from live funnel; unguarded external `?logo=` `<img>` |
| 11 | lib/ core — deliverable / grounding / templates | mostly-ok | 7 | Same uncapped paid-LLM routes; deliverable moat anchor set is loose, not strict |
| 12 | Infra — hooks / CI / GHA / tracker drift | mostly-ok | 8 | Incident logger covers only 24/50 crons; 26 fail silently |
| 13 | Email funnel (in-flight) | shaky | 11 | Resend segments not namespaced per tenant → cross-tenant contact bleed (CRITICAL) |

## Critical & high findings (consolidated, de-duplicated, grouped by theme)

### Cost / abuse — uncapped paid-LLM surface (flagged by lanes 09 + 11)
- **[HIGH] `/api/converse` and `/api/welcome/chat` have no rate limit, no auth, no cap.** `middleware.ts:11` (`RATE_LIMITED_PREFIXES` omits both); `app/api/converse/route.ts:178-191`; `app/api/welcome/chat/route.ts:84-101`. The `weeklyCount`/`capEnabled` plumbing in `lib/highlighter/meter.ts` exists but is wired to neither route — usage is recorded, never enforced. Fix: add both to `RATE_LIMITED_PREFIXES`, wire the existing cap gate before the stream, bound inbound content length, add a Vercel WAF rule. **(opus)**
- **[HIGH] MCP + entire data surface is unauthenticated in prod** (`MCP_BEARER_TOKEN` unset). `app/api/mcp/auth.ts:9-25`. A documented beta gate (`[LB-R6a]`); write tools are independently `X-Project-Key`-protected, so not a leak — but reads + template-render POST are fully open. Fix: operator-owned; ensure the WAF ceiling exists until monetization sets the bearer. **(opus)**
- **[MEDIUM→tracked] `/api/charts/save` is an unauthenticated service-role insert sink** (`app/api/charts/save/route.ts:6-32`) and `/api/templates/render` POST relies solely on the open bearer with no body/token cap. Fix: gate behind auth or per-cid meter + rate-limit prefix. **(sonnet)**

### Email funnel go-live blockers (lane 13 — see dedicated section below)
- **[CRITICAL] Resend segments not namespaced per tenant → cross-tenant contact bleed.** `lib/email/audience-sync.ts:148-182` creates/looks up segments by bare slug on one shared Resend account. Two tenants with a "newsletter" tag share one segment; either's broadcast hits the other's recipients. Fix: namespace by `${userId}:${slug}` for both list-match and create; back-migrate. **(opus)**
- **[HIGH] Usage gate has no send-size headroom check.** `lib/email/scheduler.ts:235-242` gates on `sent < limit`, never `sent + recipients <= limit`; one broadcast to a 5k audience blows 100× past the cap. Fix: move audience lookup before the gate; decide block-vs-partial. **(opus)**
- **[HIGH] Scope wired end-to-end except the consumer.** `scripts/email/run-schedules.mts:223-228` — `buildContent` ignores the row and ships the global digest while the confirmation promises a scoped one. Fix: land Task 02 or gate the scope clause out of the summary until the consumer exists. **(opus)**

### Ingest — latent traps + silent-fail pipelines (lanes 01 + 02)
- **[HIGH] FDOT `year_` vs `yearx` drift.** Ingest writes `year_`; every consumer + the analyst view read `yearx`. `ingest/pipelines/fdot/resources.py:18,48` vs `refinery/sources/fdot-source.mts:227-231`. The annual `replace` re-ingest recreates the column as `year_` → `.eq("yearx", ...)` returns 0 → traffic-swfl goes null silently. Fix: pick one canonical name across ingest/read/view/tests after confirming the live column. **(opus)**
- **[HIGH] LeePA tier-2 freshness probe is blind.** `ingest/pipelines/leepa/resources.py:107-120` uses a randomized `leepa_t2_<hex>` dlt pipeline name per chunk, so `_dlt_loads.schema_name` never matches the registry's `leepa_parcels_tier2`; the probe reads a frozen pre-2026-05-19 timestamp. Fix: mirror the collier_parcels stable-name pattern. **(sonnet)**
- **[HIGH] Census CBP frozen at vintage 2022** (`ingest/pipelines/census_cbp/resources.py:8`) while 2023 is live (web-verified). Annual cron is a no-op refresh. Fix: dynamic vintage discovery or bump to 2023; **keep NAICS2017** (web-verified — CBP has not moved to NAICS2022). **(opus)**
- **[HIGH] lee_associates rows land `verified=false` and the consumer drops them.** `ingest/pipelines/lee_associates_swfl/extract.py:138` vs `refinery/sources/marketbeat-swfl-source.mts:168-194`. The active source's entire purpose (Fort Myers Office/Retail/MF) never reaches master. Fix: define what "verified" means for a 3rd broker or flip the gate; add `multifamily` to `SURFACED_SECTORS`. **(opus)**
- **[HIGH] Crexi scraper bypasses the spider-fallback wrapper and swallows errors** (`ingest/pipelines/crexi_listings/extract.py:17,79,92-95`) — the exact silent-zero-rows trap; workflow never sets `SPIDER_API_KEY`. Fix: route through `extract_client.extract()`, let `ExtractError` propagate. **(sonnet)**
- **[HIGH] fgcu_reri uses `V1FirecrawlApp` directly, no spider fallback** (`ingest/pipelines/fgcu_reri_indicators/pipeline.py:32,266-270`); a transient firecrawl miss fails the whole monthly run. Fix: route through `scrape_with_fallback`. **(sonnet)**
- **[HIGH] Seed-upsert pipelines bump `_ingested_at` every run** (estero_edc, fmb_recovery) → the ODD probe can never detect a frozen snapshot, reports FRESH forever. Fix: only bump the timestamp when content changed (`IS DISTINCT FROM`). **(opus)**

### Refinery correctness / honesty (lanes 03 + 04 + 05 + 06 + 07)
- **[HIGH] master conclusion prose confidence uses the LEGACY formula; published confidence uses the NEW weighted-mean.** `refinery/packs/master.mts:136-157` vs `refinery/stages/4-output.mts:427-437`. The narrative can say "Combined confidence 0.39" while the published field reads 0.81 — a self-contradiction the no-smoothing rules exist to prevent; the in-code "they match" comment is now false. Fix: compute the headline once in the engine; delete the duplicate `computeConfidence`. **(opus)**
- **[HIGH] The lean RULES_OF_ENGAGEMENT block never reaches the model on claude.ai** (it drops `_meta`); the binding contract is the hand-maintained `RESPONSE_CONTRACT` string (`app/api/mcp/server.ts:86-116`), which is outside the four-mirror drift test and omits the `[INFERENCE]` tag, the NNN/triple-net guard, and the no-invention-below-ZIP guard. Fix: derive RESPONSE_CONTRACT from shared constants and add it to the drift test. **(opus)**
- **[HIGH] Dual slug-inversion.** Constitutions resolve `concept.raw_slugs` while Stage 2.5 resolves `slug_index` (`refinery/vocab/loader.mts:50-71` vs `refinery/stages/2.5-normalize.mts:213-260`); already divergent on `marketbeat_asking_rent_nnn`. A future constitution rule on a pattern-only concept silently never fires. Fix: a consistency lint + make `resolveConceptSlugs` honor patterns. **(opus)**
- **[HIGH] sector-credit-swfl can emit ~10 unregistered `sector_NN_chargeoff_rate` slugs** (`refinery/packs/sector-credit-swfl.mts:135-159`) — no `raw_slug_patterns`; the moment a live build crosses 5 resolved loans in Manufacturing/Transportation it orphans master's normalize (the recurring nightly breaker). Fix: add one `sector_*_chargeoff_rate` pattern. **(opus)**
- **[HIGH] BRAIN_CATALOG out of sync with PER_PACK_REGISTRY — drift test RED on main.** `home-values-swfl` and `investor-zip-swfl` are registered but absent from `BRAIN_CATALOG` (`refinery/packs/catalog.mts`), so two shipped brains are invisible to the MCP capability inventory and CI is red. Fix: add the two catalog rows (verbatim domain/scope/ttl). **(sonnet)** *(also surfaced by lane 12 as a `bun test` breaker)*

### Backtest / flywheel — engine built, no fuel (lane 08)
- **[HIGH] Retrodicted corpus is a manual one-shot on a pinned snapshot** (`refinery/tools/flywheel-backtest.mts:112`, `DEFAULT_SNAPSHOT="2026-06"`; no workflow runs it). The 144 grades are frozen; new ALFRED vintages never enter. Fix: a monthly workflow downstream of the ALFRED refresh that resolves the latest snapshot. **(opus)**
- **[HIGH] Live forward loop has banked zero outcomes;** the only live-gradeable yield is leaf sign-slugs that hadn't refreshed since before §6-A wiring (`SESSION_LOG.md:975`). Fix: confirm the daily rebuild now banks `kind='slug'` rows; add a health signal when 0 predictions open in N days; filter the 29 legacy pending husks. **(opus)**
- **[HIGH] Backtestable universe is one data family (LAUS)** — the dirtiest, most-revised series (`flywheel-backtest.mts:59-70`); the 11 declared clean slugs are unwired. Effective independent N ≈ 2. Fix: land SBA + TDT clean grids; surface `n_families`, not just call count. **(opus)**

### App pages / front-end (lane 10)
- **[HIGH] WelcomeChat "See pricing" → `/pricing` 404** (`app/welcome/WelcomeChat.tsx:132`; real route is `/billing`). Every prospect who clicks the only pricing CTA on the top-of-funnel page hits a 404. Fix: change href to `/billing`; delete the stale PHASE-1 docstring. **(sonnet)**
- **[HIGH] Prospect arrival page renders an arbitrary external `?logo=` URL into `<img src>`** with only a scheme check (`app/welcome/page.tsx:13-16,51`) — tracking-pixel / client-SSRF / deanonymization vector. Fix: host allowlist or server-side proxy. **(opus)**

### Infra / CI (lane 12)
- **[HIGH] Incident logger + healer cover only 24/50 scheduled crons** — 26 fail silently, including Daily Email Digest and most data-bearing ingests (`log-cron-incident.yml`, `heal-cron-failure.yml`). The drift test only checks logger==healer parity, never coverage. Fix: reconcile both lists with the full scheduled set; make the drift test enumerate every `schedule:` block. **(opus)**
- **[HIGH] safe-push.mjs flattens `--no-ff` merge commits** (`scripts/safe-push.mjs:30-44`, plain rebase) — re-triggers resolved conflicts, drops merge-only SESSION_LOG entries (memory-confirmed incident). Fix: detect a local merge commit, use `--rebase-merges` or FF-push directly. **(opus)**
- **[HIGH] `daily-email-digest.yml` pushes with `git push || true` and no rebase** (`:50-57`) — the email send log is silently dropped after a busy commit day, failures masked green. Fix: port the proven `fetch → rebase --autostash → push` retry loop. **(sonnet)**

## Cross-cutting themes

1. **Silent-empty / silent-stale loads are the dominant failure class.** It recurs in at least six places: seed pipelines self-refreshing `_ingested_at` (lane 02), Crexi/fgcu swallowing errors and bypassing the fallback wrapper (lane 02), storm_history's missing zero-row guard (lane 01), Census CBP's full-wipe-on-fail risk (lane 01), city_pulse Tier-2 lacking the recency watchdog its corridors sibling has (lane 02), and active-listings never pruning stale rows (lane 02). The freshness/volume probe is good but is defeated whenever a pipeline can write zero or stamp a fresh timestamp on unchanged data.

2. **Orphan-slug / dual-list drift.** sector-credit's unregistered NAICS slugs (lane 06), the dual slug-inversion (lane 05), the signal_* topic enum triple-coupled across two languages (lane 05), BRAIN_CATALOG vs PER_PACK_REGISTRY (lane 07), and master's parallel `sources[]`/`input_brains[]` (lane 07) are all the same hand-maintained-dual-list-with-no-parity-test pattern that has frozen the nightly rebuild before. The `--all` vocab check passes today but does not cover conditional slugs that only appear when data lands.

3. **Auth surface — the cost routes are the least protected.** The data/MCP surface is intentionally open for the beta, but the two endpoints that actually bill Anthropic tokens (`/api/converse`, `/api/welcome/chat`) plus the service-role `/api/charts/save` insert sink have zero gate. The enforcement plumbing (`capEnabled`/`weeklyCount`/`checkRateLimit`) already exists and is simply unwired. Three lanes converged on this.

4. **Tracker / plan-doc drift on main.** BRAIN_CATALOG red, a 12-day-dead SessionStart gate, the email-funnel plan existing as both a folder (staged-deleted) and a single file (untracked), a stray empty `.audit-scan.mjs`, and stale code comments that say the opposite of the code (master's "confidence matches" comment, the constitution "un-called" comments). RULE 2's "plan markers rot the instant code ships" is visibly happening.

5. **Dead / parked sources sitting in the active probe.** premier_commercial + svn_florida stubs (`sys.exit(1)` by design) live in the active `odd_window` probe and will alarm OVERDUE on a recurring basis (lane 02); noaa_ghcn_rainfall is fully built but never dispatched (lane 02). These train the operator to ignore the probe.

6. **Local dev signal is polluted.** `npm run lint` throws 112 errors from un-ignored worktree/vendor dirs and `bun test` hangs on a live-DB vitest that times out against the firewalled direct `:5432` (lane 12) — so "lint/test clean before push" is not actually runnable locally, undermining the prepush habit.

## Missing data / holes (data the product needs but does not hold)

- **Census CBP establishment/employment frozen at 2022** — every CBP-derived metric is a year+ stale (lane 01). 2023 is live at the API now.
- **Glades + Hendry counties have no MSA-keyed market coverage** (ZORI/ZHVI/Redfin) — any ZIP-level rent/home-value answer for those two counties has no substrate (lane 01). Honestly documented; the product must say "not held."
- **CRE coverage outside Fort Myers is thin** — with lee_associates dark and C&W/Colliers industrial-only, Naples/Bonita/Charlotte office+retail vacancy is effectively uncovered; Crexi (Estero/FMB leases) never activated; SVN deal-level transaction velocity declined (lane 02).
- **The backtest moat has effectively one independent series.** SBA outcomes (immutable, grid-honest) and TDT (self-ingest pending) are the obvious second/third families and are unwired; LeePA keeps one row per parcel so repeat-sales appreciation is impossible (lanes 07, 08).
- **No self-serve billing.** `/billing` is "Coming soon"; `email_usage.tier` is permanently `free` because nothing writes a non-free tier — there is no Stripe path (lanes 10, 13).
- **env AAL denominator is a v1 ACS proxy** pending live OpenFEMA NFIP policy counts (lane 07) — correctly caveated, tracked.
- **noaa_ghcn_rainfall built but never run** → `env_rainfall_swfl_annual_in` is empty (lane 02).

## What we can do better (top simplification / better-approach opportunities)

- **Single source of truth for the headline confidence** — stop computing it twice (engine + master.mts); delete the legacy `computeConfidence` (lane 03). Same shape: one `CONSTITUTIONS` export instead of two hand-edited import lists (lane 05); derive RESPONSE_CONTRACT from shared ROE constants (lane 04); add parity tests for every dual-list (catalog, master sources/input_brains, signal_* enum).
- **Code-split the chart bundle.** Every `/r/` report ships echarts + gsap + recharts even when no chart renders, because the registry barrel-imports all frames and the highlighter pulls the registry (lane 10). Lazy-load per `frameId` and consolidate on one chart library (~1MB win).
- **Make the deliverable moat strict, or stop overselling it.** The anchor set ingests free-text note/question content and strips units, so the "structural no-invention guarantee" is actually a best-effort backstop (lane 11). Build anchors only from sourced value-bearing fields; key by unit.
- **Standardize the silent-empty guards.** Every `replace`-disposition or COPY pipeline should get a pre-write min-row floor + `raise_on_failed_jobs()` (lane 01); every seed pipeline should bump timestamps only on real content change (lane 02); every Tier-2 distill should have the corridors-style recency watchdog (lane 02).
- **Move dead/parked sources out of the active probe** and dispatch the built-but-unrun ones, so the freshness probe stays trustworthy (lane 02).
- **Surface the flywheel's honest N.** The harness already computes `n_families` (~2); show it in The Glass next to call count so a −6.5pp lift on one autocorrelated series isn't over-read (lane 08).

## External verifications

| Question | Verdict | Implication |
|----------|---------|-------------|
| Latest Census CBP vintage + NAICS variable? | **confirmed** — 2023 is the newest (2024 → 404); 2023 still uses **NAICS2017**, no NAICS2022 yet | Bump CBP to 2023 with NAICS2017; do NOT assume 2024 or NAICS2022. Re-verify the variable name when 2024 eventually lands. |
| Does flylcpa.com publish Punta Gorda (PGD) enplanements? | **likely NO** — LCPA operates only RSW + Page Field; PGD belongs to the Charlotte County Airport Authority (flypgd.com) | rsw-airport's PGD metrics are sourced from the wrong publisher; either re-source PGD from flypgd.com / BTS T-100 or remove the PGD emission. The `grain_boundary` "not available" caveat is closer to correct than the emitted metrics. |

## Email funnel (in-flight — audited separately because a parallel session is mid-build)

**Current state on `main`:** The multi-tenant engine (Units B–G) is well-architected and well-tested — pure DI cores, an atomic `FOR UPDATE SKIP LOCKED` claim RPC, a crash-orphan reaper, idempotent unsubscribe injection, DST-correct `computeNextRunAt`, correct DRY_RUN safety, and per-schedule error isolation. But it is **built-but-off** (the `*/15` cron is commented out) and carries two correctness holes plus one half-wired feature.

**Ship-blockers (must close before the cron flips):**
1. **[CRITICAL] Resend segment namespacing** — `lib/email/audience-sync.ts:148-182`. Bare-slug segments on one shared Resend account → cross-tenant contact bleed and CAN-SPAM exposure (mailing people who never opted in to that sender). Namespace by `${userId}:${slug}` and back-migrate. This alone gates go-live.
2. **[HIGH] Usage-cap headroom** — `lib/email/scheduler.ts:235-242`. Gate on `sent + expectedRecipients <= limit`, not `sent < limit`; decide block-vs-partial overshoot policy.
3. **[HIGH] Scope consumer** — `scripts/email/run-schedules.mts:223-228`. Either land Task 02 (scoped content through the grounded `lib/deliverable/*` engine) or gate the scope clause out of the confirmation so the product doesn't promise a Cape-Coral-flood digest and ship the generic one.
4. **[MEDIUM] Project-ownership validation** (`app/api/email/schedule-command/route.ts:62-63`) — RLS prevents cross-tenant mutation, but a user can attach a schedule to a `project_id` they don't own, which silently breaks brand resolution. Validate ownership before propose/confirm.
5. **[MEDIUM] Contact re-upload nulls existing names** (`app/api/email/contacts/upload/route.ts:155-179`) — `name: incoming.name ?? ex.name`. Silent data loss on the routine "add a tag" flow.
6. **[MEDIUM] Physical-sender provenance** on the unverified-tenant platform-domain path (`lib/email/sender-config.ts:52-74`) — add an ADDRESS/"sent on behalf of" token; verify against live Gmail/Yahoo bulk-sender + Resend guidance.

**What the two in-flight features must close to ship safely:**
- **Welcome→delta two-step activation** needs a per-`(recipient, sequence_step)` idempotency key — the only dedup today is the claim RPC (per-schedule, not per-recipient-per-step), so a retry/crash-replay re-sends step 2. The two-step command confirm is also replayable (no proposal nonce) — settle the idempotency key now because the inbound path will reuse this seam.
- **Buyer-intent reply sensor** is net-new (no `app/api/email/inbound/route.ts`). It must: do live Resend inbound-webhook **signature verification** (vendor-verify in-session, do not trust remembered payload shape); resolve sender-email→`user_id` via `email_sender_config` and **reject unknown senders before any parse**; **reuse** the existing `schedule-command` parser, not fork it; and make any intent label deterministic/auditable (no ungrounded LLM guess that auto-acts — the two-step confirm must gate any action).
- **Stripe billing is entirely absent** — every tenant is permanently free-capped (50/mo) because nothing writes a non-free `email_usage.tier`. The paid path (Task 04) is a stub.

**Lower-severity (track, not blockers):** chronically-failing-but-armed schedules never escalate (no `consecutive_failures` counter / notify sink); domain-verify refresh writes a new domain string against the old `resend_domain_id`; the new `schedule-command.test.ts` lives outside the `__tests__` convention.
