# Step 4 Fact Packs — 5 Spot-Check Corridors

---

## 🏖️ Vanderbilt Beach Rd / Mercato (Collier · beachfront-tourism)

**Vintage:** OLDEST-2026-01

**Current values**

| Metric                 | Value | Unit       | Vintage    | Source                             | Gap reason                     |
| ---------------------- | ----- | ---------- | ---------- | ---------------------------------- | ------------------------------ |
| Cap rate               | 6.7   | %          | 2026-05-21 | corridor_profiles.cap_rate_pct     | —                              |
| Vacancy rate           | 3.3   | %          | 2026-Q1    | corridor_profiles.vacancy_rate_pct | —                              |
| Absorption             | 8,500 | sqft       | 2026-Q1    | corridor_profiles.absorption_sqft  | —                              |
| Asking rent            | 30.91 | $/sqft NNN | 2026-Q1    | corridor_profiles.asking_rent_psf  | —                              |
| Unemployment (Collier) | 4.5   | %          | 2026-03    | data_lake.bls_laus (preliminary)   | —                              |
| ZORI rent index        | —     | —          | —          | data_lake.zori_swfl                | no corridor→ZIP map yet        |
| Permits trailing 6mo   | —     | —          | —          | data_lake.lee_building_permits     | Collier not in Lee-only ingest |
| NFIP claim frequency   | —     | —          | —          | data_lake.fema_nfip_claims         | no corridor→ZIP map yet        |
| FDOT AADT              | —     | —          | —          | data_lake.fdot_aadt_fl             | no corridor→roadway map yet    |

**Computed math**

| Label                     | Value   | Dir        | Why null                                       |
| ------------------------- | ------- | ---------- | ---------------------------------------------- |
| cap_rate YoY (pp)         | —       | rising     | cap_rate not in marketbeat_swfl; only snapshot |
| vacancy YoY (pp)          | —       | —          | marketbeat_swfl empty                          |
| absorption YoY (sqft)     | —       | —          | marketbeat_swfl empty                          |
| asking_rent YoY ($)       | —       | —          | marketbeat_swfl empty                          |
| **unemployment YoY (pp)** | **1.2** | **rising** | **REAL — BLS LAUS computed**                   |
| ZORI YoY (%)              | —       | —          | no ZORI rows                                   |
| permits trailing 6mo dir  | —       | —          | Collier not in ingest                          |
| NFIP frequency dir        | —       | —          | no NFIP rollup                                 |

**Prior-quarter context:** none (first run).

---

## 🛣️ Immokalee Rd North Naples (Collier · highway-strip-mall)

**Vintage:** OLDEST-2026-01

**Current values**

| Metric                       | Value  | Unit       | Vintage    | Source                               | Gap reason |
| ---------------------------- | ------ | ---------- | ---------- | ------------------------------------ | ---------- |
| Cap rate                     | 6.7    | %          | 2026-05-21 | corridor_profiles.cap_rate_pct       | —          |
| Vacancy rate                 | 3.3    | %          | 2026-Q1    | corridor_profiles.vacancy_rate_pct   | —          |
| Absorption                   | 15,000 | sqft       | 2026-Q1    | corridor_profiles.absorption_sqft    | —          |
| Asking rent                  | 30.91  | $/sqft NNN | 2026-Q1    | corridor_profiles.asking_rent_psf    | —          |
| Unemployment (Collier)       | 4.5    | %          | 2026-03    | data_lake.bls_laus (preliminary)     | —          |
| ZORI / Permits / NFIP / FDOT | —      | —          | —          | (4 gaps, same reasons as Vanderbilt) | —          |

**Computed math:** only unemployment YoY computed (**+1.2 pp rising**). Everything else null because marketbeat empty / Collier outside permits scope.

**Prior-quarter context:** none.

---

## 🌴 Bonita Beach Rd (US-41 to Sanibel Causeway) (Lee · beachfront-tourism)

**Vintage:** OLDEST-2026-01

**Current values**

