# Vocab Audit — 10K-to-2.5K Collapse

<!-- Tier 1, Lane A, Item #2 -->
<!-- Status: DRAFT 2026-05-16 -->
<!-- Next: Item #1 — refinery/vocab/brain-vocabulary.json -->

## Purpose

Map every raw metric slug in the lake to a canonical SKOS concept so that:

1. Downstream consumers join on a stable ID, not a fragile string.
2. The "Direction" overload (Sentiment vs Trajectory) is resolved structurally.
3. The Charge-off naming collision (NAICS 44 vs NAICS 45) is resolved with typed keys.

---

## Raw Inventory

Extracted from all five brain `.md` files (as-shipped 2026-05-16).

### franchise-outcomes

| Raw slug                | Source field | Label                               |
| ----------------------- | ------------ | ----------------------------------- |
| `overall_survival_rate` | key_metrics  | SBA franchise overall survival rate |

### macro-swfl

| Raw slug                 | Source field | Label                                   |
| ------------------------ | ------------ | --------------------------------------- |
| `sofr_rate`              | key_metrics  | SOFR (Secured Overnight Financing Rate) |
| `fl_unemployment`        | key_metrics  | Florida unemployment rate               |
| `cpi_yoy`                | key_metrics  | US CPI YoY                              |
| `fl_labor_participation` | key_metrics  | Florida labor force participation       |

### cre-swfl

| Raw slug              | Source field                                    | Label                                                             |
| --------------------- | ----------------------------------------------- | ----------------------------------------------------------------- |
| `cap_rate_median`     | key_metrics                                     | Median SWFL CRE cap rate (21 of 25 corridors)                     |
| `vacancy_rate_median` | key_metrics                                     | Median SWFL CRE vacancy rate (21 of 25 corridors)                 |
| `cap_rate`            | corridor facts (topic: `metric:cap_rate_*`)     | Per-corridor cap rate                                             |
| `vacancy_rate`        | corridor facts (topic: `metric:vacancy_rate_*`) | Per-corridor vacancy rate                                         |
| `seasonal_index`      | corridor profile facts                          | Corridor seasonality 0–1                                          |
| `evolution`           | corridor profile facts                          | Narrative direction: stable / growing / declining / repositioning |

### sector-credit-swfl

| Raw slug                   | Source field | Label                                         |
| -------------------------- | ------------ | --------------------------------------------- |
| `best_naics_survival`      | key_metrics  | Best-sector SBA survival rate                 |
| `worst_naics_chargeoff`    | key_metrics  | Worst-sector SBA charge-off rate              |
| `sector_72_chargeoff_rate` | key_metrics  | NAICS 72 Accommodation & Food Services        |
| `sector_42_chargeoff_rate` | key_metrics  | NAICS 42 Wholesale Trade                      |
| `sector_54_chargeoff_rate` | key_metrics  | NAICS 54 Professional, Scientific & Technical |
| `sector_44_chargeoff_rate` | key_metrics  | NAICS 44 Retail Trade                         |
| `sector_45_chargeoff_rate` | key_metrics  | NAICS 45 Retail Trade ← **COLLISION**         |
| `sector_23_chargeoff_rate` | key_metrics  | NAICS 23 Construction                         |
| `sector_62_chargeoff_rate` | key_metrics  | NAICS 62 Health Care & Social Assistance      |
| `sector_81_chargeoff_rate` | key_metrics  | NAICS 81 Other Services (Personal & Repair)   |
| `sector_56_chargeoff_rate` | key_metrics  | NAICS 56 Administrative & Support Services    |
| `sector_53_chargeoff_rate` | key_metrics  | NAICS 53 Real Estate, Rental & Leasing        |
| `sector_71_chargeoff_rate` | key_metrics  | NAICS 71 Arts, Entertainment & Recreation     |
| `sector_52_chargeoff_rate` | key_metrics  | NAICS 52 Finance & Insurance                  |
| `sector_48_chargeoff_rate` | key_metrics  | NAICS 48 Transportation & Warehousing         |

