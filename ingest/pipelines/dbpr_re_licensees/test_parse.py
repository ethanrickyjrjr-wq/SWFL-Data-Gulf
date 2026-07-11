"""Unit tests for the DBPR RE licensee parse module.

All fixtures are REAL rows sampled 2026-07-10/11 from a live download of RE_rgn7.csv (23
columns, verified — see constants.py docstring). One synthetic short-row fixture tests the
column-count guard.
"""
from .parse import parse_dbpr_date, split_licensee_name, normalize_row

# Lee, individual, Current/Active, has employer — the "full happy path" row.
AARNIO_LEE = [
    "25", "2501 Real Estate Broker or Sales", "AARNIO, KRISTEN LYNN", "",
    "SL Sales Associate", "1013 SE 43RD TERR", "", "", "CAPE CORAL", "FL", "33904",
    "46", "Lee", "3579344", "Current", "Active", "06/16/2023", "07/10/2023",
    "03/31/2027", "SL3579344", "", "NAUTICAL GULF REALTY INC", "1067315",
]

# Highlands (non-SWFL), individual — must be dropped by the county filter.
AARON_HIGHLANDS = [
    "25", "2501 Real Estate Broker or Sales", "AARON, KUMASI", "",
    "SL Sales Associate", "622 MARTIN LUTHER KING JR. BLVD", "", "", "SEBRING", "FL",
    "33870", "38", "Highlands", "3636733", "Current", "Active", "05/27/2025",
    "05/23/2025", "03/31/2027", "SL3636733", "", "STAR BAY REALTY CORP", "1055154",
]

# Lee, corporation (2502) — must be dropped by the individual filter.
CORP_LEE = [
    "25", "2502 Real Estate Corporation", "#1 REAL ESTATE SERVICES LLC", "",
    "CQ RE Corp.", "23004 SANABRIA LOOP", "", "", "BONITA SPRINGS", "FL", "34135",
    "46", "Lee", "1031298", "Current", "Active", "03/12/2008", "02/08/2010",
    "09/30/2027", "CQ1031298", "", "", "",
]

# Collier, individual, has employer, single-letter middle name ("LESLIE B").
AARON_COLLIER = [
    "25", "2501 Real Estate Broker or Sales", "AARON, LESLIE B", "",
    "SL Sales Associate", "692 PINE COURT", "", "", "NAPLES", "FL", "34102",
    "21", "Collier", "655507", "Current", "Active", "09/22/1997", "12/12/2012",
    "03/31/2027", "SL655507", "", "SUN REALTY USA INC", "1021728",
]

# Lee, individual, no employer, single first name (no middle name at all).
ABAL_NO_MIDDLE = [
    "25", "2501 Real Estate Broker or Sales", "ABAL, KATIUSKA", "",
    "SL Sales Associate", "917  PALMETTO AVE", "", "", "LEHIGH ACRES", "FL",
    "33972", "46", "Lee", "3588678", "Current", "Inactive", "09/18/2023",
    "04/02/2025", "03/31/2027", "SL3588678", "", "", "",
]

# Synthetic — truncated mid-row (only 10 of 23 columns). Tests the length guard.
SHORT_ROW = AARNIO_LEE[:10]


class TestParseDbprDate:
    def test_valid_date(self):
        assert parse_dbpr_date("06/16/2023") == "2023-06-16"

    def test_empty_string(self):
        assert parse_dbpr_date("") is None

    def test_none_input(self):
        assert parse_dbpr_date(None) is None

    def test_garbage_input(self):
        assert parse_dbpr_date("not-a-date") is None


class TestSplitLicenseeName:
    def test_first_and_middle(self):
        assert split_licensee_name("AARNIO, KRISTEN LYNN") == ("Aarnio", "Kristen", "Lynn")

    def test_single_letter_middle(self):
        assert split_licensee_name("AARON, LESLIE B") == ("Aaron", "Leslie", "B")

    def test_no_middle(self):
        assert split_licensee_name("ABAL, KATIUSKA") == ("Abal", "Katiuska", None)

    def test_no_comma_falls_back_to_last_only(self):
        assert split_licensee_name("SOME ORG NAME") == ("Some Org Name", None, None)


class TestNormalizeRowKept:
    def setup_method(self):
        self.row = normalize_row(AARNIO_LEE)

    def test_kept(self):
        assert self.row is not None

    def test_license_number(self):
        assert self.row["license_number"] == "3579344"

    def test_name_split(self):
        assert self.row["last_name"] == "Aarnio"
        assert self.row["first_name"] == "Kristen"
        assert self.row["middle"] == "Lynn"

    def test_county(self):
        assert self.row["county_code"] == "46"
        assert self.row["county_name"] == "Lee"

    def test_license_type_and_rank(self):
        assert self.row["license_type"] == "2501 Real Estate Broker or Sales"
        assert self.row["rank"] == "SL Sales Associate"

    def test_dates(self):
        assert self.row["original_license_date"] == "2023-06-16"
        assert self.row["status_effective_date"] == "2023-07-10"
        assert self.row["license_expiration_date"] == "2027-03-31"

    def test_employer(self):
        assert self.row["employer_name"] == "NAUTICAL GULF REALTY INC"
        assert self.row["employer_license_number"] == "1067315"

    def test_email_always_none(self):
        assert self.row["email"] is None


class TestNormalizeRowCollierKept:
    def test_collier_kept_with_single_letter_middle(self):
        row = normalize_row(AARON_COLLIER)
        assert row is not None
        assert row["county_name"] == "Collier"
        assert row["last_name"] == "Aaron"
        assert row["middle"] == "B"


class TestNormalizeRowNoMiddleNoEmployer:
    def test_kept_with_nulls(self):
        row = normalize_row(ABAL_NO_MIDDLE)
        assert row is not None
        assert row["middle"] is None
        assert row["employer_name"] is None
        assert row["employer_license_number"] is None


class TestNormalizeRowDropped:
    def test_non_swfl_county_dropped(self):
        assert normalize_row(AARON_HIGHLANDS) is None

    def test_corporation_dropped(self):
        assert normalize_row(CORP_LEE) is None

    def test_short_row_dropped(self):
        assert normalize_row(SHORT_ROW) is None
