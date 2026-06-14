# Industry Methodology Findings — Seller Stress Composites

Research conducted 2026-06-14 via live web fetch.

## Q1 — Does anyone publish a composite seller stress score?

**No. The gap is real and confirmed.**

No major vendor (Zillow, NAR, CoreLogic/Cotality, ATTOM, First American, ICE, Realtor.com, Redfin) publishes a product named or structured as a "seller stress" composite. The closest is:

- **Zillow Market Heat Index** — blends buyer demand signals WITH seller signals. Not a pure seller-stress score.
- **Realtor.com Hotness Score** — 50/50 (page views per listing vs. days on market). Buyer demand only, no seller-side signals.

**Cancellation rates are universally absent from all public composites.** Seller concession share is also absent. No vendor has built what we're building.

## Q2 — Weightings for price cuts vs. cancellations vs. inventory?

**Zillow Market Heat Index** (verified methodology at zillow.com/research/market-heat-index-methodology-34057/):
- Input 1: Zillow user page views on listings (demand signal)
- Input 2: Share of listings with a price cut (seller signal)
- Input 3: Share going pending within 21 days (velocity signal)
- Weights: equal-weight average of three inputs — explicitly stated
- Scale: 0–100 (≥70 strong seller / 55–69 seller / 44–55 neutral / 28–44 buyer / ≤27 strong buyer)
- National reading August 2025: 52

**Realtor.com Hotness Score**: 50% demand (views/listing) + 50% supply (days on market). No seller concession input.

**NAR**: No published composite. Uses separate 50-point diffusion indexes for buyer traffic and seller traffic — not combined.

**Key finding: no vendor has published a composite weighting cancellations.** This is our differentiation.

## Q3 — Measured lag between price cut surge and price decline?

**No vendor has published a calibrated lag coefficient.** Best available:

- **Dallas Fed real-time model**: implies 1–3 month lead for price cut share as same-quarter nowcast input
- **Practitioner observation (2022–2024 Sun Belt)**: 6–18 months from peak price-cut share to sustained median price softening — but no vendor has calibrated this empirically
- **Redfin delistings finding (Nov 2025)**: rising delistings suppress supply and prop prices UP in the short term (deadlock mechanism), then unlock a price correction when sellers capitulate. The two-phase dynamic is documented but not quantified.

## Q4 — Buyer's vs. seller's market thresholds

| Source | Buyer's Market | Balanced | Seller's Market |
|---|---|---|---|
| Zillow MHI | ≤27 | 44–55 | ≥70 |
| Redfin B/S ratio | >110 sellers per 100 buyers | 90–110 | <90 sellers per 100 buyers |
| NAR months supply | 6+ months | 5–6 months | 0–3 months |
| Zillow months supply | 7+ months | 5–7 months | <5 months |

## Key Differentiation Opportunities

1. **Cancellation rate as composite input** — nobody else includes it
2. **Seller-only composite** — Zillow's is a market balance index; ours is pure seller-side stress
3. **ZIP-level composite** — Zillow's MHI is not published at ZIP grain (requires their proprietary page views)
4. **Temporal lag mapping** — first to empirically measure delistings→cancellations→price_drops→price_decline lag in a specific market (SWFL has a clean natural experiment: pre/post Ian)
5. **SWFL-specific thresholds** — national thresholds are wrong for a 50% cash-buyer market; calibrate to SWFL's 2019–2021 baseline
