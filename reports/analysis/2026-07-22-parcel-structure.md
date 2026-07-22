# Parcel structure pass — column allow-list + dimensionality read

- **As of:** 07/22/2026
- **Commit:** `29c62f79`
- **Command:** `python -m ingest.analysis.parcel_structure --max-zero-share 0.95 --min-distinct 2 --min-non-null-share 0.5 --max-distinct-share 0.99 --corr-threshold 0.8`
- **Source `data_lake.collier_parcels`:** 290,973 rows
- **Source `data_lake.lee_parcels`:** 556,083 rows

SCOPE BOUNDARY: the challenger trains on the data_lake.listing_week panel, which contains NO parcel columns. A result showing no lift from a tree ensemble says nothing about whether parcel data helps — parcel data was never in the feature set. The parcel structure pass informs a FUTURE model iteration; the panel-to-parcel join is not built.

This report ships no number, renders no surface, and touches no served path. It is evidence for a decision, not a served value.

### `lee_parcels` — observed distribution (59 numeric columns)

Ordered by zero-share, descending. Read this to CHOOSE the floors; the floors are not chosen for you.

    column                          non_null_share  zero_share  distinct
    jv_change                              1.0000      1.0000         1
    jv_change_code                         1.0000      1.0000         1
    jv_h2o_recharge                        1.0000      1.0000         1
    av_h2o_recharge                        1.0000      1.0000         1
    jv_hist_commercial                     1.0000      1.0000         1
    av_hist_commercial                     1.0000      1.0000         1
    jv_hist_significant                    1.0000      1.0000         1
    av_hist_significant                    1.0000      1.0000         1
    jv_working_waterfront                  1.0000      1.0000         1
    av_working_waterfront                  1.0000      1.0000         1
    special_circumstances_code             1.0000      1.0000         1
    special_circumstances_year             1.0000      1.0000         1
    jv_conservation                        1.0000      0.9996       203
    av_conservation                        1.0000      0.9996       151
    sale_change_code_2                     1.0000      0.9994         6
    parcel_split_code                      1.0000      0.9976        19
    sale_change_code_1                     1.0000      0.9966         6
    deletion_value                         1.0000      0.9966     1,851
    prev_homestead_owners                  1.0000      0.9949         5
    assessment_diff_transferred            1.0000      0.9949     2,744
    prev_homestead_county_no               1.0000      0.9949        43
    year_value_transferred                 1.0000      0.9949         4
    jv_class_use                           1.0000      0.9947     2,098
    av_class_use                           1.0000      0.9947     2,167
    construction_class                     1.0000      0.9811         6
    sale_prc2                              1.0000      0.9782     1,883
    sale_yr2                               1.0000      0.9717         3
    jv_resd_non_resd                       1.0000      0.9411    19,866
    av_resd_non_resd                       1.0000      0.9411    20,584
    new_construction_value                 1.0000      0.9388    26,220
    disaster_code                          1.0000      0.9384         2
    disaster_year                          1.0000      0.9384         3
    sale_prc1                              1.0000      0.8547     7,749
    sale_yr1                               1.0000      0.8440         3
    jv_hmstd                               1.0000      0.6191   140,672
    av_hmstd                               1.0000      0.6191   157,355
    special_feature_value                  1.0000      0.5630    83,460
    jv_non_hmstd_resd                      1.0000      0.4512   109,819
    av_non_hmstd_resd                      1.0000      0.4512   124,890
    residential_unit_count                 1.0000      0.2993       220
    living_area_sqft                       1.0000      0.2848    14,297
    effective_year_built                   1.0000      0.2846        82
    actual_year_built                      1.0000      0.2846       127
    building_count                         1.0000      0.2846        47
    land_value                             1.0000      0.1784    34,561
    land_unit_count                        1.0000      0.1595    12,744
    land_unit_code                         1.0000      0.1592         6
    tv_nsd                                 1.0000      0.0486   253,872
    tv_sd                                  1.0000      0.0437   254,373
    jv                                     1.0000      0.0174   224,279
    av_sd                                  1.0000      0.0174   250,175
    av_nsd                                 1.0000      0.0174   261,096
    land_sqft                              1.0000      0.0068    30,632
    date_last_inspection                   1.0000      0.0028       160
    co_no                                  1.0000      0.0000         1
    assessment_year                        1.0000      0.0000         1
    sale_mo1                               0.1560      0.0000        12
    sale_mo2                               0.0283      0.0000        12
    file_sequence_no                       1.0000      0.0000   556,083

