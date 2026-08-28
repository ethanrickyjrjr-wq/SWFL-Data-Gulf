"""Unit tests for the pure normalizer — no dlt, no disk, no network."""
from __future__ import annotations

from datetime import date

from .normalize import (
    normalize_row,
    parse_consideration_usd,
    parse_parcel_strap,
    parse_record_date,
    split_parties,
)
from .normalize import ELISION_MARKER


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


def test_normalize_row_snake_cases_and_flags_the_elided_party_list() -> None:
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
    # SUPERSEDES the old contract (which asserted the literal "..." was kept in the
    # names array). The source elided this grantee list; the marker is stripped and
    # the elision is recorded in the flag — so no consumer can read two names as the
    # whole party list, and no party named "..." ever ships.
    assert "..." not in row["grantees"]
    assert row["grantees"] == ["MADDEN KEITH ALLEN TRUSTEE", "MADDEN TERESA P TRUSTEE"]
    assert row["grantees_complete"] is False
    assert row["grantors"] == ["MADDEN KEITH ALLEN", "MADDEN TERESA P"]
    assert row["grantors_complete"] is True


# ── Source-elided party lists ─────────────────────────────────────────────────
# FAILURE MODE these guard: the Lee Clerk grid caps a party list at TWO real names
# and appends a literal "..." when there are more. Stored verbatim, that reads
# downstream as a COMPLETE two-party list (plus a party literally named "..."),
# i.e. a wrong fact rather than a missing one. Measured 08/27/2026 across all 22
# committed raw/*.json: 4,529 of 28,186 rows (16.07%) carry the marker; every one
# of the 4,753 marked lists is exactly len 3 with the marker last — no list the
# source emits ever holds 3 real names.


def test_an_elided_party_list_is_flagged_not_stored_as_complete() -> None:
    row = normalize_row(
        {
            "grantors": ["MADDEN KEITH ALLEN", "MADDEN TERESA P"],
            "grantees": ["MADDEN KEITH ALLEN TRUSTEE", "MADDEN TERESA P TRUSTEE", "..."],
            "internalDocId": "19764956",
        }
    )
    # The grantee list is NOT complete and must say so explicitly.
    assert row["grantees_complete"] is False
    # The grantor list on this same row IS complete — the two sides are independent.
    assert row["grantors_complete"] is True


def test_the_elision_marker_never_ships_as_a_party_name() -> None:
    """A party literally named "..." is a fabricated, matchable, displayable value.
    It is stripped; the fact of the elision survives in the flag (bijective)."""
    row = normalize_row({"grantees": ["A CORP", "B CORP", "..."], "internalDocId": "1"})
    assert row["grantees"] == ["A CORP", "B CORP"]
    assert "..." not in row["grantees"]
    assert row["grantees_complete"] is False


def test_a_full_party_list_is_marked_complete() -> None:
    row = normalize_row({"grantors": ["SOLO OWNER"], "grantees": [], "internalDocId": "2"})
    assert row["grantors"] == ["SOLO OWNER"]
    assert row["grantors_complete"] is True
    # An empty list is complete-as-given: the source elided nothing.
    assert row["grantees_complete"] is True


def test_only_the_exact_marker_is_stripped_not_a_name_that_ends_in_dots() -> None:
    """Match on exact equality after strip() — never endswith("..."), which would
    eat a real (if oddly punctuated) party name."""
    row = normalize_row({"grantors": ["SMITH ET AL...", " ... "], "internalDocId": "3"})
    assert row["grantors"] == ["SMITH ET AL..."]
    assert row["grantors_complete"] is False


def test_split_parties_is_bijective_over_the_measured_source_shape() -> None:
    """Every marked list in the corpus is exactly ["A", "B", "..."] (4,753 of them,
    measured 08/27/2026) — names + flag reconstruct the source value exactly."""
    names, complete = split_parties(["A CORP", "B CORP", "..."])
    assert (names, complete) == (["A CORP", "B CORP"], False)
    assert names + ([ELISION_MARKER] if not complete else []) == ["A CORP", "B CORP", "..."]

    # A missing / non-list value is empty-but-complete, never "elided".
    assert split_parties(None) == ([], True)
    assert split_parties("NOT A LIST") == ([], True)
