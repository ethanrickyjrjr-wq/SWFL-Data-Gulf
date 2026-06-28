# Homepage — Daily Listing Data Showcase

**Status:** Ready to build (code partially written, not pushed)
**Date:** 2026-06-28
**Check:** `homepage_listing_showcase_live_verify`

---

## Why This Exists

We have 10,459 live residential listings (Lee 7,412 · Collier 2,749 · Hendry 298, median $496,470) updating every day. The homepage shows none of it. It opens on a flood risk map by default.

**The operator said it directly:** "EVERYONE KNOWS ABOUT FUCKING FLOOD RISK. WE LIVE BY A GOD DAMN OCEAN. NO ONE CARES ABOUT FLOOD RISK UNLESS YOU HAVE PRICES TO BACK UP WHERE YOU MIGHT BE BUYING PROPERTY."

Flood risk only means something when someone has already found a price they like. Lead with inventory and price. Flood is a context layer — show it last.

---

## Research (crawl4ai — Redfin, Zillow, CoStar, NNGroup)

Every major real estate platform leads with the same three metrics in the same order:

1. **Homes for Sale count** — how many choices do I have?
2. **Median Sale/List Price** — what does it cost?
3. **Days on Market** — how fast is it moving?

Risk metrics (flood, school ratings, crime) appear only as filters or secondary layers — never as the default view. Nobody opens Redfin to check flood risk. They check what's available and what it costs.

**Page narrative pattern (Redfin/Zillow):**
- Hero: inventory count + price headline
- Map: choropleth defaulting to price or listing density, not risk
- Stats bar: region-wide numbers (total homes, median price, by-county breakdown)
- Feature cards: data-forward (real numbers, not generic claims)
- Single CTA: one destination, repeated

**What makes hero cards work (NNGroup + real platform research):**
- Lead with a real number, not a feature name
- Chips that add context without walls of text (county breakdowns, update cadence, data grain)
- YoY direction when available
- Buyer/seller/broker framing — not "platform features"

---

## Live Data (source: `data_lake.listing_active_stats`, as of 2026-06-27)

| Metric | Value |
|--------|-------|
| Total active listings (SWFL) | 10,459 |
| Median asking price | $496,470 |
| Lee County listings | 7,412 |
| Lee County median | $414,900 |
| Collier County listings | 2,749 |
| Collier County median | $912,000 |
| Hendry County listings | 298 |
| ZIP codes covered | 61 |
| Highest ZIP (33993 Cape Coral NW) | 722 listings |
| Days on market | NULL — coming via Realtor.com ingest |

---

## Page Narrative — One Story Top to Bottom

```
[Hero map]   -> This is your market. Here's what's for sale, by ZIP.
[Stats bar]  -> 10,459 homes / $496,470 median / Lee 7,412 / Collier 2,749
[Cap cards]  -> Here's what the data means for you (buyer / seller / broker)
[Comp strip] -> Here's what everyone else charges for this (unchanged — best copy on site)
[CTA]        -> Build Your First Report
```

Every section feeds the next. No island sections.

---

## Changes

### 1. Map pills — `lib/landing/home-map-data.ts`

Add `listings` MetricKey (first = default):
```ts
export type MetricKey = "listings" | "flood" | "value" | "permits";
```

Add `listings` MetricDef — per-ZIP counts from `brains/active-listings-swfl.md`, 57 map ZIPs (Lee + Collier only; Hendry ZIPs not on the SVG map). Color: warm amber `#3d2200 → #b86a1a → #f5c518`.

Per-ZIP data (baked from brain as of 2026-06-27):
```
33901:78  33903:182 33904:312 33905:278 33907:37  33908:370 33909:418 33912:93
33913:276 33914:469 33916:56  33917:358 33919:141 33920:159 33921:0   33922:62
33924:67  33928:251 33931:182 33936:208 33956:117 33957:182 33965:0   33966:50
33967:98  33971:369 33972:288 33973:18  33974:409 33976:294 33990:173 33991:284
33993:722 34101:0   34102:188 34103:104 34104:109 34105:56  34108:182 34109:124
34110:131 34112:166 34113:156 34114:262 34116:45  34117:141 34119:219 34120:464
34134:108 34135:282 34137:2   34138:3   34139:8   34140:11  34141:2   34142:175
34145:152
```
low: 0, high: 722

METRIC_ORDER (first = default pill on load):
```ts
export const METRIC_ORDER: MetricKey[] = ["listings", "value", "permits", "flood"];
```

De-jargon flood:
- label: `"Flood Insurance Risk"` (was "Annual Flood Loss")
- sublabel: `"Average annual insurance loss per home"` (was "FEMA NFIP avg annual loss per property")

---

### 2. Hero.tsx — `components/landing/Hero.tsx`

Initial active metric:
```ts
let activeMetric: MetricKey = "listings";  // was "flood"
```

Hero badge:
```
"Lee · Collier · Hendry Counties · Updated Daily"
```