### Cross-brain qualitative fields (not metric slugs, but overloaded)

| Raw field   | Appears in          | Current value domain                             |
| ----------- | ------------------- | ------------------------------------------------ |
| `direction` | `BrainOutput`       | `"bullish" \| "bearish" \| "neutral" \| "mixed"` |
| `direction` | `BrainOutputMetric` | `"rising" \| "falling" \| "stable"`              |

---

## Problem 1 — The "Direction" Overload (Sentiment vs Trajectory)

### Root cause

The same field name `direction` carries two different semantic loads:

| Context      | Field path                    | Meaning                                         | Type           |
| ------------ | ----------------------------- | ----------------------------------------------- | -------------- |
| Brain-level  | `BrainOutput.direction`       | Market outlook — where should an operator lean? | **Sentiment**  |
| Metric-level | `BrainOutputMetric.direction` | Which way is this number moving?                | **Trajectory** |

These are orthogonal concepts that SKOS must not map to the same concept node.

### Resolution

**Two canonical concepts, zero overlap:**

```
swfl:SentimentDirection
  skos:prefLabel  "Market Sentiment"
  skos:notation   bullish, bearish, neutral, mixed
  skos:scopeNote  "Brain-level qualitative read. Output of synthesis stage.
                   Never conflated with metric-level trajectory."

swfl:MetricTrajectory
  skos:prefLabel  "Metric Trajectory"
  skos:notation   rising, falling, stable
  skos:scopeNote  "Single-series time-series direction at the metric level.
                   Never conflated with brain-level sentiment."
```

**Naming rule going forward:**

- JSON key in `BrainOutput` → stays `direction` (external contract is locked).
- JSON key in `BrainOutputMetric` → stays `direction` (same lock).
- Vocabulary concept IDs: `swfl:sentiment_direction` and `swfl:metric_trajectory`.
- In the vocab JSON schema the field for each concept carries a `disambiguates` array pointing to the other concept so consumers know the distinction is intentional.

---

## Problem 2 — Charge-off Naming Collisions

### Root cause

NAICS 2017 splits "Retail Trade" into two separate 2-digit codes:

- **NAICS 44**: Motor Vehicle, Electronics, Building Materials, Food & Beverage Stores
- **NAICS 45**: Clothing, Sporting Goods, Hobby, General Merchandise, Non-store Retailers

Both are officially labeled "Retail Trade" by the SBA dataset. The current raw slugs `sector_44_chargeoff_rate` and `sector_45_chargeoff_rate` are structurally distinct (18.8% vs 44.4%), but:

1. Both surface the label `"Retail Trade"` in the brain's `key_metrics[].label`.
2. `worst_naics_chargeoff` points at NAICS 45 but the label says "Retail Trade (NAICS 45)" — a downstream brain reading only the label will miscategorize it as NAICS 44.

### Resolution

**Canonical form for all sector charge-off metrics:**

```
swfl:sba_chargeoff_rate_sector:{naics_code}
```

Where `naics_code` is the 2-digit integer. The SKOS vocabulary entry carries the full NAICS title (not the SBA shorthand) as `prefLabel`:

