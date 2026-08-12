# Freakonomics-style seller insights — Priority 1-5 crawl4ai results

**Filed 08/11/2026.** Closes out `docs/handoff/2026-08-11-crawl4ai-freakonomics-research-targets-handoff.md`
(target list, filed same day, nothing crawled yet at that point) and continues
`_RESEARCH/email-and-social/2026-08-11-freakonomics-seller-insights-crawl4ai-research.md` (the original
4-agent sweep). Five parallel research agents ran WebSearch + the pinned crawl4ai CLI
(`C:\Users\ethan\crawl4ai-venv\Scripts\python.exe`, never Firecrawl) against the handoff's 10 numbered
targets, one agent per priority bucket. Every finding below carries its real source, URL, and date —
nothing invented, and every agent that hit an unverifiable claim (AI-chatbot synthesis pages, bare
search snippets, 403s) dropped it explicitly rather than passing it through.

**Same read key as the parent file:** **[A]** our own data, buildable now · **[B]** cited external
context, real but not ours · **[C]** genuine gap, not fabricated.

---

## Priority 1 — Lee County cash-buyer gap: NOT CLOSED (structural, not a search failure)

1. **[C] RASM / Royal Palm Coast Realtor Association** (rpcra.org, Lee + Hendry counties) —
   `https://rpcra.org/content/docs/Market-Stats-Report---June-2026.pdf` (19pp, data "provided by SWFL
   MLS, updated 07/04/26," Domus Analytics template). Every page read, including all 8 sub-region
   pages. **The report template structurally does not carry a cash-buyer or price-band cut at
   all** — this isn't a gap in what got searched, it's what the vendor template (Domus Analytics)
   ships. What it DOES carry, June 2026, Lee+Hendry region-wide: Single Family median sold $369,000
   (+2.5% MoM, +1.1% YoY), 1,239 closed sales, median DOM 56 days. Condo/Townhouse median sold
   $239,000 (-4.4% MoM), 359 closed sales, median DOM 75 days.
2. **[B] NABOR — Naples Area Board of Realtors** (Collier, excl. Marco Island) — primary S3-hosted
   reports, not the JS-widget page: June 2026 Statistics PDF (ShowingTime Plus LLC, "current as of
   July 10, 2026") and May 2026 Market Report. **Cash-buyer: NABOR's own May 2026 press release
   states verbatim "61 percent of the overall closed sales in May were cash buyers"** — a genuine
   primary NABOR figure, correcting the prior sweep's assumption that the Naples number came only
   secondhand via news. But it's an editorial callout, not a standing table: the June 2026 release
   drops the cash line entirely (zero "cash" mentions in the full 24-page June Statistics PDF,
   confirmed by full-text search) — expect it some months, not others. **Price-band: real, primary,
   recurring table** ("Overall Closed Sales By Price Range," rolling 12mo through June 2026, All/SF/
   Condo, YoY) — $300k and below: 1,331 all-properties (+39.7% YoY); $300,001–500k: 2,247 (+15.1%);
   $500,001–1.5M: 3,954 (+10.5%); $1,500,001–5M: 1,258 (+29.4%); $5M+: 261 (+11.5%), each split by
   SF/Condo too. DOM June 2026: 103 days average (up from 98 June 2025), SF 93 days. Median closed
   $595,000 (+3.8% YoY), SF $750,000, Condo $442,500.
3. **[C] Florida Realtors** (floridarealtors.org) — the county-level detail reports (where a Lee cut
   would live) sit under **"County Reports (Members Only)"** — confirmed gated, all 67 counties
   including Lee listed by name but login-walled; did not attempt bypass. Public statewide "Quarterly
   Market Detail Q1 2026, FL Single-Family" PDF (`floridarealtors.org/sites/default/files/2026-04/
   1Q-2026-Fla-single-family-data-detail.pdf`, released 4/17/2026) **confirms the template tracks
   cash-sales % by design** — statewide Q1 2026 = 30.3% (down from 30.8% Q1 2025) — but grepped all
   12 pages for "Lee"/"Collier," zero matches. The Lee-County-specific number almost certainly exists
   inside Florida Realtors' gated system on the same template; it is membership-gated, not absent.

**Bottom line: still no public, current, primary Lee County cash-buyer number.** RASM (the actual
Lee County MLS board) simply doesn't publish that cut in its report template — exhausted, not
under-searched. The honest options going forward: (a) email RASM (`marketing@rpcra.org`) directly and
ask, (b) get a Florida Realtors membership login to pull Lee's gated county report, or (c) report
Collier's real 61% (May 2026, NABOR primary) as Collier-only and continue stating Lee as a genuine gap.

## Priority 2 — Insurance carrying-cost: CLOSES THE FEMA CEILING WITH A REAL NUMBER

**Live code-lane finding (same session, before this crawl):** `refinery/sources/fema-nfip-source.mts:158`
hardcodes `export const INSURED_PENETRATION_FACTOR = 0.3;`, confirmed still live via the ceiling note
at `ingest/cadence_registry.yaml:772` (07/07/2026). FEMA NFIP *claims* data is already ingested
(448,381 rows, `data_lake.fema_nfip_claims`, quarterly cron `fema-nfip-quarterly.yml`) but the specific
penetration-rate dataset was never pulled — until this crawl found it.

1. **[B] Citizens Property Insurance Corporation** — "Detail By County" PDF, reported period
   12/31/2024, `citizensfla.com/documents/20702/30188280/20241231+Detail+by+County.pdf`. Real
   county-level personal-residential-multi-peril (PR-M) figures: **Lee — 21,001 policies, $51,040,337
   total premium → $2,430/yr average** (average is my division of Citizens' own two published totals,
   not a number Citizens prints as a headline — flagged as derived). **Collier — 6,042 policies,
   $18,910,575 total premium → $3,130/yr average.** Wind-only (PR-W, narrower product) separately:
   Lee 3,154 policies ~$3,611/yr avg; Collier 1,302 policies ~$3,468/yr avg. No clean HTML "average
   premium by county" page exists on citizensfla.com — the PDF is the only usable primary source.
2. **[B] Insurance Information Institute (iii.org)** — `iii.org/fact-statistic/facts-statistics-
   homeowners-and-renters-insurance`. Florida statewide $2,437/yr (2021 NAIC data via a Dec 2023
   study, III's own "latest data available" label) — **#1 most expensive state** nationally
   (US avg $1,411). **No county breakdown, no hurricane-exposure cut, and stale (2021).** Other
   figures seen in search snippets ($3,340, $4,419, a $14,520 Boca Raton number) came from
   third-party aggregators (MoneyGeek, Insuranceopedia), not iii.org itself — dropped, not reported.
3. **[A-adjacent, real dataset now identified] FEMA "NFIP Residential Penetration Rates – v1"** —
   dataset page `fema.gov/openfema-data-page/nfip-residential-penetration-rates-v1`, queried live at
   `https://www.fema.gov/api/open/v1/NfipResidentialPenetrationRates` (data as-of 08/03/2026, dataset
   refreshed 08/04/2026, quarterly cadence). **Real measured values: Lee County countywide
   penetration ≈ 24.25% (84,120 residential contracts-in-force / 346,951 total residential
   structures); Collier ≈ 29.55% (51,467 / 174,174).** Lee's SFHA-only sub-rate (47.47%) is
   internally consistent; Collier's SFHA sub-rate is a data artifact (FEMA's own NSI-2022-undercount
   caveat applies — 152 "total structures" against 38,559 contracts — unusable, countywide figure is
   unaffected). **The 0.3 guess overstates Lee's real penetration by ~6 points; it's close for
   Collier.** A companion "average flood premium by county" dataset does not exist pre-aggregated —
   only the raw 80M+-row `FIMA NFIP Redacted Policies` dataset, which would need real aggregation
   work, not another web pull — flagged as a genuine [C] gap, not estimated.

