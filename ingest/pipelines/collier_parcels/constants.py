"""Constants for the Collier County parcel ingest (FDOR statewide NAL).

Source is the Florida Department of Revenue statewide cadastral (the annual
tax roll in GIS form), served as a public ArcGIS FeatureServer — the auto-
ingestable equivalent of Lee's LeePA appraiser feed. Free, no auth, no scraping.

REPOINTED 07/11/2026 — the polygon layer we used through 06/06
(Florida_Statewide_Cadastral/FeatureServer/0) was republished as the full 2025
NAL (14 fields -> 100+, 364k Collier -> 10.8M statewide) and now REJECTS every
attribute-field WHERE with a 200-body-400 (`CO_NO=21` -> "Unable to perform
query"), so the ingest silently no-op'd while the freshness probe read FRESH.
The FloridaGIO CENTROID twin below is NOT locked, carries the same 100+ NAL
fields (incl. SALE_PRC1, which the old 14-field layer lacked), and returns the
exact 364,827 Collier count via the same OBJECTID keyset paging. Point geometry.
See docs/handoff/2026-07-11-source-liveness-and-collier-handoff.md.

Verified live 2026-07-11 on the centroid twin:
  - where=CO_NO=21 -> 364,827 parcels, cities NAPLES / MARCO ISLAND.
  - This 2025 NAL uses the STANDARD FDOR alphabetical county code: Alachua=11
    (OBJECTID=1 -> CO_NO 11 = GAINESVILLE), ... Collier=21, ... Lee=46. So
    CO_NO=21 = Collier is correct here — do NOT "correct" it.
  - Homes-only sold median reads: SALE_PRC1, SALE_YR1, QUAL_CD1, DOR_UC, PHY_ZIPCD
    (situs ZIP, native — no centroid->ZCTA join needed, unlike Lee/LeePA).

WIDENED 07/18/2026 (RULE 0.4 FULL-SCOPE-FIRST) — the layer carries 120 fields
total; this ingest previously pulled 15. Field-by-field meanings verified against
FDOR's live 2025 NAL Data File User's Guide (crawl4ai + direct fetch,
floridarevenue.com/property/dataportal/.../2025_NAL_SDF_NAP_Users_Guide.pdf),
not guessed from the truncated ArcGIS aliases. Now pulls every field on the layer
except: 14 owner/fiduciary PII fields (OWN_*/FIDU_* — deliberate exclusion, same
policy as parcel_subdivision) and 4 ArcGIS-internal row-tracking artifacts with
no NAL spec match (OBJECTID, OID_, ORIG_FID, PARCELNO). No DOR_UC filter — every
parcel type (residential, commercial, vacant, agricultural, institutional) is
included, same as before this widening.
"""

COLLIER_CADASTRAL_URL = (
    "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services"
    "/Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0/query"
)

# Standard FDOR alphabetical county code — Collier=21 (verified live 07/11/2026).
COLLIER_CO_NO_WHERE = "CO_NO=21"

# FDOR qualified arms-length sale code (verified: code 01 carries realistic prices;
# nominal $100 transfers carry disqualified codes 11/17/30/37).
QUALIFIED_SALE_CODE = "01"

# All 102 non-PII, non-internal NAL fields the layer carries (of 120 total) —
# verified field-by-field against FDOR's 2025 NAL Data File User's Guide.
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
