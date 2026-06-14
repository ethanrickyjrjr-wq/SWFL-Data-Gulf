# Housing Market Signal Detection: Algorithm Findings

Researched: 2026-06-14. Sources fetched and read in-session — no training-data memory.

---

## 1. Delistings as a Market Stress Signal

**What the signal is:** Count (or rate) of active listings taken off the market without selling or going under contract. Redfin defines a "delisting" as a home that goes off market for more than 31 days without selling or going pending/contingent.

**How it is computed (Redfin):**
- Raw count: homes removed from active status, no sale or pending flag, >31-day gap before reappearing.
- Rate: `delistings / total active listings` in the same period (reported monthly, lagged one month).
- Stale-listing threshold companion signal: a listing is "stale" if active >=60 days without going under contract. Redfin Sept 2025: 70% of all U.S. listings were stale; the typical delisted home had been on market 100 days before the seller pulled it.
- Re-list rate: 1-in-5 (20%) of delisted homes re-list within 3 months. Of those re-listed, 31.6% eventually sell. Redfin uses this to identify "strategic delistings" (sellers gaming the DOM counter) separate from genuine exit.

**What it predicts:**
- Delistings are a coincident-to-leading signal of price pressure relief. Redfin Sept 2025: delistings up 28% YoY while prices were still up ~2% YoY. Key finding: delistings suppress realized supply, propping prices above what demand fundamentals would suggest. Rising delistings do not immediately predict price drops; they explain why prices stay elevated despite weak demand by keeping true supply lower than the headline active count.
- Surge in delistings preceded market regime shift: delistings started rising spring 2024, peaked at 39% YoY growth June 2025 — roughly 12-18 months before the market would fully tip to buyer-favoring in some metros.
- Realtor.com (Nov 2025): delisting rate ~6% of all active listings monthly from June 2025 onward; highest national delisting rate since Realtor.com began tracking this metric in 2022.

**Source URLs:**
- https://www.redfin.com/news/delistings-jump-sellers-pull-homes-off-market/ (Redfin, Nov 2025)
- https://www.realtor.com/news/trends/delistings-surge-sellers-miami-denver-houston-november-2025-report/ (Realtor.com, Dec 2025)
- https://www.cbsnews.com/news/home-delistings-rise-as-sellers-hold-out-on-price-cuts/

---

## 2. Contract Cancellations as a Coincident Demand Signal

**What the signal is:** Share of homes under contract that fall out of escrow before closing. Realtor.com tracks this monthly as "contract cancellation rate" = failed sales / total contracts that month.

**How it is computed (Realtor.com):**
- Numerator: listing-status changes from pending/contingent back to active or withdrawn without a recorded sale.
- Denominator: total contracts executed (gone pending) in the same period.
- February 2026 rate: 7.2% nationally (down from 7.4% a year earlier). December 2025 peak: ~16.3% (~40,000 cancellations in one month).

**What it predicts:**
- Coincident signal of buyer confidence/stress, not a leading indicator of price. High cancellations typically reflect: (a) buyers unable to secure financing at agreed-upon price, (b) inspection contingencies exercised as buyers find leverage, (c) cold feet on overpriced properties.
- Realtor.com finds the cancellation rate loosely tracks mortgage rate spikes with a 30-60 day lag.
- Relationship to delistings: rising cancellations + rising delistings together signal a "market deadlock" — sellers unwilling to cut, buyers unwilling to close. This is the precursor state before price corrections materialize.

**Source URLs:**
- https://www.realtor.com/news/trends/home-contract-cancellations-edge-down-february-2026/ (Realtor.com, March 2026)
- https://www.realestatenews.com/2026/01/27/buyers-backed-out-of-deals-at-a-record-rate-last-month (Jan 2026)

---

## 3. Months of Supply: Regime Classification Thresholds

**What the signal is:** Active inventory / monthly sales pace. The canonical buyer-vs-seller boundary published by NAR and echoed across industry.

