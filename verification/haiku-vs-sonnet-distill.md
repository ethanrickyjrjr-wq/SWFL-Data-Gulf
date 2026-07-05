# Haiku vs Sonnet — pulse distill writing comparison

**Purpose (operator, 07/05/2026):** show how different Haiku's fact write-ups are
from the old Sonnet writings, on identical citation spans, over several days —
evidence for the pulse retrofit's model choice.

## The specs to change (what the retrofit swaps)

- CAPTURE: `claude-sonnet-4-6` + paid `web_search_20250305` (max_uses 8/unit)
  → crawl4ai fetch of articles matched from the news_swfl lake ($0).
  Files: `ingest/pipelines/city_pulse/pipeline.py`, `ingest/pipelines/city_pulse_corridors/pipeline.py`.
- DISTILL: already `claude-haiku-4-5-20251001` (cost mode 07/05/2026); prompt +
  forced-tool schema unchanged. THIS FILE tests exactly that swap's writing cost.
- BUDGET: corridor RunBudget default $16 → $1 (decree; handoff in flight),
  city already capped; $5/day ceiling preflight everywhere.
- RE-ENABLE GATE: dry-run green on the runner + console shows zero web-search
  billing segments (`pulse_crawl4ai_retrofit_live_verify`).

## Method + known bias

Same spans, same prompt, same schema — only the model differs. Spans are
rebuilt from Sonnet-era lake rows, so spans Sonnet DROPPED are invisible here:
this measures wording/fidelity/classification on shared spans, not recall.
Sonnet-era = rows with captured_at < 07/05/2026. No lake writes; Haiku output
stays in this file.

Daily protocol: run the command below once a day for a few days (fresh
Sonnet-era rows keep aging out via TTL, so earlier runs cover more ground);
read the pairs; judge.

```
OPERATOR_APPROVED_PAID_RUN=1 node scripts/paid-run.mjs python scripts/compare-distill-writing.py
```

## Comparison run — 07/05/2026 16:39 UTC

### Marco Island — HAIKU CALL FAILED: KeyError('ANTHROPIC_API_KEY')

(harness ready; re-run once credits exist)


## Comparison run — 07/05/2026 16:41 UTC

### Marco Island — 11 shared spans · Sonnet kept 11 facts · Haiku kept 8 facts

- SPAN: Marco Island shopping center sells for $26.6M | Real Estate | gulfshorebusiness.com
  - SONNET (transactions): The new owner of Island Plaza has local ties to Marco Island restaurateur Luigi Carvelli, whose family owns a local business.
  - HAIKU  : (dropped this span)
- SPAN: Marco Island expects tax bump from resort sale | GB Daily | gulfshorebusiness.com
  - SONNET (structural): Casey Lucius, interim city manager for Marco Island, expects property tax revenue to increase after the $835 million JW Marriott resort sale.
  - HAIKU  (transactions): Island Plaza sale expected to increase property tax revenue
- SPAN: Marco Island shopping center sells for $26.6M | Real Estate | gulfshorebusiness.com
  - SONNET (transactions): Island Plaza, a Marco Island shopping center at 3058-3078 Bald Eagle Drive at the intersection with Collier Boulevard, sold for $26.6 million.
  - HAIKU  (transactions): Island Plaza shopping center sells for $26.6M
- SPAN: Dashcam video reveals tension between Marco Island Councilwoman and police officer over beach night fishing enforcement | Collier County | winknews.com
  - SONNET (structural): At a June 1 City Council meeting, Councilwoman Schwan spearheaded a request to investigate the potential disbanding of the Marco Island Police Department, citing it as a cost-saving measure to prepare for potential property tax revenue losses.
  - HAIKU  : (dropped this span)
- SPAN: Marco airport seeks federal funds to update runway plan | Government | gulfshorebusiness.com
  - SONNET (development): Marco Island Executive Airport is seeking a nearly $500,000 FAA grant to update its runway plan; the airport has not had an Airport Master Plan Update since 2006.
  - HAIKU  (development): Marco Island Executive Airport seeking nearly $500,000 Federal Aviation Administration grant for runway plan update
- SPAN: Beloved Marco Island theater shuts down amid rising costs | Collier County | winknews.com
  - SONNET (business): A beloved Marco Island theater shut down amid rising costs and declining attendance; owner Drake Heroy had bought the theater 4 years prior after managing it for years.
  - HAIKU  (breaking): Beloved Marco Island theater shuts down amid rising costs
- SPAN: Marco Island weighs revenue options amid property tax amendment | GB Daily | gulfshorebusiness.com
  - SONNET (structural): City Manager Casey Lucius told City Council on June 1 that the city could lose about $2 million annually if the state property tax amendment measure passes.
  - HAIKU  (structural): City could lose about $2 million annually if property tax amendment passes
