---
title: Pipeline health
type: fact
status: active
updated: 2026-09-15
sources:
  - https://github.com/ethanrickyjrjr-wq/SWFL-Data-Gulf/actions/runs/34952735442
  - https://github.com/ethanrickyjrjr-wq/SWFL-Data-Gulf/actions/runs/34884508823
  - https://github.com/ethanrickyjrjr-wq/SWFL-Data-Gulf/actions/runs/34872217510
  - https://github.com/ethanrickyjrjr-wq/SWFL-Data-Gulf/actions/runs/34709333377
  - https://github.com/ethanrickyjrjr-wq/SWFL-Data-Gulf/issues?q=label%3Acron-failure+is%3Aopen
  - ingest/cadence_registry.yaml
  - docs/cron-rebuild-failures.md
  - .github/workflows/nightly-chain.yml
  - https://www.anthropic.com/legal/consumer-terms
  - https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan
  - https://code.claude.com/docs/en/agent-sdk/overview
  - https://code.claude.com/docs/en/authentication
  - https://code.claude.com/docs/en/costs
  - _RESEARCH/agent-behavior/2026-09-15-max-subscription-vs-api-key-for-pipeline-calls-evaluation.md
  - refinery/agents/anthropic.mts
  - _ASSISTANT/NORTH-STAR.md
  - chief-of-staff:wiki/swfl-pipeline-health.md (the full, exhaustive version of this page)
---
# Pipeline health

**Status (2026-09-15):** SteadyAPI is out on Ricky's word — the listing spine reverts to the
crawl4ai scrape source that ran clean from GitHub's own runners on 2026-07-01 (one flag flip plus
a dry run). The API key stays the right path for the pipeline: measured spend is trivial ($6.03 in
the last 30 days, $81.42 lifetime — see Facts), the key just hit a zero balance, and routing the
customer-facing brain rebuild through Ricky's personal Max login runs into Anthropic's own "not for
third parties' products" line, not a cost problem. A same-day metering defect is fixable today at
$0: `claude-sonnet-5`/`claude-opus-5` are missing from the cost table, so recent calls on those
models log at $0.00 and the spend guard can't see them. The master brain has not rebuilt since
2026-08-19.

## What it is

