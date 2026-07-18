"""Constants for the Lee County parcel ingest (FDOR statewide NAL).

Sibling to ingest/pipelines/collier_parcels — same FDOR ArcGIS Statewide Parcel
Centroid FeatureServer, same 102-field scope, filtered to CO_NO=46 (Lee)
instead of CO_NO=21 (Collier). Built 07/18/2026 alongside collier_parcels'
widen: Lee never had a comprehensive FDOR-sourced parcel table (its existing
value-direction pack, properties-lee-value, sources from the LeePA appraiser
feed instead — a different, Lee-specific source; this pipeline is the FDOR
counterpart, giving Lee the same full field/parcel-type coverage Collier has).

No DOR_UC filter — every parcel type included (residential, commercial,
vacant, agricultural, institutional), same as collier_parcels.

Field-by-field meanings verified against FDOR's live 2025 NAL Data File User's
Guide (crawl4ai + direct fetch,
floridarevenue.com/property/dataportal/.../2025_NAL_SDF_NAP_Users_Guide.pdf).
"""

LEE_CADASTRAL_URL = (
    "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services"
    "/Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0/query"
)

# Standard FDOR alphabetical county code — Lee=46 (same numbering
# collier_parcels verified live 07/11/2026: Alachua=11 ... Collier=21 ... Lee=46).
LEE_CO_NO_WHERE = "CO_NO=46"

# FDOR qualified arms-length sale code (verified: code 01 carries realistic prices;
# nominal $100 transfers carry disqualified codes 11/17/30/37).
QUALIFIED_SALE_CODE = "01"

# Identical field scope to collier_parcels.OUT_FIELDS — all 102 non-PII,
# non-internal NAL fields the layer carries (of 120 total).
OUT_FIELDS = (
    "PARCEL_ID,CO_NO,FILE_T,ASMNT_YR,BAS_STRT,ATV_STRT,GRP_NO,DOR_UC,PA_UC,SPASS_CD,"
    "JV,JV_CHNG,JV_CHNG_CD,AV_SD,AV_NSD,TV_SD,TV_NSD,JV_HMSTD,AV_HMSTD,"
    "JV_NON_HMS,AV_NON_HMS,JV_RESD_NO,AV_RESD_NO,JV_CLASS_U,AV_CLASS_U,"
    "JV_H2O_REC,AV_H2O_REC,JV_CONSRV_,AV_CONSRV_,JV_HIST_CO,AV_HIST_CO,"
    "JV_HIST_SI,AV_HIST_SI,JV_WRKNG_W,AV_WRKNG_W,NCONST_VAL,DEL_VAL,"
    "PAR_SPLT,DISTR_CD,DISTR_YR,LND_VAL,LND_UNTS_C,NO_LND_UNT,LND_SQFOOT,"
    "DT_LAST_IN,IMP_QUAL,CONST_CLAS,EFF_YR_BLT,ACT_YR_BLT,TOT_LVG_AR,"
    "NO_BULDNG,NO_RES_UNT,SPEC_FEAT_,"
    "M_PAR_SAL1,QUAL_CD1,VI_CD1,SALE_PRC1,SALE_YR1,SALE_MO1,OR_BOOK1,OR_PAGE1,CLERK_NO1,S_CHNG_CD1,"
    "M_PAR_SAL2,QUAL_CD2,VI_CD2,SALE_PRC2,SALE_YR2,SALE_MO2,OR_BOOK2,OR_PAGE2,CLERK_NO2,S_CHNG_CD2,"
    "S_LEGAL,APP_STAT,CO_APP_STA,MKT_AR,NBRHD_CD,PUBLIC_LND,TAX_AUTH_C,"
    "TWN,RNG,SEC,CENSUS_BK,PHY_ADDR1,PHY_ADDR2,PHY_CITY,PHY_ZIPCD,ALT_KEY,"
    "ASS_TRNSFR,PREV_HMSTD,ASS_DIF_TR,CONO_PRV_H,PARCEL_ID_,YR_VAL_TRN,"
    "SEQ_NO,RS_ID,MP_ID,STATE_PAR_,SPC_CIR_CD,SPC_CIR_YR,SPC_CIR_TX"
)

PAGE_SIZE = 2000  # = layer maxRecordCount
