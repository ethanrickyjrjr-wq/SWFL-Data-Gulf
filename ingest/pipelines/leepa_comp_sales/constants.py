LEEPA_MAPSERVER_BASE = "https://gissvr.leepa.org/gissvr/rest/services/ParcelInfo/MapServer"

# Layer 23 — "Comparable Sales". Feature Layer, maxRecordCount 1000 (must page).
#
# WHY THIS LAYER. It is the ONLY LeePA surface carrying BedRooms / Bathrooms. Neither
# leepa_parcels (Lee Property Appraiser) nor lee_parcels (FDOR) has a bedroom or bathroom
# column at all — see docs/sql/20260722_lee_comp_sales_view.sql, which documents that gap
# as the reason lee_comp_sales_v falls back to living_area_sqft as its only home test.
#
# WHAT IT DOES NOT FIX (data-roots T10, verbatim): SaleYear + SaleMonth are separate
# integers, so this layer is MONTH GRAIN like everything else we serve. It does NOT fix
# sale-date recency. The normalizer therefore stores the two integers as-is plus a
# first-of-month `sale_month` DATE for range queries — it must NEVER synthesize a
# day-of-month, which would assert precision the source does not have.
LEEPA_COMP_SALES_URL = f"{LEEPA_MAPSERVER_BASE}/23/query"

# The FULL field census, live-probed 07/22/2026 — all 16 fields the layer exposes.
# This IS the full scope; there is no ceiling beyond it (FULL-SCOPE-FIRST, CLAUDE.md).
#   FOLIOID (int) · OBJECTID (OID) · SaleYear (int) · SaleMonth (int) · DeedType (string)
#   dorcode (string) · BuildingCount (int) · BedRooms (double) · Bathrooms (double)
#   NbhdLand (string) · Pool (string) · YearBuilt (smallint) · GrossArea (double)
#   ImpCode (int) · SalePrice (STRING, formatted "$245,000") · SHAPE (geometry)
#
# We pull every attribute EXCEPT SHAPE. Measured payload 07/22/2026: 100 rows =
# 27,629 bytes without geometry vs 58,929 with — geometry more than doubles the pull for
# a polygon we already hold on the parcel spine. If coordinates are ever wanted, request
# them as attribute columns, never the full polygon.
COMP_SALES_OUT_FIELDS = ",".join([
    "FOLIOID",
    "SaleYear",
    "SaleMonth",
    "DeedType",
    "dorcode",
    "BuildingCount",
    "BedRooms",
    "Bathrooms",
    "NbhdLand",
    "Pool",
    "YearBuilt",
    "GrossArea",
    "ImpCode",
    "SalePrice",
])

TABULAR_BUCKET = "raw-tabular-cold"
