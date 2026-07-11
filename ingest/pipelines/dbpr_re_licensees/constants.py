"""Constants for the DBPR RE licensee (new-agent radar) pipeline.

Column layout verified live 07/10/2026 AND re-verified 07/11/2026 via byte-range curl of the
real file (307/307 sampled rows were exactly 23 columns; the 0-indexed positional map below was
confirmed field-for-field against real rows) — NOT the DBPR public-records page's prose column
list, which undercounts (same trap that bit fl_dbpr_licenses' applicant file). See
docs/superpowers/specs/2026-07-11-new-agent-radar-design.md Sources section for the full
verification trail and a real sample row.
"""

# The RE_rgn7.csv extract. Despite the "rgn7" name, the live file is effectively statewide —
# a 07/11/2026 byte-range probe found Lee, Collier, Charlotte, DeSoto, Glades, Hendry,
# Highlands, Sarasota AND Broward, Escambia, Pinellas, "Out of State", and blank county rows.
# The spec's "8 Region-7 counties" framing is prose from the DBPR page, not the file's real
# contents. This is why the county filter below is load-bearing, not cosmetic: we keep
# Lee + Collier only (CLAUDE.md SCOPE) and drop everything else.
RE_RGN7_URL = "https://www2.myfloridalicense.com/sto/file_download/extracts/RE_rgn7.csv"

# Human-readable citation URL for provenance (matches fl_dbpr_licenses' DBPR_CITATION_URL pattern).
CITATION_URL = "https://www2.myfloridalicense.com/instant-public-records/"

# ── Column positions (0-indexed, RE_rgn7.csv — no header row) ──────────────────────────────
COL_BOARD_NUMBER = 0              # always "25" (Real Estate board)
COL_LICENSE_TYPE = 1             # CODE + label, e.g. "2501 Real Estate Broker or Sales"
COL_LICENSEE_NAME = 2             # raw "LAST, FIRST MIDDLE"
COL_DBA_NAME = 3
COL_RANK = 4                      # CODE + label, e.g. "SL Sales Associate"
COL_ADDRESS1 = 5
COL_ADDRESS2 = 6
COL_ADDRESS3 = 7
COL_CITY = 8
COL_STATE = 9
COL_ZIP = 10
COL_COUNTY_CODE = 11             # DBPR 2-digit, e.g. "46" (Lee), "21" (Collier)
COL_COUNTY_NAME = 12             # e.g. "Lee", "Collier"
COL_LICENSE_NUMBER = 13
COL_PRIMARY_STATUS = 14           # e.g. "Current"
COL_SECONDARY_STATUS = 15         # e.g. "Active", "Invol Inactive"
COL_ORIGINAL_LICENSE_DATE = 16
COL_STATUS_EFFECTIVE_DATE = 17
COL_LICENSE_EXPIRATION_DATE = 18
COL_ALTERNATE_LICENSE_NUMBER = 19  # e.g. "SL3014884"
COL_SELF_PROPRIETOR_NAME = 20
COL_EMPLOYER_NAME = 21
COL_EMPLOYER_LICENSE_NUMBER = 22

# Must have at least through the last column used.
MIN_ROW_LEN = COL_EMPLOYER_LICENSE_NUMBER + 1  # 23

# County filter — county_name (col 12) values kept.
SWFL_COUNTIES = {"Lee", "Collier"}

# Individual agents (as opposed to corporations "2502", branch offices "2504", instructors/
# schools "2507", etc. — all confirmed present in the live file) carry this prefix in
# COL_LICENSE_TYPE. Verified live: every individual row reads exactly
# "2501 Real Estate Broker or Sales".
INDIVIDUAL_PREFIX = "2501 "

# Volume-guard floors. Verified live 2026-07-10 against the full RE_rgn7.csv (51,364 total
# rows, all 23 columns): 30,100 kept individual Lee/Collier rows (Lee 18,015 / Collier
# 12,085), ALL statuses (this table keeps historical/inactive rows too — only license.md's
# `--- OUTPUT ---`-style "current only" views would filter status; "new" is keyed off
# original_license_date, not status). Floors set at ~50% of the observed count, matching the
# fl_dbpr_licenses precedent (loose bootstrap floor; catches collapse/scheme-drift, not
# week-to-week fluctuation — that lives in cadence_registry expected_rows_min).
FLOOR_TOTAL = 15_000
FLOOR_LEE = 9_000
FLOOR_COLLIER = 6_000