| Canonical ID                   | prefLabel                                                      | altLabel                | charge-off (corpus) |
| ------------------------------ | -------------------------------------------------------------- | ----------------------- | ------------------- |
| `sba_chargeoff_rate_sector_44` | Retail Trade — Motor Vehicle & General Merchandise (NAICS 44)  | Retail Trade 44         | 18.8%               |
| `sba_chargeoff_rate_sector_45` | Retail Trade — Clothing, Sporting Goods & Non-store (NAICS 45) | Retail Trade 45         | 44.4%               |
| `sba_chargeoff_rate_sector_23` | Construction (NAICS 23)                                        | Construction            | 13.7%               |
| `sba_chargeoff_rate_sector_42` | Wholesale Trade (NAICS 42)                                     | Wholesale Trade         | 9.1%                |
| `sba_chargeoff_rate_sector_48` | Transportation & Warehousing (NAICS 48)                        | Transport & Warehousing | 57.1%               |
| `sba_chargeoff_rate_sector_52` | Finance & Insurance (NAICS 52)                                 | Finance & Insurance     | 0%                  |
| `sba_chargeoff_rate_sector_53` | Real Estate, Rental & Leasing (NAICS 53)                       | Real Estate             | 0%                  |
| `sba_chargeoff_rate_sector_54` | Professional, Scientific & Technical Services (NAICS 54)       | Prof & Tech Services    | 12%                 |
| `sba_chargeoff_rate_sector_56` | Administrative & Support Services (NAICS 56)                   | Admin & Support         | 18.8%               |
| `sba_chargeoff_rate_sector_62` | Health Care & Social Assistance (NAICS 62)                     | Health Care             | 12.5%               |
| `sba_chargeoff_rate_sector_71` | Arts, Entertainment & Recreation (NAICS 71)                    | Arts & Entertainment    | 0%                  |
| `sba_chargeoff_rate_sector_72` | Accommodation & Food Services (NAICS 72)                       | Food Service            | 7.1%                |
| `sba_chargeoff_rate_sector_81` | Other Services — Personal & Repair (NAICS 81)                  | Other Services          | 21.2%               |

**Corpus-summary aliases** (these stay as-is; they are derived aggregates, not sector data):

| Raw slug                | Canonical alias              | Concept                                 |
| ----------------------- | ---------------------------- | --------------------------------------- |
| `best_naics_survival`   | `sba_best_sector_survival`   | Top-performing sector survival rate     |
| `worst_naics_chargeoff` | `sba_worst_sector_chargeoff` | Worst-performing sector charge-off rate |
| `overall_survival_rate` | `sba_overall_survival_rate`  | Corpus-level franchise survival rate    |

---

## Canonical SKOS Scheme: `swfl-vocab`

### Category A — Credit & Risk

| Concept ID                          | prefLabel                              | Domain  | Source brain(s)            |
| ----------------------------------- | -------------------------------------- | ------- | -------------------------- |
| `sba_overall_survival_rate`         | SBA Franchise Survival Rate (Corpus)   | finance | franchise-outcomes         |
| `sba_chargeoff_rate_sector_{naics}` | SBA Sector Charge-off Rate — NAICS {n} | finance | sector-credit-swfl         |
| `sba_best_sector_survival`          | Best-Sector SBA Survival Rate          | finance | sector-credit-swfl, master |
| `sba_worst_sector_chargeoff`        | Worst-Sector SBA Charge-off Rate       | finance | sector-credit-swfl, master |

### Category B — Real Estate Fundamentals

| Concept ID                | prefLabel                    | Scope       | Source brain(s)  |
| ------------------------- | ---------------------------- | ----------- | ---------------- |
| `cre_cap_rate`            | Cap Rate (per corridor)      | real-estate | cre-swfl         |
| `cre_cap_rate_median`     | Median Cap Rate (corpus)     | real-estate | cre-swfl, master |
| `cre_vacancy_rate`        | Vacancy Rate (per corridor)  | real-estate | cre-swfl         |
| `cre_vacancy_rate_median` | Median Vacancy Rate (corpus) | real-estate | cre-swfl, master |
| `cre_seasonal_index`      | Seasonal Index (0–1)         | real-estate | cre-swfl         |
| `cre_corridor_evolution`  | Corridor Evolution Stage     | real-estate | cre-swfl         |

### Category C — Macro Indicators

