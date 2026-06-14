# SWFL Housing Market Dynamics — Research Findings
**Date:** 2026-06-14
**Purpose:** Understand Lee + Collier County structural divergence from national housing models before wiring Redfin data into the lake.

---

## Key Stats Table (most recent sourced data)

| Metric | Value | Date | Source |
|---|---|---|---|
| Cape Coral avg home value (Zillow ZHVI) | $338,328 (-6.8% YoY) | May 2026 | https://www.zillow.com/cape-coral-fl/home-values/ |
| Lee County median SFH sale price | $395,000 (-5.5% YoY) | March 2025 | Florida Realtors / SWFLAMLS |
| Lee County active SFH listings | 9,997 (+35.5% YoY) | March 2025 | Florida Realtors |
| Lee County active listings total (FRED) | 14,298 | May 2026 | https://fred.stlouisfed.org/series/TOTLISCOU12071 |
| Lee County months supply (SFH) | 9.0 months | March-April 2025 | Florida Realtors / HUD CHMA |
| Lee County days on market | 82 avg (up from 69 in 2024) | May 2025 | Worthington Realty |
| HMA avg SFH/TH price (HUD) | $525,900 (-3% YoY) | 12 mo ending Apr 2025 | HUD CHMA May 2025 |
| HMA avg condo price | $415,900 (-8% YoY) | 12 mo ending Apr 2025 | HUD CHMA May 2025 |
| HMA condo months supply | 14.6 months | April 2025 | HUD CHMA May 2025 |
| HMA total home sales | 20,500 (-9% YoY, 3rd consecutive decline) | 12 mo ending Apr 2025 | HUD CHMA May 2025 |
| HMA median homeowner insurance premium | $3,249/yr (+72% since 2020) | 2023 | NBER estimates, cited in HUD CHMA |
| Florida condo inventory statewide | 74,241 (+37% YoY) | June 2025 | https://www.trustetc.com/blog/2025-condo-crisis/ |
| HMA apartment vacancy | 9.7% | Q1 2025 | CoStar, cited in HUD CHMA |
| HMA avg apartment rent | $1,861/mo (-3% YoY) | Q1 2025 | CoStar, cited in HUD CHMA |
| SWFL annual visitors | 3.20 million | 2024 | Visit Fort Myers 2024 Visitor Tracking Study |
| Cash-buyer share (SFH / condo) | ~50% / ~70% | Late 2024-2025 | https://coconutcoastrealtors.org/southwest-florida-real-estate-2024-2025-a-data-driven-market-rebalance-in-lee-collier-counties/ |

---

## Q1 - Post-Ian Lee County Price/Inventory Timeline

Primary source: HUD Comprehensive Housing Market Analysis, Cape Coral-Fort Myers FL, May 1, 2025.
Full PDF: https://www.huduser.gov/portal/publications/pdf/CapeCoralFortMyersFL-CHMA-25.pdf

### Pre-Ian surge (2020-Q1 2022)
- Home sales +20%/year, reaching 25,800 sold annually. Average price +18%/year. Mortgage rate ~3.0%.
- Q1 2022: Cape Coral-Fort Myers HPI hit 41.3% annual appreciation -- highest in the nation that quarter.
  Source: https://www.riskwire.com/cape-coral-fort-myers-housing-market-after-hurricane-ian/

### Ian impact + rate shock (late 2022-2023)
- Hurricane Ian (Sept 29, 2022) caused widespread damage, disrupted net in-migration, triggered insurance shock.
- Home sales fell average 17%/year, bottoming at ~17,900 sold in 2023 (from 25,800 peak).
- Dual cause: Ian disruption + mortgage rate spike from ~3% to ~7%.
- Lee County median dropped estimated 15-20% immediately post-Ian.
  Source: https://www.ownluxuryhomes.com/markets/florida/research-indices/florida-hurricane-value-recovery-index

### 2023-2025 slow bleed
- Avg SFH/TH price: +2% in 2023, then -3% to $525,900 in 12 mo ending April 2025.
- Avg condo price: -8% to $415,900 in 12 mo ending April 2025.
- Total sales -9% YoY -- third consecutive annual decline.
- Cape Coral Zillow ZHVI (May 2026): $338,328, down 6.8% YoY.
- Fort Myers Beach: still recovering 36+ months post-storm as of late 2025.
  Source: https://www.ownluxuryhomes.com/markets/florida/research-indices/florida-hurricane-value-recovery-index

### Academic references
- FHFA study (2024): https://www.fhfa.gov/blog/fhfa-statistics/measuring-price-effects-from-disasters-using-public-data-a-case-study-of-hurricane-ian
  Also: https://www.tandfonline.com/doi/full/10.1080/08965803.2024.2391213
