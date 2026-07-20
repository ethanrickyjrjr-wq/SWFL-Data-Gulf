"""Unit tests for the pure normalizer — no dlt, no disk, no network."""
from __future__ import annotations

from datetime import date

from .normalize import (
    normalize_row,
    parse_consideration_usd,
    parse_parcel_strap,
    parse_record_date,
)


def test_parse_consideration_usd() -> None:
    assert parse_consideration_usd("$304,900.00") == 304900.0
    assert parse_consideration_usd("$10.00") == 10.0
    assert parse_consideration_usd("$3,600,000.00") == 3600000.0
    assert parse_consideration_usd("") is None
    assert parse_consideration_usd(None) is None


def test_parse_record_date_mmddyyyy() -> None:
    assert parse_record_date("07/16/2026") == date(2026, 7, 16)
    assert parse_record_date("7/1/2026") == date(2026, 7, 1)
    # Never invent a date for an unparseable value.
    assert parse_record_date("2026-07-16") is None
    assert parse_record_date("") is None
    assert parse_record_date(None) is None


def test_parse_parcel_strap_before_or_after_plat() -> None:
    # STRAP after the plat description (README idx-15 example).
    assert (
        parse_parcel_strap("L 170 RESERVE AT ESTERO | Parcel 22-46-25-E4-10000.1700")
        == "22-46-25-E4-10000.1700"
    )
    # STRAP before the plat description.
    assert (
        parse_parcel_strap("Parcel 03-47-24-W1-0280A.6010 U A601 THE SANDARAC")
        == "03-47-24-W1-0280A.6010"
    )
    # Metes-and-bounds / condo legals with no Parcel label -> None.
    assert parse_parcel_strap("LOT 12 SOME PLAT WITH NO STRAP") is None
    assert parse_parcel_strap(None) is None


def test_normalize_row_snake_cases_and_preserves_truncation_marker() -> None:
    raw = {
        "status": "V",
        "considerationRaw": "$10.00",
        "grantors": ["MADDEN KEITH ALLEN", "MADDEN TERESA P"],
        "grantees": ["MADDEN KEITH ALLEN TRUSTEE", "MADDEN TERESA P TRUSTEE", "..."],
        "recordDate": "07/16/2026",
        "docType": "DEED",
        "bookType": "O",
        "book": None,
        "page": "0000",
        "clerkFileNumber": "2026000187515",
        "legalFull": "L 170 RESERVE AT ESTERO | Parcel 22-46-25-E4-10000.1700",
        "lot": "170",
        "subdivision": "RESERVE AT ESTERO",
        "internalDocId": "19764956",
    }
    row = normalize_row(raw, source_file="2026-07-16.json")

    assert row["internal_doc_id"] == "19764956"
    assert row["clerk_file_number"] == "2026000187515"
    assert row["consideration_usd"] == 10.0
    assert row["consideration_raw"] == "$10.00"
    assert row["record_date"] == date(2026, 7, 16)
    assert row["parcel_strap"] == "22-46-25-E4-10000.1700"
    assert row["subdivision"] == "RESERVE AT ESTERO"
    assert row["record_source_file"] == "2026-07-16.json"
    # The source truncates grantee lists past ~3 parties with a literal "..." — the
    # normalizer must PRESERVE it (do not claim completeness the source doesn't have).
    assert row["grantees"][-1] == "..."
    assert row["grantors"] == ["MADDEN KEITH ALLEN", "MADDEN TERESA P"]