| Concept ID                     | prefLabel                               | Series        | Source brain(s)    |
| ------------------------------ | --------------------------------------- | ------------- | ------------------ |
| `macro_sofr_rate`              | SOFR (Secured Overnight Financing Rate) | FRED SOFR     | macro-swfl, master |
| `macro_fl_unemployment`        | Florida Unemployment Rate               | FRED LBSSA12  | macro-swfl, master |
| `macro_cpi_yoy`                | US CPI Year-over-Year                   | FRED CPIAUCSL | macro-swfl, master |
| `macro_fl_labor_participation` | Florida Labor Force Participation Rate  | FRED FLUR     | macro-swfl         |

### Category D — Qualitative Descriptors

| Concept ID                 | prefLabel                      | Domain | Disambiguates                |
| -------------------------- | ------------------------------ | ------ | ---------------------------- |
| `qual_sentiment_direction` | Market Sentiment Direction     | all    | ≠ `qual_metric_trajectory`   |
| `qual_metric_trajectory`   | Metric Trajectory              | all    | ≠ `qual_sentiment_direction` |
| `qual_magnitude`           | Synthesis Magnitude (0–1)      | all    | —                            |
| `qual_confidence`          | Deterministic Confidence Score | all    | —                            |
| `qual_trust_tier`          | Source Trust Tier (1–4)        | all    | —                            |

---

## Raw-to-Canonical Mapping Table

| Raw slug (as written in brain files) | Canonical ID                   | Category |
| ------------------------------------ | ------------------------------ | -------- |
| `overall_survival_rate`              | `sba_overall_survival_rate`    | A        |
| `best_naics_survival`                | `sba_best_sector_survival`     | A        |
| `worst_naics_chargeoff`              | `sba_worst_sector_chargeoff`   | A        |
| `sector_23_chargeoff_rate`           | `sba_chargeoff_rate_sector_23` | A        |
| `sector_42_chargeoff_rate`           | `sba_chargeoff_rate_sector_42` | A        |
| `sector_44_chargeoff_rate`           | `sba_chargeoff_rate_sector_44` | A        |
| `sector_45_chargeoff_rate`           | `sba_chargeoff_rate_sector_45` | A        |
| `sector_48_chargeoff_rate`           | `sba_chargeoff_rate_sector_48` | A        |
| `sector_52_chargeoff_rate`           | `sba_chargeoff_rate_sector_52` | A        |
| `sector_53_chargeoff_rate`           | `sba_chargeoff_rate_sector_53` | A        |
| `sector_54_chargeoff_rate`           | `sba_chargeoff_rate_sector_54` | A        |
| `sector_56_chargeoff_rate`           | `sba_chargeoff_rate_sector_56` | A        |
| `sector_62_chargeoff_rate`           | `sba_chargeoff_rate_sector_62` | A        |
| `sector_71_chargeoff_rate`           | `sba_chargeoff_rate_sector_71` | A        |
| `sector_72_chargeoff_rate`           | `sba_chargeoff_rate_sector_72` | A        |
| `sector_81_chargeoff_rate`           | `sba_chargeoff_rate_sector_81` | A        |
| `cap_rate`                           | `cre_cap_rate`                 | B        |
| `cap_rate_median`                    | `cre_cap_rate_median`          | B        |
| `vacancy_rate`                       | `cre_vacancy_rate`             | B        |
| `vacancy_rate_median`                | `cre_vacancy_rate_median`      | B        |
| `seasonal_index`                     | `cre_seasonal_index`           | B        |
| `evolution`                          | `cre_corridor_evolution`       | B        |
| `sofr_rate`                          | `macro_sofr_rate`              | C        |
| `fl_unemployment`                    | `macro_fl_unemployment`        | C        |
| `cpi_yoy`                            | `macro_cpi_yoy`                | C        |
| `fl_labor_participation`             | `macro_fl_labor_participation` | C        |
| `BrainOutput.direction`              | `qual_sentiment_direction`     | D        |
| `BrainOutputMetric.direction`        | `qual_metric_trajectory`       | D        |
| `BrainOutput.magnitude`              | `qual_magnitude`               | D        |
| `BrainOutput.confidence`             | `qual_confidence`              | D        |
| `BrainOutput.trust_tier`             | `qual_trust_tier`              | D        |

