"""Constants for condo_baseline_swfl.

Sources (all verified live 08/30/2026 — counts in comments are that day's):

Lee County building footprints (LeePA-sourced, county GIS), attribute-only pull.
  Layer fields include MaxStories, ResidentialUnits, ActualYearBuilt, SubCondoName,
  CondoBldgNo, BldgUseType, STRAP. 1,426 rows match LEE_WHERE (BldgUseType=CONDOMINIUM,
  3+ stories). NOT `SubCondoName IS NOT NULL`: that field is populated for ordinary
  platted subdivisions too, and the 2,352 it returned included 545 apartment/hotel,
  186 single-family and 91 office buildings (grouped live 08/30/2026). The 1,426 still
  contain 61 "Condominium - Time Share", 10 "- Commercial" and 8 "- Hotel" rows —
  kept, because 553.899 keys on the condominium form of ownership, not on use.
Collier County Milestone Inspection program (Building Plan Review), ArcGIS feature
  service behind the county's public Milestone Map. 926 rows; ApplicationStatus
  breakdown 08/30/2026: Cycle Completed 553 / Not Due 353 / Delinquent 18 / Phase 1 2.
Collier "Milestone Buildings by Year" PDF — the same permit list with two columns the
  feature service lacks: building CO date and next milestone due date. 20 text pages,
  ~900 rows, "As of January 2026" header, Last-Modified 2026-02-25.

Statutes (2026 FS): 553.899 (milestone inspection: 3+ stories, 30 yrs from CO, 25 yrs
if within 3 miles of coastline); 718.112(2)(g) (SIRS); 718.501(3) (building report).

Baseline caveat, by county:
  LEE     — footprints are a true physical baseline (every 3+-story condo building the
            appraiser mapped), independent of any compliance program.
  COLLIER — the milestone list contains only buildings that have ENTERED the county's
            program; a Collier building not on it is invisible to us. Shipped as a
            "program-registered baseline", named as such in the brain. collier_parcels
            (FDOR NAL) carries no stories field, so no physical baseline exists yet.
"""

PIPELINE = "condo_baseline_swfl"
PACK_ID = "condo-sirs-swfl"

# Gate-12 convention: `*_TABLE = "name"` constants are how the pre-push hook finds
# the tables this pipeline writes (see .claude/hooks/lib/table-consumer.mjs).
BUILDINGS_TABLE = "condo_buildings_swfl"
XREF_TABLE = "condo_association_xref"
COMPLIANCE_VIEW = "condo_compliance_swfl_v"
SIRS_TABLE = "dbpr_sirs_submissions"

# ── Lee ─────────────────────────────────────────────────────────────────────
LEE_FOOTPRINTS_LAYER = (
    "https://gismapserver.leegov.com/gisserver910/rest/services/DataExplorer/LandRecords/MapServer/8"
)
LEE_FOOTPRINTS_QUERY_URL = LEE_FOOTPRINTS_LAYER + "/query"
LEE_FOOTPRINTS_DOC_URL = (
    "https://gismapserver.leegov.com/gisserver910/rest/services/DataExplorer/LandRecords/MapServer"
)
# 553.899 applies to condominium/cooperative buildings three or more stories in height.
# BldgUseType is the appraiser's ownership-form code; see the module docstring for why
# SubCondoName is NOT the filter.
LEE_WHERE = "MaxStories>=3 AND BldgUseType='CONDOMINIUM'"
LEE_FIELDS = (
    "OBJECTID,STRAP,FolioID,BuildingKey,ParcelBldgNo,SubCondoName,CondoBldgNo,"
    "StreetAddress,PostalCity,PostalCode,BldgUseType,BldgDescription,"
    "ResidentialUnits,MaxStories,ActualYearBuilt,ModifyDate"
)
LEE_MIN_ROWS = 1000  # 1,426 on 08/30/2026 — well under this means a broken pull

# ── Collier ─────────────────────────────────────────────────────────────────
COLLIER_MILESTONE_LAYER = (
    "https://services2.arcgis.com/SlIq32SqARUHIhSx/arcgis/rest/services/MilestoneMap/FeatureServer/2"
)
COLLIER_MILESTONE_QUERY_URL = COLLIER_MILESTONE_LAYER + "/query"
COLLIER_MILESTONE_DOC_URL = (
    "https://www.collier.gov/government/growth-management-community-development/divisions/"
    "building-plan-review-and-inspection/milestone-inspections"
)
COLLIER_FIELDS = (
    "OBJECTID,PermitNumber,ApplicationName,AssociationName,Application_Status,"
    "ApplicationStatus,NextMilestoneInspectionYear,CommissionerDistrict,"
    "PermitLocation,SiteAddressID"
)
COLLIER_MIN_ROWS = 500  # 926 on 08/30/2026

COLLIER_PDF_URL = (
    "https://www.collier.gov/files/assets/county/v/2/building-plan-review/documents/"
    "milestone/milestone-buildings-by-year.pdf"
)
COLLIER_PDF_MIN_JOIN_RATE = 0.90  # PDF rows that must join the feature service on PermitNumber

# ── Matching ────────────────────────────────────────────────────────────────
# Token-set Jaccard thresholds on normalized association names.
DETERMINISTIC_ACCEPT = 0.85  # top score at/above this AND clear runner-up gap → no LLM
RUNNER_UP_MAX = 0.50  # runner-up must be at/below this for a deterministic accept
CANDIDATE_MIN = 0.30  # below this a name is not even offered to the model
MAX_CANDIDATES = 5

LLM_CALL_TYPE = "ingest_condo_xref"
LLM_TASK = (
    "Decide whether the QUERY (a Florida DBPR SIRS filing: association name, project name, "
    "city, zip) is the same condominium association as one of the CANDIDATE buildings "
    "(county property records: association/condo name, address, city, zip). Naming varies: "
    "'X CONDOMINIUM ASSOCIATION INC' vs 'X, A CONDO' vs 'X CONDO' are the same. Different "
    "phase/building numbers of the same association are the same association. A different "
    "street or a different community is NOT a match."
)
