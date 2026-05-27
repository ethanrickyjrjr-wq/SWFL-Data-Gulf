# Voice 06 — Seasonal Operator (Hospitality / STR)

## Audience

STR operators, hotel owners, hospitality investors, vacation rental managers evaluating seasonal demand on a specific SWFL corridor.

## Priority

**6 — TDT data live; STR pricing gap is manageable.** `str_median_nightly` ships as null + gap_reason until the optional Firecrawl pipe runs. The synthesizer already handles this gracefully.

## Data Sources

| Brain / Lake Table   | Signal                                                          | Status                                                 |
| -------------------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| `tourism-tdt`        | Gross collections, YoY%, seasonal index, post-Ian recovery flag | Live                                                   |
| `traffic-swfl`       | AADT (seasonal visitor demand proxy)                            | Live                                                   |
| `macro-swfl`         | BLS LAUS (hospitality labor availability)                       | Live                                                   |
| `franchise-outcomes` | NAICS 72 survival + CDR                                         | Live                                                   |
| `sector-credit-swfl` | NAICS 72 CDR + approval volume                                  | Live                                                   |
| STR pricing          | Airbnb/VRBO median nightly rate + listing count                 | **null + gap_reason** until `str_firecrawl` pipe ships |

## Fact Pack Shape

```typescript
{
  tdt_yoy_pct: MetricFact; // tourism-tdt
  tdt_seasonal_index: MetricFact; // peak÷trough ratio
  post_ian_recovery_flag: MetricFact; // boolean + NFIP context
  naics72_cdr: MetricFact; // sector-credit
  naics72_survival: MetricFact; // franchise-outcomes
  aadt_seasonal_peak: MetricFact; // traffic-swfl peak-month AADT
  str_median_nightly: MetricFact; // null + gap_reason if pipe not run
}
```

## Web Query Template

```
Hospitality and short-term rental market summary for {corridor_name}, Southwest Florida.

1. TOURIST DEVELOPMENT TAX AND VISITOR VOLUMES (2023-2026): Lee County TDT gross
collections trend, YoY change, seasonal peak months. Lee/Collier TDC occupancy or ADR reports.

2. SHORT-TERM RENTAL MARKET: Airbnb/VRBO average nightly rates, occupancy rates, or
listing counts for ZIP codes on or near this corridor. STR regulatory changes (local
ordinances, registration requirements) in 2024-2026.

3. HOTEL AND HOSPITALITY PERFORMANCE: RevPAR, ADR, or occupancy data for SWFL hotels
near this corridor. Hotel openings, closings, or brand changes.

4. POST-IAN RECOVERY: Tourism recovery metrics post-Hurricane Ian for Lee County —
occupancy, airlift, or visitor spend data.

Cite each figure to its primary source (county, AirDNA, STR, TDC).
```

## Additional Allowed Domains

- `visitlc.com`
- `colliercountyfl.gov` (TDC pages)

## System Prompt Preamble

> "You are writing for an STR operator, hotel owner, or hospitality investor evaluating seasonal demand. Lead with TDT collections trend and seasonal index. STR pricing data (when available) is the primary revenue signal."

The hard contract (three-layer format, lint rules, disclaimer wording) is unchanged beneath this preamble.

## Fact-Pack Builder

`refinery/tools/build-seasonal-operator-fact-pack.mts`

Copy pattern from `refinery/tools/build-corridor-fact-pack.mts`. When `str_median_nightly` is null, write `gap_reason: "STR pricing pipe not yet run — see str_firecrawl pipeline"` in the fact pack. The synthesizer promotes null metrics to the speculative block automatically.

## GHA Cron

`.github/workflows/industry-seasonal-operator.yml`

Runs week 3 of each quarter. Accepts `--batch-size N`. Writes to `lake-tier1/industry_grounded/seasonal-operator/{slug}/`.

## Optional New Pipe — `ingest/pipelines/str_firecrawl/pipeline.py`

~4 hours to build. Uses existing Firecrawl SDK already in the toolbox.

- Scrape public Airbnb/VRBO search results for corridor ZIPs
- Extract median nightly rate estimate + listing count
- Writes to `lake-tier1/str_firecrawl/{zip_code}/year=YYYY/month=MM/run-{iso}.ndjson`
- Voice ships without it — pipe is additive, not blocking

## Speculative Framing Notes

- Lead speculation on peak-season RevPAR potential from TDT seasonal index + AADT peak
- Infer STR regulatory risk from local ordinance trend (mention if web search surfaces pending ordinances)
- Assess post-Ian recovery completeness from recovery flag + TDT YoY trajectory
- When `str_median_nightly` is null: infer nightly rate range from TDT collections ÷ estimated room-nights using seasonal index — label clearly as [INFERENCE]
- All inferences must carry the standard disclaimer
