# Parcel structure pass — column allow-list + dimensionality read

- **As of:** 07/22/2026
- **Commit:** `9152cddd`
- **Command:** `python -m ingest.analysis.parcel_structure --profile-only`
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

### Floors used

Profile-only run — no floors applied, no allow-list produced.

