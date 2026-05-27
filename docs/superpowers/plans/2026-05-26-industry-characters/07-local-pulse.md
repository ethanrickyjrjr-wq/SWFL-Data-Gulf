# Voice 07 — Local Pulse (Civic / Community)

## Audience

Residents, HOA boards, local journalists, county commissioners assessing neighborhood conditions on a specific SWFL corridor.

## Priority

**7 — needs 2 new free government pipes.** Ships with null + gap_reason on school grades and crime until pipes run. All other sources live.

## Data Sources

| Brain / Lake Table | Signal                                  | Status                                                |
| ------------------ | --------------------------------------- | ----------------------------------------------------- |
| `env-swfl`         | Flood barrier class + AAL               | Live                                                  |
| `permits-swfl`     | Residential permit velocity             | Live                                                  |
| `rentals-swfl`     | ZORI affordability signal               | Live                                                  |
| `macro-swfl`       | Unemployment + labor participation      | Live                                                  |
| `traffic-swfl`     | AADT (livability/congestion)            | Live                                                  |
| FLDOE grades       | School A-F grade by ZIP attendance zone | **null + gap_reason** until `fldoe_grades` pipe ships |
| FDLE UCR           | Property crime per 1K residents         | **null + gap_reason** until `fdle_ucr` pipe ships     |

## Fact Pack Shape

```typescript
{
  flood_barrier_class: MetricFact; // env-swfl
  aal_per_policy_usd: MetricFact; // env-swfl
  residential_permits_6mo: MetricFact; // permits-swfl
  zori_rent_index: MetricFact; // rentals-swfl
  lee_unemployment: MetricFact; // macro-swfl
  aadt_corridor: MetricFact; // traffic-swfl
  school_grade_nearest: MetricFact; // FLDOE (null + gap_reason until pipe)
  property_crime_per_1k: MetricFact; // FDLE UCR (null + gap_reason until pipe)
}
```

## Web Query Template

```
Community and civic quality-of-life summary for {corridor_name}, Southwest Florida.

1. SCHOOL QUALITY: FLDOE A-F school grades for public schools in this corridor's
attendance zone (latest available year). School-boundary changes or charter school openings.

2. PUBLIC SAFETY: FDLE UCR property crime rate (per 1,000 residents) for the nearest city
or unincorporated area. Community policing initiatives or crime trend reporting.

3. INFRASTRUCTURE AND LIVABILITY: Recent road improvements, sidewalk projects, park or
greenspace investments, or code-enforcement actions affecting corridor quality.

4. COMMUNITY DEVELOPMENT: HOA activity, neighborhood association meetings, or civic
planning discussions (city/county commission) in 2024-2026.

Cite each figure to its primary source (FLDOE, FDLE, county, city).
```

## Additional Allowed Domains

- `fldoe.org`
- `fdle.state.fl.us`

## System Prompt Preamble

> "You are writing for a resident, HOA board member, or local journalist assessing neighborhood conditions. Lead with school grades and crime statistics (when available). Permit activity is a neighborhood-change signal, not a development opportunity signal."

The hard contract (three-layer format, lint rules, disclaimer wording) is unchanged beneath this preamble.

## Fact-Pack Builder

`refinery/tools/build-local-pulse-fact-pack.mts`

Copy pattern from `refinery/tools/build-corridor-fact-pack.mts`. When `school_grade_nearest` or `property_crime_per_1k` are null, write explicit `gap_reason` strings. The synthesizer promotes both to the speculative block and sources web search to fill the gap.

## GHA Cron

`.github/workflows/industry-local-pulse.yml`

Runs week 4 of each quarter. Accepts `--batch-size N`. Writes to `lake-tier1/industry_grounded/local-pulse/{slug}/`.

## Required New Pipes

### `ingest/pipelines/fldoe_grades/pipeline.py`

~1 day to build. Free government data.

- Fetch FLDOE A-F school accountability grades for Lee + Collier public schools
- Match schools to corridor ZIPs via attendance-zone boundary join
- Writes to `lake-tier1/fldoe_grades/year=YYYY/run-{iso}.ndjson`
- Source: `fldoe.org` — annual release, typically October

### `ingest/pipelines/fdle_ucr/pipeline.py`

~1 day to build. Free government data.

- Fetch FDLE Uniform Crime Reports property crime per 1,000 residents by jurisdiction
- Match jurisdictions to corridor ZIPs via city/unincorporated area lookup
- Writes to `lake-tier1/fdle_ucr/year=YYYY/run-{iso}.ndjson`
- Source: `fdle.state.fl.us` — annual release

Both pipes ship with `--dry-run` support and GHA cron wrappers per pipeline-freshness standards. Voice ships before pipes are built — null + gap_reason path is fully supported.

## Speculative Framing Notes

- Lead speculation on neighborhood trajectory from residential permit velocity + ZORI trend
- Infer school quality from web search when FLDOE pipe not yet run — label as [web-sourced inference], not internal data
- Assess livability trend from AADT + code-enforcement activity (when web search surfaces it)
- When both school_grade and crime are null: explicitly state "school and crime data not yet in lake — web search results above are the best available proxy"
- All inferences must carry the standard disclaimer
