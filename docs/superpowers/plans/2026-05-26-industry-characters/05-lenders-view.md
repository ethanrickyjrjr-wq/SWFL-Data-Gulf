# Voice 05 — Lender's View (SBA / Commercial Lending)

## Audience

SBA lenders, community banks, CDFIs, credit unions, commercial loan officers evaluating credit risk on a specific SWFL corridor.

## Priority

**5 — underserved audience.** All data sources live. No new pipes required.

## Data Sources (all live)

| Brain / Lake Table   | Signal                                                  |
| -------------------- | ------------------------------------------------------- |
| `franchise-outcomes` | Survival rate + CDR by brand × NAICS × county           |
| `sector-credit-swfl` | 2-digit NAICS CDR + approval volume                     |
| `macro-us`           | SOFR                                                    |
| `macro-florida`      | FL state employment by sector                           |
| `macro-swfl`         | BLS LAUS county unemployment (local default risk proxy) |
| `cre-swfl`           | Vacancy + cap rate + asking rent (collateral signal)    |

## Fact Pack Shape

```typescript
{
  sector_cdr_worst3: MetricFact; // top 3 NAICS by CDR
  franchise_survival_rate: MetricFact; // franchise-outcomes weighted mean
  sofr_rate: MetricFact; // macro-us
  fl_unemployment: MetricFact; // macro-florida
  lee_unemployment: MetricFact; // macro-swfl
  cre_vacancy: MetricFact; // cre-swfl (collateral signal)
  cre_cap_rate: MetricFact; // cre-swfl
}
```

## Web Query Template

```
Commercial lending and credit risk summary for {corridor_name}, Southwest Florida.

1. SBA AND COMMERCIAL LOAN PERFORMANCE (2022-2026): Charge-off rates, default rates, or
survival rates for SBA 7(a)/504 loans in sectors dominant on this corridor. Community bank
CRE concentration exposure for Lee/Collier banks.

2. COLLATERAL VALUES: Commercial real estate values, cap rates, or asking rents PSF for
this corridor (NNN basis). Recent CMBS defaults or distressed-sale comps.

3. MACRO CREDIT CONDITIONS: SOFR rate, prime rate, SBA or Fed policy changes affecting
commercial lending terms in 2025-2026.

4. FLORIDA BANK REGULATORY DATA: FDIC enforcement actions, troubled-debt restructurings,
or concentration-limit advisories affecting Lee/Collier lenders.

Cite each figure to its primary source (SBA, FDIC, FRED, broker).
```

## Additional Allowed Domains

- `fdic.gov`
- `ffiec.gov`
- `sba.gov`

## System Prompt Preamble

> "You are writing for an SBA lender, community bank officer, or CDFI evaluating commercial credit risk. Lead with sector CDR and franchise survival rates. Asking rent is a collateral signal, not a market signal."

The hard contract (three-layer format, lint rules, disclaimer wording) is unchanged beneath this preamble.

## Fact-Pack Builder

`refinery/tools/build-lenders-view-fact-pack.mts`

Copy pattern from `refinery/tools/build-corridor-fact-pack.mts`. Note: `sector_cdr_worst3` is a ranked array of the three highest-CDR NAICS sectors present on the corridor — render as three separate MetricFact rows in the fact pack, not a single aggregated value.

## GHA Cron

`.github/workflows/industry-lenders-view.yml`

Runs week 2 of each quarter (alongside Builder's Edge). Accepts `--batch-size N`. Writes to `lake-tier1/industry_grounded/lenders-view/{slug}/`.

## Speculative Framing Notes

- Lead speculation on CRE collateral stress: rising vacancy + falling cap rate = collateral compression signal
- Infer sector concentration risk from top-3 CDR pair with corridor's dominant NAICS
- Assess local lender headroom from Lee unemployment trend (rising unemployment → rising CDR lag of ~6 months)
- Flag CMBS exposure if web search surfaces distressed comps near corridor
- All inferences must carry the standard disclaimer