---

## Collapse Summary

| Category          | Raw slugs                  | Canonical concepts                                          | Reduction                           |
| ----------------- | -------------------------- | ----------------------------------------------------------- | ----------------------------------- |
| A — Credit & Risk | 16                         | 4 concept templates (13 sector variants + 3 corpus aliases) | ~16 → 4 shapes                      |
| B — Real Estate   | 6                          | 6                                                           | 1:1 (already clean)                 |
| C — Macro         | 4                          | 4                                                           | 1:1 (already clean)                 |
| D — Qualitative   | 5 raw fields (2 ambiguous) | 5 (disambiguated)                                           | 2 collisions resolved               |
| **Total**         | **31 raw slugs**           | **19 canonical shapes**                                     | **39% reduction on current corpus** |

The "10K-to-2.5K" target applies to the full projected lake at scale (every future brain adds slugs). The canonical shapes above are the templates; the naming convention `{category}_{concept}_{qualifier?}` scales to thousands of metric IDs without a collision.

---

## Open Questions for Item #1 (brain-vocabulary.json)

1. **Namespace prefix**: use `swfl:` as the scheme prefix in JSON, or use category-qualified keys (`cre_*`, `sba_*`, `macro_*`, `qual_*`) directly? Recommendation: category-qualified keys — no prefix resolution needed in TypeScript.
2. **`cre_corridor_evolution`**: the raw values (`stable`, `growing`, `declining`, `repositioning`) are strings in the fact layer, not `BrainOutputMetric` slugs. Should they be a SKOS `OrderedCollection` ordered by "operator friendliness" (growing > stable > repositioning > declining)? Flag for Item #1.
3. **`flood_risk_pct`**: referenced in `refinery/constitution/real-estate.mts` but not yet produced by any brain. Pre-register it in the vocab as a placeholder concept `env_flood_risk_pct` so the constitution rule can reference a stable ID.
4. **`naics_distress_baseline`**: same situation — stubbed in `naics-distress-veto`. Pre-register as `sba_naics_distress_baseline`.

---

## Post-Ship Audit TODOs

### 1. Verify `macro_fl_labor_participation` FRED series mapping (flagged 2026-05-17)

The Category C table above maps `macro_fl_labor_participation` to FRED series `FLUR`. `FLUR` is widely understood as Florida's _unemployment_ rate ticker on FRED — not labor force participation. The companion entry `macro_fl_unemployment` is mapped to `LBSSA12`, which compounds the suspicion that the two FRED series IDs may be swapped (or that one is wrong outright).

**Action required:**

1. Pull both FRED tickers from `https://fred.stlouisfed.org/` and inspect canonical titles + values.
   - `FLUR` → confirm whether it's "Florida Unemployment Rate" or "Florida Labor Force Participation Rate"
   - `LBSSA12` → confirm same
   - Find the FRED series ID for "Florida Labor Force Participation Rate" if neither of the above is correct
2. Update `refinery/vocab/brain-vocabulary.json` — fix `macro_fl_labor_participation.fred_series` and/or `macro_fl_unemployment.fred_series`.
3. If any ingested `data_lake.fred_*` rows are mis-categorized, regenerate them under the corrected concept ID.
4. After resolution, archive the vault fragment `fl-labor-baselines-suspect-until-audit` (banked 2026-05-17, conf 0.50) — set `status = 'superseded'` and `superseded_by` to a new confirmed entry.

**Why it matters:** every brain that consumes Florida labor as a denominator (the macro-swfl chain, anything downstream from `macro-florida`) inherits the bug. The vault fragment serves as the operator-side caveat until the technical fix lands.
