# Data Exploration & Visualization Brief — Noor

**From:** Ricky / Brain Platform
**Scope:** Exploratory data review + chart prototyping
**Initial milestone payment:** $100 (sent on acceptance)

---

## Important framing — please read first

Hurricane and flood data is part of the platform, but it is **not a standalone visual section**. We weight it into the brain scoring behind the scenes — `env-swfl` adjusts cap rates by ZIP based on flood exposure, and storm history factors into the overall market read. The output the user sees is the conclusion ("this corridor carries X bps of flood-adjusted risk"), not a flood map or hurricane layer. The signal is already embedded in the numbers.

Where the visual focus actually belongs — these are the five sections where a user makes a decision and where the visual storytelling should live:

1. **Market Pulse** — the top-line read across all 13 brains (confidence, conflicts, direction)
2. **Corridor Health** — the 26 CRE corridors (vacancy, rent, absorption, cap rate)
3. **Rental Market** — ZORI rent trends across 94 ZIPs
4. **Permit Activity** — construction momentum by corridor
5. **Tourism & Economy** — TDT revenue, employment, sector health

Everything that follows is mapped to those five sections. If a dataset or chart idea doesn't strengthen one of them, it's not the right target for this milestone.

---

## The ask

Brain Platform synthesizes Southwest Florida data into a single Claude-readable layer. We have 17 brains (data pipelines) live today, each producing a deterministic headline number plus supporting metrics. Inventory below.

What we want from you, in priority order:

1. **Gap analysis.** Read the inventory below. Tell us what's missing that a working professional (CRE broker, lender, city planner, franchise consultant, asset manager) would expect to see and we don't have. Name the dataset and where to get it. Pay attention to the "What we're chasing" section — some of these are already in flight and we want your read on priority.
2. **Combination opportunities.** Most of our brains pull from a single source and roll it up. A few combine sources (`master`, `cre-swfl`, `env-swfl`, `properties-lee-value`, `sector-credit-swfl`, `logistics-swfl-nowcast`, `traffic-swfl`). Tell us which datasets _should_ be combined that currently aren't — and what new signal that combination would surface. Frame each idea under one of the five visual sections above.
3. **Chart prototypes.** Build 3–5 charts (any tool — Observable, Plot, D3, Recharts, even Figma mocks) that fit those five sections. Lean toward charts that show a _relationship_ between two of our datasets, not a single time series. Avoid flood maps and hurricane track overlays — that signal lives in the conclusion text and the confidence number, not in a dedicated chart.
4. **Forward-deduction list.** For each existing or near-term brain, list what a professional could _project_ if they layered their own in-house data on top. Example: a CRE broker with a private rent roll could project NOI sensitivity by combining their actuals against our cap-rate and absorption math. Tell us 8–12 of these.

## The ultimate goal

Professionals spend more time cleaning and reconciling data than acting on it. We want to fix that — line up their internal data with our cleaned, sourced, deterministic baseline and return exact answers. Less guessing, fewer hallucinations, better speculation, faster reports, sharper graphs. Useful to a CRE broker pitching a listing, a lender underwriting a loan, a city planner prepping a council meeting, a buyer evaluating a business or property, an asset manager pulling a quarterly report. Hyper-focused, compacted, fast, real.

---

## Inventory mapped to the five visual sections

Every brain produces one distilled output (`conclusion`, `confidence`, `key_metrics`). Confidence is deterministic — `avg(trust_tier) × freshness_ratio`, never LLM-generated.

### 1. Market Pulse (synthesis layer)

| Brain           | Headline                                                                                                                                        | Confidence | Notes                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| `master`        | Mixed read across 13 upstreams; conflict surfaced: `cre-swfl` (bullish) vs `sector-credit-swfl` (bearish); flood-barrier-mode-1 override active | 0.97       | This is the one users see first. Conflicts, direction, confidence — the "top of the dashboard" |
| `macro-us`      | SOFR 4.31% (falling); US CPI YoY 2.6% (falling)                                                                                                 | 1.00       | Funding-cost backdrop. Goes on every page as ambient context                                   |
| `macro-florida` | FL unemployment 3.4%; LFP 60.9%; ~213K establishments across 5 sectors                                                                          | 1.00       | State baseline                                                                                 |
| `macro-swfl`    | Currently empty — county-level BLS LAUS not yet ingested                                                                                        | 1.00       | Slot ready; waiting on data                                                                    |

### 2. Corridor Health (26 CRE corridors)

