"""Constants for the Collier County building permits pipeline."""

LISTING_PAGE_URL = (
    "https://www.colliercountyfl.gov/Business-Resources/Building-Permits-Construction"
    "/Meetings-Advisory-Boards-Reports/Monthly-Building-Permit-Reports"
)
BASE_URL = "https://www.colliercountyfl.gov"

CENSUS_GEOCODER_URL = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch"
CENSUS_BATCH_SIZE = 9_999  # Census hard limit is 10,000 rows per request

MAX_RADIUS_MI = 1.5  # haversine threshold — matches Lee corridor-assignment

# Issued-only: Applied series would need a (permit_number, series) composite PK.
SERIES = "issued"

# Exact column names as they appear in the XLSX (row 1, header=1).
# Verified against April 2026 download on 2026-05-27.
COLUMN_MAP = {
    "Permit Number": "permit_number",
    "Declared Value": "declared_value",
    "Building Type": "building_type",
    "Permit Class": "permit_class",
    "Permit Type Desc": "permit_type_desc",
    "Permit Status": "permit_status",
    "Site Address": "site_address",
    "Property ID": "property_id",
    "Date Issued": "date_issued",
    "Date Applied": "date_applied",
    "Total SF": "total_sf",
    "Total Units": "total_units",
    "Const Type": "const_type",
    "Owner Name": "owner_name",
    "City": "owner_city",
    "State": "owner_state",
    "Zip": "owner_zip",
    "Contractor Type": "contractor_type",
    "License Number": "license_number",
    "Contractor Name": "contractor_name",
    "City 1": "contractor_city",
    "State 1": "contractor_state",
    "Zip 1": "contractor_zip",
}
