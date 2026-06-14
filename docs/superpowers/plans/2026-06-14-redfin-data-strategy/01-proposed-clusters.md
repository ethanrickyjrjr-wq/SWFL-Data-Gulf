# Proposed Dataset Clusters + Signal Ideas

## Cluster A — Seller Stress Index
**Datasets:** price_drops + contract_cancellations + delistings_relistings
**Grain:** ZIP monthly (already built) + city monthly + metro weekly

The three datasets together tell a complete story of seller capitulation:
1. Seller lists → doesn't sell → drops price (price_drops)
2. Buyer makes offer → backs out (contract_cancellations)
3. Seller gives up entirely → delists (delistings)
4. Seller re-lists later at lower price or different framing (relistings)

**Composite signal idea:** Seller Stress Score (0–100) per ZIP:
- pct_active_with_drops × 0.35
- cancellation_rate_pct × 0.35
- share_delisted_pct × 0.30
- Normalized against 2019–2023 baseline (pre-rate-shock)

**Leading vs lagging:**
- delistings LEAD (seller gives up before comps move)
- cancellations LAG (buyer pain, reflects existing market conditions)
- price_drops are coincident

**Research questions:**
- What's the empirically optimal weighting?
- Does the delistings→cancellations→price_drops cascade have a predictable lag?
- Can we predict 3-month forward price direction from seller stress alone?

---

## Cluster B — Market Temperature
**Datasets:** housing_market (main tracker) + buyers_and_sellers (balance of power)
**Grain:** ZIP monthly + city monthly + metro weekly

Core metrics: homes_sold, DOM, inventory, months_of_supply, sale-to-list ratio, pending_sales, off_market_in_two_weeks

**Temperature Index idea:**
- A single hot/cold/balanced score per ZIP
- Inputs: months_of_supply + DOM + sale_to_list + sold_above_list + off_market_in_two_weeks
- Balance of power (buyers vs sellers) adds the negotiation dimension

**Research questions:**
- What's the canonical weighting for a "market temperature" composite? (NAR/FHFA/Zillow research?)
- At what months_of_supply threshold does pricing power flip?

---

## Cluster C — Price Trajectory
**Datasets:** housing_market (median_sale_price) + rhpi
**Grain:** Metro monthly (RHPI) + ZIP monthly (median price)

RHPI is a repeat-sales index — cleaner than median price for tracking true appreciation.

**Ideas:**
- Median price + RHPI divergence = mix-shift signal (more starter vs luxury sales changing the median)
- ZIP-level median vs metro RHPI = relative value signal

---

## Cluster D — Access & Affordability
**Datasets:** starter_homes + financing_trends + ehs
**Grain:** Metro level only (no ZIP grain available)

**Ideas:**
- Starter home premium over time: is the entry point compressing or expanding?
- Cash buyer % rising = institutional pressure, not affordability-driven demand
- Financing_trends (loan type mix) → signals which buyer cohort is active

---

## Cluster E — Investment Signal
**Datasets:** investors + luxury
**Grain:** Metro level only

**Ideas:**
- Investor retreat early warning: when investor share drops sharply before price drops materialize
- Luxury vs starter divergence: two-tier market forming?

---

## Novel AI-Specific Ideas (beyond the user's initial concept)

### 1. Seller Distress Cascade Predictor
Train on 2018–2023 data: delistings surge → cancellations spike → price drops → eventual comp compression → median price decline. Predict the 3-month forward price direction per ZIP using the leading indicators. SWFL has a clear test case: Ian 2022.

### 2. Buyer Negotiation Coach (product feature)
For a given ZIP + asking price: "In 33908, 52.6% of sellers dropped price by avg 4.6%. Median DOM is 60 days. Your negotiation power is HIGH — start at 6% below list." Cite the exact data. No invention.

### 3. Market Regime Classifier
Unsupervised clustering of ZIPs by multi-dimensional behavior signature. Not just hot/cold — identify regimes like:
- "Zombie inventory" (high DOM, low sales, no price drops yet — sellers in denial)
- "Capitulation" (price drops accelerating, delistings peaking)
- "FOMO resurgence" (off-market-in-two-weeks rising, cancellations dropping)
- "Investor exit" (investor share dropping, luxury diverging)

### 4. SWFL Seasonal Deseasonalizer
Redfin publishes NSA (not seasonally adjusted) for many metrics. SWFL has extreme snowbird seasonality that distorts national seasonal adjustments. Build a SWFL-specific seasonal model from 7 years of ZIP data to publish "SWFL-SA" variants.

### 5. Micro-Market Fingerprinter
The neighborhood grain (700MB file) lets you distinguish behavior inside a ZIP. Cape Coral ZIP 33904 has canal-front, gulf-access, and inland blocks behaving very differently. Fingerprint neighborhoods by their price/DOM/drop profile and cluster into micro-market types.

### 6. Investor Exodus Early Warning
Cross investors (quarterly metro) + price_drops + delistings at ZIP level. When investor share drops AND price drops/delistings spike in the same ZIP → publish an early warning before retail buyers notice. Empirically: institutional investors got out of some Sun Belt ZIPs 12–18 months before price corrections.

### 7. Listing-to-Close Survival Model
Using historical rolling periods: what % of listings in a given DOM/price-drop cohort eventually close vs delist? Build a survival curve per market condition. Tells buyers: "at 90 DOM in this ZIP, 67% of listings delist without selling — make your offer now or it'll expire."
