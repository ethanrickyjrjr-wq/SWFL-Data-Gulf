# FDIC BankFind Suite API — public, no key. `banks.data.fdic.gov/api` 301-redirects here.
API_BASE = "https://api.fdic.gov/banks"

# Lee, Collier, Hendry — the platform's core scope (CLAUDE.md, locked 07/07/2026).
COUNTY_FIPS = ("12071", "12021", "12051")

# Vendor-validated maximum (`validate:too_big ... less than or equal to 10000`, probed 09/22/2026).
PAGE_LIMIT = 10_000

# Volume floors = 90% of the live totals probed 09/22/2026 (SOD 6,160 + 4,297 + 302 = 10,759 rows
# 1994-2026; locations 165 + 128 + 5 = 298; 198 distinct CERTs across both).
SOD_MIN_ROWS = 9_683
LOCATIONS_MIN_ROWS = 268
INSTITUTIONS_MIN_ROWS = 178

# Columns the consumer view looks up BY NAME — a vendor rename must fail loud, not coerce to NULL.
SOD_REQUIRED = ("ID", "YEAR", "CERT", "BRNUM", "STCNTYBR", "DEPSUMBR")
LOCATIONS_REQUIRED = ("ID", "CERT", "STCNTY", "UNINUM", "NAME", "OFFNAME", "ADDRESS", "ZIP", "LATITUDE", "LONGITUDE", "SERVTYPE_DESC", "ESTYMD")
INSTITUTIONS_REQUIRED = ("ID", "CERT", "NAME", "ACTIVE", "ASSET", "DEP", "NETINC", "ROA", "ROE", "CHARTER", "NAMEHCR", "STCNTY")

# Institutions are fetched by CERT list; 60 ORs per request verified 09/22/2026, 50 keeps headroom.
CERT_BATCH = 50
