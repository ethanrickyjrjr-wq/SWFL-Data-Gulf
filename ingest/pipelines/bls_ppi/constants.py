"""Constants for bls_ppi pipeline."""
from datetime import datetime

# Full "Nonresidential Building Construction" sector (NAICS 236 subset — BLS's own
# NRBC initiative grouping). Verified live 07/17/2026 against
# download.bls.gov/pub/time.series/pc/pc.industry (industry code + title list) and
# individually re-confirmed at data.bls.gov/timeseries/<id> for the 3 non-obvious
# ids (236400, 236500, 2381MR) whose "Series Title" field was cross-checked before
# adding. Broadened from the original 2 (236211, 236221) per
# docs/superpowers/specs/2026-07-17-bls-ppi-cre-swfl-consumer-design.md — that doc
# also confirms NO residential-construction PPI series exists at BLS (no NAICS
# 2361xx entries anywhere in the industry list); the old "residential" label on
# the original 2 series was simply wrong, not a wrong-series mixup.
SERIES_IDS = [
    "PCU236211236211",  # New industrial building construction
    "PCU236221236221",  # New warehouse building construction
    "PCU236222236222",  # New school building construction
    "PCU236223236223",  # New office building construction
    "PCU236224236224",  # New health care building construction
    "PCU23811X23811X",  # Concrete contractors, nonresidential building work
    "PCU23816X23816X",  # Roofing contractors, nonresidential building work
    "PCU23821X23821X",  # Electrical contractors, nonresidential building work
    "PCU23822X23822X",  # Plumbing/HVAC contractors, nonresidential building work
    "PCU236400236400",  # New nonres. building construction by contractor type/region
    "PCU236500236500",  # New nonres. building construction by region
    "PCU2381MR2381MR",  # Nonresidential building maintenance & repair
]

# Why 10y: BLS POST caps at 20 years; match FRED G.17 / Census VIP 10-year window.
def current_year_window() -> tuple[str, str]:
    now = datetime.now()
    return str(now.year - 9), str(now.year)

SOURCE_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
BUCKET = "lake-tier1"
