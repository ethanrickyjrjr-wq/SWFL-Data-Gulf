# Voice 02 — Storm Ready (Risk & Insurance)

## Audience

Homeowners, insurance agents, property managers, real estate attorneys evaluating storm and flood risk on a specific SWFL corridor.

## Priority

**2 — unique moat.** Nobody synthesizes NFIP data at ZIP level the way this system does. All data sources live. No new pipes required.

## Data Sources (all live)

| Brain / Lake Table    | Signal                                                                |
| --------------------- | --------------------------------------------------------------------- |
| `env-swfl`            | NFIP AAL per ZIP, flood barrier class (Mode 1/2/3), SFHA %, VE-zone % |
| `hurricane-tracks-fl` | Named storm claim counts + loss totals by county × storm              |
| `storm-history-swfl`  | NOAA event type + damage 1996–2025                                    |

## Fact Pack Shape

```typescript
{
  sfha_pct_corridor: MetricFact; // env-swfl SFHA area %
  ve_zone_exposure_pct: MetricFact; // coastal high-hazard %
  barrier_class: MetricFact; // Mode 1/2/3
  aal_per_policy_usd: MetricFact; // NFIP AAL
  nfip_claim_count_10yr: MetricFact; // env-swfl
  named_storm_claims: MetricFact; // hurricane-tracks-fl sum
  noaa_event_count_5yr: MetricFact; // storm-history-swfl
}
```

## Web Query Template

```
Flood, hurricane, and storm risk summary for {corridor_name}, Southwest Florida.

1. FLOOD ZONE STATUS: FEMA flood zone designations (AE, VE, X) affecting properties on
or adjacent to this corridor. Recent LOMA/LOMR actions or map revisions.

2. HURRICANE AND STORM HISTORY (2000-2026): Storm claims, insurance payouts, or damage
assessments from Ian (2022), Irma (2017), or other named storms. NFIP claim counts.

3. INSURANCE MARKET CONDITIONS (2024-2026): Homeowner/commercial property insurance
availability, premium trends, or carrier exits in this ZIP/corridor. Citizens Property
Insurance exposure.

Cite each claim to its primary source (FEMA, county, FLOIR, news).
```

## Additional Allowed Domains

- `myfloridacfo.com`
- `disasterassistance.gov`

## System Prompt Preamble

> "You are writing for a homeowner, insurance agent, or property manager evaluating storm and flood risk. Lead with FEMA flood zone and NFIP claim history. Every metric is a risk signal, not an investment signal."

The hard contract (three-layer format, lint rules, disclaimer wording) is unchanged beneath this preamble.

## Fact-Pack Builder

`refinery/tools/build-storm-ready-fact-pack.mts`

Copy pattern from `refinery/tools/build-corridor-fact-pack.mts`. Key difference: barrier_class is ordinal (Mode 1/2/3), not a continuous number — render as label, not as a rate.

## GHA Cron

`.github/workflows/industry-storm-ready.yml`

Runs week 1 of each quarter (alongside Main Street). Accepts `--batch-size N`. Writes to `lake-tier1/industry_grounded/storm-ready/{slug}/`.

## Speculative Framing Notes

- Lead speculation on insurance premium trajectory given barrier class + AAL trend
- Infer post-Ian recovery completeness from claim count + NOAA event delta
- Assess Citizens Property Insurance exit risk based on VE-zone exposure %
- Note: Mode 1 corridors (highest flood barrier) should carry explicit "elevated risk — double-check Citizens availability" inference
- All inferences must carry the standard disclaimer
