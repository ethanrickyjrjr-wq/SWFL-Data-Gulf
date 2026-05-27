# Voice 01 — Main Street (Small Business / Franchise)

## Audience

Prospective franchisees, SBA lenders, SBDC advisors evaluating a small-business location on a specific SWFL corridor.

## Priority

**1 — highest.** Largest audience segment. All data sources are live. No new pipes required.

## Data Sources (all live)

| Brain / Lake Table   | Signal                                                     |
| -------------------- | ---------------------------------------------------------- |
| `franchise-outcomes` | 5-yr SBA survival rate + charge-off rate by NAICS × county |
| `sector-credit-swfl` | 2-digit NAICS CDR + approval volume                        |
| `traffic-swfl`       | AADT (foot-traffic proxy) + 5-yr CAGR                      |
| `tourism-tdt`        | Seasonal multiplier (peak Q2, trough Q3) + YoY%            |
| `macro-swfl`         | BLS LAUS labor force participation + unemployment          |
| `permits-swfl`       | Commercial construction activity (capital-flow signal)     |
| `cre-swfl`           | Asking rent PSF NNN (floor occupancy cost)                 |

## Fact Pack Shape

```typescript
{
  sba_survival_rate_sector: MetricFact; // franchise-outcomes dominant NAICS
  sector_cdr: MetricFact; // sector-credit 2-digit CDR
  aadt_corridor: MetricFact; // traffic-swfl
  tdt_seasonal_multiplier: MetricFact; // peak÷trough ratio
  tdt_yoy_pct: MetricFact; // tourism-tdt YoY
  lee_unemployment: MetricFact; // macro-swfl
  commercial_permits_6mo: MetricFact; // permits-swfl commercial_new
  asking_rent_psf: MetricFact; // cre-swfl NNN
}
```

## Web Query Template

```
Small business and franchise market summary for {corridor_name}, Southwest Florida.

1. FRANCHISE PERFORMANCE (2023-2026): SBA loan data, franchise survival rates, or default
rates for retail/restaurant/service concepts in this corridor or nearest SWFL submarket.
Named franchise brands that opened, closed, or expanded.

2. FOOT TRAFFIC: Daily traffic counts (AADT), pedestrian studies, customer-draw data,
or trade-area estimates for this corridor or similar SWFL strips.

3. RETAIL LEASING AND VACANCY (2024-2026): Asking rents PSF, vacancy rates, recent
lease signings by small business or franchise tenants on or near this corridor.

Cite each figure to its primary source (county, broker, SBA, FDOT).
```

## Additional Allowed Domains

- `sba.gov`

## System Prompt Preamble

> "You are writing for a prospective franchisee, SBA lender, or SBDC advisor evaluating a small-business location. Lead with foot-traffic and sector credit-risk signals. Franchise survival rates are the primary decision variable."

The hard contract (three-layer format, lint rules, disclaimer wording) is unchanged beneath this preamble.

## Fact-Pack Builder

`refinery/tools/build-main-street-fact-pack.mts`

Copy pattern from `refinery/tools/build-corridor-fact-pack.mts`. MetricFact / ImportantMath / FactValue pattern is identical. Only the source reads and metric keys change.

## GHA Cron

`.github/workflows/industry-main-street.yml`

Runs week 1 of each quarter. Accepts `--batch-size N` flag. Writes to `lake-tier1/industry_grounded/main-street/{slug}/`.

## Speculative Framing Notes

- Lead speculation on franchise concept fit given sector CDR + AADT combination
- Infer peak-season revenue potential from TDT seasonal multiplier
- Assess rent-to-revenue ratio risk using asking_rent_psf + NAICS survival rate
- All inferences must carry the standard disclaimer