| Brain                  | Headline                                                                                                                | Confidence | Notes                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------- |
| `cre-swfl`             | 8 corridors with full reads: median cap 6.5% (falling), vacancy 6% (falling), absorption +32K sqft, rent $32.5/sqft NNN | 0.91       | 26 corridors in the underlying table; 8 currently have complete metrics. Absorption is null on 2 large-format centers |
| `properties-lee-value` | Lee 2025: 8,301 qualified sales / 548,798 parcels = 15.1 per 1K (z = +1.5); FHFA Cape-FM −8.86% YoY                     | 0.91       | Parcel-level value-axis read. Lee only — Collier and Charlotte still on the list                                      |

### 3. Rental Market (94 ZORI ZIPs)

| Brain          | Headline                                                                                                                | Confidence | Notes                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------- |
| `rentals-swfl` | SWFL ZORI YoY −1.92% at $2,169/mo median across 94 ZIPs; hottest 34103 Naples +9.1%; coolest 33953 Port Charlotte −8.7% | 0.60       | The 94-ZIP grid is the visual unit |

### 4. Permit Activity (construction momentum)

| Brain          | Headline                                                                                       | Confidence | Notes                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------- |
| `permits-swfl` | Lee corridor-weighted permit z = +1.26 (neutral); hottest US-41 commercial alteration z = 1.73 | 1.00       | Lee County only. Collier permits in flight (see "What we're chasing") |

### 5. Tourism & Economy

| Brain                    | Headline                                                                                         | Confidence | Notes                             |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ---------- | --------------------------------- |
| `tourism-tdt`            | Lee TDT 2025-09: $1.80M (+12.5% YoY); T12M = $53.15M (99% of pre-Ian peak)                       | 1.00       | Hospitality demand pulse          |
| `traffic-swfl`           | Length-weighted AADT 62,804 veh/day; YoY +4.2%; 5-yr CAGR +2.6%; post-Ian coastal recovery 117.6 | 0.80       | Visitor + corridor activity proxy |
| `logistics-swfl`         | FAF5 2024: 12,853K tons / $11.64B inbound across 7 origin zones; top = Tampa-St.Pete 4.4M tons   | 1.00       | Goods-economy baseline            |
| `logistics-swfl-nowcast` | FDOT nowcast: 242.4M tons/yr vs 242.5M baseline; deviation z = −0.02; shock-state normal         | 0.91       | Real-time freight shock detector  |
| `sector-credit-swfl`     | Best NAICS: Prof/Sci/Tech 0% charge-off; worst: Arts/Rec 33.3%, Retail 26.1%, Accom/Food 25.4%   | 1.00       | Sector health by industry         |
| `franchise-outcomes`     | 15 brands / 169 resolved loans; SBA overall survival rate 78.1%                                  | 1.00       | Operator-level outcome data       |

### Embedded (not its own section)

| Brain                 | What it adjusts                                                                                   | Why no standalone panel                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `env-swfl`            | Cap-rate adjustment by ZIP (+50–70 bps barrier-island); NOI flood-insurance share (5.3% at 33931) | Output is a bps adjustment baked into corridor and parcel reads, not a flood map |
| `storm-history-swfl`  | Risk weighting on long-horizon reads (76 trailing-10yr events; 0 hurricane-force wind)            | Output is a confidence and risk modifier, not a hurricane track display          |
| `hurricane-tracks-fl` | Available as cold-storage data for ad-hoc spatial joins                                           | Not surfaced as a visual; called by other brains when needed                     |

---

## Underlying tables (Supabase `data_lake`)

These are the cleaned bases that power the brains. You can request a read-only snapshot of any of them.

| Table                                | Rows             | What it holds                                                    | Feeds which section             |
| ------------------------------------ | ---------------- | ---------------------------------------------------------------- | ------------------------------- |
| `corridor_profiles`                  | 26               | CRE corridors: rents, vacancy, cap, absorption                   | Corridor Health                 |
| `leepa_parcels`                      | 548,798          | Lee County parcel snapshot (assessment, sales, geometry)         | Corridor Health                 |
| `zori_swfl`                          | 94 ZIPs          | Zillow Observed Rent Index                                       | Rental Market                   |
| `lee_building_permits`               | rolling          | Lee County Accela permits                                        | Permit Activity                 |
| `fdot_aadt_fl` / `_swfl_yearly` view | statewide        | FDOT Annual Average Daily Traffic, segment-level                 | Tourism & Economy               |
| `census_cbp_fl`                      | 255,563          | County Business Patterns, FL — 6 yrs × 67 counties × 1,823 NAICS | Tourism & Economy, Market Pulse |
| `bls_qcew`                           | FL               | Quarterly Census of Employment & Wages                           | Tourism & Economy, Market Pulse |
| `fhfa_hpi`                           | Cape-FM MSA + FL | House Price Index                                                | Corridor Health                 |
| `fema_nfip_claims` / `_swfl` view    | 448,381 / 89,492 | NFIP paid flood claims, ZIP-level                                | Feeds env-swfl (embedded)       |
| `usgs_water`                         | continuous       | USGS Caloosahatchee gage                                         | Feeds env-swfl (embedded)       |
| `_tier1_inventory`                   | 19               | Cold-storage Parquet catalog (FAF5 freight + hurricane tracks)   | Tourism & Economy (logistics)   |

