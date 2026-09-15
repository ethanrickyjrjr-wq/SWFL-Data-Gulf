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
  - chief-of-staff:wiki/swfl-pipeline-health.md (the full, exhaustive version of this page)
---
# Pipeline health

**Status (2026-09-15):** SteadyAPI is out on Ricky's word — the listing spine reverts to the
crawl4ai scrape source that ran clean from GitHub's own runners on 2026-07-01 (one flag flip plus
a dry run). The rebuild can run on the Max subscription (`claude -p`, proved live 09-15) instead of
API credit, but the nightly GitHub chain still needs `ANTHROPIC_API_KEY` credit until a Fedora
self-hosted runner carries the Max login. The master brain has not rebuilt since 2026-08-19.

## What it is

The dated read of what breaks in this repo's 113 GitHub Actions workflows, why, and what a
residential-IP runner (Fedora, on Ricky's home network) can and cannot fix. The 75 `source_ceiling`
entries in `ingest/cadence_registry.yaml` are the "more data" list — read this page before adding a
new one. This is the condensed, this-repo version; the full write-up with every run ID and log
excerpt lives on [chief-of-staff's wiki/swfl-pipeline-health.md](https://github.com/ethanrickyjrjr-wq/chief-of-staff/blob/master/wiki/swfl-pipeline-health.md)
(a sister repo — Ricky's Chief of Staff desk compiles across the whole operation, this repo holds
the copy scoped to this product).

## Facts

- 2026-09-15 — **The rebuild can run on the Max subscription, not just the API key.**
  `LLM_PROVIDER=claude-code` shells every refinery agent call out to `claude -p` on the machine's
  claude.ai login instead of the Anthropic API — proved live: Sonnet 4.6, 7.1s, correct output, $0
  ledger cost, no API key in the environment. Run it as `LLM_PROVIDER=claude-code bun refinery/cli.mts
  master --resilient` from Ricky's machine or Fedora. GitHub-hosted runners have no claude.ai login,
  so the *nightly, scheduled* chain still needs API credit until a self-hosted runner on Fedora
  carries the Max subscription — that's the Fedora job (see Decisions).
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
- 2026-09-15 — Rebuild order: (0) Ricky puts credit on the Anthropic console key — the only blocker
  for 16 workflows; (1) flip the listing path to `--source scrape`, dry-run one county, let the
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
- 2026-09-15 — Do not route pipeline LLM calls through the Fedora subscription — `claude -p` on Max
  is Consumer Terms. The API key (with credit) is the only legal path for the unattended nightly
  chain.

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
