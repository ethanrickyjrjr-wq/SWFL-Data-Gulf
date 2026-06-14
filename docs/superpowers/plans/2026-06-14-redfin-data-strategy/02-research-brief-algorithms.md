# Research Brief: Best Algorithms for Housing Market Signal Detection

## What We're Looking For

We have 7 years of monthly ZIP-level data for SWFL (126 ZIPs) covering:
- Price drops (pct active, avg size, count)
- Contract cancellations (rate, count)
- Delistings & relistings (share delisted, share relisted)
- Full housing market tracker (price, DOM, inventory, months_of_supply, pending, sold_above_list)

We want to know:

1. **Composite Seller Stress Scores** — is there academic/industry research on optimal weighting of price_drops + cancellations + delistings into a single distress index? What do NAR, Zillow Research, FHFA, CoreLogic publish?

2. **Leading vs Lagging Indicators** — empirically, which signals LEAD price movements by the most months? Is the delistings→cancellations→price_drop cascade documented? What's the typical lag?

3. **Market Regime Classification** — papers on unsupervised clustering of housing markets by multi-dimensional behavior. "Zombie inventory," "capitulation," "recovery" regimes. Any published ML approaches?

4. **Seasonal Adjustment for Local Markets** — Redfin publishes NSA metrics. How do you build a local seasonal adjustment model from rolling-period data? X-13ARIMA-SEATS? STL decomposition? What's best for a small metro with 126 ZIPs?

5. **Survival Analysis for Listings** — has anyone published a Cox PH model or similar for listing survival (close vs delist) as a function of DOM, price drop history, market conditions?

## Search Queries to Run

- "housing market distress index methodology price drops cancellations"
- "real estate leading indicators price drops delistings cancellations academic"
- "housing market regime classification machine learning clustering"
- "seasonal adjustment housing data small metro STL X13 methodology"
- "listing survival analysis days on market Cox proportional hazard real estate"
- site:zillow.com/research "price cuts" OR "cancellations" methodology
- site:redfin.com/news "methodology" cancellations OR delistings
- "seller stress index" housing OR "seller concession index"
- FHFA OR NAR "leading indicator" housing market price prediction
- "inventory turnover" housing "months of supply" threshold buyers sellers market

## Sources to Prioritize

- Zillow Research (zillow.com/research)
- Redfin Data Center methodology pages
- NAR Research (nar.realtor/research-and-statistics)
- FHFA (fhfa.gov/data)
- CoreLogic Insights blog
- NBER working papers on housing
- Journal of Real Estate Finance and Economics
- Harvard Joint Center for Housing Studies
