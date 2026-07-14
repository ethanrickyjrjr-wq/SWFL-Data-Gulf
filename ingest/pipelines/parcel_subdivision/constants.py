"""Constants for the parcel -> subdivision-name ingest (communities-swfl Phase 1 T2).

Source: FDOR Statewide Parcel Centroid FeatureServer ("Florida_Statewide_Parcel_
Centroid_Version"), layer 0 — the CENTROID-version layer, not the cadastral layer
`collier_parcels` uses. The cadastral layer does NOT expose `S_LEGAL` (requesting
it 400s); the centroid layer does.

Verified live 2026-07-05 / re-verified 2026-07-06:
  - where=(CO_NO=21) -> 364,827 Collier parcels. Carries PARCEL_ID, S_LEGAL, DOR_UC,
    PA_UC, JV, PHY_ADDR1, PHY_CITY, PHY_ZIPCD (all populated).
  - RETRIEVAL METHOD (07/06/2026): do NOT keyset-paginate this layer. A
    `where=(CO_NO=21) AND OBJECTID>N` + `orderByFields` + `resultRecordCount` query
    soft-400s ("Invalid query parameters") at specific deep cursors — NOT a data
    problem (every "failing" OBJECTID is individually queryable, S_LEGAL intact),
    it's the sorted-pagination query shape this layer chokes on. Use the official
    Esri pattern instead: `returnIdsOnly=true` (returns all 364,827 IDs in one call)
    then fetch by `objectIds` in batches (resources.py). `returnCountOnly=true`
    (bare, no LIKE/centroid) works and is used for the canonical count.

CORRECTION 2026-07-14 — the "CO_NO=46 (Lee) is a broken partition" claim that used
to live here was STALE. It was diagnosed with the OLD keyset-pagination query shape
(the same shape that produced Collier's false "dead zone" above), never retested
against the returnIdsOnly+objectIds fix. Verified live 07/14/2026: where=(CO_NO=46)
-> 556,100 Lee parcels; returnIdsOnly returns all 556,100 OIDs cleanly; objectIds
batch-fetches at the start, a random 250-id sample spread across the WHOLE range,
and the tail of the range all returned full S_LEGAL/PHY_ADDR1/PARCEL_ID (0 nulls in
a 250-row random sample) — real Cape Coral/Bonita Springs/Lehigh Acres/North Fort
Myers addresses and legal descriptions, DOR_UC distribution matching the expected
home-type codes. Lee needs no separate source or spatial join — same layer, same
retrieval code as Collier, just CO_NO=46. (`verification/communities-lee-source-
probe.md`'s spatial-join recommendation was scoped to LeePA's OWN services, which
really do lack a subdivision-name field — it never tried this statewide layer.)
"""

CENTROID_URL = (
    "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services"
    "/Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0/query"
)

# EMPIRICALLY verified filters for THIS layer (matches collier_parcels' cadastral-
# layer finding for Collier — CO_NO=21/46 confirmed by returned city names + count).
CO_NO = {"collier": 21, "lee": 46}

# Widened 07/14/2026 (CLAUDE.md RULE 0.4 FULL-SCOPE-FIRST) — this layer is the full 120-field
# DOR NAL file; the original 7-field pull left sale price/date, physical facts, and DOR's own
# neighborhood code sitting unused in the same response. Owner/fiduciary PII (OWN_*, FIDU_*)
# deliberately excluded. See docs/handoff/2026-07-14-community-data-into-builder-handoff.md.
OUT_FIELDS = (
    "OBJECTID,PARCEL_ID,S_LEGAL,DOR_UC,JV,PHY_ZIPCD,PHY_ADDR1,"
    "SALE_PRC1,SALE_YR1,SALE_MO1,QUAL_CD1,VI_CD1,"
    "SALE_PRC2,SALE_YR2,SALE_MO2,QUAL_CD2,VI_CD2,"
    "TOT_LVG_AR,ACT_YR_BLT,EFF_YR_BLT,LND_VAL,NO_BULDNG,NO_RES_UNT,"
    "NBRHD_CD,MKT_AR,ASMNT_YR"
)

PAGE_SIZE = 2000

# FDOR DOR use codes -> home property_type. Non-residential and vacant-residential
# codes are dropped (not in this map) per the design spec's home-count scope.
DOR_HOME_TYPE = {
    "001": "single-family",
    "002": "mobile",
    "004": "condominium",
    "005": "cooperative",
    "007": "misc-residential",
    "008": "duplex-small-multifamily",
}

# Stripped from a legal description to leave the bare community/subdivision name
# (e.g. "HERITAGE BAY UNIT 12" -> "HERITAGE BAY"). Kept byte-identical to
# `normalizeSubdivisionName` in refinery/lib/subdivision-aliases.mts — Python and
# TS must stem to the same string or the alias reconciler's slugs drift apart.
SUBDIVISION_QUALIFIER_PATTERN = (
    r"\b(UNIT|PHASE|TRACT|BLOCK|BLK|REPLAT|AMENDED|ADDITION|ADD|SECTION|SEC)\b.*$"
)