---

## What we're chasing (data in flight or queued)

These are the next ingest targets. Some have plans drafted, some are waiting on a brain to consume them. Calling them out so you can weigh in on priority and shape the visual sections around what's actually coming.

| Dataset                                                             | Status                                                                              | Visual section it would strengthen                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Collier County permits**                                          | Queued — Lee shipped, Collier next on the Accela pattern                            | Permit Activity (doubles coverage)                  |
| **Collier + Charlotte parcels**                                     | Queued — LeePA pattern extends to Collier County Property Appraiser + Charlotte CPA | Corridor Health (gets us all of SWFL, not just Lee) |
| **County-level BLS LAUS (Lee + Collier monthly unemployment)**      | Queued — fills the empty `macro-swfl` slot                                          | Market Pulse, Tourism & Economy                     |
| **Census ACS block-group demographics (B25038, income, migration)** | Aspirational — unlocks `demographics-swfl` brain + per-ZIP context                  | All five sections (demographic backdrop)            |
| **Anchor tenant table**                                             | Aspirational — referenced in corridor narratives, no structured table yet           | Corridor Health                                     |
| **CoStar / LoopNet shadow listings**                                | Aspirational — listings as a Tier-3 source                                          | Corridor Health, Rental Market                      |
| **Spatial oracle (`corridor_for_point(lat, lon)` Supabase RPC)**    | Near-term roadmap — unlocks Brand → located_in → Corridor joins                     | Corridor Health                                     |
| **Predictions / outcomes table**                                    | Aspirational — our own backtested calls vs. actuals                                 | Market Pulse (track-record overlay)                 |
| **GraphRAG / news layer (Graphiti as Python sidecar)**              | Near-term roadmap, blocked on CVE patch                                             | Market Pulse (event detection)                      |
| **Scheduled refinery runs (3am cron)**                              | Long-term roadmap — FRED, permits, TDT, SBA quarterly                               | All sections (freshness gets tighter)               |

---

## What's missing entirely (starter list — challenge or extend)

Beyond what's queued, these are gaps a working professional would expect us to have and we haven't started on. Tell us which ones matter most.

- **FL DBPR business license file** — active operating businesses, address-keyed → grounds NAICS reads in real entities
- **DOH restaurant inspection grades** — proxy for hospitality operator quality
- **FL OIR insurance rate filings** — leading indicator on insurance-driven cost shocks (especially flood-adjacent)
- **BLS OEWS MSA-level wages** — cap-rate justification math, labor-cost overlay for franchise underwriting
- **Building age / construction type from LeePA** — data is already in the parcel file; we don't surface it
- **RSW airport ops (FAA / NOAA)** — visitor leading indicator that lands before TDT
- **Per-ZIP days-on-market for residential** — flagged as a known gap in our worked-example doc; homebuyer use cases need it
- **Sarasota / Charlotte ZORI** — we have 94 SWFL ZIPs; expanding coverage strengthens the regional read

## Combinations we should be running and aren't

Single-source brains that should be multi-source. Each idea sits inside one of the five visual sections.

- **Corridor Health:** `rentals-swfl` × `properties-lee-value` × `fhfa_hpi` — rent-to-value gap by ZIP, flag overpriced vs underpriced submarkets
- **Corridor Health:** `permits-swfl` × `cre-swfl` × `rentals-swfl` — supply pipeline (permits) vs demand signal (rents) vs commercial absorption
- **Tourism & Economy:** `tourism-tdt` × `traffic-swfl` × `permits-swfl` — visitor-economy momentum vs infrastructure load vs construction supply
- **Market Pulse:** `sector-credit-swfl` × `census_cbp_fl` employment share — concentration-of-risk view (where the bad credit lives relative to where the jobs live)
- **Rental Market:** `rentals-swfl` × `census_cbp_fl` × `bls_qcew` — rent-to-wage ratio by ZIP (affordability heatmap)

## Forward-deduction list (what a professional could project with our baseline + their data)

Each of these lights up if a user brings their in-house data and we line it up against ours.