Filter pills (reordered, flood last):
```tsx
<button className="filter-pill active" data-metric="listings">Homes for Sale</button>
<button className="filter-pill" data-metric="value">Home Value</button>
<button className="filter-pill" data-metric="permits">New Construction</button>
<button className="filter-pill" data-metric="flood">Flood Risk</button>
```

Rail header defaults (before a ZIP is clicked):
- metric name: "Homes for Sale"
- sublabel: "Active residential listings"

Add listings metric-row in rail-detail:
```tsx
<div className="metric-row" id="mrow-listings" data-metric="listings">
  <div className="metric-row-label">Homes for Sale</div>
  <div className="metric-row-value" id="mval-listings">—</div>
  <div className="metric-row-rank" id="mrank-listings"></div>
  <div className="mini-bar">
    <div className="mini-bar-fill" id="mbar-listings" style={{ background: "#b86a1a" }} />
  </div>
</div>
```

Label fixes:
- "Annual Flood Loss" → "Flood Insurance Risk"
- "New Permits 2024" → "New Construction 2024"

Stats bar — 4 cells with live data:

| Cell | Label | Number | Sublabel | Chip |
|------|-------|--------|----------|------|
| 1 | Homes for Sale | 10,459 | Across SWFL | Updated Daily |
| 2 | Median Asking | $496,470 | Active listings | List Price |
| 3 | Lee County | 7,412 | Median $414,900 | Most Active |
| 4 | Collier County | 2,749 | Median $912,000 | Luxury Market |

Sources footer: add `"Active Listings (SWFL Data Gulf)"`.

---

### 3. Capabilities.tsx — `components/landing/Capabilities.tsx`

Replace 4 generic cards with data-forward cards + chips.

**Card 1 — Inventory:**
- Icon: `BarChart2`
- Title: `"10,459 Homes for Sale"`
- Body: `"Active listings across Lee, Collier, and Hendry counties — updated every day."`
- Chips: `[Lee · 7,412]` `[Collier · 2,749]` `[Hendry · 298]` `[Updated Daily]`

**Card 2 — Price:**
- Icon: `TrendingUp`
- Title: `"$496,470 Median Asking"`
- Body: `"Asking prices across 61 ZIP codes. Lee runs $414K. Collier runs $912K. Click any ZIP to see it."`
- Chips: `[List Price]` `[61 ZIPs]` `[As of Today]`

**Card 3 — Ask anything:**
- Icon: `Zap`
- Title: `"Any question. Any ZIP. Real answer."`
- Body: `"Flood insurance, active inventory, price trend — cited answer in seconds."`
- Chips: `[Buyers]` `[Sellers]` `[Brokers]`

**Card 4 — Build deliverable:**
- Icon: `CalendarClock`
- Title: `"Say what you need. It builds it."`
- Body: `"Market report. Flood analysis. Investment memo. AI writes it from live data and sends on schedule — no workflow to build."`
- Chips: `[Market Reports]` `[Auto-Send]` `[Any Client]`

CTA button: `"Build Your First Report"` (was "Get Access")

CTA deck: `"Built for brokers, buyers, and investors working SWFL."`

---

### 4. Chip CSS — `components/landing/home-explorer.css`

Add before `.cap-cta-row`:
```css
.home-explorer .cap-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.home-explorer .cap-chip {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,0.07);
  color: var(--text-secondary);
  border: 1px solid rgba(255,255,255,0.1);
}
```

---

## What Does NOT Change

- Map SVG and useEffect interaction logic
- Competitor comparison strip — best copy on the page
- Waitlist section
- ZIP report pages (separate initiative)

---

## Files Changed

| File | Change |
|------|--------|
| `lib/landing/home-map-data.ts` | Add `listings` MetricKey + MetricDef + METRIC_ORDER fix |
| `components/landing/Hero.tsx` | Default pill, rail labels, stats bar, badge, metric-row |
| `components/landing/Capabilities.tsx` | Data cards with real numbers + chips, CTA copy |
| `components/landing/home-explorer.css` | `.cap-chips` + `.cap-chip` styles |

---

## Verification

1. Homepage opens with "Homes for Sale" pill active (amber choropleth)
2. Click any ZIP → rail shows listing count, rank, mini bar in amber
3. Flood Risk pill is last; clicking shows "Flood Insurance Risk" (no jargon)
4. Stats bar: 10,459 / $496,470 / Lee 7,412 / Collier 2,749
5. Capabilities cards show real numbers with chips
6. CTA reads "Build Your First Report"
7. `bun test` 3911/0
8. `bunx next build` clean

---

## Phase 2 — After Realtor.com Ingest

Once `data_lake.realtor_zip_metrics` is populated (see `2026-06-27-realtor-data-library-ingest-design.md`):
- Hero card 1: add `active_listing_count_yy` chip ("↑8% YoY")
- Hero card 2: add `median_listing_price_yy` chip
- New hero card: "X% of SWFL homes cut their price this month"
- New map pill: Days on Market (`median_days_on_market` per ZIP)
- Stats bar: add median DOM + pending ratio
