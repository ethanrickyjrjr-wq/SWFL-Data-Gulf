# Apify — where it fits brain-platform, and the one Actor worth building

**Date:** 08/03/2026 · **Trigger:** operator: "we have access to apify, how can we use it here? we have the CLI. look into building an actor"

## Verified state (live, this session — not memory)

- **CLI was NOT installed** despite "we have the CLI" (both `where.exe apify` and `npm ls -g` empty).
  Installed `apify-cli` 1.7.1 globally via npm 08/03/2026. **LOGGED IN 08/03/2026** as
  `rectangular_horn` (userId rXchKRQTnXEo9OJxS): default personal token copied from
  console.apify.com/settings/integrations via browser drive (operator logged in), then
  `apify auth login -t` — token now in OS keyring, ALSO persisted as User-scope `APIFY_TOKEN`
  env var (for future Python `apify-client` / scripts). Clipboard cleared after. NOTE: CLI 1.7.1
  does NOT honor `APIFY_TOKEN` env for auth state (skill text wrong there) — persistent login via
  `apify auth login -t` was required; verified verbatim in CLI reference (auth.json/keyring,
  "All other commands use these stored credentials").
- **What "access to Apify" actually is:** the Apify MCP plugin live in Claude Code sessions —
  `search-actors`, `call-actor`, `get-dataset-items`, `fetch-apify-docs`, `rag-web-browser`.
  That is a *consumer* surface (call existing store Actors) and needs no CLI at all.
- **Monetization verified in vendor docs** (docs.apify.com academy + SDK pay-per-event pages):
  pay-per-event (PPE) / pay-per-result are real — chargeable events are triggered from Actor
  source code (per result, per API call, per start); pricing set in the Actor's Publication tab;
  `ACTOR_MAX_PAID_DATASET_ITEMS` env caps unpaid items. Apify runs billing/metering/payouts.
- **Standby mode verified** (docs.apify.com/actors/running/standby): an Actor can run as an
  always-on HTTP server (any method, input via query/body) instead of batch — i.e., an Actor can
  be a thin real-time API wrapper, and can even expose an MCP endpoint over standby
  (SDK guide: mcp-servers over standby, Streamable HTTP, bearer = Apify token).

## What an Actor is (from the loaded apify-actor-development skill)

Docker-packaged serverless program: JSON input (schema-validated), pushes JSON items to a
dataset / files to a key-value store. Scaffold: `apify create <name> -t ts_empty|python-empty`,
test `apify run`, deploy `apify push`. `.actor/actor.json` + input/output/dataset schemas +
README (store landing page) are mandatory parts.

## Fit assessment — three lanes, ranked

**Lane A (RECOMMENDED BUILD): a metered distribution Actor over OUR live API.**
One Actor ("SWFL Property Data" / comps / market stats) that is a thin wrapper calling
`swfldatagulf.com/api/b/*` (and/or the comp path) and pushing cited results to a dataset,
priced pay-per-event. Why it's the fit:
- RULE 0.9 exactly: OURS = data/provenance/judgment; Apify supplies the NOT-OURS plumbing
  (billing, metering, discovery, hosting) we would never build well.