| Metric               | Value  | Unit       | Vintage    | Source                             | Gap reason                                                                   |
| -------------------- | ------ | ---------- | ---------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| Cap rate             | 6.7    | %          | 2026-05-21 | corridor_profiles.cap_rate_pct     | —                                                                            |
| Vacancy rate         | 2.3    | %          | 2026-Q1    | corridor_profiles.vacancy_rate_pct | —                                                                            |
| Absorption           | 18,000 | sqft       | 2026-Q1    | corridor_profiles.absorption_sqft  | —                                                                            |
| Asking rent          | 27.51  | $/sqft NNN | 2026-Q1    | corridor_profiles.asking_rent_psf  | —                                                                            |
| Unemployment (Lee)   | 4.9    | %          | 2026-03    | data_lake.bls_laus (preliminary)   | —                                                                            |
| ZORI rent index      | —      | —          | —          | data_lake.zori_swfl                | no corridor→ZIP map yet                                                      |
| Permits trailing 6mo | —      | —          | —          | data_lake.lee_building_permits     | **Lee corridor but geo-join not wired in driver v1 — "Zero permits joined"** |
| NFIP / FDOT          | —      | —          | —          | —                                  | (gaps)                                                                       |

**Computed math:** unemployment YoY **+1.3 pp rising**. Everything else null.

**Prior-quarter context:** none.

---

## 🏥 Six Mile Cypress Pkwy (Lee · medical-anchored)

**Vintage:** OLDEST-2026-01

**Current values**

| Metric                       | Value   | Unit       | Vintage    | Source                             | Gap reason |
| ---------------------------- | ------- | ---------- | ---------- | ---------------------------------- | ---------- |
| Cap rate                     | **8.3** | %          | 2026-05-21 | corridor_profiles.cap_rate_pct     | —          |
| Vacancy rate                 | 4.0     | %          | 2026-Q1    | corridor_profiles.vacancy_rate_pct | —          |
| Absorption                   | 14,000  | sqft       | 2026-Q1    | corridor_profiles.absorption_sqft  | —          |
| Asking rent                  | 26.03   | $/sqft NNN | 2026-Q1    | corridor_profiles.asking_rent_psf  | —          |
| Unemployment (Lee)           | 4.9     | %          | 2026-03    | data_lake.bls_laus (preliminary)   | —          |
| ZORI / Permits / NFIP / FDOT | —       | —          | —          | (4 gaps)                           | —          |

**Computed math:** unemployment YoY **+1.3 pp rising**. Cap rate editorial direction is **"falling"** (only corridor in the 5 where cap direction is falling). Everything else null.

**Prior-quarter context:** none.

---

## 🛒 Daniels Pkwy (I-75 to Ben Hill Griffin) (Lee · anchor-dependent)

**Vintage:** OLDEST-2026-01

**Current values**

| Metric                       | Value | Unit       | Vintage    | Source                             | Gap reason |
| ---------------------------- | ----- | ---------- | ---------- | ---------------------------------- | ---------- |
| Cap rate                     | 6.7   | %          | 2026-05-21 | corridor_profiles.cap_rate_pct     | —          |
| Vacancy rate                 | 3.2   | %          | 2026-Q1    | corridor_profiles.vacancy_rate_pct | —          |
| Absorption                   | 4,200 | sqft       | 2026-Q1    | corridor_profiles.absorption_sqft  | —          |
| Asking rent                  | 23.27 | $/sqft NNN | 2026-Q1    | corridor_profiles.asking_rent_psf  | —          |
| Unemployment (Lee)           | 4.9   | %          | 2026-03    | data_lake.bls_laus (preliminary)   | —          |
| ZORI / Permits / NFIP / FDOT | —     | —          | —          | (4 gaps)                           | —          |

**Computed math:** unemployment YoY **+1.3 pp rising**. Everything else null.

**Prior-quarter context:** none.

---

**Pattern across all 5:** the ONLY metric with a real YoY computed delta is **unemployment_rate** (from BLS LAUS). Everything else null because (a) `marketbeat_swfl` is empty so no quarterly time series, (b) corridor→ZIP and corridor→roadway maps aren't wired in driver v1. So the model is working with 5 real values + 1 real YoY per corridor, plus whatever Anthropic's web_search pulls in.
