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

# SALE_PRC1 added 07/11/2026 — the republished NAL carries the sale price the old
# 14-field layer lacked; it feeds the homes-only sold-median-per-ZIP view.
OUT_FIELDS = (
    "PARCEL_ID,JV,JV_HMSTD,AV_HMSTD,AV_SD,AV_NSD,TV_NSD,"
    "SALE_PRC1,SALE_YR1,SALE_MO1,QUAL_CD1,VI_CD1,PHY_ZIPCD,DOR_UC,PA_UC"
)

PAGE_SIZE = 2000  # = layer maxRecordCount
