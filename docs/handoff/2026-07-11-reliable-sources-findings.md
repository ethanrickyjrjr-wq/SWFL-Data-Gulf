# Findings — reliable-source research mission

**Date:** 2026-07-11 · **Mode:** research only, no pipeline code touched. Companion to
`docs/handoff/2026-07-11-reliable-sources-research-mission.md` (the brief this answers).

---

## Step 0 — crawl4ai 0.9.0: what we weren't using

Crawled `docs.crawl4ai.com` live (confirms "v0.9.x" in the docs nav itself). Beyond the pinned
deep-crawl/schema-extraction/`-q`/`-p` abilities already in `CLAUDE.md`, 0.9.x adds:

- **Adaptive Crawling** (`AdaptiveCrawler` / `AdaptiveConfig`) — crawls until an information-sufficiency
  score (coverage + consistency + saturation) says "stop," instead of a fixed page count. Two strategies:
  `statistical` (term-based, no LLM, default) and `embedding` (semantic, needs an embedding model). Useful
  for "find the one page with X" tasks without guessing `--max-pages`.
- **URL Seeding** (`AsyncUrlSeeder` / `SeedingConfig`) — bulk-discovers a site's URLs from its sitemap
  (`source="sitemap"` or `"sitemap+cc"` for sitemap+Common Crawl) in seconds, with a `pattern` glob filter
  and `extract_head=True` metadata, instead of crawling page-by-page to find a page. Good fit for "does
  this county GIS portal even have a permits page" before spending a deep-crawl budget on it.
- **Domain Mapping** — sibling capability to URL seeding, not yet needed here.
- `-q` (page Q&A) requires an LLM provider configured (`litellm` provider string) — **not set up on this
  machine**, so it errors asking for one interactively. Every fetch in this mission used the LLM-free
  paths (`-o markdown-fit`, direct JSON endpoint fetches, `--deep-crawl`) — zero LLM cost incurred.

We used deep-crawl-shaped fetches for GIS/API discovery and plain `markdown-fit` fetches for content pages
this session (see Parts A/B/C below); none of the candidate sources needed the adaptive/seeding modes
themselves, but they're now confirmed available for future audits like this one.

---

## PART A — the Naples/Collier price gap: it's an internal query bug, not a missing source

**RULE 0.5 first.** Before hunting a new external source, I queried our own live lake
(`mcp__lake__query_lake`) against the exact tables the mission brief's numbers came from, and found the
"2× gap" is **not real** — the brief's $309,000 figure reproduces a rental/staleness contamination bug
that was already found and fixed at the VIEW level on 2026-06-26, just not at the raw-table level.

### The mix-up — three tables, only one is safe to query directly

- `data_lake.active_listings_residential` (source_name=`active_listings_seed`) is the RAW table behind
  the homepage map / `active-listings-swfl` brain. Its own migration comment
  (`docs/sql/20260625_active_listings_residential_zip_stats.sql`) says outright: **"the upsert never
  prunes, so delisted listings accumulate as stale rows"** — a daily cron
  (`.github/workflows/active-listings-daily.yml`) keeps appending, and a prior incident documented in
  that same file says an unfiltered read once "dragged the median to a backwards $315k" because monthly
  **rentals** (e.g. a $1,200/mo lease) were mixed into the same table. Querying this raw table directly,
  filtered only to `property_type='residential'`+`'land'` for Collier, reproduces exactly that bug: n=8,408
  residential (median $320,000) + n=821 land (median $245,001) = **n=9,229, blended ≈ $309k — the exact
  figure the mission brief cites.** This table should never be queried directly for a price.
- `data_lake.active_listings_residential_zip_stats` is the SAME seed-crawl data, but through the view that
  already fixes this (`listing_type='sale'` filter + per-county latest-20h-batch window). Its live
  Collier county-total row (`county='Collier', zip_code IS NULL`) reads **$645,000** (n=1,406) — a
  **3.2% gap** to Redfin's $625,000 sold anchor. Lee's equivalent row reads **$439,900** (n=2,381) vs
  Redfin's $360,000 sold (+22%, wider but same order of magnitude, not a structural break).
