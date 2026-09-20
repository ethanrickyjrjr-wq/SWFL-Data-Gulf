BLS_QCEW_BASE_URL = "https://data.bls.gov/cew/data/api"

# Path layout re-verified live 09/20/2026 against
# https://www.bls.gov/cew/additional-resources/open-data/csv-data-slices.htm
# ("NEW: https://data.bls.gov/cew/data/api/2026/1/area/US000.csv") — unchanged.
#
# https://www.bls.gov/bls/pss.htm: BLS "reserves the right to block robots that do
# not contain information that can be used to contact the owner. Blocking may occur
# in real time." The default python-requests UA carries no contact, so every
# data.bls.gov call sends this one.
BLS_HEADERS = {"User-Agent": "swfldatagulf-ingest/1.0 (contact: ops@swfldatagulf.com)"}

# Area FIPS codes for the three geographies we track
AREA_FIPS = {
    "florida":  "12000",
    "lee":      "12071",
    "collier":  "12021",
}