The dated read of what breaks in this repo's 113 GitHub Actions workflows, why, and what a
residential-IP runner (Fedora, on Ricky's home network) can and cannot fix. The 75 `source_ceiling`
entries in `ingest/cadence_registry.yaml` are the "more data" list — read this page before adding a
new one. This is the condensed, this-repo version; the full write-up with every run ID and log
excerpt lives on [chief-of-staff's wiki/swfl-pipeline-health.md](https://github.com/ethanrickyjrjr-wq/chief-of-staff/blob/master/wiki/swfl-pipeline-health.md)
(a sister repo — Ricky's Chief of Staff desk compiles across the whole operation, this repo holds
the copy scoped to this product).

## Facts

- ~~2026-09-15 — Correction: Max-plan automation is not a ToS violation, `LLM_PROVIDER=claude-code`
  proved live running the rebuild on Max.~~ SUPERSEDED 2026-09-15, same day, by the two lines below —
  this page gave three different answers to the same question in one day (Ricky: "WE HAVE MAX PLAN,
  WHY DO WE NEED CREDITS"; then two sessions ran in parallel on the exact question). Verified by
  grep: `LLM_PROVIDER` is read by nothing in `refinery/`, `lib/`, `app/`, or `scripts/` — zero hits.
  `refinery/agents/anthropic.mts:15-17`: `agentsAreMocked() { return !env.anthropicApiKey }` — no
  key present means the pipeline runs in **deterministic mock mode**, not on the Max login. The
  "$0 ledger cost, no API key in the environment" result earlier today was the mock path, not proof
  Max was doing the work. (source: `_RESEARCH/agent-behavior/2026-09-15-max-subscription-vs-api-key-for-pipeline-calls-evaluation.md`)
- 2026-09-15 — **The real terms question, and it's narrower than "is automation banned."** The
  Consumer Terms §3(7) bot clause is not the operative one — general Agent SDK/`claude -p` automation
  is fine, including a named GitHub Actions integration (support.claude.com, updated 2026-06-15).
  The clause that actually reaches this repo is in the Agent SDK's own developer docs
  (code.claude.com/docs/en/agent-sdk/overview, verbatim): "Unless previously approved, Anthropic does
  not allow third party developers to offer claude.ai login or rate limits **for their products**,
  including agents built on the Claude Agent SDK." The nightly brain rebuild generates the content
  sold to SWFL Data Gulf's paying customers — that is squarely "their product." Internal dev/CI
  tooling (e.g. the 3 `claude-code-action` GHA workflows building/testing this repo's own code, not
  generating customer-facing brain content) is not "their product" and isn't reached by this clause —
  a separate, narrower, and still-unadopted option (see Decisions; blocked by the standing 30-day
  freeze regardless, `_ASSISTANT/NORTH-STAR.md` priority 5, runs through 2026-09-18).
- 2026-09-15 — **What we're actually spending, measured from our own `api_usage_log`** (6,122 rows,
  07/01–09/08/2026): $81.42 lifetime, $6.03 in the last 30 days across 697 calls, refinery
  synthesis+triage $12.30 **total, ever**, nothing through the metered refinery path since 08/10.
  This isn't a cost problem — the console key hit a zero balance on a tiny run rate, not an expensive
  one. Caveat: this table only records calls routed through `logApiUsage`; the 3 GHA
  `claude-code-action` workflows and any `SKIP_USAGE_LOG=1` call aren't in it, so this is a floor, not
  a full invoice. (source: `_RESEARCH/agent-behavior/2026-09-15-max-subscription-vs-api-key-for-pipeline-calls-evaluation.md`)
- 2026-09-15 — **Live defect: the spend guard is blind to the current models.** `RATES`
  (`refinery/agents/anthropic.mts:53-64`) has no row for `claude-sonnet-5` or `claude-opus-5`;
  `computeCostUsd` returns $0 for an unrecognized model by design. Measured: 58 `claude-sonnet-5`
  calls logged at $0.00, invisible to `checkSpendGuard`'s caps. Same shape as an already-flagged
  07-30 finding. Fix is two rows in `RATES`, $0 cost, does not touch the freeze (a repair to an
  existing guard, not a new adoption).
- 2026-09-15 — **Precedence bug, the reason a naive attempt to use the subscription silently bills
  the API anyway:** documented auth order puts `ANTHROPIC_API_KEY` ahead of `CLAUDE_CODE_OAUTH_TOKEN`,
  and in non-interactive `-p` mode the key is always used when present (code.claude.com/docs/en/authentication).
  Our key lives in the local dotenv file bun loads, which wins over anything set in the shell — any
  subprocess inheriting `process.env` bills the API regardless of what subscription token is also set.
- 2026-09-15 — The listing pipeline's pre-SteadyAPI spine still exists: `--source scrape`, a
  crawl4ai walk of the brokerage listings site (host in the `LISTING_LIFECYCLE_BASE_URL` secret).
  Ran clean from GitHub's own runner IPs 2026-07-01 (Lee 21,889 rows, Collier 8,120, zero 403s).
  Reverting is one uncomment in `listing-lifecycle-daily.yml`. Lost on revert: days-on-market and
  sold events (previously from SteadyAPI's tax-history probe) — Lee's sold median already comes
  from LeePA deeds, Collier's from Redfin county monthly, so this is not a data gap, just a lost
  freshness signal. Reuse terms for scraping a brokerage site are unrecorded anywhere in the repo —
  Ricky's lane, unresolved.
- 2026-09-15 — Nightly Chain has failed every night 09-12 through 09-15 at `gate · assert_landed`:
  the listing feed logs `untrustworthy scan (incomplete: last page returned status 429)` then
  `[fatal] every county returned 0 rows`, for 32 straight nights — an account-state 429, not a
  burst, at 1 req/s with backoff. Because `rebuild · brains` needs the row gate, the master brain
  hasn't rebuilt on schedule since 2026-08-19.
- 2026-09-15 — `ingest · city pulse` (and 15 other workflows carrying `ANTHROPIC_API_KEY`) 400s:
  `Your credit balance is too low`. Classified as a generic failure today, not BILLING, so it shows
  as five red cities instead of one billing issue.
- 2026-09-14 — Freshness doctor red rows: `leepa_comp_sales`, `neighborhood_stats`,
  `collier_official_records` are NEVER_LANDED — three registry entries pointing at tables that never
  populated, so they read FRESH forever until landed or deleted. `dbpr_sirs_submissions` and
  `crexi_listings` TIMEOUT_KILL on the Windows self-hosted runner.
- 2026-09-14 — `collier-official-records` parse failure (`expected 10 <td> cells, got 1`) is a WAF
  or interstitial page shape, not a data page — already classed `scrape_fragile` in the registry.
- 2026-09-13 — Only two workflows run on `[self-hosted, swfl-local]` (the Windows box): DBPR SIRS
  (DBPR's WAF drops GitHub datacenter IPs) and Crexi (a pinned Windows crawl4ai venv). Both are the
  residential-IP problem, and the Windows box is the only residential IP this repo has today.
- 2026-09-12 — One reverify signal is BROKEN, not just failing: its query names
  `public.data_lake.lee_deed_official_records`, a schema-prefixed name PostgREST can't see — it can
  never pass as written. `/api/health` (a signal target) doesn't exist in the repo either.
- 2026-09-14 — 22 open `cron-failure` issues, oldest since 2026-06-22; nothing auto-closes them
  except a scheduled green run of the same workflow.
- 2026-07-22 — 75 `source_ceiling` entries in `ingest/cadence_registry.yaml`: things a source is
  proven to carry that the lake never pulled. Free, zero-integration ones first: Lee's own ArcGIS
  permit layers (9,386 unincorporated permits — replaces the fragile Accela scrape), QCEW industry
  detail and FDLE offense types (already inside responses we already parse), FHFA county/ZIP HPI,
  Census Building Permits Survey (a cross-check), Collier's Applied-permits XLSX, Zillow ZHVI by
  bedroom, FDOT crash layers.
- 2026-07-05 — Guards already exist — the failures above are money and upstream shape, not missing
  guardrails: $1/run and $5/day API caps, the `assert_landed` row gate, content contracts, a doctor
  that writes prescriptions, one auto-retry, incident issues, a Healthchecks.io dead-man ping.

## Decisions

- 2026-09-15 — **Lake first, not listings.** Ricky: "You are focused on listings and I don't know if
  that is the need right now. It's SWFL Data!!!" Stop gating the whole nightly rebuild on one
  dataset of 77 — rebuild on whatever landed, carry a per-dataset freshness caveat, let the doctor
  keep only the listing leg red on its own.
- 2026-09-15 — **SteadyAPI is out.** Ricky: "Forget the steady api!!!!" Spine reverts to the scrape
  source; SteadyAPI code stays inert, no dashboard check, no renewal.
- 2026-09-15 — Rebuild order: (0) Ricky adds credit on the Anthropic console key for the 16
  credit-blocked workflows — still the right path (see Facts: ~$6/month measured run rate, this is
  cheap, not a workaround); (1) flip the listing path to `--source scrape`, dry-run one county, let the
  chain run — the row gate lands and brains rebuild nightly again; (2) fleet hygiene in one session
  (classify credit/429 as BILLING, land or delete the 3 ghost registry entries, fix the
  schema-prefixed signal, add the missing health route, close the 22 stale issues); (3) Fedora
  stands up as the `swfl-local` residential-IP runner for DBPR SIRS, Crexi, Collier official
  records, and Collier permits, then the Windows runner retires; (4) pull from the 75-entry ceiling
  list, Lee/Collier only, cheapest and most-proven first; (5) the MCP landing page, once the numbers
  behind it are current — see [MCP connector](mcp-connector.md), which shipped the page already
  (PR #204) but the underlying data staleness this page describes still needs fixing first.
- 2026-09-15 — Do not move the cron fleet to Fedora. GitHub Actions is free on the public repo and
  already carries the doctor, the incident logger, and the dead-man ping. Fedora's job is the
  residential IP, not the scheduler.
- 2026-09-15 — **Do not route the customer-facing brain rebuild through Ricky's personal Max login.**
  Not a flat ToS ban (general Agent SDK automation is permitted) — the specific reach is Anthropic's
  "not for third parties' products" line (see Facts) plus the standing 30-day adopt-nothing-new
  freeze (`_ASSISTANT/NORTH-STAR.md` priority 5, through 2026-09-18). The API key is the right,
  cheap path (~$6/month measured). Narrower, separate, still-unadopted option: `CLAUDE_CODE_OAUTH_TOKEN`
  for the repo's own internal dev/CI GHA workflows (not customer-facing content) — not proposed here,
  blocked by the freeze regardless, a decision for after 2026-09-18 if Ricky wants it scoped.
- ~~2026-09-15 — Do not route pipeline LLM calls through the Fedora subscription — `claude -p` on Max
  is Consumer Terms. The API key (with credit) is the only legal path for the unattended nightly
  chain.~~ SUPERSEDED 2026-09-15 by the Decision line above — right conclusion, wrong reason; corrected
  same day after two sessions independently checked the actual clause.

- 2026-09-15 — **Fix the $0-rate spend-guard defect now.** Add `claude-sonnet-5` and `claude-opus-5`
  rows to `RATES` in `refinery/agents/anthropic.mts`. $0 cost, one commit, not an adoption (a repair
  to an existing guard) — doesn't touch the freeze. This is the concrete "automatic guard" fix
  available today from Ricky's "rules, guards and repairs automatic" ask.

## Open questions

- Does the scrape source still parse? Unchecked since 2026-07-01. One dry-run dispatch answers it.
- Does the Actions runner tarball run as a user service on Fedora 44 without sudo, and does a
  rootless-podman Playwright container reach DBPR/Crexi from the Xfinity line? Unverified — needs a
  session actually on Ricky's network (`ssh fedora`), which a cloud sandbox can't reach.
- Should the chain rebuild brains under a stale caveat when only the listing leg is red? The row
  gate was deliberately flipped to blocking — reversing it is Ricky's call, not the desk's.

## Contradictions

- 2026-09-14 — Doctor says `leepa_comp_sales` NEVER_LANDED; the repo's own inventory audit says
  `data_lake.leepa_comparable_sales` holds 108,848 rows. OPEN — one live row count settles it.

## Related

- [MCP connector](mcp-connector.md)
- [Diversification](diversification.md)
- [Chief of Staff: SWFL pipeline health (full version)](https://github.com/ethanrickyjrjr-wq/chief-of-staff/blob/master/wiki/swfl-pipeline-health.md)
- [Chief of Staff: Florida public records](https://github.com/ethanrickyjrjr-wq/chief-of-staff/blob/master/wiki/florida-public-records.md)