- SPAN: Marco Island exploring costs to phase out local police department amid state property tax debate | Collier County | winknews.com
  - SONNET (structural): The Marco Island Police Department has provided law enforcement services within city limits since its establishment in 1999.
  - HAIKU  (structural): Marco Island Police Department has provided law enforcement services since its establishment in 1999
- SPAN: Marco Island studies sheriff takeover of police services | GB Daily | gulfshorebusiness.com
  - SONNET (structural): Marco Island City Council voted 4-3 on June 1 to direct staff to research the costs, logistics, and operational impacts of potentially shifting police services to the Collier County Sheriff's Office.
  - HAIKU  (structural): City Council voted 4-3 on June 1 to direct staff to research costs, logistics and operational impacts of shifting police services to Collier County Sheriff
- SPAN: Collier County property values drop, but tax bills might not
  - SONNET (structural): Collier County property values fell nearly 6%, but tax bills may not decrease correspondingly, per a June 12, 2026 report.
  - HAIKU  (structural): Collier County property values drop but tax bills might not in 2026
- SPAN: Marco Island weighs replacing city police with Collier County ...
  - SONNET (structural): Marco Island is weighing replacing its city police department with the Collier County Sheriff's Office, according to a report by WINK News.
  - HAIKU  : (dropped this span)

### Bonita Springs — 10 shared spans · Sonnet kept 10 facts · Haiku kept 5 facts

- SPAN: SWFL member-owned golf club to build $110M clubhouse | Business Observer
  - SONNET (development): Bonita Bay Club, billed as the largest member-owned private golf club in Florida, announced a $110 million clubhouse project.
  - HAIKU  : (dropped this span)
- SPAN: Midtown Development: Hub for Bonita Springs' Growth
  - SONNET (development): Midtown at Bonita's design includes 30 acres of open space/drainage addressing flooding concerns, as the development drains into the Kehl Canal and Imperial River Watershed.
  - HAIKU  (development): Midtown at Bonita, a 68-acre mixed-use development, includes design with 30 acres and addresses flooding concerns as it drains into the Kehl Canal and Imperial River Watershed.
- SPAN: 68-acre Lee County project adds tenants, including popular donut shop | Business Observer
  - SONNET (business): Midtown at Bonita's new tenants will join TJ Maxx and Ulta Beauty, which were announced in February, and existing tenants Jeff's Bagel Run, Gelato & Co., and LowB (partial name).
  - HAIKU  : (dropped this span)
- SPAN: Five retailers sign leases at Midtown at Bonita | GB Daily | gulfshorebusiness.com
  - SONNET (transactions): Five new retail tenants signed leases at Midtown at Bonita, the 68-acre mixed-use development on Bonita Beach Road, developed by The Zuckerman Group.
  - HAIKU  (business): Five retailers signed new leases at Midtown at Bonita, joining previously announced tenants TJ Maxx and Ulta Beauty (announced February 2026), as well as Jeff's Bagel Run, Gelato & Co., and LowB.
- SPAN: Saltleaf Marina opens on Weeks Fish Camp site in Bonita Springs
  - SONNET (business): Saltleaf Marina in Bonita Springs opened to the public on June 22, 2026, on the historic Weeks Fish Camp site, as part of the 500-acre Saltleaf community being built by Naples-based London Bay.
  - HAIKU  (business): Saltleaf Marina opened to the public on June 22, part of the 500-acre Saltleaf community being built by Naples-based developers.
- SPAN: Top Real Estate Agent in Estero, FL | McGreevy & Comisar
  - SONNET (structural): Jesse McGreevy and Marc Comisar are also recognized as the top real estate agents in Estero, FL (neighboring Bonita Springs market), with more than $860 million in career sales and nearly two decades of market leadership, as of June 11, 2026.
  - HAIKU  : (dropped this span)
- SPAN: Best Real Estate Agent in Bonita Springs, FL: Jesse McGreevy and ...
  - SONNET (structural): McGreevy | Comisar Team, based in Bonita Springs, FL, has recorded over $860 million in career sales and nearly two decades of market leadership with over 1,700 career transactions, as of a press release dated June 10, 2026.
  - HAIKU  (structural): Jesse McGreevy and Marc Comisar have $860 million in career sales and nearly two decades of market leadership as top real estate agents in Bonita Springs, FL, with over 1,700 career transactions.
- SPAN: Waterfront estates, penthouses, lead big 2026 SW Florida home sales
  - SONNET (structural): The SW Florida uber-luxury real estate market remained steady in 2026, with waterfront estates and penthouses leading big home sales across the region including Bonita Springs, as reported May 13, 2026.
  - HAIKU  : (dropped this span)
