"""Tests for ingest.lib.coercion."""
from ingest.lib.coercion import (
    SUPPRESSION_TOKENS,
    coerce_date,
    coerce_float,
    coerce_int,
    coerce_suppressed,
)


class TestCoerceFloat:
    def test_plain_int(self):
        assert coerce_float(123) == 123.0
        assert isinstance(coerce_float(123), float)

    def test_plain_string(self):
        assert coerce_float("123.45") == 123.45

    def test_dollar_sign(self):
        # Lifted from leepa sale Amount field: "$245,000.00"
        assert coerce_float("$245,000.00") == 245000.0

    def test_comma_thousands(self):
        assert coerce_float("1,234,567") == 1234567.0

    def test_none(self):
        assert coerce_float(None) is None

    def test_empty_string(self):
        assert coerce_float("") is None

    def test_na_variants(self):
        assert coerce_float("N/A") is None
        assert coerce_float("n/a") is None
        assert coerce_float("NA") is None

    def test_non_parseable(self):
        assert coerce_float("abc") is None

    def test_zero_is_not_none(self):
        assert coerce_float("0") == 0.0
        assert coerce_float(0) == 0.0


class TestCoerceInt:
    def test_float_string_truncates(self):
        assert coerce_int("123.9") == 123

    def test_plain_int_string(self):
        assert coerce_int("42") == 42

    def test_none(self):
        assert coerce_int(None) is None

    def test_returns_int_type(self):
        assert isinstance(coerce_int("10"), int)


class TestCoerceDate:
    def test_epoch_millis(self):
        # 2024-06-15 00:00:00 UTC = 1718409600000ms (from leepa SALE_ROW_1)
        assert coerce_date(1718409600000) == "2024-06-15"

    def test_iso_datetime_string(self):
        assert coerce_date("2024-06-15T00:00:00Z") == "2024-06-15"

    def test_iso_date_string(self):
        assert coerce_date("2024-06-15") == "2024-06-15"

    def test_esri_year_month_partial(self):
        # "2024-4" -> "2024-04-01" (ESRI DoS year-month format)
        assert coerce_date("2024-4") == "2024-04-01"

    def test_esri_year_month_single_digit_month(self):
        assert coerce_date("2023-1") == "2023-01-01"

    def test_none(self):
        assert coerce_date(None) is None

    def test_empty_string(self):
        assert coerce_date("") is None


class TestCoerceSuppressed:
    def test_star(self):
        assert coerce_suppressed("*") is None

    def test_hash(self):
        assert coerce_suppressed("#") is None

    def test_double_star(self):
        assert coerce_suppressed("**") is None

    def test_any_value_returns_none(self):
        # The function is a named sentinel — always None regardless of input
        assert coerce_suppressed("12345") is None
        assert coerce_suppressed(0) is None

    def test_suppression_tokens_contains_bls_markers(self):
        assert "*" in SUPPRESSION_TOKENS
        assert "#" in SUPPRESSION_TOKENS
        assert "**" in SUPPRESSION_TOKENS
        assert "***" in SUPPRESSION_TOKENS