- ProQuest dissertation -- Disparities in Housing Recovery: A Comparative Study of Primary and Seasonal Housing in Lee County, Florida After Hurricane Ian:
  https://search.proquest.com/openview/1d9f4531c5d430ad53bafb76418d01a1/1
  Finding: measurably different recovery rates between primary vs. vacation/seasonal housing stock.

### Bottom line
No crash to pre-pandemic levels. Market is structurally weak (3 straight years of volume decline, inventory 2-3x equilibrium) driven by: rate shock + insurance shock + Ian demand disruption + condo-law overlay. Recovery is slower than comparable hurricane markets because the insurance and condo-law issues are ongoing costs, not one-time shocks.

---

## Q2 - Florida Condo Special Assessment / Inspection Law

Trigger: Partial collapse of Champlain Towers South (Surfside), June 2021.
Laws: Florida SB 4-D (2022) + SB 154 (2023) -- mandatory structural integrity inspections + minimum reserve funding for condos 3+ stories.

### Market impact (HUD CHMA May 2025, direct quote)
"New building safety laws and regulations for condominium associations were enacted in Florida in 2022 and 2023, requiring structural integrity inspections and sufficient financial reserves for potential major repairs... The new rules have significantly increased HOA fees and added special assessment fees... contributing to reduced affordability of condominiums and a substantial decline in condominium sales."

### Volume collapse (all from HUD CHMA)
- Condo sales: -30%/year on average in 2022 and 2023, then -19% in 12 mo ending April 2024, then -19% again in 12 mo ending April 2025.
- Condo months-of-supply: 14.6 months in April 2025 (was 9.0 a year prior; was 0.6 months at the December 2021 low).

### Statewide inventory surge
- Florida condo inventory: 54,142 in June 2024 to 74,241 in June 2025 (+37% in one year).
  Source: https://www.trustetc.com/blog/2025-condo-crisis/

### Financing blockage
- Mortgage companies blocking financing for buildings with unresolved inspection/assessment issues.
  Source: https://www.reddit.com/r/REBubble/comments/1ljryrc/ (reports of $100k+ per-unit assessments)
- Law firm advisory (Jan 2025): https://www.bilzin.com/insights/publications/2025/01/florida-condo-owners-will-pay-more-in-2025