**How it is computed:**
- `months_of_supply = active_inventory / trailing_12_month_avg_monthly_sales`
- NAR published thresholds: 0-3 months = seller market; 3-6 months = balanced/neutral; 6+ months = buyer market.
- Zillow version: "A balanced market has five to seven months of inventory" — slightly wider neutral band than NAR 3-6.

**What it predicts:**
- Regime classifier, not a price direction predictor per se. Markets below 3 months historically correlated with YoY price appreciation; markets above 6 months with flat or negative YoY appreciation.
- Year-over-year change in supply is often more informative than the absolute level (a market moving from 2 to 4 months is shifting regardless of which side of 3 it sits on).
- [INFERENCE] The rate of change in months of supply (first derivative) may be a better leading indicator than the level itself. No published formula for supply-rate-of-change as a predictor was found in this session.

**Source URLs:**
- https://www.zillow.com/learn/buyers-or-sellers-market/ (Zillow, May 2026) — "balanced market = 5-7 months"
- https://www.defalcorealty.com/blog/months-of-supply-explained-buyers-sellers-market-ny-nj/ — cites NAR 0-3/3-6/6+ thresholds

---

## 4. Zillow Market Heat Index (MHI): Published Composite Methodology

**What the signal is:** A 0-100 index measuring market competitiveness, published by Zillow Research for ~250 metros. Higher = more seller-favoring.

**How it is computed — Zillow published methodology:**
Source: https://www.zillow.com/research/market-heat-index-methodology-34057/

Three input components, each normalized and combined (exact weighting formula not published):

1. **User engagement on Zillow active listings** — measures how many users are viewing/favoriting each listed home. A leading indicator of housing demand. Low engagement = buyers pulling back.

2. **Share of for-sale listings with a price cut** — high percentage means sellers are frequently reducing prices (cooling market). Low percentage = sellers can hold or raise prices (hot market).

3. **Share of for-sale listings going pending within 21 days** — market speed signal. High = fast-moving (hot). Low = slow-moving (cold).

**Score interpretation (Zillow published thresholds):**
- 70+ = strong seller market
- 55-69 = seller market
- 44-55 = neutral market
- 28-44 = buyer market
- 27 or below = strong buyer market

**What it predicts:**
- Real-time market temperature reading, not a forward-looking price predictor. Most useful for cross-market comparison and trend direction (MoM, YoY change in score).
- As of April 2026: 54 of 100 largest metros scored in seller-market range; 8 in buyer-market range. Florida metros (Cape Coral, North Port, Deltona, Jacksonville, Miami) are the buyer-side outliers — consistent with SWFL data.

**Non-disclosure note:** Exact weighting of the three components is not published. Scores are relative — good for cross-market and time-series comparison, not absolute calibration.

**Source URL:** https://www.zillow.com/research/market-heat-index-methodology-34057/

---

## 5. Listing Survival Analysis: Cox Proportional Hazard Model for Days on Market

**What the signal is:** Probability that a listing survives (remains unsold) as a function of time and covariates. Used by academics and Opendoor to model time-to-sale and identify which listing characteristics increase/decrease sale probability.

**Cox Proportional Hazards (Cox PH) model — standard form:**
- Target variable: days on market (TOM) — a censored time-to-event variable.
- Model form: h(t) = h0(t) * exp(b1*X1 + b2*X2 + ...) where h0(t) is the baseline hazard (unspecified shape) and X's are covariates.
- Key covariates in published studies: list price tier, number of prior price reductions, crime rate, school proximity, bedroom/bath count, current list price as time-varying feature.
- Delistings and active-but-unsold listings are censored observations — they contribute to the hazard function without a terminal event. Dropping them (naive regression) introduces systematic downward bias in predicted TOM for risky/slow homes.

**Opendoor published framework (2019, David Lundgren):**
- Reframed Cox PH as discrete-time classification: expand each listing into listing-day pairs; each day on market without selling = negative example; sale day = positive example; delisted/active = censored.
- Hazard rate = P(sell on day t | survived until day t). Converts to expected TOM via: P(sell on day t) = hazard(t) * P(survived days 1..t-1).
- Allows time-varying features: current list price, number of active competing listings, seasonal dummies.
- Market-level interpretation: mean of P(sell tomorrow) across all active listings = inventory turnover rate (clearance rate) — direct mapping to months of supply.

