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
  - CO_NO=46 (Lee) record queries 400 on BOTH statewide layers (count works, records
    don't) — a broken Lee partition. Lee is ingested from a SEPARATE source (see
    ingest/pipelines/lee_parcel_subdivision, follow-up F1). Do not pull Lee here.
"""

CENTROID_URL = (
    "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services"
    "/Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0/query"
)

# EMPIRICALLY verified Collier filter for THIS layer (matches collier_parcels'
# cadastral-layer finding — CO_NO=21 confirmed by returned city names + count).
CO_NO = {"collier": 21}  # lee(46) record-queries 400 here — see constants docstring.

OUT_FIELDS = "OBJECTID,PARCEL_ID,S_LEGAL,DOR_UC,JV,PHY_ZIPCD,PHY_ADDR1"

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