### DATA GAP
No published count of total affected condo units found. FGCU RERI quarterly reports (https://www.fgcu.edu/reri) most likely hold SWFL-specific unit counts.

---

## Q3 - Insurance-Driven Delistings / Uninsurable Homes

### Premium trajectory (HUD CHMA May 2025 citing NBER)
- Median annual homeowner insurance premium: $1,886 in 2020 to $3,249 in 2023 (+72%).

### Individual examples (Reddit r/capecoral)
- Reported trajectory: $700 (2015) to $5,200 (peak) to $4,546 (2023) to $3,956 (2024) to $3,834 (2025).
  Source: https://www.reddit.com/r/capecoral/comments/1fevpl6/

### Price elasticity estimate
- "For every 10% increase in homeowners insurance cost, home prices declined by 4.6%."
  Source: https://ourfinancialsecurity.org/resources/propertyinsurancepremiums2025report/
  Implication: 72% premium increase implies ~33% price suppression pressure.

### Insurer market exit post-Ian
- Multiple insurers exited Florida after Ian: https://grist.org/housing/florida-insurance-farmers-desantis-hurricane-ian-litigation/
- Florida DFS Stability Report (Jan 2025): https://floir.gov/docs-sf/default-source/property-and-casualty/stability-unit-reports/january-2025-isu-report.pdf
- Realtor.com 2025 Climate Risk Report: https://www.realtor.com/research/climate-risk-2025/

### DATA GAP (confirmed)
No published count of homes delisted due to uninsurability found in any source. This stat is not tracked or published. Market signal appears in volume decline + inventory rise + rising days-on-market. A Redfin custom analysis or CoreLogic climate risk dataset would be needed to approximate this number.

---

## Q4 - Snowbird Seasonality

### Visitor scale (HUD CHMA May 2025)
- HMA: 3.20 million visitors in 2024 (up from 2.98 million in 2023), concentrated in winter months.
  Source: Visit Fort Myers 2024 Visitor Tracking, Occupancy and Economic Impact Study, cited in HUD CHMA.
- Leisure and hospitality + retail trade = 27% of nonfarm payrolls in the HMA.

### Seasonal demand window
- Peak: November through April. Trough: May-September.
  Source: https://www.quintessentialnaples.com/blog/883/Naples%2C+Florida+Housing+Market%3A+Hidden+Seasonal+Patterns+Revealed (Nov 2025)

### Buyer profile -- strongest seasonality proxy
- Cash-buyer share: ~50% of SFH sales, ~70% of condo sales.
- First-time buyers: only ~21% of SWFL purchases.
- Repeat/investor/retirement buyers: ~79%.
  Source: https://coconutcoastrealtors.org/southwest-florida-real-estate-2024-2025-a-data-driven-market-rebalance-in-lee-collier-counties/

### Post-Ian differential
- Measurably different recovery rates between primary and seasonal housing stock.
  Source: ProQuest dissertation: https://search.proquest.com/openview/1d9f4531c5d430ad53bafb76418d01a1/1

### DATA GAP (partial)
No published volume multiplier found. Quantified seasonal index likely in FGCU RERI quarterly reports or SWFLAMLS raw data. The ~50% cash-buyer share rules out the rate-sensitive first-time buyer as the primary demand driver -- SWFL demand is structurally less sensitive to mortgage rate moves than national models assume.

---

## Q5 - Investor Concentration in Cape Coral

### Canal system as investor driver
- Cape Coral: ~400 miles of navigable canals -- largest network in the world. Canal tiers (direct Gulf access vs. indirect vs. freshwater) create 3-4 distinct value/yield tiers within single ZIPs.
  Source: https://nixandassociates.com/blog/cape-coral-waterfront-investments-for-income-buyers (2026)

### Investor demand signals
- Cape Coral: "one of Florida's more compelling real estate markets for investors" in 2026.
  Source: https://www.noradarealestate.com/blog/cape-coral-housing-market-2026-where-investors-are-finding-the-best-deals/
- Median rents peaked ~$2,500-$2,600 in mid-2022, now softened.
  Source: https://www.biggerpockets.com/forums/921/topics/1273369-last-market-update-2026-cape-coral-ft-myers-swfl
- October 2025 recovery: prices +3.4%, pending sales +68%, inventory tightened to 6.1 months.
  Source: https://worthingtonrealty.com/cape-coral-real-estate-market-update-november-2025/
- STR/rental investment analysis: https://www.margpm.com/the-future-of-rental-property-investment-in-cape-coral (Sept 2025)

### DATA GAP (confirmed)
No sourced investor-ownership percentage for Cape Coral found. The ~50% cash-buyer rate for Lee County SFH is the best available proxy. CoreLogic or ATTOM investor-purchase-flag analysis would give a direct ownership-share figure.

---

## Structural Factors That Make SWFL Diverge from National Models

Five confirmed divergences, in order of data confidence:

**1. Insurance as an ongoing demand suppressor**
Median premium up 72% in 3 years to $3,249/yr. Elasticity estimate: -4.6% price per +10% premium increase implies meaningful price suppression from insurance alone. National housing models do not account for this.
Source: HUD CHMA + NBER estimates + https://ourfinancialsecurity.org/resources/propertyinsurancepremiums2025report/

**2. Condo segment is functionally broken**
14.6 months supply, -8% YoY price, -19% YoY volume after two prior years of -30%/yr. Driven by a Florida-specific law with no national analog. Any aggregate model blending condo + SFH produces a distorted read. The segments must be tracked separately.

**3. Hurricane shock creates a multi-year tail, not a one-time event**
Ian (Sept 2022) reset insurance markets, in-migration expectations, and demand psychology. Fort Myers Beach still not recovered 36+ months later. The bounce-back pattern seen in other disaster markets does not apply because the insurance crisis is an ongoing cost shock.

**4. Seasonality suppresses mortgage-rate sensitivity**
With ~50% cash buyers and ~79% repeat/retirement buyers, SWFL demand is structurally less sensitive to the Fed than national models assume. Rate-driven demand models will systematically overestimate SWFL response to rate cuts.

**5. Volume leads, price lags**
Third consecutive year of volume decline with prices only moderately below peak. In a cash-buyer-dominated market where sellers do not need to move, volume and price decouple. Volume is the early signal; price will follow if volume stays depressed. National models calibrated on rate-sensitive markets will misread SWFL timing.

**Bonus: Cape Coral canal-front is 3-4 sub-markets, not one**
The canal tier structure creates distinct price and yield tiers within single ZIP codes. County-level or even ZIP-level hedonic models produce noise when applied to Cape Coral.

---

## Source Quality Notes

| Source | Quality | Notes |
|---|---|---|
| HUD CHMA May 2025 | Most authoritative | Covers Lee + Charlotte counties MSA; cites CoStar, NBER, FHFA, Florida Realtors, Visit Fort Myers. PDF: https://www.huduser.gov/portal/publications/pdf/CapeCoralFortMyersFL-CHMA-25.pdf |
| Zillow ZHVI (May 2026) | Most current price signal | City-level Cape Coral; monthly update |
| FRED TOTLISCOU12071 | Most current inventory signal | Lee County specifically; weekly update |
| FGCU RERI | Best local academic source | https://www.fgcu.edu/reri -- requires navigating internal links; quarterly SWFL-specific reports |
| Florida Realtors | County-level monthly | Requires MLS login for full downloads |
| Coconut Coast Realtors | Useful local brokerage data | SWFLAMLS-based; good for seasonal buyer-type breakdowns |
| FHFA Ian study (2024) | Academic, FHFA-sourced | Best methodological treatment of Ian price effects |