## Priority 3 — Price-band search-filter mechanism: PRIMARY SOURCE UNDERCUTS THE PREMISE; ACADEMIC BASE STRENGTHENED

1. **[C→B, complicating] Zillow's own Help Center** (`zillow.zendesk.com/hc/en-us/articles/
   216985327`, last updated ~2 years ago per the page, fetched 08/11/2026) — states the price filter
   is **free-text min/max entry**, not fixed round-number brackets. This is the one primary technical
   fact retrieved and it mildly undercuts the "hard $50k bracket" premise rather than confirming it.
   Realtor.com's support site and live search page both blocked/bot-walled crawl4ai — no primary
   source retrieved there. No engineering blog post from either company exists publicly on filter
   bucketing; one candidate (a UX-coursework portfolio post) was read in full and dropped as not
   qualifying (paraphrases marketing copy only).
2. **[B] Five real peer-reviewed papers found**, none proving the exact hard-bracket-cutoff mechanism
   but each stronger than the single Inman column previously on file:
   - Beracha & Seiler (2015), *Journal of Housing Research* 24(2):147-161, DOI 10.1080/
     10835547.2015.12092101 — left-most-digit effect on home selection.
   - Seiler, Madhavan & Liechty (2012), *Journal of Real Estate Research* 34(2):211-242, DOI
     10.1080/10835547.2012.12091333 — eye-tracking study; ties charm pricing to **sort-order
     position** when results are sorted price-low-to-high — closest match to a search-visibility
     mechanism, though sort-position ≠ hard filter exclusion.
   - Beracha & Seiler (2014), *Journal of Real Estate Finance and Economics* 49(2):237-255, DOI
     10.1007/s11146-013-9424-1 — 75%+ of sampled homes cluster on round/just-below-round prices.
   - Beck, Levine & Toma (2024), *American Journal of Economics and Sociology* 83(1):17-34, DOI
     10.1111/ajes.12510 — Savannah GA MLS 2006-2021; just-below pricing effect varies by price
     segment, can backfire at the high end.
   - Repetto & Solís (2020), *Journal of the European Economic Association* 18(6):3261-3304, DOI
     10.1093/jeea/jvz065 — Swedish auction listings just below round millions sell 3-5% higher with
     more competitive bidding — left-digit bias measurably changes buyer engagement, published in a
     top-5 general econ journal.
   **Honest caveat, explicit in every source above: none study a buyer-side portal FILTER with hard
   price-bracket cutoffs** (the $635k-misses-$650k-bracket claim) — all five study listing-price
   psychology on selection/attention/bidding, adjacent but not identical. Keep that gap named, don't
   paper over it.

## Priority 4 — Competitor seller-tool check: REAL WHITE SPACE, INGREDIENTS EXIST SEPARATELY

Compass, Redfin (general blog, not Premier product page), HomeLight, and Opendoor were each crawled
live. **None combines DOM-stigma psychology + carrying-cost dollar math + price-cut-timing into one
seller-facing calculator.** Compass has cited DOM/price-cut-history psychology (4.6% higher sale price
for pre-marketed listings, 34% faster contract, 29% fewer cuts — compass.com/newsroom/research,
07/24/2026) but no carrying-cost math. Redfin's general blog (redfin.com/blog/dangers-of-overpricing-
your-home, 09/25/2025) has explicit "cost of holding" carrying-cost language, but redfin.com/premier
itself is pure luxury marketing with none of it. HomeLight has DOM-stigma blog content
(homelight.com/blog/days-on-market-matters, 01/15/2026) but no carrying-cost math found; Simple Sale's
product page has neither. Opendoor comes closest — "run the full net proceeds math" including
carrying costs (opendoor.com/articles/does-opendoor-lowball-you, updated April 2026) — but it's
Opendoor-vs-traditional channel persuasion, not in-listing price-cut timing coaching. **The combined,
quantified, personalized framing appears to be genuine white space**, not something already shipped.

## Priority 5 — Comparable-metro DOM-vs-cut range: ONE UNVERIFIED ANALOG, ONE CORRECTLY DROPPED HALLUCINATION

1. **[B, one-hop] Bright MLS (Mid-Atlantic — DC/MD/VA/PA/DE/WV)** via UrbanTurf DC
   (`dc.urbanturf.com/articles/blog/41_of_homes...`, 08/10/2026) — cites "new Bright MLS data": share
   of actives with a cut by time-on-market (<1wk 0%, 2-3wk ~6%, 3-4wk ~12.5%, 1mo+ 51%); regional cut
   share climbed 34.2%→39.9%→41.1% over 2024-2026; Central PA 10-day median DOM w/ 36.9% cut rate vs.
   Maryland Eastern Shore 26-42 day DOM. **Could not confirm at Bright MLS's own site** — three direct
   fetch attempts (research page, article page, the linked preview URL) all failed (bot-block/render
   error). Reporting as a named, dated, credible outlet's republication of a real regional MLS's data,
   one hop from primary, not independently verified.
2. **[B] HouseCanary Florida** (housecanary.com/blog/florida-real-estate-trends-in-july-2024, updated
   08/07/2024) — median days-to-first-cut held at 25 days (down from 29 the year prior), Florida-wide.
   No companion cut-to-sale figure. Same tier as Zillow/Redfin (private vendor, not an MLS board).
3. **[Dropped — correct call by the agent] Coconut Coast Organization of Realtors** (Bonita Springs/
   Estero — literally inside Lee County/SWFL) — a page titled "Optimizing Pricing: Price Reductions
   vs. Days on Market in SW Florida" carries a self-disclosed banner: *"Coco is an evolving CCOR help
   assistant... Responses may not always be fully accurate."* It's an AI-chatbot-generated synthesis
   page, not published research — its citations are bare domain links with one unlinked "Bright MLS"
   footnote pointing nowhere. **Every number on this page was correctly dropped rather than reported**
   — textbook example of the no-invention discipline catching a hallucinated-citation pattern from a
   third party, not just from us.
4. **[B, caveated] Nevada Real Estate Group** (Las Vegas brokerage, nevadarealestategroup.com,
   08/09/2026) — a single brokerage's own scan of the GLVAR MLS feed (11,878 actives), NOT GLVAR's own
   published research: 43.4% of actives had ≥1 cut, median cut $18,900 (3.7% of ask), median DOM (all
   actives) 35 days, 27.8% sitting 60+ days.
5. **[Dropped, unverifiable]** Texas Real Estate Research Center (TAMU) 403'd on direct fetch — search
   snippet only, not reported. Cromford Report (Phoenix, ARMLS) confirmed to exist and track the right
   metrics but no specific comparable stat located. South/North Carolina MLS DOM data surfaced but not
   deep-crawled — flagged unchecked, not claimed absent.

**Sanity-check takeaway:** no other metro/MLS board publishes the exact Indiana-shaped stat (median
days-to-cut + separate median days-cut-to-sale). Bright MLS's cut-share-by-DOM-age shape is the
closest analog but unconfirmed at primary. Use Indiana + this range as rough plausibility bounds only
— never cite any of Priority 5's numbers in a shipped product, per the original brief.

---

## What this file is not

Still a research compile, not a build spec. No approach chosen, no email picked, no code touched.
Two genuinely new, actionable findings came out of this pass: (1) the FEMA NFIP Residential
Penetration Rates dataset is real, live, and directly swaps into `INSURED_PENETRATION_FACTOR` in
`refinery/sources/fema-nfip-source.mts` — this is now an ingest task with a named source, not a
research gap; (2) NABOR's May 2026 61% cash-buyer figure is a genuine primary number for Collier
County, usable today with correct provenance — the Lee County equivalent remains a real, exhausted gap
(RASM's template doesn't carry it; Florida Realtors' county cut is membership-gated). Next step on any
of this is the operator's call, run through `superpowers:brainstorming` before it becomes a build.