**Wiley / Journal of Financial Research — Recurrent Price Reductions (Kryzanowski & Wu, 2023):**
- Used a joint frailty model (extension of Cox PH) to handle recurrent events (multiple price reductions per listing) and the terminal event (sale).
- Key finding: recurrent price reductions send a negative signal — listings with frequent price cuts are less likely to sell. The negative signaling dominates the impatience signaling. However, when discounted homes do sell, they sell at a higher ratio of sold price to last list price.
- Implication: number-of-price-cuts is a negative predictor of sale probability. More cuts = stigmatized listing, not motivated seller.

**McMullen (Twin Cities Cox PH study):**
- Kaplan-Meier curves: highest-price homes had longest TOM; mid-price homes sold fastest; cheapest homes intermediate (quality signal matters alongside price).
- Survival differences by price tier minimal in first 30 days, maximum around 90 days, narrowing past 150 days — the 60-90 day window is the peak differentiation zone.
- School proximity HR approx 0.701 (30% hazard reduction) but not statistically significant after controlling for price. Crime rate and list price were significant.

**Source URLs:**
- https://www.opendoor.com/articles/liquidity-modeling-real-estate-survival-analysis (Opendoor, 2019)
- https://onlinelibrary.wiley.com/doi/10.1111/jfir.12308 (Kryzanowski & Wu, Journal of Financial Research, 2023)
- https://nickmcmullen.github.io/Final_Draft_1.pdf (McMullen, Twin Cities Cox PH study)

---

## 6. Foreclosure Auction Sales Rate as a Leading Indicator

**What the signal is:** Rate of homes sold to third-party investors at public foreclosure auctions, month over month. Published by Auction.com from their proprietary dataset (~434,000 properties over 7 years).

**How it is computed (Auction.com / Scotsman Guide analysis):**
- Numerator: homes sold to third-party investors (non-lender, non-occupant) at foreclosure auctions.
- Denominator: total homes brought to auction in same period.
- Compared YoY to control for seasonality.

**What it predicts:**
- Leading indicator of broad market price appreciation, 1-2 months ahead:
  - Foreclosure auction sales rate dropped 10% YoY in Sept 2013; home price appreciation began decelerating in Nov 2013 (2-month lead).
  - Auction sales jumped 23% in Feb 2015; price appreciation inflected upward in March 2015 (1-month lead).
  - Same pattern repeated in 2016 and 2018.
- Mechanism: investor demand at distressed auctions is a proxy for smart-money confidence in the residential market. When investors pull back, they are pricing in weakening near-term conditions.
- Note: most useful during periods of elevated foreclosure activity. Less relevant in normal low-foreclosure markets.

**Source URL:** https://www.scotsmanguide.com/residential/distressedproperty-demand-is-a-leading-housin/

---

## 7. Price Cut Share as a Leading Price Direction Indicator

**What the signal is:** Percentage of active listings that have had at least one list-price reduction from original list price.

**How it is computed:**
- count of active listings where current_price < original_list_price / total active listings. Published by Redfin, Zillow, and Realtor.com at metro and ZIP level.
- Zillow uses this as one of three inputs to the Market Heat Index (see Section 4) but does not publish a standalone predictive model using this input alone.

**What it predicts:**
- Rising price cut share is a leading indicator of median price deceleration (not necessarily median price decline). Price cuts in individual listings precede changes in the median transaction price by 1-3 months.
- CBS News notes the ratio of delistings to listings as the key "deadlock indicator" — when delistings exceed price cuts, sellers are choosing exit over negotiation, which suppresses supply rather than clearing the market at lower prices. This ratio captures market stubbornness.

