# Synthesis + Recommended Build Order

Research synthesized 2026-06-14 from 4 parallel Firecrawl agents.

---

## The Confirmed Gap: Nobody Has Built This

Every major vendor (Zillow, Redfin, NAR, CoreLogic, ATTOM, Realtor.com) tracks these signals separately. **Nobody publishes a composite seller stress score at ZIP level that includes cancellations.** Zillow's Market Heat Index is the closest but:
- Mixes buyer demand signals with seller signals
- Doesn't include cancellation rate (our strongest signal per Redfin's own data)
- Not published at ZIP grain
- Not SWFL-calibrated (their national thresholds are wrong for a 50% cash-buyer market)

This is a real moat. 7 years of ZIP-level data + cancellations + delistings + price drops = something nobody else has publicly.

---

## What the Research Says to Build First

### Priority 1 — Seller Stress Score (composite, ZIP-level)
**Confirmed no competitor has this at ZIP grain with cancellations included.**

Inputs (all already in Tier-1 parquet):
- `pct_active_with_drops` — price drops breadth (coincident)
- `avg_price_drop_pct` — price drops depth (lagging)
- `cancellation_rate_pct` — buyer exit rate (lagging, ~30-60 day lag to market conditions)
- `share_delisted_pct` — seller exit rate (LEADING — Redfin confirmed Sept 2025: delistings lead price unlock)
- `share_relisted_pct` — stale inventory recycling (coincident)

Starting weights (to be calibrated against Ian natural experiment):
- share_delisted: 0.30 (leading — most weight)
- pct_active_with_drops: 0.25
- cancellation_rate_pct: 0.25
- avg_price_drop_pct: 0.15
- share_relisted_pct: 0.05

Baseline: normalize against each ZIP's 2019–2021 average (pre-rate-shock, post-COVID distortion)

**SWFL calibration**: national Zillow thresholds (6 months supply = buyer's market) are wrong here. 50% cash buyers mean rate moves don't suppress demand the same way. Must calibrate to SWFL's own historical distribution.

### Priority 2 — Market Regime Classifier (Hidden Markov Model per ZIP)
**No competitor does this. Academic precedent solid (quant finance HMM is standard).**

4 regimes identified from the research:
1. **Seller's Market** — low supply, fast velocity, low drops
2. **Deadlock** — rising delistings but prices holding (the deadlock mechanism Redfin documented — delists suppress supply, prop prices)
3. **Capitulation** — delistings peaking, cancellations rising, price drops accelerating
4. **Recovery** — off-market-in-two-weeks rising, cancellations falling, new listings stabilizing

HMM gives transition probabilities, not just current state. "ZIP 33908 is in Deadlock with 68% probability of entering Capitulation in the next 2 periods."

7 years of SWFL data makes this trainable. Ian provides a labeled ground truth event.

### Priority 3 — Listing Survival Curves (Kaplan-Meier per ZIP)
**Opendoor built this internally. No public product.**

Given current market conditions in a ZIP, what's the probability a new listing closes within 30/60/90/120 days vs. delistings? Surfaces as: "In 33914 right now, 62% of listings delist without selling past 75 days — if you're buying, offer before day 60."

### Priority 4 — City + Neighborhood grain pipelines
**Confirmed: Cape Coral, Fort Myers, Naples, Bonita Springs, Estero, Lehigh Acres all present in city file.**
**Neighborhoods file confirmed at 700MB — need to spot-check SWFL neighborhood density.**

Enables sub-ZIP analysis: canal-front Cape Coral vs inland Cape Coral behave completely differently inside the same ZIP code.

### Priority 5 — Condo Segment Tracker (SWFL-specific)
**Research confirms condo is a separate market that needs separate tracking.**

Collier condo months-supply: 0.6 (Dec 2021) → 14.6 (April 2025). SB 4-D broke it.
The Redfin data cuts by property type — filter to `Condo` + `Townhouse` separately from `Single Family`.
This is a SWFL-specific brain, not a national feature.

---

## What NOT to Build (Yet)

- **Balance of Power, Luxury, Investor, Starter Home** — only at census region or metro level. Cape Coral/Naples metros are present but these are context signals, not ZIP-grain moat
- **Weekly pipelines** — weekly metro files exist but Redfin's own methodology notes that weekly data at metro level has high noise. Monthly ZIP is more reliable for direction signals.
- **RHPI** — 0.7MB metro-only file. Useful context but not differentiated vs FHFA ZIP-level HPI (already in roadmap)

---

## SWFL-Specific Adjustments (Critical)

From the SWFL dynamics research:

1. **~50% cash buyer rate** → rate sensitivity is muted; don't use national rate-sensitive models
2. **Ian (Sept 2022) = labeled distress event** → use as training/validation anchor for all models
3. **Condo segment is broken separately from SFH** → always cut by property type
4. **Snowbird seasonality** → peak Nov–Apr, trough May–Sep; must deseasonalize before any trend signal
5. **Canal tier = sub-ZIP micro-markets** → neighborhood grain is load-bearing for Cape Coral analysis
6. **Insurance premium shock ongoing** → suppress optimistic signals in flood-exposed ZIPs (we already have NFIP AAL per ZIP)

---

## Build Queue Recommendation

| # | What | Why first |
|---|---|---|
| 1 | Seller Stress Score brain (`seller-stress-swfl`) | Confirmed gap, data already in Tier-1, direct user ask |
| 2 | Housing market new-format pipeline (`housing_market/monthly/all_zips.csv`) | Replaces old 1.5GB gzipped tracker with cleaner 567MB CSV |
| 3 | City-level pipelines (all 4 datasets × city grain) | Enables Fort Myers/Naples/Cape Coral city-level brains |
| 4 | Regime classifier (HMM) | Novel, no competitor, 7yr data makes it buildable |
| 5 | Condo segment filter (property_type split in existing pipelines) | SWFL-specific, confirmed broken segment |
| 6 | Neighborhood grain pipelines | Sub-ZIP canal analysis, requires spot-check first |
