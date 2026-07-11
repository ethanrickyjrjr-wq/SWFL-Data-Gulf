# HANDOFF — Reliable-source research mission (run with the upgraded web-crawl tool)

**For:** a fresh Sonnet session. **From:** Opus 4.8, 07/11/2026. **Mode:** research + evidence, then a
recommendations doc + checks. **Do NOT write pipeline code in this session** — this is a sourcing hunt;
the build follows separately once the operator picks winners.

Operator's words: *"Send out the web-crawl tool with all its new abilities and find us solid info we can
rely on for this. Figure out a source, and figure out if that source is better for anything else we have
that breaks all the time. Then find other sources for other things that always break and we suck at."*

---

## 0. Rules that bind this session (read first)

- **RULE 0.4 — research the outside answer with the crawl tool, not memory.** Every vendor/source fact
  (URL, file path, field names, cadence, license/attribution, rate limits) is verified with a LIVE fetch
  in-session and written down with the fetched URL. "I remember" and "the docs probably say" are not
  evidence.
- **RULE 0.5 — probe OUR code first.** Before proposing a source for anything, confirm what we already
  hold and how it breaks. Grep `ingest/pipelines/`, `ingest/cadence_registry.yaml`, the open `checks`,
  and `docs/cron-rebuild-failures.md`. Never propose a source for a problem we already solved.
- **No invented numbers / source-faithful only.** A source is only "solid" if the number it gives is the
  real published figure at the grain we claim — never a back-solved or median-of-medians derivation
  dressed up as sourced. Provenance is the data ORIGIN (realtor.com, Redfin, Zillow, a county), never the
  access layer.
- **No paid model web-search inside any scheduled pipeline** (locked, `ingest/CLAUDE.md`). The crawl tool
  = fetch of sources WE discover; an LLM distill only runs with matched content. This mission is allowed
  to spend on research; what it *recommends wiring* must obey the cron cost locks.
- **The crawl tool is the ONLY web-crawl tool** — never Firecrawl. Its files never go to GitHub (the repo
  gitignores that tool's name; that's why this doc is named "reliable-sources", not after the tool).

## 1. The crawl tool — confirm its current abilities BEFORE using them

Pinned (from root `CLAUDE.md`): interpreter `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe`; PATH shim
`crawl4ai <url>` → clean markdown; underlying official `crwl` CLI. **Installed version this machine:
0.9.0** (verified 07/11/2026). The CLI exposes abilities worth using deliberately — do NOT just dump
markdown:

- **Deep crawl** `--deep-crawl best-first --max-pages N` — follow links toward a goal (e.g. find the one
  page on a county GIS site that lists REST endpoints).
- **Structured extraction** — `--schema <css.json>` (deterministic CSS/XPath, no LLM cost) or
  `--json-extract "<description>"` (LLM extraction) to pull a table/spec into JSON instead of prose.
- **Q&A over a page** `-q "<question>"`, content filters `-f`, browser profiles `-p` for JS/auth pages.
- **STEP 0 (mandatory):** crawl the tool's own current docs (`https://docs.crawl4ai.com`) and write a
  3-5 line "what 0.9.0 can do that we weren't using" note into your findings doc. The operator explicitly
  asked for "all its new abilities" — prove you enumerated them, don't assume the 2026-06 feature set.

## 2. PART A — a reliable price source (the immediate trigger)

**Context (already established this session, don't re-derive):** `data_lake.daily_truth.median_sale_price`
has been NULL for 19 days — it web-searched (lane 3) a *sold* price we can't get daily anywhere. The fix
in flight is a dual signal: a **daily ASKING** median from our own live listings + a **monthly SOLD**
anchor from Redfin's free city file (`data_lake.redfin_city_swfl`, built + proven this session, part 1
committed). Cape Coral and Fort Myers reconcile cleanly. **Naples/Collier does NOT** — and that's the
open research question:

- Collier County **asking** (our live listings, all residential): **$309,000** (9,229 listings).
- Collier County **sold** (Redfin, All Residential, as of 06/04/2026): **$625,000** (957 sales).
- Same geography, asking is HALF of sold. Lee reconciles ($425k asking / $360k sold); Collier doesn't.

**A-goal:** find a solid, independent source that tells us the TRUE Collier/Naples residential price
picture at a defensible grain+cadence, so we can (a) explain the 2× gap — near-certainly a property-type
MIX difference (our live-listing "residential" for Collier likely stuffed with manufactured/land/low-end
condo that Redfin's sold count excludes) and (b) pick the geography+filter that makes asking and sold
describe the same market. Candidate sources to evaluate LIVE (confirm each: free? structured file or API?
grain? cadence? attribution/license? does it split by property_type?):

1. **Redfin Data Center** — we already stream the county + city TSVs (proven reliable, free, monthly, YoY
   + homes_sold, splits property_type). Check whether the city file's *property_type* rows or the
   `place_type`/`region_type` columns let us define a "Naples area" that matches our listing footprint.
2. **Realtor.com Data Library** (`realtor.com/research/data`) — free monthly ZIP/county/metro inventory +
   median list & sold, active listing counts, DOM. This is our SAME provenance as the paid access layer;
   the free bulk file may hand us county/ZIP sold + list medians directly, no metered calls. HIGH PRIORITY.
3. **Zillow Research** (`zillow.com/research/data`) — ZHVI (typical value, tiered by home type) + ZORI +
   for-sale/sold inventory; free CSVs, monthly, splits SFR vs condo. We already use ZHVI as the desk
   fallback — check if its *sold*/list series or home-type tiers reconcile Collier.
4. **FRED realtor.com release** (`fred.stlouisfed.org/release?rid=462`) — county-level realtor.com series
   (note: an open check flags our `fred_listing_swfl` currently cites the WRONG rid — confirm the right
   one while here).

Deliverable for Part A: which source (or which property_type filter on a source we already hold) makes
Naples/Collier asking-vs-sold coherent, with the verbatim field names + the fetched URL.

## 3. PART B — is that winning source better for other things that break?

Once you land a Part-A winner (likely Realtor.com Data Library or a better cut of Redfin/Zillow), ask:
**what ELSE does that same free structured source cover that we currently get from a flaky path?** Map
its full field list against our brains. Concretely check whether it also gives, free + monthly + already
structured: active inventory counts, months-of-supply, median DOM, price cuts, new listings, price/sqft —
because today several of those ride the fragile SteadyAPI/live-listing path (see Part C). One reliable
bulk file replacing three flaky feeds is the win the operator is pointing at.

## 4. PART C — sources for the OTHER chronic breakers (what we suck at)

Grounded from the open `checks` + `docs/cron-rebuild-failures.md` (07/11/2026). For EACH cluster, find a
more reliable ORIGIN and confirm it live. Ranked by how often it burns us:

1. **SteadyAPI account fragility — the single biggest point of failure.** `steadyapi_subscription_suspended`
   (403 "access suspended", whole API dead, blocks listing-lifecycle + rentals + market-aggregates at
   once), `steadyapi_429_no_retry` (one 429 kills a county's whole scan). Everything listing/rental/comp
   rides one flaky vendor account. **Hunt:** is there a free/stable origin for for-sale + sold + rental
   listings at ZIP/county grain (Realtor.com Data Library aggregates, county property-appraiser sold
   rolls, a public MLS data feed)? We don't need parcel-level listings for the market metrics — aggregates
   may cover most consuming brains. Provenance stays realtor.com/county, never the vendor.

2. **Permit scraping via Accela — chronically 429/WAF-blocked.** `lee_permits_capdetail_waf_429` (only ONE
   successful write ever), `lee_permits_issued_date_cursor_window_mismatch` (~1 row/run), `lee_permits_
   history_source` (date filter inert), `collier_permits` tracebacks, `city_permits_ingest_odd`. **Hunt
   (high value):** county GIS/ArcGIS **FeatureServers** for permits instead of HTML scraping — the
   `vendor_extraction_ceiling_audit_followup` check already names "Lee GIS permit layers replacing Accela
   scrape" as the likely win. Confirm Lee County GIS + Collier County GIS expose a permits FeatureServer
   (query-able JSON, no WAF, no browser). Also the city portals (Cape Coral / Naples / Fort Myers).

3. **News source rot.** `news_county_sources_rotted` — leegov 404s behind an auth wall, Collier moved to a
   `collier.gov` SPA, baseline rows are nav-chrome false positives. **Hunt:** stable RSS/JSON feeds or the
   SPA's underlying JSON API for Lee + Collier gov news, plus 2-3 durable local outlets, instead of
   scraping rotting HTML shells.

4. **CRE broker PDFs — sites keep moving.** `lee_associates_missing_naples` (Naples report set exists,
   never pulled), `brevitas_lease_only_hardcoded` (for-sale endpoint never queried), plus the deleted
   marketbeat/corridor-narrative pipelines (broker sites rebuilt). **Hunt:** which SWFL CRE brokers still
   publish a stable, machine-fetchable research surface (structured page or predictable PDF URL) vs. which
   are dead — so we stop re-scraping moved sites.

5. **Gemini web-search cascade (the price thread's proximate cause).** Billing-fragile, no working
   fallback legs. Part A likely retires its main use; note any *other* metric still leaning on it.

## 5. What "solid info we can rely on" means (the rubric — score every candidate)

1. **Free or already-paid-for**, and stable (won't suspend/WAF/rot).
2. **Structured** — a bulk file (CSV/TSV/Parquet) or a query-able JSON/REST API, NOT HTML we parse by
   selector (selectors rot; that's half this list).
3. **Source-faithful at a real grain** — publishes the actual number at ZIP/county/city, splittable by
   property_type where the metric needs it; no median-of-medians dressed as sourced.
4. **Right cadence** for the consumer, and it says its own as-of date.
5. **Licensable** — free to use with attribution we can honor (provenance = the origin).
6. **In-scope** — Lee + Collier core (Hendry minor). Don't adopt a source that only widens geography.

## 6. Deliverables (what to leave behind)

- A findings doc `docs/handoff/2026-07-11-reliable-sources-findings.md` (or dated next-day): per candidate
  — fetched URL, free/structured/grain/cadence/license verdict, the rubric score, and the verbatim field
  names we'd read. Include the STEP-0 crawl-tool ability note.
- A ranked **recommendation** per Part (A: the price/Naples fix; B: what the winner also replaces; C: one
  best replacement source per chronic cluster) with the exact next build for each.
- **Open a `check`** (`node scripts/check.mjs open <project> <key> "<label>"`) for every source you
  recommend adopting, so it lands in the session loop — do not leave findings only in prose (RULE 2.4, no
  silent deferrals).
- Do NOT build pipelines here. If a win is obvious and cheap, say so and let the operator green-light it.

## 7. Fast pointers (so you don't start cold)

- In-flight price work + full evidence: `docs/superpowers/specs/2026-07-11-daily-price-dual-signal-design.md`
  and today's SESSION_LOG top entry. Open checks: `naples_asking_vs_sold_geography`,
  `retire_gemini_price_websearch`, `daily_price_dual_signal_live_verify`.
- What we already ingest: `ingest/cadence_registry.yaml` (grep `redfin`, `steady`, `census`, `fred`,
  `zori`), `ingest/pipelines/`.
- The chronic-break truth: `node scripts/check.mjs list` and `docs/cron-rebuild-failures.md` "Recurring
  Patterns".
- Realtor.com Data Library was previously noted free/attribution-only: memory `reference_realtor-data-library`.