1. **CRE broker with a private rent roll** — NOI sensitivity by combining their actuals against our cap-rate and flood-AAL math
2. **Lender with a loan book** — sector-concentration risk against our `sector-credit-swfl` charge-off rates and current SOFR
3. **Franchise consultant evaluating a brand** — survival projection by overlaying brand history on our SBA outcomes + sector credit
4. **Asset manager prepping a quarterly report** — corridor-relative performance vs our absorption / vacancy benchmarks
5. **City planner prepping a council meeting** — permit saturation forecast (when does construction supply overtake absorption?)
6. **Buyer evaluating a business for acquisition** — operating cost sensitivity (rent × wage × cap-rate) per submarket
7. **Homebuyer under a budget cap** — ZIP-level inland-vs-coastal tradeoff resolved against price level + rent + permit pipeline
8. **Insurance underwriter** — premium-vs-AAL gap by ZIP (where market premiums diverge from claims history)
9. **Hospitality operator** — TDT recovery curve vs traffic and freight; demand normalization signal
10. **Developer scoping a site** — corridor-fit score (permit z + absorption + rent direction + demographic backdrop)
11. **REIT analyst** — submarket beta against the broader market read (master) over rolling windows
12. **Municipal economic-development office** — sector mix gap vs Florida baseline (which industries are underrepresented locally)

## Chart territory — by section

Starting points only. Push back on any of them.

**Market Pulse**

- Conflict map: each upstream brain as a dot on a bullish/bearish axis, sized by confidence, colored by domain. Shows at a glance where the conflict the `master` brain surfaced is coming from.
- Confidence trendline over time (once we have prediction/outcomes history) — track record overlay.

**Corridor Health**

- Corridor radar: cap, vacancy, absorption, rent, permit-z — one polygon per corridor, comparable at a glance.
- Rent-to-value scatter: each ZIP or corridor plotted on (median rent) × (FHFA price level), with bubble size = sales velocity. Outliers are the story.
- Cap rate vs SOFR delta over time — corridor-by-corridor spread compression / expansion.

**Rental Market**

- 94-ZIP rent YoY heatmap with a secondary overlay for the permits-swfl corridor z-score. Where supply is racing demand pops visibly.
- Rent vs price level by ZIP (gross yield map) — overlays cleanly with the Corridor Health scatter.

**Permit Activity**

- Permit-type stacked bar by corridor (commercial new / commercial alteration / residential / demolition), z-scored against trailing-365d baseline.
- Permit-velocity sparklines per corridor — small multiples, sorted by z-score.

**Tourism & Economy**

- TDT × hurricane recovery curve, 2018 → today. One line per event, indexed to month-of-event = 0.
- Sector charge-off vs sector employment (CBP). Where is the risk concentrated relative to the share of jobs?
- FAF5 inbound freight Sankey: origin zone → commodity class → SWFL.
- Sector dot-plot: charge-off rate (x) × employment share (y) × wage level (color). One chart, three signals.

---

## What I can build alongside you

While you're exploring, I can:

- Stand up read-only Supabase views for any table above on request — same-day turnaround
- Wire any new brain combination you propose into the synthesis layer once we agree on the math
- Add new data sources to the ingest pipeline (most public APIs land in a day; scraped sources take longer)
- Generate sample fixtures from any brain so you can prototype against real shape without hitting prod
- Accelerate any of the "What we're chasing" items if your gap analysis says one is higher-leverage than what's queued today

## When you're ready to prototype

The gap analysis, combination list, and chart sketches above don't need our data to start — you can work from the inventory in this brief. Once you're ready to build against real numbers, tell me which delivery channel works best for you and I'll set it up:

- **Shared Google Drive folder** — I drop the sample fixtures (real shape, real numbers, frozen snapshots from each brain) into a folder I share with you. Easiest if you just want files.
- **GitHub repo invite** — read-only access to the project. Fixtures live at `refinery/__fixtures__/`. Best if you want to see how the data flows end to end.
- **Zip file** — one-shot send of just the fixtures you need. Simplest if you're working off your laptop and don't want another account login.

Your call. Whichever is least friction for the way you work.

## Deliverables for the $100 milestone

- Written gap analysis (1–2 pages) — what's missing per section, ranked by leverage
- Written combination-opportunity list (5–10 entries, each tagged to a visual section)
- 3–5 chart prototypes (any tool — static images, Observable notebook, Figma frames all fine), each anchored to one of the five sections
- Forward-deduction list (8–12 professional projections)

Async, no call needed. End-of-day Loom or written check-in is great.

If this lands well, next milestone is implementation — wiring the strongest 2–3 combinations into live brains with real Supabase reads.

Send confirmation and I'll release the $100. Looking forward to seeing where you push this.

— Ricky