### `lee_parcels` — excluded columns (32)

FM 5: printed with their rates, never silently dropped.

- `assessment_year` — **constant** (non_null_share=1.0000 zero_share=0.00 distinct=1 distinct_share=0.0000)
- `av_h2o_recharge` — **constant** (non_null_share=1.0000 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `av_hist_commercial` — **constant** (non_null_share=1.0000 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `av_hist_significant` — **constant** (non_null_share=1.0000 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `av_working_waterfront` — **constant** (non_null_share=1.0000 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `co_no` — **constant** (non_null_share=1.0000 zero_share=0.00 distinct=1 distinct_share=0.0000)
- `jv_change` — **constant** (non_null_share=1.0000 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `jv_change_code` — **constant** (non_null_share=1.0000 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `jv_h2o_recharge` — **constant** (non_null_share=1.0000 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `jv_hist_commercial` — **constant** (non_null_share=1.0000 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `jv_hist_significant` — **constant** (non_null_share=1.0000 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `jv_working_waterfront` — **constant** (non_null_share=1.0000 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `special_circumstances_code` — **constant** (non_null_share=1.0000 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `special_circumstances_year` — **constant** (non_null_share=1.0000 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `file_sequence_no` — **identifier** (non_null_share=1.0000 zero_share=0.00 distinct=556083 distinct_share=1.0000)
- `sale_mo1` — **sparse** (non_null_share=0.1560 zero_share=0.00 distinct=12 distinct_share=0.0001)
- `sale_mo2` — **sparse** (non_null_share=0.0283 zero_share=0.00 distinct=12 distinct_share=0.0008)
- `assessment_diff_transferred` — **zero_filled** (non_null_share=1.0000 zero_share=0.99 distinct=2744 distinct_share=0.0049)
- `av_class_use` — **zero_filled** (non_null_share=1.0000 zero_share=0.99 distinct=2167 distinct_share=0.0039)
- `av_conservation` — **zero_filled** (non_null_share=1.0000 zero_share=1.00 distinct=151 distinct_share=0.0003)
- `construction_class` — **zero_filled** (non_null_share=1.0000 zero_share=0.98 distinct=6 distinct_share=0.0000)
- `deletion_value` — **zero_filled** (non_null_share=1.0000 zero_share=1.00 distinct=1851 distinct_share=0.0033)
- `jv_class_use` — **zero_filled** (non_null_share=1.0000 zero_share=0.99 distinct=2098 distinct_share=0.0038)
- `jv_conservation` — **zero_filled** (non_null_share=1.0000 zero_share=1.00 distinct=203 distinct_share=0.0004)
- `parcel_split_code` — **zero_filled** (non_null_share=1.0000 zero_share=1.00 distinct=19 distinct_share=0.0000)
- `prev_homestead_county_no` — **zero_filled** (non_null_share=1.0000 zero_share=0.99 distinct=43 distinct_share=0.0001)
- `prev_homestead_owners` — **zero_filled** (non_null_share=1.0000 zero_share=0.99 distinct=5 distinct_share=0.0000)
- `sale_change_code_1` — **zero_filled** (non_null_share=1.0000 zero_share=1.00 distinct=6 distinct_share=0.0000)
- `sale_change_code_2` — **zero_filled** (non_null_share=1.0000 zero_share=1.00 distinct=6 distinct_share=0.0000)
- `sale_prc2` — **zero_filled** (non_null_share=1.0000 zero_share=0.98 distinct=1883 distinct_share=0.0034)
- `sale_yr2` — **zero_filled** (non_null_share=1.0000 zero_share=0.97 distinct=3 distinct_share=0.0000)
- `year_value_transferred` — **zero_filled** (non_null_share=1.0000 zero_share=0.99 distinct=4 distinct_share=0.0000)

### `lee_parcels` — correlation clusters (|r| >= 0.8)

27 screened columns collapse to **17 clusters**. The representative is the highest-cardinality member.

- **`av_nsd`** (absorbs: `av_resd_non_resd`, `av_sd`, `jv`, `jv_resd_non_resd`, `living_area_sqft`)
- **`tv_sd`** (absorbs: `tv_nsd`)
- **`av_non_hmstd_resd`** (absorbs: `jv_non_hmstd_resd`)
- **`sale_yr1`**
- **`disaster_year`** (absorbs: `disaster_code`)
- **`av_hmstd`** (absorbs: `jv_hmstd`)
- **`actual_year_built`** (absorbs: `effective_year_built`)
- **`residential_unit_count`**
- **`land_unit_code`**
- **`sale_prc1`**
- **`land_unit_count`**
- **`date_last_inspection`**
- **`special_feature_value`**
- **`land_value`**
- **`land_sqft`**
- **`new_construction_value`**
- **`building_count`**

### `lee_parcels` — PCA explained variance (reported only, never served)

- **9** components explain 80% of variance.
- **15** components explain 95% of variance.
- First component alone: 30.5%.

This is a dimensionality READ. No component is persisted, written to the allow-list, or served — the allow-list is named columns only (FM 4).

### `lee_parcels` — ALLOW-LIST (17 columns)

- `actual_year_built`
- `av_hmstd`
- `av_non_hmstd_resd`
- `av_nsd`
- `building_count`
- `date_last_inspection`
- `disaster_year`
- `land_sqft`
- `land_unit_code`
- `land_unit_count`
- `land_value`
- `new_construction_value`
- `residential_unit_count`
- `sale_prc1`
- `sale_yr1`
- `special_feature_value`
- `tv_sd`

### `collier_parcels` — observed distribution (59 numeric columns)

Ordered by zero-share, descending. Read this to CHOOSE the floors; the floors are not chosen for you.

    column                          non_null_share  zero_share  distinct
    jv_change                              0.9980      0.9980         1
    jv_change_code                         0.9980      0.9980         1
    jv_h2o_recharge                        0.9980      0.9980         1
    av_h2o_recharge                        0.9980      0.9980         1
    jv_conservation                        0.9980      0.9980         1
    av_conservation                        0.9980      0.9980         1
    jv_hist_commercial                     0.9980      0.9980         1
    av_hist_commercial                     0.9980      0.9980         1
    jv_hist_significant                    0.9980      0.9980         1
    av_hist_significant                    0.9980      0.9980         1
    jv_working_waterfront                  0.9980      0.9980         1
    av_working_waterfront                  0.9980      0.9980         1
    special_circumstances_code             0.9980      0.9980         1
    special_circumstances_year             0.9980      0.9980         1
    sale_change_code_2                     0.9980      0.9977         6
    parcel_split_code                      0.9980      0.9935        20
    prev_homestead_owners                  0.9980      0.9919         4
    assessment_diff_transferred            0.9980      0.9919     1,582
    prev_homestead_county_no               0.9980      0.9919        32
    year_value_transferred                 0.9980      0.9919         4
    disaster_code                          0.9980      0.9916         3
    disaster_year                          0.9980      0.9916         7
    jv_class_use                           0.9980      0.9915     1,098
    av_class_use                           0.9980      0.9915     1,016
    deletion_value                         0.9980      0.9889     2,209
    sale_change_code_1                     0.9980      0.9879         8
    sale_prc2                              0.9980      0.9710       663
    sale_yr2                               0.9980      0.9710         3
    new_construction_value                 0.9980      0.9710     5,613
    sale_yr1                               1.0000      0.8803         3
    sale_prc1                              0.9980      0.8786     4,220
    jv_resd_non_resd                       0.9980      0.8172    10,316
    av_resd_non_resd                       0.9980      0.8172    10,801
    special_feature_value                  0.9980      0.6649    56,853
    av_hmstd                               1.0000      0.6322    90,837
    jv_hmstd                               1.0000      0.6322    81,484
    construction_class                     0.9980      0.5990         6
    building_count                         0.9980      0.5707        38
    jv_non_hmstd_resd                      0.9980      0.5455    65,040
    av_non_hmstd_resd                      0.9980      0.5455    73,732
    land_sqft                              0.9980      0.3677    21,089
    land_value                             0.9980      0.3544    52,643
    land_unit_code                         0.9980      0.3544         6
    land_unit_count                        0.9980      0.3544    20,684
    residential_unit_count                 0.9980      0.2290        96
    living_area_sqft                       0.9980      0.2250    12,515
    effective_year_built                   0.9980      0.2197       109
    actual_year_built                      0.9980      0.2197       116
    tv_nsd                                 1.0000      0.1315   163,696
    tv_sd                                  0.9980      0.1237   157,479
    jv                                     1.0000      0.0000   143,049
    av_sd                                  1.0000      0.0000   156,820
    av_nsd                                 1.0000      0.0000   165,466
    sale_mo1                               0.1197      0.0000        12
    co_no                                  0.9980      0.0000         1
    assessment_year                        0.9980      0.0000         1
    date_last_inspection                   0.9980      0.0000        26
    sale_mo2                               0.0270      0.0000        12
    file_sequence_no                       0.9980      0.0000   290,391

### `collier_parcels` — excluded columns (34)

FM 5: printed with their rates, never silently dropped.

- `assessment_year` — **constant** (non_null_share=0.9980 zero_share=0.00 distinct=1 distinct_share=0.0000)
- `av_conservation` — **constant** (non_null_share=0.9980 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `av_h2o_recharge` — **constant** (non_null_share=0.9980 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `av_hist_commercial` — **constant** (non_null_share=0.9980 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `av_hist_significant` — **constant** (non_null_share=0.9980 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `av_working_waterfront` — **constant** (non_null_share=0.9980 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `co_no` — **constant** (non_null_share=0.9980 zero_share=0.00 distinct=1 distinct_share=0.0000)
- `jv_change` — **constant** (non_null_share=0.9980 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `jv_change_code` — **constant** (non_null_share=0.9980 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `jv_conservation` — **constant** (non_null_share=0.9980 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `jv_h2o_recharge` — **constant** (non_null_share=0.9980 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `jv_hist_commercial` — **constant** (non_null_share=0.9980 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `jv_hist_significant` — **constant** (non_null_share=0.9980 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `jv_working_waterfront` — **constant** (non_null_share=0.9980 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `special_circumstances_code` — **constant** (non_null_share=0.9980 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `special_circumstances_year` — **constant** (non_null_share=0.9980 zero_share=1.00 distinct=1 distinct_share=0.0000)
- `file_sequence_no` — **identifier** (non_null_share=0.9980 zero_share=0.00 distinct=290391 distinct_share=1.0000)
- `sale_mo1` — **sparse** (non_null_share=0.1197 zero_share=0.00 distinct=12 distinct_share=0.0003)
- `sale_mo2` — **sparse** (non_null_share=0.0270 zero_share=0.00 distinct=12 distinct_share=0.0015)
- `assessment_diff_transferred` — **zero_filled** (non_null_share=0.9980 zero_share=0.99 distinct=1582 distinct_share=0.0054)
- `av_class_use` — **zero_filled** (non_null_share=0.9980 zero_share=0.99 distinct=1016 distinct_share=0.0035)
- `deletion_value` — **zero_filled** (non_null_share=0.9980 zero_share=0.99 distinct=2209 distinct_share=0.0076)
- `disaster_code` — **zero_filled** (non_null_share=0.9980 zero_share=0.99 distinct=3 distinct_share=0.0000)
- `disaster_year` — **zero_filled** (non_null_share=0.9980 zero_share=0.99 distinct=7 distinct_share=0.0000)
- `jv_class_use` — **zero_filled** (non_null_share=0.9980 zero_share=0.99 distinct=1098 distinct_share=0.0038)
- `new_construction_value` — **zero_filled** (non_null_share=0.9980 zero_share=0.97 distinct=5613 distinct_share=0.0193)
- `parcel_split_code` — **zero_filled** (non_null_share=0.9980 zero_share=0.99 distinct=20 distinct_share=0.0001)
- `prev_homestead_county_no` — **zero_filled** (non_null_share=0.9980 zero_share=0.99 distinct=32 distinct_share=0.0001)
- `prev_homestead_owners` — **zero_filled** (non_null_share=0.9980 zero_share=0.99 distinct=4 distinct_share=0.0000)
- `sale_change_code_1` — **zero_filled** (non_null_share=0.9980 zero_share=0.99 distinct=8 distinct_share=0.0000)
- `sale_change_code_2` — **zero_filled** (non_null_share=0.9980 zero_share=1.00 distinct=6 distinct_share=0.0000)
- `sale_prc2` — **zero_filled** (non_null_share=0.9980 zero_share=0.97 distinct=663 distinct_share=0.0023)
- `sale_yr2` — **zero_filled** (non_null_share=0.9980 zero_share=0.97 distinct=3 distinct_share=0.0000)
- `year_value_transferred` — **zero_filled** (non_null_share=0.9980 zero_share=0.99 distinct=4 distinct_share=0.0000)

### `collier_parcels` — correlation clusters (|r| >= 0.8)

25 screened columns collapse to **17 clusters**. The representative is the highest-cardinality member.

- **`av_nsd`** (absorbs: `av_sd`, `jv`, `tv_nsd`, `tv_sd`)
- **`av_hmstd`** (absorbs: `jv_hmstd`)
- **`av_resd_non_resd`** (absorbs: `jv_resd_non_resd`)
- **`building_count`**
- **`special_feature_value`**
- **`actual_year_built`** (absorbs: `effective_year_built`)
- **`av_non_hmstd_resd`** (absorbs: `jv_non_hmstd_resd`)
- **`living_area_sqft`**
- **`sale_yr1`**
- **`land_sqft`**
- **`residential_unit_count`**
- **`date_last_inspection`**
- **`land_unit_code`**
- **`sale_prc1`**
- **`construction_class`**
- **`land_unit_count`**
- **`land_value`**

### `collier_parcels` — PCA explained variance (reported only, never served)

- **8** components explain 80% of variance.
- **13** components explain 95% of variance.
- First component alone: 32.7%.

This is a dimensionality READ. No component is persisted, written to the allow-list, or served — the allow-list is named columns only (FM 4).

### `collier_parcels` — ALLOW-LIST (17 columns)

- `actual_year_built`
- `av_hmstd`
- `av_non_hmstd_resd`
- `av_nsd`
- `av_resd_non_resd`
- `building_count`
- `construction_class`
- `date_last_inspection`
- `land_sqft`
- `land_unit_code`
- `land_unit_count`
- `land_value`
- `living_area_sqft`
- `residential_unit_count`
- `sale_prc1`
- `sale_yr1`
- `special_feature_value`

### Floors used

- max_zero_share = 0.95
- min_distinct = 2
- min_non_null_share = 0.5
- max_distinct_share = 0.99
- corr_threshold = 0.8

Chosen from the observed distribution above, not from the spec.