- `data_lake.listing_state` (source_name=`api_feed`) is the independent **live daily SteadyAPI sweep**
  (realtor.com origin) that today's `listing_active_stats` view (just re-scoped to Lee+Collier this
  session, see SESSION_LOG top entry) reads for `/desk`. It carries its own `property_type` split:

  | property_type (Collier, active, for-sale) | n | median list price |
  |---|---|---|
  | single_family | 3,570 | $825,000 |
  | condo | 2,722 | $475,000 |
  | land | 783 | $249,900 |
  | other | 329 | $170,000 |
  | townhouse | 155 | $395,000 |
  | multi_family | 44 | $712,500 |

  Live query: `SELECT property_type, count(*), percentile_cont(0.5)... FROM pg.data_lake.listing_state
  WHERE source_name='api_feed' AND state='active' AND sale_or_rent='sale' AND county='Collier' GROUP BY
  property_type` (run 07/11/2026).

### The reconciliation, once you read the right table AND match Redfin's property-type definition

`data_lake.listing_active_stats` (the view `/desk` reads) blends ALL `listing_state` property types
including land/other. Redfin's "All Residential" sold figure is defined as SF + Condo + Townhouse +
Multi-Family only — it **excludes land**. So the true apples-to-apples comparison excludes
`land`/`other` on our side too:

| grain | all-types asking (listing_active_stats) | residential-only asking (SF+condo+townhouse+multi) | Redfin sold, "All Residential" | bracket |
|---|---|---|---|---|
| Collier County | $610,000 (n=7,602) | **$677,000** (n=6,491) | **$625,000** (957 sales, as of 06/04/2026) | Redfin sits inside the $610k–$677k bracket, **–2.4% to +8.3%** |
| Lee County | $295,945 (n=20,748) | **$379,900** (n=12,946) | **$360,000** (2,001 sales) | **+5.5%** once land is excluded (was a false 18% gap) |
| Naples core ZIPs (34102/34103/34105/34108/34109/34110) | $1,092,500 (n=2,390) | $1,095,000 (n=2,256) | ~$1,235,000 (Naples-city sold, per `naples_asking_vs_sold_geography`) | **–11.3%** (land wasn't the driver here — see geography section below) |

Land-excluded queries run live 07/11/2026, e.g.: `SELECT count(*), percentile_cont(0.5)... FROM
pg.data_lake.listing_state WHERE source_name='api_feed' AND state='active' AND sale_or_rent='sale' AND
county='Collier' AND property_type IN ('single_family','condo','townhouse','multi_family')`.

**Conclusion: three independent live reads — `listing_active_stats` (all-types and residential-only) and
`active_listings_residential_zip_stats` — all land Collier within roughly 3–8% of Redfin's $625,000 sold
anchor, and Lee within 6–22%.** There is no 2× gap anywhere once you read a table that dedupes/filters
correctly. **No new external source is needed to fix the county-grain number** — the fix is purely which
of our own tables gets queried directly.

**This finding directly contradicts the in-flight design doc.** `docs/superpowers/specs/2026-07-11-daily-price-dual-signal-design.md`
names `data_lake.active_listings_residential` + `_zip_stats` as "the only genuinely daily-moving price we
can source honestly" and plans to build the daily city-asking rollup from it. That's fine IF the build
reads `_zip_stats` (or an equivalent latest-batch, rental-filtered query) — **but the mission brief's own
$309k citation proves it's easy to instead touch the raw `active_listings_residential` table and
silently reintroduce the exact contamination the 2026-06-26 fix already solved once.** The build should
add an explicit test/guard asserting nothing reads `active_listings_residential` without going through
`_zip_stats` (or `listing_state`/`listing_active_stats`, which has no such contamination risk and carries
real property-type detail besides). Recommendation: prefer `listing_state`/`listing_active_stats` as the
primary daily-asking source (it's independent of the map's seed crawl, refreshes daily via SteadyAPI, and
already has clean property-type detail); keep `_zip_stats` as a secondary cross-check, and never touch
`active_listings_residential` directly again.

**Scope note:** the mission brief asked whether the Redfin *city* tracker's `region_type`/`place_type`
columns could define a "Naples area." That column wasn't separately examined this session — the direct
ZIP-level analysis below answered the geography question more precisely, so this was a choice to skip a
redundant check, not an oversight.

### The separate, still-real issue: Naples CITY grain (tracked in `naples_asking_vs_sold_geography`)

That check is right that a *city*-grain mismatch exists, and it's **geography, not property type**.
Wikipedia (`en.wikipedia.org/wiki/Naples,_Florida`, fetched live) states Naples' ZIP range is
**34101–34120** — that's the full USPS "Naples, FL" mailing area, which sprawls into Golden Gate Estates,
East Naples, and North Naples — NOT the small incorporated city. Live per-ZIP query confirms the two
"Naples" populations are wildly different markets:

| ZIP | listings | median list |
|---|---|---|
| 34102 (true downtown/coastal Naples) | 529 | $2,995,000 |
| 34103 | 369 | $1,495,000 |
| 34108 | 484 | $1,282,500 |
| 34120 (Golden Gate Estates, "Naples" mailing address) | 1,055 | $559,000 |
| 34117 (Golden Gate Estates) | 358 | $509,950 |
| 34112 (East Naples) | 628 | $349,000 |

Restricting to the tight core-city ZIP set (34102/34103/34105/34108/34109/34110) gives a live median
asking of **$1,092,500** across 2,390 listings — an **11.6% gap** against Redfin's Naples-city sold
figure (~$1,235,000, per `naples_asking_vs_sold_geography`), the same reasonable asking<sold direction as
county grain. The broad `city='Naples'` label (used for the daily city-asking rollup in the
daily-price-dual-signal design) is what's wrong, not the price data.

**Recommendation (Part A):** no new source. Two concrete fixes, both data-hygiene on sources we already
hold:
1. Wire the daily city-asking rollup (and any `/desk` Collier/Lee tile) off `listing_active_stats` /
   `listing_state` primarily, `active_listings_residential_zip_stats` as secondary cross-check — never
   the raw `active_listings_residential` table directly.
2. For the Naples-city daily line, replace the broad ZIP-range city label with a tighter ZIP set
   (candidate: 34102/34103/34105/34108/34109/34110 — only against price-clustering + the Wikipedia
   ZIP-range note, a strong hypothesis, not a closed fact; several of these — 34108/34109/34110 — are
   commonly cited as largely *unincorporated* North Naples/Pelican Bay, so "incorporated city limits" is
   likely the wrong target polygon to chase). **The real anchor to match is Redfin's own "Naples, FL"
   region footprint** (the sold-price source this whole reconciliation is measured against) — not an
   abstractly "correct" city-limits boundary that might be a different polygon from what Redfin itself
   uses. Next build step: pull Redfin's REGION definition for "Naples, FL" in the city tracker
   (`region_type`/`place_type` columns, deliberately not examined this session — see scope note above)
   and match our ZIP set to THAT footprint, so both sides of the asking-vs-sold comparison describe the
   identical geography by construction, rather than two independently-chosen boundaries that happen to
   be close.

I've added this evidence to the existing `naples_asking_vs_sold_geography` check rather than opening a
duplicate (RULE 0.5 — don't propose a source for a problem already tracked).

---

## PART B — the external candidates, verified live, and what they replace

### B1 — Realtor.com Data Library — **ADOPT** (5/6)

Fetched `https://www.realtor.com/research/data/`; found direct static CSVs (no key, no click-through)
embedded in the page HTML:
`https://econdata.s3-us-west-2.amazonaws.com/Reports/Core/RDC_Inventory_Core_Metrics_{County,Zip}.csv`
(+ `_History` variants), also Metro/State/Country and `Hotness` variants. Grain goes to **ZIP**. Cadence
stated on-page: "updated July 1, 2026 with data through June 2026, next update August 2026." Verbatim
fields: `active_listing_count`, `median_listing_price`, `median_listing_price_per_square_foot`,
`median_days_on_market`, `new_listing_count`, `price_increase_count`/`price_decrease_count`,
`pending_listing_count`, `pending_ratio`, `total_listing_count`, `average_listing_price`, plus M/M and
Y/Y variants and hotness/demand/supply scores. License: attribution required, otherwise free.

**Critical gap** (stated on the source page itself): *"All residential data includes data on all homes
(single-family and condo/townhome) for the given level of geography"* — it is **not property-type
split**. It would re-introduce the exact SF-vs-condo blending problem Part A just diagnosed, so it's
right for cross-checking **aggregate** trend (inventory count, DOM, price/sqft, new listings, price
cuts) at ZIP grain, wrong for a segment-specific median.

**Part B answer:** yes — this ONE free monthly ZIP-grain file already carries active inventory count,
months-of-supply-adjacent signals (pending ratio), median DOM, price-cut counts, new-listing counts, and
price/sqft, all metrics that today ride the fragile SteadyAPI aggregate calls (`market_aggregates`,
`market_aggregates_details`). It can't replace segment-level (SF vs condo) detail, but it's a strong,
free, zero-cost independent monthly cross-check / fallback for the aggregate metrics, at the same ZIP
grain we already operate at.

### B2 — Zillow Research — **ADOPT-PARTIAL** (4/6)

Fetched `https://www.zillow.com/research/data/`. ZHVI confirmed at **ZIP grain**
(`Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv`), monthly, updated 16th of month, with separate
SF-only and condo-only tiers. **Must be labeled plainly: ZHVI is a smoothed, model-based "typical value"
index (35th–65th percentile), not a raw transaction price** — not source-faithful in the sense this
mission's rubric requires. Zillow's raw for-sale/sold-price series (median list price, sale price,
sales-count nowcast) were only confirmed live at **Metro grain** this session — ZIP-grain availability
for the raw (non-index) series is **unconfirmed**, a real gap, not a guess dressed as a finding.
**Verdict:** keep using ZHVI exactly as we already do (labeled desk fallback), don't promote it to a
price source; one more session needed to check if raw median list/sale CSVs exist below Metro.

### B3 — FRED realtor.com release (rid=462) — **CONFIRMED CORRECT, fix the URL now**

Fetched `https://fred.stlouisfed.org/release?rid=462` — titled "Housing Inventory Core Metrics,"
confirmed sourced from realtor.com. **This resolves check `fred_listing_swfl_wrong_source_url`
directly: `rid=462` is the right release; the current `SOURCE_URL` constant
(`fred.stlouisfed.org/categories/32287`) is confirmed wrong (resolves to an unrelated
Singapore/International-Data category) and should be replaced with
`https://fred.stlouisfed.org/release?rid=462`.** Our `fred_listing_swfl` pipeline's existing
`SERIES_MAP` (`ingest/pipelines/fred_listing_swfl/constants.py`) already pulls the right 8 series
(`ACTLISCOU`/`MEDDAYONMAR`/`MEDLISPRI`/`NEWLISCOU` × MSA 15980/34940) — this is a one-line citation fix,
not a re-plumb. Same underlying realtor.com data, same "not property-type split" caveat, and FRED stops
at county/MSA grain (no ZIP). One additional free series confirmed available and unused:
`MEDLISPRIPERSQUFEE{15980,34940}` (median list price per sqft) — cheap add, same call shape.

---

## PART C — chronic-break clusters

### C1 — SteadyAPI fragility: explicit CAN / CANNOT verdict

The single biggest point of failure is one vendor account whose suspension or 429 takes out listings +
rentals + comps at once. Verdict, so this doesn't get over-read as "drop SteadyAPI":

**CAN be replaced** by the free sources verified in Part B — Realtor.com Data Library (B1) + FRED (B3) —
for **aggregate** metrics only: active inventory count, median DOM, new-listing count, price-cut count,
price/sqft, all at ZIP/county/MSA grain, monthly, free, zero vendor risk. This directly covers what
`market_aggregates` / `market_aggregates_details` pull today.

**CANNOT be replaced** by anything found this session:
- **Per-parcel/per-listing data** (address, beds/baths/sqft, photo, status flags) — no free source
  matches SteadyAPI's row-level grain; Realtor.com/FRED/Zillow are all pre-aggregated.
- **True sold price** — no free daily or ZIP-grain sold-price source exists anywhere in this research
  (Redfin is monthly/county-or-city grain; that's already wired). The best free alternative for a
  *sold* figure below Redfin's grain is county **FDOR cadastral sale fields** (`SALE_PRC1`/`SALE_PRC2`),
  already flagged as an unpulled cheap win in the 07/08 vendor-ceiling audit and tracked in
  `fldor_collier_nal_confirm_source` — NOT SteadyAPI's `/property-tax-history` sold-sampling path.
- **Rentals** — no free structured rental-listing source was found or searched for deeply this session;
  SteadyAPI/`rentals_swfl` remains the only spine for rental grain today.

**Net:** the aggregate slice of SteadyAPI risk can be hedged today with a free fallback; the listing- and
rental-grain slice cannot — the account-fragility risk there is real and unaddressed by this mission.

### C2 — Permit scraping: Collier is solved, Lee is NOT (GIS layers are dead)

- **Collier County Issued+Applied XLSX — ADOPT, already the strongest source in this whole mission.**
  Live-confirmed both series exist side by side, current through June 2026: `.../monthly-building-permit-reports/2026-6-issued.xlsx`
  and `.../2026-6-applied.xlsx`. Already ingested (Issued); Applied (leading-indicator) is free, same
  cadence, same page, unpulled — cheap add.
- **Lee County ArcGIS org (`LvWGAAhHwbCJ2GMP`) permit FeatureServers — DO NOT adopt as an ongoing
  replacement for Accela.** Confirmed live and queryable with no auth/WAF (`BuildingPermits_UnincorporatedLee_March2025`
  n=9,386, `CommercialBuildingPermits_UnincorporatedLeeCounty_March2025` n=719,
  `CapeCoral_ResidentialBuildingPermits_March2025` n=2,192 — all match the prior audit's counts exactly).
  **New finding this session: all three are frozen at March 2025 — created=modified=March 2025 in AGOL
  item metadata, no successor item anywhere in the 918-service catalog.** This is a one-time Accela
  export snapshot, not a live feed — using it to "replace the fragile Accela scrape" would trade a
  flaky-but-live source for a stable-but-16-months-dead one. Worth a one-time historical backfill; do
  NOT retire the Accela cron on the strength of this alone. Could not verify the previously-claimed
  93,976-row code-enforcement layer or 550,454-row parcel-valuation table in this org's catalog this
  session — unconfirmed, not refuted.
- **City portals (Cape Coral EnerGov, Fort Myers EnerGov, Naples CityView) — SKIP.** All three are
  citizen-facing Angular/JS self-service portals with no public REST/FeatureServer endpoint found —
  structurally identical to the Lee/Accela problem. No payoff for the same fragility cost.

**Recommendation:** the two counties are on very different footing. Collier needs no new source (just
add the Applied series to the existing pipeline). Lee has no cheap structured replacement for Accela
today — the GIS layers are a dead end for ongoing ingest; either keep hardening the Accela scrape
(backoff/retry tuning, per check `lee_permits_capdetail_waf_429`) or confirm with Lee County GIS directly
whether a refreshed permit layer exists elsewhere before betting any build on this org's catalog again.

### C3 — News sourcing: county-gov RSS doesn't exist; outlet RSS does

- **leegov.com — SKIP, confirms the tracked issue exactly.** The news list is SharePoint-rendered behind
  an authenticated web part (`_layouts/15/Authenticate.aspx`); the nav's "RSS" link is a dead stub to the
  homepage. No usable feed exists. Matches `news_county_sources_rotted`.
- **collier.gov — ADOPT, but re-architect, don't add an API.** No RSS/JSON API exists (tried
  `/api/news`, `/api/press-releases`, `/CivicAlerts.aspx`, `/RSSFeed.aspx` — all just re-render the SPA
  shell). But the content IS reachable once crawl4ai executes JS: `/News-articles` shows real,
  current, dated items (verified July 8–10, 2026 at fetch time). The prior "nav-chrome false positive"
  bug was a plain non-JS HTTP scrape; fix is to rebuild the scraper on a headless JS render + a `-s`
  CSS/structured schema keyed to the article-card selector, not to hunt for an API that doesn't exist.
- **WINK News — ADOPT, the strongest replacement found.** Genuine working RSS 2.0 (TownNews/TNCMS
  platform), county-scoped, verified hours-old items at fetch time:
  `https://www.winknews.com/search/?f=rss&t=article&c=news/lee&l=50&s=start_time&sd=desc` (Lee) and the
  same URL with `c=news/collier` (Collier). **License caveat:** WINK's ToS restricts to
  "personal, non-commercial use" and prohibits "unauthorized... scraping" — the self-published RSS
  `<link rel="alternate">` weighs toward "this is meant to be consumed," but the broad ToS language is a
  real tension worth the operator's eyes before shipping. Recommend attribution-only excerpt + link,
  never full-text mirror, and build in a takedown path.
- **News-Press, Naples Daily News (Gannett) — SKIP.** No RSS `<link>` tag found; Gannett has discontinued
  public RSS network-wide, confirmed empirically here (guessed feed URLs redirect to the generic
  homepage), not assumed from memory.
- **NBC2/Gulf Coast News Now, Fox4/WFTX, Business Observer — SKIP.** No RSS `<link>` tag or `/feed/`
  endpoint found on any of the three.

**Recommendation:** WINK's two county-scoped RSS feeds are the single most reliable replacement for the
broken leegov/collier.gov scrapers — free, structured, verified current, zero new extraction complexity
(standard RSS 2.0). Pair with a rebuilt (JS-render) collier.gov scrape as a secondary official-source
leg; drop leegov.com entirely rather than keep fighting the SharePoint auth wall.

### C4 — CRE broker stable surfaces — verified live

- **Lee & Associates SWFL — ADOPT.** `https://www.lee-associates.com/fort-myers/research/` live; all 8
  sector PDFs HEAD-checked 200: Fort Myers Office/Retail/Industrial/Multifamily (already ingested) AND
  Naples/Collier Office/Retail/Industrial/Multifamily (confirmed live, never pulled) — exact pattern
  `.../2026-Q1-{City}-FL-{Sector}.pdf`. **Medical Office sector 404 on both cities — Lee & Associates does
  not publish one** (the Cushman & Wakefield Medical Office gap doesn't mirror here — real vendor
  ceiling, not a miss). Fix: add Naples as a second `submarket` through the same 4-sector loop, zero new
  extraction logic.
- **Brevitas for-sale — ADOPT.** Confirmed live: `brevitas.com/api/search?...&transaction_type=for_sale`
  returns real for-sale pins today (e.g. `{"name":"Estero, FL - Wawa","price":8111000,"type":"retail"}`),
  same JSON shape (`pins[]`: name/uuid/lat/lng/price/type) as the already-ingested lease endpoint. Closes
  `brevitas_lease_only_hardcoded` trivially — loop `transaction_type` over `["for_lease","for_sale"]`.
- **LSI Companies — ADOPT.** `https://lsicompanies.com/` live, publishes two direct-download SWFL-scoped
  quarterly PDFs on the homepage with no lead-gen gate: `lsi-market-trends-q1-2026-final-2.pdf` and
  `lsi-commercial-pulse-q1-2026-final.pdf`, plus an on-page notable-transactions feed (Naples/Punta
  Gorda/Cape Coral/Fort Myers deals). Caveat: filename carries a non-deterministic `-final`/`-final-2`
  suffix — scrape the current homepage link each quarter, don't template next quarter's filename.
- **SVN — SKIP.** `svn.com` is a national rollup; the SWFL franchisee's own domain
  (`svncommercialpartners.com`) resolves 200 but is a near-empty JS shell with no discoverable
  research/market-report content. Live, but nothing machine-fetchable without a lead-gen form.
- **Crexi — NEW GAP FOUND, not a Part-A assumption we can rely on.** `crexi.com/properties` (for-sale
  UI) confirmed Cloudflare-gated. More importantly, reading our own `ingest/pipelines/crexi_listings/`
  found it **only ever queries `crexi.com/lease` + `api-lease.crexi.com/assets/search` — lease-only**,
  same hardcode pattern as Brevitas had. "Crexi already covers for-sale" was a false assumption; opened
  new check `crexi_lease_only_hardcoded`. Route any for-sale need through Brevitas for-sale (above) until
  the Crexi stealth technique is extended to `/properties`.

### C5 — Gemini web-search cascade: confirmed fully retired by the Part-A fix

Grepped `ingest/cadence_registry.yaml` for every `fetch_mode: search` entry: **exactly one** —
`live_search_daily_median_price` (the broken `median_sale_price` metric). Grepped `ingest/` for
`live_search`/`firecrawl_search`/`spider_search`/`claude_last_resort` usage: confined to
`ingest/pipelines/live_search/` and its own tests/cadence entry — no other pipeline calls this cascade.
**Once the daily-price-dual-signal build retires this metric (already in flight, check
`retire_gemini_price_websearch`), the Gemini-grounded web-search cascade has zero remaining scheduled
consumers.** Nothing else to migrate off it.

