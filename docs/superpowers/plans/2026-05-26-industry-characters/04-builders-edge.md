# Voice 04 — Builder's Edge (Development Pipeline)

## Audience

General contractors, civil engineers, land-use attorneys, construction lenders evaluating development opportunity on a specific SWFL corridor.

## Priority

**4 — strong data, actionable.** All data sources live. No new pipes required.

## Data Sources (all live)

| Brain / Lake Table     | Signal                                                              |
| ---------------------- | ------------------------------------------------------------------- |
| `permits-swfl`         | Permit volume by bucket, QoQ direction, corridor saturation Z-score |
| `traffic-swfl`         | AADT + 5-yr CAGR (infrastructure capacity signal)                   |
| `properties-lee-value` | LeePA parcel sales velocity (land moving = demand signal)           |
| `rentals-swfl`         | ZORI demand signal (multifamily feasibility)                        |
| `macro-us`             | SOFR (financing window)                                             |
| `sector-credit-swfl`   | NAICS 23 (construction) CDR                                         |

## Fact Pack Shape

```typescript
{
  commercial_permits_6mo: MetricFact; // permits-swfl
  commercial_permits_direction: MetricFact; // trailing vs. prior 6mo delta
  permit_saturation_zscore: MetricFact; // permits-swfl Z-score
  leepa_parcel_sales_velocity: MetricFact; // properties-lee-value
  zori_demand: MetricFact; // rentals-swfl
  sofr_rate: MetricFact; // macro-us
  construction_cdr_naics23: MetricFact; // sector-credit
  aadt_yoy_pct: MetricFact; // traffic-swfl
}
```

## Web Query Template

```
Development pipeline and construction market summary for {corridor_name}, Southwest Florida.

1. ACTIVE PERMITS AND ENTITLEMENTS (2024-2026): Commercial, mixed-use, or multifamily
permit activity on or near this corridor. Planning-board approvals, rezoning actions,
or PUD amendments.

2. LAND MARKET: Recent land sales, parcel assemblages, or raw land price trends adjacent
to this corridor. LeePA or Collier Appraiser records if available.

3. CONSTRUCTION COST AND CREDIT CONDITIONS: Current construction lending rates (SOFR
context), material cost trends, or contractor availability issues in SWFL 2025-2026.

4. COMPETITIVE PIPELINE: Major projects under construction or in entitlement within 1 mile.

Cite each figure to its primary source (county, FDOT, broker, SBA).
```

## Additional Allowed Domains

- `nabop.com` (NAIOP reports)

## System Prompt Preamble

> "You are writing for a general contractor, land-use attorney, or construction lender evaluating development opportunity. Lead with permit momentum and SOFR context. LeePA parcel velocity is the primary land-market signal."

The hard contract (three-layer format, lint rules, disclaimer wording) is unchanged beneath this preamble.

## Fact-Pack Builder

`refinery/tools/build-builders-edge-fact-pack.mts`

Copy pattern from `refinery/tools/build-corridor-fact-pack.mts`. Note: `permit_saturation_zscore` is the corridor-level Z-score already computed in the permits-swfl brain — pull it directly, do not recompute.

## GHA Cron

`.github/workflows/industry-builders-edge.yml`

Runs week 2 of each quarter (alongside Move Ready). Accepts `--batch-size N`. Writes to `lake-tier1/industry_grounded/builders-edge/{slug}/`.

## Speculative Framing Notes

- Lead speculation on entitlement window: high parcel velocity + rising AADT = land-rush signal
- Infer financing feasibility from SOFR + construction CDR pair (high CDR = lender caution)
- Assess saturation risk from Z-score: Z > 1.5 = corridor may be overbuilt in current cycle
- Flag competitive pipeline gaps when web search returns no active entitlements near corridor
- All inferences must carry the standard disclaimer
