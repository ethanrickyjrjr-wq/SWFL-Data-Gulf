# Voice 03 — Move Ready (Relocation)

## Audience

Relocating retirees, remote workers, snowbirds evaluating a permanent or seasonal move to a specific SWFL corridor area.

## Priority

**3 — massive SWFL relocation market.** All data sources live. No new pipes required.

## Data Sources (all live)

| Brain / Lake Table     | Signal                                                        |
| ---------------------- | ------------------------------------------------------------- |
| `rentals-swfl`         | ZORI by ZIP, YoY%, MoM%                                       |
| `properties-lee-value` | FHFA HPI YoY%, LeePA parcel sales velocity                    |
| `macro-swfl`           | BLS LAUS unemployment + labor participation                   |
| `env-swfl`             | Flood barrier class + AAL                                     |
| `permits-swfl`         | Residential permit velocity (neighborhood growth signal)      |
| `traffic-swfl`         | AADT (commute reality)                                        |
| `tourism-tdt`          | Seasonal index (tourist trap vs. year-round community signal) |

## Fact Pack Shape

```typescript
{
  zori_rent_index: MetricFact; // rentals-swfl YoY
  fhfa_hpi_msa: MetricFact; // properties-lee-value
  leepa_sales_velocity: MetricFact; // parcel sales trailing 6mo
  flood_barrier_class: MetricFact; // env-swfl Mode 1/2/3
  aal_per_policy_usd: MetricFact; // env-swfl
  residential_permits_6mo: MetricFact; // permits-swfl
  aadt_corridor: MetricFact; // traffic-swfl
  tdt_seasonal_index: MetricFact; // peak÷trough ratio
  lee_unemployment: MetricFact; // macro-swfl
}
```

## Web Query Template

```
Residential relocation and quality-of-life summary for the {corridor_name} area,
Southwest Florida.

1. HOUSING MARKET (2024-2026): Median home prices, price-per-sqft, and trend direction
for neighborhoods along or within 1 mile of this corridor. FHFA HPI or Zillow HVI preferred.

2. RENTAL MARKET: Current asking rents (apartment/SFR), vacancy trends, or Zillow ZORI
changes for ZIP codes touching this corridor.

3. LIVABILITY SIGNALS: School ratings/grades (FLDOE A-F), crime statistics (FDLE property
crime per 1,000), commute times, or quality-of-life rankings.

4. SEASONAL CHARACTER: Peak-season population influx, snowbird share, or seasonal demand
patterns affecting this corridor's character.

Cite each figure to its primary source.
```

## System Prompt Preamble

> "You are writing for a relocating retiree, remote worker, or snowbird evaluating where to live. Lead with housing affordability, school quality, and flood exposure. Frame traffic as a livability signal, not a business signal."

The hard contract (three-layer format, lint rules, disclaimer wording) is unchanged beneath this preamble.

## Fact-Pack Builder

`refinery/tools/build-move-ready-fact-pack.mts`

Copy pattern from `refinery/tools/build-corridor-fact-pack.mts`. Note: `tdt_seasonal_index` reframes the tourism signal — here it answers "is this a quiet neighborhood or a peak-season madhouse?" rather than "how much does tourist spend fluctuate?"

## GHA Cron

`.github/workflows/industry-move-ready.yml`

Runs week 2 of each quarter. Accepts `--batch-size N`. Writes to `lake-tier1/industry_grounded/move-ready/{slug}/`.

## Speculative Framing Notes

- Lead speculation on long-term affordability trajectory given HPI + ZORI combined trend
- Infer year-round community character from seasonal index (low index = snowbird-heavy, high = stable year-round)
- Assess flood insurance cost burden using AAL + barrier class pair (Mode 1 = likely Citizens exposure)
- Note school quality gap if FLDOE data is unavailable via web search — flag explicitly
- All inferences must carry the standard disclaimer