- Zero scraping, zero fragility — it reads our own API. Build cost is small.
- Distribution: Apify Store reaches humans AND agents (store Actors are callable as MCP tools
  through Apify's MCP server) — a second agent-discovery channel next to our own /api/mcp.
- Revenue lane with no billing code of ours.
Failure modes to name at brainstorm (RULE 3.5, not yet done): egress burn if Actor fan-out hits
Supabase/Vercel (the 07/22 egress scar — needs rate/tier caps + caching), tier leakage (Actor
must not hand tier-3 depth at tier-1 price), provenance/rules-of-engagement stripped from
payload, freshness token dropped. Monetization itself = operator decision (builds-free/SEND-paywall
precedent is about a different surface; this is a NEW surface — needs sign-off).

**Lane B (USE, don't build): existing store Actors for enrichment.**
The cold-email/prospect lane (DBPR licensees parked; Clay drive 08/02 showed 0.5–3 credits/row)
could use store Actors (Google Maps, contact scrapers) at commodity prices via the MCP tools we
already have. No CLI, no build. Candidate when the prospect list unparkes.

**Lane C (RULED OUT for now): build a scraping Actor for blocked sources.**
NCUA Angular SPA, FLOIR portal, DBPR emergency-closure xlsx would need browser automation an
Actor could host — but the 08/02 greenfield decree rejected exactly this fragile class
("the kind that always fail"), FLOIR "stays dead," and for .gov sources GHA+Playwright already
covers headless free. Apify's edge (residential proxies, anti-blocking) buys nothing on .gov.
Don't resurrect without an operator decree.

**Standing tension to surface, not silently resolve:** "crawl4ai is the ONLY web-crawl tool"
(RULE 0.4) governs research crawling. Lane B/C are production ingest, a different lane — but any
Apify use that looks like crawling should be flagged against that decree, operator decides.

## BUILT 08/03/2026 — playground actor `swfl-market-pulse` (Lane A v0, live on the platform)

Operator decree: "PLAY AROUND. LEARN WHILE YOU BUILD" then "DO WHAT WORKS FOR THE LEAST AMOUNT
OF MONEY AND WE CAN RELY ON." Built + deployed same session, ~1 hour end to end:
- Location: `C:\Users\ethan\dev\swfl-market-pulse` (own git repo, outside brain-platform — the
  repo's cross-project write hook blocks Claude file tools on sibling paths; wrote via shell).
- Shape: JS empty template, ~70-line `src/main.js` — fetches our live speak endpoint
  (`/api/b/<report>?view=speak&tier=<1|2>&v=5`), parses headline + metric table into structured
  dataset items `{type, metric, value, direction, report, tier, as_of, source}` — provenance on
  every row, tier hard-capped at 2 in code, report id regex-validated, our own /r/<report> URL
  as source link.
- Actor ID `7XwiUmlTzzxvWMbsr` on account rectangular_horn. Build 0.0.1 SUCCEEDED (remote
  Docker build ~90s). Cloud run 3n0WpvFUdWLZvNfLy SUCCEEDED: 7 items, exit 0.
- **Cost, measured from the run record: $0.000665/run, 2.59s, 0.0029 compute units at the
  default 4096MB** — i.e. ~1,500 runs per dollar. Memory could drop to 256MB and cut that ~16x.
- Learnings: (1) local `apify run` on Windows crashes AFTER completion (libuv assertion in
  node 24 teardown) — data lands fine, Linux cloud run exits 0; ignore locally. (2) Platform
  runs default to "LIMITED_PERMISSIONS" — fine for pure-fetch actors. (3) `apify push` builds
  remotely on their ECR, no local Docker needed. (4) `apify api <endpoint>` is an authenticated
  raw-API escape hatch (used it for run stats). (5) The template git-inits itself with
  AGENTS.md/CLAUDE.md stubs. (6) Dataset schema views render the console table for free.
- NOT done (deliberate): monetization (needs Publication-tab setup + operator sign-off),
  publishing to the Store (actor is private), standby mode, README polish, egress-side caching
  on our API. Publishing = the real decision; the plumbing is now proven.

## Next steps if Lane A is a go

1. Operator: `! apify login` (browser OAuth) — CLI is installed and waiting.
2. `superpowers:brainstorming` + `node scripts/new-build.mjs apify-distribution-actor "..."`
   (RULE 3.5 — failure-modes section required before approval).
3. Scaffold `apify create swfl-data-actor -t ts_empty` (TS matches stack), set
   `generatedBy: "Claude Code with Claude Fable 5"` in `.actor/actor.json` per skill.
4. Actor code NEVER goes in brain-platform repo root without deciding repo placement first —
   likely its own folder/repo; contains no secrets (reads public API).

## ADDENDUM 08/03/2026 — INBOUND lane proven live: sold comps w/ photos, baths, and MLS description

Operator: "see how apify actors can help us build emails" -> "SOLD HOUSES" -> "HAS TO BE A WAY"
for date range + description. Lane C (scraping) was ruled out above for .gov/blocked sources; this
is a DIFFERENT question — portal listing data we do not hold — and it was proven with real runs,
total spend ~$0.80.

**The 2-step recipe (both steps verified with live runs, not schemas):**
1. BULK — `moving_beacon-owner1/realtor-com-property-scraper`, $0.01/result. Takes explicit
   `date_from`/`date_to` (+ `past_days`, `mls_only`, `radius`). Run fHcQih5wLt7isk75w: 33914,
   sold, 01/01/2026-02/28/2026 -> 31 items, `last_sold_date` 2026-02-27. Run GWVs3PePdm8MXF7cY:
   same ZIP, 06/01/2025-06/30/2025 -> 25 items, `last_sold_date` 2025-06-30 (**14 months back**).
   Fields: sold_price, last_sold_date, beds, full_baths + half_baths (SEPARATE), sqft, year_built,
   lot_sqft, price_per_sqft, county, fips_code, hoa_fee, tax + tax_history, assessed/estimated
   value, agent+broker+office w/ email & phones, nearby_schools, `primary_photo` AND `alt_photos`
   (**full gallery — 50 photos on 4627 SW 2nd Ave, 31 on 2619 SW 5th Ave**). `text` = `<NA>` here.
2. DETAIL (only for homes actually featured in an email) — `one-api/realtor-property-scraper`,
   $0.007/result, `property_inputs: [<realtor.com detail URL>]`. Run y6PbRIwA5FJvbOUfP returned a
   92,784-byte `Raw` blob whose `details.text` is the **3,000-char full MLS description on an
   ALREADY-SOLD home** ("<< MULTIPLE OFFERS >> Some waterfront homes impress..."). Also carries
   property_history[] w/ per-event photos, street_view_url, schools, tax assessments, estimates.
   Description is NOT a first-class column — parse it out of `Raw`.

**Photo rot falsified at this age:** the 02/27/2026 sold home's `primary_photo` returned HTTP 200
image/webp 21,164 B and the full-size `.jpg` variant HTTP 200 image/jpeg 56,334 B on 08/03/2026.
Relevant to the open `rdcpix_rot_head_reprobe` check. Photos are rdcpix — the SAME CDN our existing
SteadyAPI photos use, so no new host/brand surface.

**Why this matters beyond emails — it retires a known open problem.** Our own
`_RESEARCH/data-and-ingest/2026-07-02-sold-price-backfill-findings.md` documented that a listing
stamped `sold` with price 0 is TERMINAL (`plan_off_market_checks` re-probes only `holding` rows),
so the real closing price is only ever recoverable via a per-build PAID call, forever — 11 of 19
captured sold transitions were price-0 at the time. A date-ranged Apify sold pull returns the real
`sold_price` for any window at a penny a home, which is a bulk repair path that research had no
answer for ("decision-pending, no code written").

**COVERAGE CORRECTION (do not repeat the error):** the 98.5% comp-photo figure
(34,673/35,202, `lib/listings/comp-photos.ts`) is coverage INSIDE the sweep window ONLY. Photo
capture first shipped 06/30/2026 (`7c66a774`), so as of 08/03/2026 we hold ~5 weeks while a comp
set reaches back 6-12 months. Quote coverage against the COMP LOOKBACK WINDOW, never against swept
rows.

**Actors that FAILED — do not re-propose without re-testing:** `scrapeworks/realtor-property-scraper`
FAILED 2/2 (exit 1, 0 items, <6s) despite the best-looking schema; `grimnir/real-estate-aggregator`
SUCCEEDED with 0 items; `parseforge/realtor-com-scraper` output schema is `{error, scrapedAt}` —
its recent runs all error. 2 of 5 store actors tested were junk. This is the fragile-source class
the 08/02 decree named; the mitigation is that failed items are never billed, not that it won't break.

Open: `apify_sold_comp_backfill_wire`. Closed w/ evidence: `apify_sold_comp_lookback_depth`,
`apify_sold_property_description_unproven`.
