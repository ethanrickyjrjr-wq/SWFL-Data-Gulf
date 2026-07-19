# Lee Parcel Consolidation + Guarded Deletion Plan (filed 2026-07-18)

**What this is:** the filed, execute-when-`lee_parcels`-lands playbook for the Lee parcel consolidation
(Project A of the 07/18 data-consolidation fan-out). Read-only analysis — NO repo files edited, NO
DROP/DELETE run. Every claim is backed by a live query (Postgres lake) or a `file:line` citation.
System-shape changes are tagged **[NEEDS-SIGN-OFF]** (operator C1/C2; never asserted here as "the authority").

**UPDATE 2026-07-18 — `lee_parcels` HAS LANDED and PASSED the §5 gate.** Live-verified: 556,083 rows =
556,083 distinct `parcel_id` (zero dupes; 1:1 with the feature count — Lee did NOT have Collier's
multi-centroid collapse, so the feature-vs-distinct concern is resolved), CO_NO=46 only, 104 columns,
`legal_description`/`jv`/`phy_zipcd` all 100% populated, all 7 use-code categories present (522,523
residential + 13,734 commercial + 4,305 industrial + 2,938 ag + 1,817 institutional + 7,259 gov + 3,507
misc). **Consolidation soundness PROVEN:** the `subdivision_name` derivation reproduces
`parcel_subdivision` at **100.00%** for both counties — Collier 220,399/220,399 (P1) and now Lee
**383,487/383,487** (joined live on matching STRAP `parcel_id`). So `parcel_subdivision` is provably a
reproducible subset of the two wide tables.

**Still gated (the DROP is irreversible).** Deletion of `parcel_subdivision` remains blocked until the
execution steps run and verify: build the two-county replacement VIEW (§4c) → repoint the 3 readers (§4d)
→ rebuild `neighborhood_stats` and confirm it MATCHES the pre-retirement rollup → then DROP (§6a). That is
a focused, verified pass, not a tail-of-session action. Open checks: `lee_parcels_leepa_redundant_into_properties_lee`,
`collier_parcels_parcel_subdivision_redundant_scrape`.

**OPERATOR DECISION (2026-07-18): KEEP `leepa_parcels`.** The FDOR pull is a cross-check; the appraiser
feed stays and is NEVER dropped. §2 is resolved **KEEP BOTH**; §6b (leepa deletion) is therefore
**permanently INERT** — do not run it. The ONLY greenlit parcel dedup is `parcel_subdivision` → the
two-county homes-only VIEW (§6a), and only after `lee_parcels` lands, passes §5, and the 3 readers in §4d repoint.

**Corrections folded from independent Sonnet verification (2026-07-18) — apply-ready:**
1. §1 SOH count fixed: **91,739** parcels show a positive SOH cap gap (`jv_hmstd > av_hmstd`), NOT
   107,029. The 107,029 figure is total *homesteaded* parcels (`av_hmstd > 0`) — a different, larger
   concept. The mean-cap dollar figure (~$386k) was already computed on the correct 91,739-row filter.
2. §3 gains a second, standalone reader of `leepa_parcels_sales_yearly`:
   `refinery/tools/ian-retrodiction-demo.mts:349` (a dev/demo tool, not a product surface — but it must
   be repointed/retired too; the §6b precondition-4 grep catches it).
3. §6b (the larger, sign-off-gated leepa deletion) gains a strict NON-NULL guard (precondition 2b) to
   match §6a's guard strength — the more consequential deletion was guarded more weakly than the smaller one.

## Ground truth confirmed live (2026-07-18)

| Object | Rows (live) | Cols | Source | Query |
|---|---|---|---|---|
| `data_lake.lee_parcels` | **does not exist** (`to_regclass` → null) | — | FDOR cadastral CO_NO=46 (ingest in flight) | `to_regclass('data_lake.lee_parcels')` = null |
| `data_lake.leepa_parcels` | 548,798 | 19 | LeePA appraiser feed (gissvr.leepa.org layers 9+10+12) | `count(*)` |
| `data_lake.collier_parcels` | 290,973 (= distinct `parcel_id`, no dupes) | 104 (102 data + 2 dlt) | FDOR centroid CO_NO=21 | `count(*)`, `count(distinct parcel_id)` |
| `data_lake.parcel_subdivision` | 604,362 (Collier 220,875 + Lee 383,487) | 28 | FDOR centroid, homes-only subset | `count(*)` grouped by county/property_type |