**Source URLs:**
- https://www.zillow.com/research/market-heat-index-methodology-34057/ (Zillow MHI input)
- https://www.cbsnews.com/news/home-delistings-rise-as-sellers-hold-out-on-price-cuts/

---

## 8. Academic Leading Indicators Paper: Abstract Only (Paywall)

**Citation:** ScienceDirect, 2023
https://www.sciencedirect.com/science/article/abs/pii/S1057521923002818

**What is accessible:** Abstract states "We argue that financial risk managers should focus more strongly on developing forward-looking early warning indicator systems for the North American housing market." The paper develops leading indicators for the US housing market targeting financial risk managers.

**What is not available:** Specific indicators, weighting, validation results. Abstract only. No usable formula accessible without a subscription.

---

## 9. Composite Distress Scoring: Published Practice vs. Inference

No single published "Housing Market Distress Index" with a disclosed composite formula was found from Zillow, Redfin, NAR, or FHFA in this research session.

**What major platforms actually publish:**
- Zillow: Market Heat Index (three components, weights undisclosed)
- Redfin: separate metrics (delistings rate, stale listing rate, cancellation rate) reported monthly, not combined into a composite
- NAR: Pending Home Sales Index (volume indicator), Housing Affordability Index — not distress composites
- Realtor.com: monthly trend reports combining inventory, median list price, DOM, cancellation rate — descriptive, not a composite index

**[INFERENCE] Defensible composite from cited signals:**

Based on the sourced findings, the following signals have direct published causal mechanisms and appropriate lag structures:

| Signal | Lag to price | Direction | Data source |
|--------|-------------|-----------|-------------|
| Delisting rate (pct of active) | 1-3 months lead (supply suppression) | Rising = prices elevated despite weak demand | Redfin monthly |
| Price cut share (pct of active) | 1-3 months lead (price deceleration) | Rising = median price decelerating | Zillow/Redfin monthly |
| Pending-in-21-days share | Coincident to 1-month lead | Falling = velocity drop precedes price pressure | Zillow MHI component |
| Cancellation rate (pct of contracts) | Coincident | Rising = buyer stress, stalled market | Realtor.com monthly |
| Days on market (median) | Coincident to 1-month lead | Rising = supply absorbing slower | FRED/Redfin/Zillow |
| Months of supply | Regime classifier | Absolute level sets regime; rate of change is leading | NAR/Zillow |

A simple z-score composite (each signal normalized to its own trailing 12-month distribution, then averaged) would yield a dimensionless score. Zillow's 0-100 approach suggests they normalize and weight, but the exact method is not public.

---

## 10. Lag/Lead Relationships Summary (Sourced)

| Leading signal | Lagging outcome | Published lag |
|----------------|----------------|---------------|
| Foreclosure auction investor sales rate (YoY change) | Broad market price appreciation (YoY) | 1-2 months (Scotsman Guide / Auction.com, 2019) |
| Delisting rate rising >1 year | Market regime shift (buyer market) | ~12-18 months (Redfin: spring 2024 rise, buyer markets in FL by late 2025) |
| Price cut share rising | Median transaction price deceleration | 1-3 months (Zillow MHI: price cuts as leading component) |
| Rising contract cancellations after rate spike | Further softening of pending sales | 30-60 days (Realtor.com, inferred from rate-spike to cancellation correlation) |

Note: "1-3 months" leads are best estimates from narrative descriptions in cited articles. Precise lag quantification from a multivariate regression was not found in any public source in this session.

---

## 11. Key Methodological Gaps (Not Publicly Available)

1. **Exact weighting of Zillow MHI components** — Zillow publishes the three inputs but not their relative weights or normalization method.
2. **Redfin distress composite** — Redfin does not combine delistings, stale rate, and price cuts into a single index; they publish them separately.
3. **Precise lag distributions for delistings-to-price** — the Redfin articles use narrative descriptions; no regression table published publicly.
4. **Academic leading indicators paper (ScienceDirect 2023)** — paywalled; abstract only.
5. **NAR distress index** — NAR does not publish a combined stress signal; their research page covers volume/price/affordability metrics only.
