"""Lee County Planned Developments — the community-boundary source.

Lee County Department of Community Development, "Planned Developments".
Info page:      https://www.leegov.com/dcd/zoning/pd
FeatureServer:  layer 0 below — esriGeometryPolygon, native wkid 2237 (NAD83 Florida
State Plane West, FEET). We request outSR=4326 so the SERVER reprojects to WGS84 —
the reprojection failure class (State Plane feet read as degrees) is deleted, not
guarded client-side. maxRecordCount 2000, pagination supported.

SCOPE — never drop this sentence: the layer covers UNINCORPORATED Lee County only,
plus some legacy incorporated polygons. Cape Coral, Fort Myers and Bonita Springs are
NOT fully covered. This source must never be described as "the community answer for
Lee" (spec: docs/superpowers/specs/2026-08-12-community-crosswalk-design.md).

Field census (26 fields) + category counts live in ingest/cadence_registry.yaml
`source_scope` for this pipeline — measured live 08/28/2026, 1,629 features.
"""

LEE_PD_FEATURESERVER_URL = (
    "https://services2.arcgis.com/LvWGAAhHwbCJ2GMP/arcgis/rest/services/"
    "PlannedDevelopments/FeatureServer/0/query"
)
LEE_PD_INFO_URL = "https://www.leegov.com/dcd/zoning/pd"

TABLE_NAME = "lee_planned_developments"
TABULAR_BUCKET = "raw-tabular-cold"

# The honest joinable universe — applied at READ (the spatial join), NEVER at ingest.
# All 1,629 features land; a Pending polygon becomes Approved next quarter and
# filtering at ingest would silently rewrite history.
#
# A NAMED residential allowlist, never a negation (failure mode 1: the largest
# category is CPD — Commercial Planned Development, 749 features — and including it
# maps homes into shopping centers). Measured 08/28/2026: Approved ∩ this list = 490.
RESIDENTIAL_ZONING_CATEGORIES = frozenset(
    ["RPD", "PUD", "MPD", "MHPD", "RVPD", "CFPD-RPD", "CPD-RPD", "MHPD-RVPD"]
)
APPROVED_STATUS = "Approved"  # exact — "Approved/Pending" (1 feature) is NOT approved

# INPUTMETHOD values whose boundaries are hand-drawn or self-declared bad — the
# assignment still lands (provenance travels), but every CONSUMER must stay SILENT
# for these (failure mode 6: a silent miss is correct; a wrong community shipped as
# a stated fact is not). Measured 08/28/2026: 4 Sketched + 1 "Bad Legal" in the
# Approved-residential scope.
LOW_TRUST_INPUT_METHODS = frozenset(["Sketched", "Bad Legal"])

# Lee County lat/lon envelope (generous: mainland + Sanibel/Captiva/Boca Grande).
# A bounds ASSERTION, not a served number — State Plane feet leaking through as
# degrees lands six figures outside this box and must fail loud, never write
# (failure mode 3).
LEE_LAT_MIN, LEE_LAT_MAX = 26.0, 27.1
LEE_LON_MIN, LEE_LON_MAX = -82.6, -81.2