Key structural fact discovered live: **`collier_parcels`, `lee_parcels`, and `parcel_subdivision`
all pull from the SAME FeatureServer** —
`.../Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0/query` —
(`ingest/pipelines/collier_parcels/constants.py:37-40`, `ingest/pipelines/lee_parcels/constants.py:19-22`,
`ingest/pipelines/parcel_subdivision/constants.py:35-38`). The stale note in
`parcel_subdivision/constants.py:4-6` ("the cadastral layer does NOT expose S_LEGAL … 400s") is
disproven by the landed data: `collier_parcels.legal_description` is 99.8% populated (below). Lee's
`OUT_FIELDS` (`lee_parcels/constants.py:34-49`) is byte-identical to Collier's
(`collier_parcels/constants.py:51-66`) — on landing `lee_parcels` = the full 104-col Collier-shape table,
CO_NO=46.

---

# 1) Column-level diff — `leepa_parcels` (19) vs the FDOR wide schema (`collier_parcels` as `lee_parcels` proxy)

`leepa_parcels` columns from `information_schema.columns` (live). FDOR mapping to `collier_parcels`
columns (the shape `lee_parcels` lands with). Buckets per CLAUDE.md "derivable ≠ source-faithful".

### 1:1 — a single direct FDOR column carries the same value
| leepa column | FDOR (`collier_parcels`) column | Note |
|---|---|---|
| `just_value` | `jv` | FDOR "just value" (`JV`). Direct. |
| `land_value` | `land_value` (`LND_VAL`) | Direct; 99.8% populated in collier. |
| `use_code` | `pa_uc` (property-appraiser use code; `dor_uc` is the DOR twin) | 100% populated. |
| `last_sale_amount` | `sale_prc1` (`SALE_PRC1`, most-recent sale) | 99.8% populated. |
| `zip_code` | `phy_zipcd` (`PHY_ZIPCD`, native situs ZIP) | 100% populated. **Provenance nuance:** leepa `zip_code` was derived via a centroid→ZCTA join (LeePA's own feed lacks native ZIP; `leepa-sold-median-source.mts:11-15`), whereas FDOR `phy_zipcd` is the native situs ZIP — FDOR is the *stronger* ZIP source here. |

### Maps WITH A SPLIT — not a clean 1:1 (FDOR splits the concept; don't overclaim)
| leepa column | FDOR columns | Why not 1:1 |
|---|---|---|
| `assessed_value` | `av_sd` + `av_nsd` | FDOR splits assessed value into school-district vs non-school-district. LeePA carries one number. |
| `taxable_value` | `tv_sd` + `tv_nsd` | Same SD/NSD split. |
| `market_value` | `jv` (and `jv_class_u` for classified-use parcels) | FL statute equates "just" ≈ "market", but LeePA keeps `market_value` and `just_value` as *distinct* fields (they diverge on classified/agricultural use). FDOR's `jv` vs `jv_class_u` is the closest analog, not a single column. |

### DERIVABLE from FDOR (computed, source-faithful)
| leepa column | FDOR derivation | Verified |
|---|---|---|
| `soh_cap` | `jv_hmstd − av_hmstd` | `jv_hmstd`/`av_hmstd` both **100% populated** (290,973/290,973) in collier; **91,739** parcels show a positive SOH cap gap (`jv_hmstd > av_hmstd`), mean derived cap ≈ $386,042. (107,029 = total *homesteaded* parcels `av_hmstd > 0`, a different larger concept — don't conflate.) Structurally sound; parcel-level reconciliation to LeePA's own `soh_cap` needs a `folioid↔parcel_id` crosswalk that does not exist yet. |
| `cap_difference` | `jv_hmstd − av_hmstd` (SOH differential) | Same source columns. This is the field `leepa_parcels_summary` filters homesteads on (`cap_difference > 0`); FDOR reproduces it as the homestead just-minus-assessed differential. |
| `use_description` | `dor_uc` → description lookup | FDOR carries codes only (no text). Derivable from a DOR_UC→label table (the pack already hard-codes this mapping, `properties-lee-value.mts:597-600`). |
| `last_sale_date` | `sale_yr1` + `sale_mo1` | **PARTIAL** — FDOR carries year+month only, no day-of-month. leepa `last_sale_date` is a full `date`. Derivable to month precision; day precision is lost. |
| `last_sale_book_page` | `or_book_1` `‖` `or_page_1` | Concatenation of the FDOR official-record book + page. |

### NO faithful FDOR equivalent (LeePA-distinctive, or system)
| leepa column | Status |
|---|---|
| `folioid` | **Distinctive identifier.** FDOR keys on `parcel_id` (STRAP) + `alternate_key`; LeePA's numeric FOLIO ID is a different key system. Not a column-equivalent — a join would need a crosswalk. This is the LeePA↔FDOR join gap. |
| `building_value` | **No faithful equivalent.** FDOR NAL carries no improvement/building-value column. Approximable by subtraction (`jv − land_value − special_feature_value`) but that is a back-solve, not a source value (CLAUDE.md: derivable ≠ source-faithful → classify as no-faithful-equivalent). |
| `last_sale_instrument` | **No faithful equivalent.** FDOR carries `qual_cd1` (sale qualification) + `vi_cd1` (vacant/improved), not a deed-instrument type (WD/QC/etc). |
| `last_sale_date__v_text` | System artifact — dlt type-variant shadow of `last_sale_date`. Not a data concept; no FDOR analog. |
| `_dlt_load_id`, `_dlt_id` | dlt system columns. `collier_parcels` carries the same two — infrastructure, not data. |

**Answer to the task's specific hints:** `folioid` → yes, no FDOR equivalent (distinctive key).
`building_value` → yes, no *faithful* FDOR equivalent (FDOR has no improvement-value column; the
subtraction approximation is not source-faithful). `soh_cap`/`cap_difference` → confirmed derivable
from `jv_hmstd − av_hmstd` (live-verified: both columns 100% populated).

---

# 2) KEEP-vs-DELETE decision for `leepa_parcels` — as BOTH sides **[NEEDS-SIGN-OFF]**

This is a C1 architecture call (changes system shape). Below is the ratification-ready case for each
side plus exactly what each source feeds today. **No authority call is made here.**

### What each source feeds `properties-lee-value` TODAY (read from `refinery/packs/properties-lee-value.mts`)
`leepa_parcels` feeds **two** of the pack's sources, producing **5 metrics + 1 detail table**:
- `leepaValueSource` (`leepa-value-source.mts`, via `leepa_parcels_sales_yearly` + `leepa_parcels_summary`)
  → `sales_velocity_per_1k`, `sales_velocity_zscore`, `soh_gap_median_pct`, `total_parcels`
  (`properties-lee-value.mts:530-584`).
- `leepaSoldMedianSource` (`leepa-sold-median-source.mts`, via `leepa_sold_median_by_zip`)
  → `lee_sold_median_homes_only` metric + `lee_sold_median_by_zip` detail table
  (`properties-lee-value.mts:738-799`).

`lee_parcels` (FDOR) feeds **one** source, producing **1 metric**:
- `leeParcelsSource` (`lee-parcels-source.mts`, via `lee_parcels_summary` — a view that does not exist
  yet) → `fdor_commercial_parcel_count` + the use-code category breakdown fact
  (`properties-lee-value.mts:586-613`, `400-414`).

The pack's own docstring/caveats frame FDOR as a deliberate **cross-check, not a replacement**
(`properties-lee-value.mts:101-104`, `858`; `lee-parcels-source.mts:11-15`).

### Case to KEEP BOTH (the cross-check is real)
- **Independent sources, independent methodologies.** LeePA is the *county appraiser's own* feed
  (`leepa-value-source.mts:11-13`): it carries `market_value`, `building_value`, `assessed_value`,
  `soh_cap` as the appraiser publishes them. FDOR is the *state* tax roll. The two `total_parcels`
  legitimately differ (different snapshot dates, different inclusion rules) — the pack already
  states they "will not match exactly … read as a cross-check on scale, not reconciled to the
  parcel" (`properties-lee-value.mts:858`). Divergence between an independent appraiser feed and the
  state roll is itself signal the pack is built to exploit.
- **LeePA carries fields FDOR lacks faithfully:** `building_value` (no FDOR column), plus a
  full-precision `last_sale_date` (day, vs FDOR year+month) and a deed `last_sale_instrument`.

### Case that FDOR SUPERSEDES for `properties-lee-value`'s needs (the double-ingest is expensive)
- **Every parcel metric the pack computes off LeePA is reproducible from FDOR `lee_parcels`:**
  sales velocity (`sale_yr1` filtered `qual_cd1='01'`), SOH gap (`jv_hmstd`/`av_hmstd`/`tv_nsd`),
  total parcels, use-code categories (already the FDOR path), and the homes-only sold median
  (`sale_prc1` + `phy_zipcd` + `dor_uc` homes filter). FDOR's ZIP (`phy_zipcd`) is *natively situs*,
  removing the centroid→ZCTA join LeePA needs (`leepa-sold-median-source.mts:11-15`).
- **Cost of keeping both:** a second full-county parcel ingest — `leepa_parcels` is 548,798 rows via
  a *separate* dlt pipeline (`ingest/pipelines/leepa/`) hitting a different host (gissvr.leepa.org),
  plus its 3 dependent views — feeding, net of the sold-median, effectively the appraiser-specific
  value fields. `lee_parcels` (FDOR, same pipeline family as the already-DONE `collier_parcels`)
  would land the wide roll for one ingest.
- **Middle option worth putting to the operator:** retire `leepa_parcels` for the *velocity / SOH /
  total-parcel* metrics (move them to `lee_parcels`), but keep the LeePA **sold-median** lane if the
  full-precision `last_sale_date` + deed instrument materially improve the recorded-deed median over
  FDOR's month-grain `sale_yr1/sale_mo1`. This is a per-metric call, not all-or-nothing.

**[NEEDS-SIGN-OFF]** — the operator decides KEEP-BOTH vs FDOR-SUPERSEDES vs the per-metric middle.
Deletion of `leepa_parcels` is blocked until (a) this sign-off, (b) `lee_parcels` lands + passes §5,
and (c) the readers in §3 are repointed and rebuilt-green.

---

# 3) `leepa_parcels`'s 3 dependent views — readers + rebuild-on

All three are plain views over `data_lake.leepa_parcels` (definitions pulled live from
`information_schema.views`). Only **code** consumers listed (docs/SQL-file matches excluded).

### `leepa_parcels_sales_yearly`
- **Definition:** `SELECT EXTRACT(year FROM last_sale_date) AS sale_year, count(*) AS sales_count FROM leepa_parcels WHERE last_sale_date IS NOT NULL GROUP BY 1`.
- **Read by:** `refinery/sources/leepa-value-source.mts:33,165-170` (`SALES_YEARLY_VIEW`); ALSO a
  second, standalone reader `refinery/tools/ian-retrodiction-demo.mts:349` (its own Supabase query — a
  dev/demo tool, not a product surface, but repoint/retire it too before dropping the view).
- **Rebuild-on if leepa retired:** rebuild over `lee_parcels` using `sale_yr1` (FDOR) instead of
  `EXTRACT(year FROM last_sale_date)`, filtered to qualified sales `qual_cd1='01'`. **Semantic
  caveat:** leepa counts each parcel's *latest qualified sale* (one per parcel — the survival-bias
  the pack warns of, `properties-lee-value.mts:56-58`); FDOR carries the two most-recent sales
  (`sale_yr1/sale_yr2`). Counting `sale_yr1` where `qual_cd1='01'` is the faithful analog.

### `leepa_parcels_summary`
- **Definition:** `total_parcels = count(*)`; `soh_homesteaded_parcels = count(*) FILTER (cap_difference > 0)`;
  `soh_gap_median_pct = percentile_cont(0.5) of ((just_value − taxable_value)/just_value*100)` for homesteads.
- **Read by:** `refinery/sources/leepa-value-source.mts:34,177-180` (`SUMMARY_VIEW`).
- **Rebuild-on if leepa retired:** over `lee_parcels`: `total = count(*)`;
  homesteaded = `count(*) FILTER ((jv_hmstd − av_hmstd) > 0)` (derived `cap_difference`);
  `soh_gap_median = median((jv − tv_nsd)/jv*100)` over homesteads. Uses `jv`, `tv_nsd`/`tv_sd`,
  `jv_hmstd`, `av_hmstd` — all live-verified populated.

### `leepa_sold_median_by_zip`
- **Definition:** homes-only (`use_code IN ('01','04')`), `last_sale_amount > 20000`, within 1 year of
  `max(last_sale_date)`, median `last_sale_amount` per `zip_code`; ZIPs < 20 sales fall back to county median.
- **Read by:** `refinery/sources/leepa-sold-median-source.mts:27,80-84` (`VIEW`).
- **Rebuild-on if leepa retired:** over `lee_parcels`: homes filter on `dor_uc IN ('001','004')`
  (SF + condo), amount `sale_prc1 > 20000`, recency from `sale_yr1`+`sale_mo1`, ZIP `phy_zipcd`.
  **Caveat:** leepa uses a full `last_sale_date` (day precision) for the 1-year recency window; FDOR
  gives month precision only — the recency anchor coarsens.

**Note — a 4th, similarly-named view is the FDOR side, not a leepa dependent:** `lee_parcels_summary`
is read by `refinery/sources/lee-parcels-source.mts:27,52-56`; it is a summary over the *phantom*
`lee_parcels` (does not exist yet) and is unrelated to the leepa views. Don't conflate.

---

# 4) `parcel_subdivision` — homes-only subset proof, replacement VIEW, and the communities repoint

### 4a. Proof it is a homes-only subset of the FDOR wide layer EXCEPT `subdivision_name`

**Homes-only (live):** every `parcel_subdivision` row is a residential type — `single-family,
condominium, mobile, cooperative, duplex-small-multifamily, misc-residential` — for both counties;
NO commercial/industrial/agricultural/vacant/institutional rows exist (query grouped by
county+property_type; totals sum to 604,362). Contrast `collier_parcels`, the full wide layer, whose
`dor_uc` spreads across all 7 FDOR categories (residential 236,934, governmental 34,802, misc 11,435,
commercial 4,144, agricultural 1,902, industrial 1,123, institutional 633). The homes-only filter is
`property_type = DOR_HOME_TYPE[dor_uc]` for `dor_uc IN ('001','002','004','005','007','008')`
(`parcel_subdivision/constants.py:60-67`, `resources.py:91-93`).

**Column-for-column, every `parcel_subdivision` col maps to a `collier_parcels` (FDOR wide) col
EXCEPT `subdivision_name`:**
| parcel_subdivision (28) | FDOR wide (`collier_parcels`) source |
|---|---|
| `parcel_id` | `parcel_id` |
| `county` | derived from `co_no` (46/21) |
| `property_type` | derived from `dor_uc` via `DOR_HOME_TYPE` |
| `just_value` | `jv` |
| `zip` | `phy_zipcd` |
| **`subdivision_name`** | **DISTINCTIVE — a stem of `legal_description` (S_LEGAL); see 4b** |
| `phy_addr1` | `phy_addr1` |
| `sale_price_1/2`, `sale_year_1/2`, `sale_month_1/2`, `qual_cd_1/2`, `vi_cd_1/2` | `sale_prc1/2`, `sale_yr1/2`, `sale_mo1/2`, `qual_cd1/2`, `vi_cd1/2` |
| `living_area_sqft`, `actual_year_built`, `effective_year_built`, `land_value`, `building_count`, `residential_unit_count` | same-named FDOR cols |
| `neighborhood_code`, `market_area`, `assessment_year` | `neighborhood_code`, `market_area`, `assessment_year` |
| `_dlt_load_id`, `_dlt_id` | dlt system (both carry) |

Confirmed by the same-source fact: `parcel_subdivision` and `collier_parcels` come off the identical
centroid FeatureServer (§ground truth); `parcel_subdivision` is that layer's homes-only, narrower-column pull.

### 4b. `subdivision_name` is a parse of `legal_description` — PROVEN LIVE, and the SQL port is validated

- `subdivision_name` = `_stem(S_LEGAL)` (`parcel_subdivision/resources.py:110`), where `_stem`
  (`resources.py:75-82`) = uppercase → strip `\b(UNIT|PHASE|TRACT|BLOCK|BLK|REPLAT|AMENDED|ADDITION|ADD|SECTION|SEC)\b.*$`
  → non-alnum→space → collapse whitespace. Byte-identical twin: `normalizeSubdivisionName`
  (`refinery/lib/subdivision-aliases.mts:28-35`).
- `legal_description` IS populated in the wide table: **290,391 / 290,973 (99.8%)** in `collier_parcels`.
  (Disproves the stale "cadastral 400s on S_LEGAL" note.)
- **Live join proves the derivation reproduces `subdivision_name` exactly**, including the
  qualifier-strip branch: over all 220,399 joined Collier homes with a non-null legal, the SQL stem
  port matched `parcel_subdivision.subdivision_name` at **100.00% (220,399/220,399)**. Samples:
  `"POINCIANA VILLAGE UNIT 1 BLK"→"POINCIANA VILLAGE"`, `"QUAIL CREEK UNIT 2 BLK V LOT"→"QUAIL CREEK"`,
  `"18 46 28 BEG 873.7FT W +"→"18 46 28 BEG 873 7FT W"`.
- **Postgres regex landmine (confirmed):** Postgres regex `\b` is a BACKSPACE, not a word boundary.
  The port MUST use `\y`. The validated expression (matched 100%):
  ```
  trim(regexp_replace(
    regexp_replace(
      regexp_replace(upper(legal_description),
        '\y(UNIT|PHASE|TRACT|BLOCK|BLK|REPLAT|AMENDED|ADDITION|ADD|SECTION|SEC)\y.*$', ''),
      '[^A-Z0-9 ]', ' ', 'g'),
    '\s+', ' ', 'g'))
  ```

### 4c. The replacement homes-only VIEW (design — TEXT, not yet creatable: needs `lee_parcels`)

Retire `parcel_subdivision` by replacing it with ONE two-county homes-only VIEW over
`lee_parcels` (Lee) + `collier_parcels` (Collier). **Expose `parcel_subdivision`'s EXACT column names**
(`zip` not `phy_zipcd`, `sale_price_1` not `sale_prc1`, …) so every reader repoint is a table-name swap,
not a code rewrite. Retirement is **atomic** (both readers scan the whole table — you cannot drop the
Lee rows alone). Sketch (illustrative; do not create until `lee_parcels` lands + §5 passes):

```sql
-- DESIGN ONLY. Requires data_lake.lee_parcels to exist (§5). Columns/names mirror parcel_subdivision.
CREATE OR REPLACE VIEW data_lake.parcel_subdivision_v AS
WITH src AS (
  SELECT parcel_id, 'lee'::text AS county, dor_uc, jv, phy_zipcd, legal_description, phy_addr1,
         sale_prc1, sale_yr1, sale_mo1, qual_cd1, vi_cd1, sale_prc2, sale_yr2, sale_mo2, qual_cd2, vi_cd2,
         living_area_sqft, actual_year_built, effective_year_built, land_value, building_count,
         residential_unit_count, neighborhood_code, market_area, assessment_year
  FROM data_lake.lee_parcels
  UNION ALL
  SELECT parcel_id, 'collier'::text AS county, dor_uc, jv, phy_zipcd, legal_description, phy_addr1,
         sale_prc1, sale_yr1, sale_mo1, qual_cd1, vi_cd1, sale_prc2, sale_yr2, sale_mo2, qual_cd2, vi_cd2,
         living_area_sqft, actual_year_built, effective_year_built, land_value, building_count,
         residential_unit_count, neighborhood_code, market_area, assessment_year
  FROM data_lake.collier_parcels
)
SELECT parcel_id, county,
       CASE dor_uc WHEN '001' THEN 'single-family' WHEN '002' THEN 'mobile' WHEN '004' THEN 'condominium'
                   WHEN '005' THEN 'cooperative' WHEN '007' THEN 'misc-residential'
                   WHEN '008' THEN 'duplex-small-multifamily' END AS property_type,
       jv AS just_value,
       phy_zipcd AS zip,
       trim(regexp_replace(regexp_replace(regexp_replace(upper(legal_description),
         '\y(UNIT|PHASE|TRACT|BLOCK|BLK|REPLAT|AMENDED|ADDITION|ADD|SECTION|SEC)\y.*$',''),
         '[^A-Z0-9 ]',' ','g'), '\s+',' ','g')) AS subdivision_name,
       phy_addr1,
       sale_prc1 AS sale_price_1, sale_yr1 AS sale_year_1, sale_mo1 AS sale_month_1, qual_cd1 AS qual_cd_1, vi_cd1 AS vi_cd_1,
       sale_prc2 AS sale_price_2, sale_yr2 AS sale_year_2, sale_mo2 AS sale_month_2, qual_cd2 AS qual_cd_2, vi_cd2 AS vi_cd_2,
       living_area_sqft, actual_year_built, effective_year_built, land_value, building_count,
       residential_unit_count, neighborhood_code, market_area, assessment_year
FROM src
WHERE dor_uc IN ('001','002','004','005','007','008');
```
**[NEEDS-SIGN-OFF]** for materialize-vs-view and for whether to keep the `parcel_subdivision` name
(recreate as a view of the same name so readers need zero change) vs a new name + repoint.

### 4d. communities-swfl's exact name-join + the repoint before the Lee slice can go

- **communities-swfl does NOT read `parcel_subdivision` directly.** Its source connector
  (`refinery/sources/communities-swfl-source.mts:42-43`) reads `neighborhood_stats` + `community_profiles`.
- **`neighborhood_stats` IS built from `parcel_subdivision`** — `ingest/duckdb_pipelines/neighborhood_stats/agg.py:50-67`
  reads the whole `parcel_subdivision` table, LEFT JOINs an alias map (`fixtures/community-aliases.json`
  via `_alias_map`), then `GROUP BY (county, resolved_name)` computing `home_count`,
  `median(just_value)`, `median(actual_year_built)`, and count-by-`property_type`. The name-join key is
  `COALESCE(alias.canonical_label, subdivision_name)` (`agg.py:52`).
- **The alias fold is the join** — `subdivision_name` (stemmed legal) → marketed-community canonical
  label, one-to-many, keyed off `fixtures/community-aliases.json` (`subdivision-aliases.mts:40-55`;
  the TS reader `lib/listings/community-lookup.ts:161-164` must stay in lockstep with agg.py's fold).

**Readers that must be repointed before `parcel_subdivision` (Lee or whole) can go — the full set:**
1. `ingest/duckdb_pipelines/neighborhood_stats/agg.py:50-67` — reads whole `parcel_subdivision`.
   Repoint the Postgres-attach glue (`neighborhood_stats/pipeline.py`) to load the replacement VIEW
   instead of `data_lake.parcel_subdivision`. Because the VIEW exposes identical column names
   (`county, subdivision_name, just_value, actual_year_built, property_type`), `agg.py`'s SQL needs
   no change. Then **rebuild `neighborhood_stats` and confirm it matches** the pre-retirement rollup
   (§6 precondition).
2. `lib/listings/community-lookup.ts:106-121` (`fetchCandidateRows`) — reads `parcel_subdivision`
   directly (`county, subdivision_name, zip, phy_addr1`, filtered by `zip` + `ilike phy_addr1`).
   Repoint `PARCEL_TABLE = "parcel_subdivision"` (line 39) to the replacement VIEW.
3. `app/r/source/_tables.ts:58-62` — registers `parcel_subdivision` as a published source-provenance
   table (the `/r/source/[table]` page). Update the registry key to the replacement view name (or
   keep the name if 4c recreates a same-named view).

Only after all three are repointed and `neighborhood_stats` rebuilds green can the Lee slice (or the
whole table) be dropped. Because agg.py + community-lookup scan both counties, **the Lee slice cannot
be dropped independently** — retirement is atomic; the whole table goes at once once the two-county
VIEW serves both halves (Collier half works today; Lee half waits on `lee_parcels`).

---

# 5) LANDING VERIFICATION GATE for `lee_parcels` (must pass before any repoint/delete)

`lee_parcels` does not exist yet. On landing, run these checks. **Row-count nuance (do NOT hard-assert
556k):** the FDOR centroid `returnCountOnly` for `CO_NO=46` is **556,100 FEATURES** (live curl,
2026-07-18), but the pipeline merges on `primary_key='parcel_id'`, so **landed rows = distinct
parcel_ids, which is materially lower than the feature count.** Precedent: `collier_parcels` landed
290,973 distinct parcel_ids against a 364,827 feature `returnCountOnly` for `CO_NO=21` (0.798 ratio;
zero dupes in the landed table). Applying that ratio, expect Lee to land ≈ 440k–470k, NOT 556k. The
gate anchors on the pipeline's own fetched-vs-canonical assert, not a fixed number.

**Gate checks:**
1. **Existence:** `to_regclass('data_lake.lee_parcels')` is not null.
2. **County purity:** `SELECT count(*) FILTER (WHERE co_no <> 46) FROM data_lake.lee_parcels` = 0
   AND `count(DISTINCT co_no)` = 1. (CO_NO=46 only — no contamination.)
3. **Row-count sanity (band, not equality):** landed `count(*) = count(DISTINCT parcel_id)` (no dupes);
   landed rows within the pipeline's `assert_vs_canonical` floor of the LIVE `returnCountOnly` for
   `CO_NO=46` at ingest time (currently 556,100 features → expect ≈ 0.75–0.85× distinct-parcel ratio,
   i.e. ~415k–475k); cross-check the landed count is the same order as `leepa_parcels` (548,798, a
   different source) — a 10× miss means a broken ingest.
   **If Lee's feature→distinct ratio departs sharply from Collier's 0.798, investigate before trusting
   either — the 73,854-feature Collier gap is unexplained by this stream (multi-centroid-per-parcel
   merge collapse is the likely benign cause, but not proven).**
4. **All 102 data fields present:** `SELECT count(*) FROM information_schema.columns WHERE
   table_schema='data_lake' AND table_name='lee_parcels'` = 104 (102 data + `_dlt_load_id` + `_dlt_id`),
   and the column set equals `collier_parcels`'s (byte-identical OUT_FIELDS guarantees this).
5. **Core-field population (FDOR zero-fills — "populated" means NOT NULL; 0 is a valid FDOR value):**
   load-bearing columns should read ~100% not-null, matching the Collier proxy:
   `jv` 100%, `pa_uc` 100%, `dor_uc` 100%, `phy_zipcd` 100%, `sale_yr1` 100%, `tv_nsd` 100%,
   `jv_hmstd`/`av_hmstd` 100%; `land_value`/`sale_prc1`/`living_area_sqft`/`legal_description` ~99.8%.
   Do NOT flag sparse-concept columns (e.g. `jv_conservation` reads 99.8% not-null in Collier only
   because FDOR stamps 0, not because the concept applies) as failures.
6. **Use-code spread across all types (proves the wide layer, not a homes-only pull):** `dor_uc`
   grouped into the 7 FDOR categories must show non-trivial counts in residential AND at least
   commercial/governmental/agricultural/institutional (mirroring Collier's all-7 spread), i.e.
   `lee_parcels` is NOT accidentally the homes-only subset.
7. **`legal_description` populated ≥ 99% (not null):** the derivation in §4 depends on it; verify Lee
   matches Collier's 99.8% before trusting the replacement view's `subdivision_name` for the Lee half.

---

# 6) GUARDED DELETION SQL — **TEXT ONLY, DO NOT RUN** (RULE 1 operator-gated)

Deletion is blocked until: `lee_parcels` lands + §5 passes; replacement objects built; every reader
repointed (grep proves zero remaining raw-table reads); dependent rollups rebuilt-green; and (for
leepa) the §2 sign-off says "retire". Each block leads with a precondition SELECT whose expected
result must hold before the DROP line. **Order: drop dependents (views) before base tables.**

### 6a. `parcel_subdivision` — clearly redundant (homes-only subset; subdivision_name re-derivable 100%)
```sql
-- ===== DO NOT RUN. Guarded-deletion TEXT for data_lake.parcel_subdivision. =====
-- PRECONDITION 1 — replacement VIEW exists and serves both counties non-empty:
--   SELECT county, count(*) FROM data_lake.parcel_subdivision_v GROUP BY county;   -- expect lee>0 AND collier>0
-- PRECONDITION 2 — neighborhood_stats was rebuilt from the VIEW and MATCHES the pre-retirement rollup:
--   (compare row count + per-(county,subdivision_name) home_count/median_just_value before vs after; expect identical)
-- PRECONDITION 3 — NO code reader of the raw table remains (must all return zero / be repointed):
--   grep 'parcel_subdivision' in: ingest/duckdb_pipelines/neighborhood_stats/{agg.py,pipeline.py},
--   lib/listings/community-lookup.ts, app/r/source/_tables.ts  -> all point at the VIEW, not the table.
-- PRECONDITION 4 — non-null guard on the load-bearing derived column in the replacement:
--   SELECT count(*) FILTER (WHERE subdivision_name IS NULL OR subdivision_name='') FROM data_lake.parcel_subdivision_v;
--   -- expect ~0 (matches parcel_subdivision's own ~0.04% null rate)
-- Only if all four hold:
-- DROP TABLE IF EXISTS data_lake.parcel_subdivision;   -- (its parcel-subdivision-annual cron + workflow also retire)
```
Note: if 4c recreates a same-named VIEW `data_lake.parcel_subdivision`, the base table must first be
renamed/dropped and the view created in one migration — sequence so no reader ever sees an empty gap.

### 6b. `leepa_parcels` + 3 views — ONLY if §2 sign-off = "retire" **[NEEDS-SIGN-OFF]**
```sql
-- ===== DO NOT RUN. Guarded-deletion TEXT for data_lake.leepa_parcels (+ dependent views). =====
-- BLOCKED unless §2 operator sign-off explicitly says "retire leepa in favor of lee_parcels".
-- PRECONDITION 1 — lee_parcels landed + passed the §5 gate.
-- PRECONDITION 2 — FDOR-backed replacement views exist and serve correct live numbers:
--   lee_parcels_sales_yearly, lee_parcels_summary, lee_sold_median_by_zip  (rebuilt over lee_parcels per §3)
--   -- verify each returns plausible numbers matching leepa's within the documented cross-check tolerance.
-- PRECONDITION 2b — STRICT NON-NULL guard on the replacement views' load-bearing columns
--   (mirror 6a's guard strength — the bigger deletion must not be guarded more weakly than the smaller):
--   SELECT count(*) FILTER (WHERE soh_gap_median_pct IS NULL) FROM data_lake.lee_parcels_summary;        -- expect 0
--   SELECT count(*) FILTER (WHERE sales_count IS NULL)        FROM data_lake.lee_parcels_sales_yearly;   -- expect 0
--   SELECT count(*) FILTER (WHERE median_sale IS NULL)        FROM data_lake.lee_sold_median_by_zip;     -- expect 0 for in-scope ZIPs
-- PRECONDITION 3 — properties-lee-value sources repointed off leepa:
--   refinery/sources/leepa-value-source.mts        -> reads lee_parcels_sales_yearly + lee_parcels_summary
--   refinery/sources/leepa-sold-median-source.mts  -> reads lee_sold_median_by_zip
--   AND the pack rebuilt green (bun run refinery -- properties-lee-value --target-only) with metrics intact.
-- PRECONDITION 4 — NO remaining code reader of leepa_parcels or its 3 views:
--   grep 'leepa_parcels' / 'leepa_parcels_sales_yearly' / 'leepa_parcels_summary' / 'leepa_sold_median_by_zip'
--   across refinery/, lib/, app/, scripts/  -> zero product reads (docs/fixtures excluded).
-- Order: views before base table.
-- DROP VIEW IF EXISTS data_lake.leepa_sold_median_by_zip;
-- DROP VIEW IF EXISTS data_lake.leepa_parcels_sales_yearly;
-- DROP VIEW IF EXISTS data_lake.leepa_parcels_summary;
-- DROP TABLE IF EXISTS data_lake.leepa_parcels;   -- (its leepa dlt pipeline + cron also retire)
```
If §2 sign-off = KEEP BOTH (or the per-metric middle), leepa is NOT deleted — this block stays inert.

---

## Redundancy verdicts (ratification-ready, tagged)
- `parcel_subdivision` → **redundant once `lee_parcels` lands** (homes-only subset of the same
  centroid layer; `subdivision_name` re-derivable at 100% via the validated `\y` stem). Replace with
  the two-county VIEW, repoint 3 readers, rebuild `neighborhood_stats`, then drop. **[NEEDS-SIGN-OFF]**
  on view-vs-materialize + same-name-vs-repoint.
- `leepa_parcels` → **KEEP/DELETE is a genuine two-sided call** — feeds 5 metrics + 1 detail table
  today vs FDOR's 1 metric; independent-appraiser cross-check value vs a 548k-row second ingest.
  **[NEEDS-SIGN-OFF]** — do not delete without the §2 decision.

## Blockers / unresolved (surfaced, not resolved by this stream)
- `lee_parcels` does not exist yet — every repoint/delete/gate here is pre-staged, blocked on the
  in-flight FDOR ingest landing + passing §5.
- Unexplained: `collier_parcels` landed 290,973 distinct parcel_ids vs a 364,827-feature centroid
  canonical (73,854 gap). Benign merge-collapse is the likely cause but is NOT proven by this stream;
  it directly shapes the Lee row-count band in §5 and should be explained before hard-setting the gate floor.