- SPAN: SW Florida uber-luxury real estate market remains steady in 2026
  - SONNET (structural): SW Florida's uber-luxury real estate market remained steady in 2026, with head-turning home and condo sales since the start of 2026 setting records or coming close in communities including areas of Lee County encompassing Bonita Springs, as reported May 5, 2026.
  - HAIKU  : (dropped this span)
- SPAN: Now You Know: No rate increases at BSU; new business brings the ...
  - SONNET (structural): Bonita Springs Utilities Inc. (BSU) will maintain current water and wastewater rates for 2026, as approved by its board of directors.
  - HAIKU  (structural): Bonita Springs Utilities Inc. will maintain current water and wastewater rates for 2026, announced in May 2026.

### Fort Myers — 10 shared spans · Sonnet kept 10 facts · Haiku kept 7 facts

- SPAN: Ben Mallah adds Fort Myers property to portfolio
  - SONNET (transactions): Ben Mallah purchased a 60,305 sq ft building in Fort Myers for $17.25 million using a 1031 exchange.
  - HAIKU  (transactions): Ben Mallah purchased a 60,305 sq ft building in Fort Myers for $17.25 million using a 1031 exchange
- SPAN: Tampa medical building tied to philanthropist, investor Patel sold | Business Observer
  - SONNET (structural): NAI Burns Scalo's Commercial Property Southwest Florida team transition from the Cushman & Wakefield Alliance has begun, led by Brian Walker, president of NAI Pittsburgh.
  - HAIKU  : (dropped this span)
- SPAN: Fort Myers land sells to Wisconsin Culver's hamburger franchisee | Business Observer
  - SONNET (transactions): The final outparcel in a Fort Myers shopping center has sold to a Wisconsin Culver's hamburger franchisee, who plans to build a Culver's restaurant on the site.
  - HAIKU  (transactions): The final outparcel in a Fort Myers shopping center sold to a Wisconsin Culver's hamburger franchisee who plans to build a Culver's restaurant on the site
- SPAN: Tampa Bay investor pays $43 million for Fort Myers apartment | Business Observer
  - SONNET (transactions): The Cobblestone on The Lake Apartments in Fort Myers sold to Tampa Bay investor Ben Mallah of Equity Management in an off-market sale for $43 million.
  - HAIKU  (transactions): Cobblestone on The Lake Apartments in Fort Myers, a 248-unit property, sold to Tampa Bay investor Ben Mallah of Equity Management in an off-market sale
- SPAN: Fort Myers scooter expansion plan divides downtown business owners | Lee County | winknews.com
  - SONNET (business): A Fort Myers scooter expansion plan is dividing downtown business owners; as of June 8, 2026, City Council had not taken a final vote during a workshop but weighed benefits against safety concerns.
  - HAIKU  (business): City Council discussed a Fort Myers scooter expansion plan that divides downtown business owners during a Monday workshop
- SPAN: Construction giant moving local HQ, jobs from Naples to Fort Myers | Business Observer
  - SONNET (structural): Manhattan Construction Group, one of the largest contractors in the region, has begun building a new office in Lee County where it will eventually relocate its local headquarters from Naples.
  - HAIKU  (structural): Manhattan Construction Group, one of the largest contractors in the region, has begun building a new office in Lee County where it will eventually relocate its local headquarters from Naples
- SPAN: NAI Burns Scalo Grows Florida Market Share, Announces Major ...
  - SONNET (structural): NAI Burns Scalo acquired Cushman & Wakefield | Commercial Property Southwest Florida (CPSWFL) in Fort Myers on June 10, 2026, transitioning the firm from the Cushman & Wakefield Alliance to the NAI Burns Scalo brand; the acquisition was led by Brian Walker, President of NAI Burns Scalo.
  - HAIKU  (structural): NAI Burns Scalo acquired Cushman & Wakefield | Commercial Property Southwest Florida (CPSWFL) in Fort Myers on June 10, 2026, led by President Brian Walker
- SPAN: Fort Myers Beach hotel recovery lags 4 years after Ian | GB Daily
  - SONNET (structural): Fort Myers Beach hotel recovery continues to lag 4 years after Hurricane Ian, per a Gulfshore Business report.
  - HAIKU  : (dropped this span)
- SPAN: Florida lawmaker says some Southwest Florida fire districts may need to merge if property tax proposal passes
  - SONNET (structural): A Florida lawmaker stated that some Southwest Florida fire districts may need to merge if a property tax proposal passes, affecting Lee County districts.
  - HAIKU  : (dropped this span)
- SPAN: Fort Myers Costco officially moving to Colonial Boulevard location
  - SONNET (structural): Fort Myers Costco is officially moving to a Colonial Boulevard location, replacing its current overcrowded location.
  - HAIKU  (business): Fort Myers Costco officially moved to Colonial Boulevard location

_31 span pairs this run; spend metered to api_usage_log (call_type ingest_city_pulse_distill)._

