# Freakonomics-style seller insights — crawl4ai research sweep + honest capability map

**Filed 08/11/2026.** Operator asked for a broad crawl4ai sweep of non-obvious real-estate
seller-psychology angles — pure ideation, not a spec — after a session wrongly treated a
brainstormed example ("cut $14k, evened out on mortgage, most cash buyers are in this range") as
a build requirement and ran a data-availability audit on it mid-ideation. That correction is
logged in `_ASSISTANT/SCRATCHPAD.md` (08/11/2026, "brainstorming ideas is not a data-verification
request"). Four parallel research agents ran WebSearch + the pinned crawl4ai CLI
(`C:\Users\ethan\crawl4ai-venv\Scripts\python.exe`, never Firecrawl) across four angles. Every
finding below carries its real source, URL, and publish date — nothing here is invented, and two
agents explicitly reported and dropped stats they could not verify against a primary source rather
than passing them through.

**How to read this file:** every finding is tagged with what it would take to actually use it —
**[A] OUR OWN DATA, buildable now, zero new ingest** · **[B] CITED EXTERNAL CONTEXT, real but not
ours — always labeled, never blended silently with our own numbers** · **[C] GAP, not usable
without new data or a new input**. This is the honest capability answer the operator asked for:
what's fake-limited-by-Claude vs. actually not built yet vs. genuinely doesn't exist anywhere.

---

## 1. Cost of waiting / carrying-cost framing

Seed idea: *"cut $14k off price and sell a month faster, you've evened out on carrying cost."*

1. **[A] The buildable version of this idea is BETTER than any cited source — we can compute our
   own SWFL DOM-vs-price-cut correlation.** The strongest external precedent, the Indiana
   Association of REALTORS regional MLS study (75,000 sales, 1 year — homes needing one price cut
   spent a median 23 days before the cut then sold 12 days after it; no-cut homes sold in 5 days
   median; https://data.indianarealtors.com/reports/stories/price-is-right, 09/20/2024), is a
   *methodology template*, not a number to cite. We already hold the same shape of data for
   Lee/Collier — `listing_dom`, `listing_transitions.price_delta`, `steadyapi_listing_events` — and
   nobody else has computed the SWFL-specific version of this stat. This is a real ingest-free
   build, not a citation.
2. **[A] Real per-property carrying-cost estimate is buildable today, no new ingest.** Live 30yr
   mortgage rate (FRED `MORTGAGE30US`, pulled daily) + the property's own real tax history
   (`steadyapi_tax_history`) support a defensible "a buyer financing this house today would carry
   ~$X/month at current rates, plus $Y/year in tax" framing. Framed as *what today's rate
   environment costs*, not the seller's private loan (see gap #3 below).
3. **[C] The seller's actual mortgage payment is a real gap.** We don't have their loan balance,
   rate, or payment — county deed MORTGAGE doc types that would carry the original loan amount are
   parked/unpulled (`lee_deed_official_records`). The only honest way to personalize this further
   is a seller-supplied input (rate/payment they tell us), which is a legitimate sourcing lane
   (RULE 0.7 lane 4) but a new small feature, not free.
4. **[B] Zillow, "The Price of Overpricing"** (Chris Sipola, 05/24/2016,
   https://www.zillow.com/research/overpricing-impacts-time-market-12476/) — homes selling almost
   immediately close ~1% under list; ~2 months on market → 5% under; ~11 months avg → 12% under. A
   10% list-to-sale discount correlates with ~5x longer time on market. Real Zillow transaction
   data, a decade old — usable as general cited context, not as an SWFL number.
5. **[B] Redfin blog, "The Hidden Dangers of Overpricing Your Home"**
   (https://www.redfin.com/blog/dangers-of-overpricing-your-home/, 09/25/2025) — closest verbatim
   match to the seed framing ("the longer your home sits, the more it costs you... a quicker sale
   at a fair price can put more money in your pocket"), from a major public brokerage. Opinion
   copy, not a dataset — useful as a *tone* reference, not a citable stat.
6. **[B] Offerpad, "The Hidden Cost of a Slow Home Sale"**
   (https://www.offerpad.com/articles/hidden-cost-of-a-slow-home-sale/, 08/03/2026) — 15 metros,
   May 2026: avg. home sold 1.6% under list, ~35% of listings had a cut, DOM rising every year
   since 2023. Built on Redfin Data Center by a market participant (iBuyer) with a commercial
   incentive to make traditional listing look costly — real numbers, read with that bias in mind.
   Not SWFL — we have our own metro-level equivalent already (`redfin_metro_sold_pivoted`,
   `market_details_swfl`), so this is a methodology nudge, not a number to import.
7. **[B] FHFA Staff Working Paper 24-03** (Batzer, Coste, Doerner, Seiler, 03/18/2024,
   https://www.fhfa.gov/document/wp2403.pdf) — the strongest "golden handcuffs" number found: each
   1-point gap between market rate and a seller's own mortgage rate cuts sale probability 18.1%;
   lock-in cut 2023Q4 fixed-rate-mortgage home sales 57%, prevented ~1.33M sales (2022Q2–2023Q4),
   raised prices 5.7%. Federal-agency working paper, highest authority in this file. National, not
   SWFL — cite as "economists estimate," never as our number.
8. **[B] Bankrate Mortgage Rate Sentiment Survey**, via CNBC
   (https://www.cnbc.com/2025/07/16/lock-in-effect-keeps-homeowners-from-selling-despite-lower-rates.html,
   07/16/2025) — 54% of US homeowners say no rate would make them comfortable selling in 2025 (up
   from 42% the prior year); only 3% would sell at 6%+. Real survey, moderate authority (sentiment,
   not transactions).
9. **[B] Clever Real Estate carrying-cost survey**, via CNBC
   (https://www.cnbc.com/2026/05/22/extra-homeownership-costs-top-23000-a-yearand-they-might-go-up.html,
   05/22/2026) — avg $23,686/yr non-mortgage cost (utilities $7,679, maintenance $5,162, HOA
   $4,196, renovations $3,929, tax $3,580, insurance $3,336); with HOA, ~$28,000/yr, more than the
   average $25,000 mortgage payment. National self-reported survey — use only as color alongside
   our own real property-tax figure (finding #2), never as a substitute for it.

## 2. Cash-buyer concentration by price band

Seed idea: *"most cash buyers are in this range"* — flagged going in that our own data has zero
cash-vs-financed field on any record; this was a pure external-source check.

1. **[B] Realtor.com, "Cash Still King"** (Danielle Hale + Hannah Jones, 10/07/2025,
   https://www.prnewswire.com/news-releases/cash-still-king-one-in-three-homes-bought-with-cash-in-2025-302576026.html,
   corroborated by Florida Realtors and Scotsman Guide) — **the real "why" finding.** Cash share by
   price is U-shaped/barbell nationally: ~2/3 of homes under $100k sell all-cash, drops through the
   middle of the market, back up to 40–50%+ over $1M–$2M. Low end = investors/credit-barrier
   buyers; high end = equity-rich, less rate-sensitive buyers. National, not SWFL — genuinely
   price-banded and real.
2. **[B] Naples-Marco Island specific, via Gulfshore Business**
   (https://www.gulfshorebusiness.com/real_estate/report-shows-naples-as-sixth-highest-in-cash-home-buys/article_3b510e59-eb97-4c8b-9bfc-91d80764c51c.html,
   11/04/2025, citing NAR/Nadia Evangelou) — **the single best local find in this whole sweep.**
   Naples-Marco Island ranks #6 nationally at 56.1% cash share (vs. ~28% national). Local
   price-band breakdown: 23% of cash sales cluster in $300k–$399,999, secondary clusters at
   $2M–$2.99M (14%) and $500k–$749,999 (12%). Cash buyers average age 68 vs. 63 for financed
   buyers; average cash purchase ~$460k. **This covers Collier County (Naples), not Lee.**
3. **[C] Lee County has no current price-banded source.** Only a stale 2009 Florida Trend
   article (foreclosure-crisis era, ~60% cash share Jan–May 2009) — flagged unusable, 17 years
   stale, different market regime.
4. **[B] CBS News/Redfin luxury-tier data**
   (https://www.cbsnews.com/news/all-cash-home-purchase-luxury-real-estate-price-gains/, 04/2024) —
   46.8% of top-5%-tier homes bought all-cash, a decade high, corroborating the high end of the
   barbell.
5. **[B] Redfin investor reports** (https://www.redfin.com/news/investor-report-q1-2026/, 05/2026)
   — investors pulling back hardest on low-priced homes/condos as margins compress, explaining the
   *why* behind the low-price cash cluster (investor buyers, not just credit-barrier buyers).

## 3. Listing freshness decay + price-cut psychology

1. **[B] Zillow, "Searched It, Saw It, Bought It"** (Chris Sipola, 06/15/2015,
   https://www.zillow.com/research/home-characteristics-time-on-market-9937/) — homes with <100
   first-week page views: 12% chance of selling within 60 days; homes with 280+ views: 36% — 3x.
   Kaplan-Meier survival analysis, real dataset, a decade old.
2. **[B] Zillow, "Price Cuts... Sometimes More Profitable"** (Arpita Chakravorty, 06/21/2021,
   https://www.zillow.com/research/listings-with-a-price-cut-2021-29653/) — first cuts nationally
   land ~25 days in; a cut landing 15–30 days in correlated with homes ultimately selling ~$15,000
   *above* asking (some metros $20k+) — reads as a market-tested repricing, not desperation. This
   is directly usable as a REASONING FRAME (decisive-early-cut framing) even without re-citing the
   dollar figure — pairs with finding [A] under section 1 (our own DOM-vs-cut data).
3. **[B] Journal of Housing Economics relisting-stigma study** (Darren Hayunga et al., via RISMedia
   07/22/2026, https://www.rismedia.com/2026/07/22/relistings-impact-sale-academic-on-the-ground-investigation/)
   — 670,000 MA MLS transactions, 2000–2019: relisted homes median 155 days cumulative DOM vs. 42
   for single-listing sales. Effect flips with market cycle (boom peak: relisted sold up to 13.7%
   *more*; trough: relisting correlates with cuts and buyer suspicion). Peer-reviewed academic
   paper via credible trade press.
4. **[B] Genesove & Mayer, "Loss Aversion and Seller Behavior"** (*Quarterly Journal of Economics*,
   2001, https://www.researchgate.net/publication/24091759) — the foundational paper: sellers
   facing a nominal loss vs. purchase price list 25–35% higher (relative to the loss gap), realize
   3–18% higher sale prices, but measurably lower probability of selling in any period. Explains
   *why* nibbling instead of cutting decisively backfires.
5. **[B] Ross & Zhou, NBER Working Paper 28796** (05/2021, https://www.nber.org/papers/w28796) —
   refines #4; naive loss-aversion estimates overstate the effect up to 73% once more controls are
   added. Cite as the more careful number if using this angle.
6. **Dropped, not verified:** a "3+ price drops sell at 88–90% of list vs. 95–97% for one drop"
   stat surfaced in an AI-generated search summary but could not be traced to a primary source —
   correctly not reported as fact by the research agent. Do not resurrect this without a real
   citation.

## 4. Broad sweep — other non-obvious angles

1. **[A] Price-band search-filter boundary check is buildable today, pure logic, zero new data.**
   Practitioner claim (Darryl Davis, Inman, 07/09/2026,
   https://www.inman.com/2026/07/09/portal-search-range-pricing-seller-preference/): portals are
   searched by round-number range filters, so $635,000 misses the $650k–$700k bracket entirely
   while $625,000 or $650,000 lands inside two brackets. Not a controlled study, but the mechanism
   matches how MLS/portal filter UIs actually work. **A related peer-reviewed finding is real and
   rigorous but a different mechanism** — Dena Lomonosov, "Left-Digit Bias in Property Taxes,"
   *Real Estate Economics* 53(3), 420–466, 01/27/2025
   (https://onlinelibrary.wiley.com/doi/10.1111/1540-6229.12521): homes with property-TAX bills
   just under a round $1,000 threshold sell 0.5% more (~$1,650 avg buyer overpayment) than
   equivalent homes just over it. Proves round-number anchoring is real in housing transactions;
   don't conflate the tax-bill mechanism with the listing-price mechanism when citing it.
2. **[B] Zonda 38th Annual Cost vs. Value Report** (09/18/2025,
   https://www.prnewswire.com/news-releases/zondas-38th-annual-cost-vs-value-report-confirms-exterior-projects-continue-to-deliver-the-highest-roi-302559084.html)
   — garage door replacement 267.7% ROI (#1 again), steel entry door 216.4%, manufactured stone
   veneer 207.9%, minor kitchen remodel 112.9% (only interior project in the top 5). **New for
   2025, directly relevant to SWFL: backup power generator ROI exceeds 100% in hurricane-prone
   regions.** Industry-standard annual report, cited by NAR itself.
3. **[B] Realtor.com 2026 Best Time to Sell Report** (03/18/2026,
   https://www.prnewswire.com/news-releases/april-12-18th-is-the-best-week-to-sell-in-2026-according-to-realtorcom-302716563.html)
   — nationally, April 12–18 is optimal (+16.7% views, 17% faster sale, +$5,300 vs. annual avg).
   Metro table gives Tampa +6.2%/Apr 19, Orlando +5.0%/Apr 19, Jacksonville +5.3%/Mar 22,
   **Miami-Fort Lauderdale-West Palm Beach May 24 — the latest and flattest "best week" of any
   metro listed (+5.1% price, only +3.0% views)**, consistent with the snowbird-season effect.
   **Miami is the nearest reported metro, not Fort Myers/Naples — label that gap explicitly if
   used.** Zillow's competing report (03/18/2026,
   https://zillow.mediaroom.com/2026-03-18-Best-time-to-list-Homes-sell-for-6,000-more-in-late-May)
   names late May nationally instead (+1.7%, ~$6,000) — the two portals disagree on the exact week;
   report both if citing either. **We already have a real SWFL-grain seasonal root**
   (`market-heat-swfl`) — lead with that, use these reports only as broader-market color.
4. **[B] Fonseca & Liu, "Mortgage Lock-In, Mobility, and Labor Reallocation,"** *Journal of
   Finance* 79(6), 2024, 3729–3772
   (https://files.consumerfinance.gov/f/documents/cfpb_FonsecaLiu_MortgageLockIn.pdf) — a 1-point
   rate-delta increase raises moving rates 0.68 points (9% of sample mean), causal estimate,
   top-tier peer-reviewed finance journal. **Timely current-condition claim from the same
   Realtor.com report above: as of Q3 2025, more outstanding US mortgages now sit above 6% than
   below 3% — the multi-year lock-in freeze is structurally thawing right now.**

---

## The honest capability map (what this answers about "what Claude can actually do")

**Bucket A — buildable today, our own data, zero new ingest.** This is the real answer to "what's
actually possible": a SWFL-specific DOM-vs-price-cut correlation (nobody else has this number for
Lee/Collier), a real per-property carrying-cost estimate (live mortgage rate + real property tax),
and a price-band search-filter boundary check on any asking price — all computable from data we
already hold, today, with code that hasn't been written yet. The gap here is an engineering
backlog item, not a ceiling on what the platform or the model can do.

**Bucket B — real, citable, external — usable as clearly-labeled context, never blended into our
own numbers.** Twenty-plus findings above, each real and sourced. The model's actual job here is
exactly what it's good at: synthesizing vetted, cited research into readable copy — which is a real
capability, not "not much," AS LONG AS the citation is fed in as grounding (same no-invention
discipline as every other number this platform serves) rather than pulled from memory.

**Bucket C — genuine gaps, not Claude's fault.** The seller's actual private mortgage
payment/rate, and a Lee-County-specific current cash-buyer price-band breakdown, do not exist
anywhere either in our data or publicly. Both are real "we don't have that" answers, exhausted
against research + catalog + code + live search before saying so.

## What this file is not

This is a research sweep, not a build spec. No approach was chosen, no email was picked, no design
was written. Per the operator's correction this session: brainstorming an idea is not the same as
proposing it as a build requirement — the next step is his call on which of the Bucket A / Bucket B
items are worth turning into an actual design, run through `superpowers:brainstorming` properly
when that happens.
