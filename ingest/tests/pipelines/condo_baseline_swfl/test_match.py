"""Unit tests for the matching ladder and the Collier PDF parser. No network, no DB, no Ollama."""
from __future__ import annotations

from datetime import date, datetime, timezone

from ingest.lib.local_llm import Candidate, ChoiceResult, LocalLLMSchemaError
from ingest.pipelines.condo_baseline_swfl import match as m
from ingest.pipelines.condo_baseline_swfl.resources import parse_collier_pdf_text

NOW = datetime(2026, 8, 30, tzinfo=timezone.utc)


# ── normalize ────────────────────────────────────────────────────────────────


def test_normalize_strips_legal_boilerplate_only():
    assert m.normalize_assoc_name("BAYPOINT CONDOMINIUM ASSOCIATION, INC.") == "BAYPOINT"
    assert m.normalize_assoc_name("BAYPOINT, A CONDO") == "BAYPOINT"
    assert m.normalize_assoc_name("Capistrano at Grey Oaks Condo") == "CAPISTRANO AT GREY OAKS"
    assert m.normalize_assoc_name("Avellino Isles Phase 2") == "AVELLINO ISLES PHASE 2"
    assert m.normalize_assoc_name("  ") is None
    assert m.normalize_assoc_name(None) is None


# ── fixtures ─────────────────────────────────────────────────────────────────


def _buildings():
    rows = [
        ("COLLIER", "BAYPOINT, A CONDO", "35 Bluebill AVE B", "Naples", None),
        ("COLLIER", "BAYPOINT, A CONDO", "35 Bluebill AVE C", "Naples", None),
        ("COLLIER", "BAYFRONT PLACE CONDO", "450 Bayfront PL", "Naples", None),
        ("COLLIER", "GREY OAKS CONDO", "1 Grey Oaks BLVD", "Naples", None),
        ("COLLIER", "CAPISTRANO AT GREY OAKS CONDO", "2 Grey Oaks BLVD", "Naples", None),
        ("LEE", "CAPE CORAL UNIT 46", "39 NE 10TH PL BLDG H2", "CAPE CORAL", "33909"),
    ]
    return [
        {"county": c, "association_name": n, "assoc_name_norm": m.normalize_assoc_name(n),
         "street_address": a, "city": ci, "zip": z}
        for c, n, a, ci, z in rows
    ]


def _filing(assoc, project=None, county="COLLIER", h="h1", period="july_2025_plus"):
    return {"row_hash": h, "database_period": period, "association_name": assoc,
            "project_name": project or assoc, "city": "NAPLES", "zip": "34108",
            "county_normalized": county}


class FakeClient:
    """Stands in for OllamaClient: returns a scripted choice per query."""

    def __init__(self, model: str, choice: str | None, confidence: float = 0.9):
        self.model = model
        self._choice = choice
        self._conf = confidence
        self.calls = 0

    def chat_json(self, *, system, user, schema, temperature=0.0, retries=1, pack_id=None):
        self.calls += 1
        allowed = schema["properties"]["choice"]["enum"]
        choice = self._choice if self._choice in allowed else "none"
        return {"choice": choice, "confidence": self._conf, "reason": f"{self.model} says {choice}"}


# ── ladder ───────────────────────────────────────────────────────────────────


def test_exact_match_never_calls_llm():
    idx = m.build_assoc_index(_buildings())
    primary, judge = FakeClient("p", "c1"), FakeClient("j", "c1")
    rows, stats = m.match_filings([_filing("BAYPOINT CONDOMINIUM ASSOCIATION INC")], idx,
                                  primary=primary, judge=judge, matched_at=NOW)
    assert rows[0]["match_method"] == "exact"
    assert rows[0]["assoc_name_norm"] == "BAYPOINT"
    assert stats.exact == 1 and primary.calls == 0 and judge.calls == 0


def test_index_aggregates_buildings_per_association():
    idx = m.build_assoc_index(_buildings())
    assert idx["COLLIER"]["BAYPOINT"].building_count == 2
    assert "35 Bluebill AVE B" in idx["COLLIER"]["BAYPOINT"].describe()
    assert idx["LEE"]["CAPE CORAL UNIT 46"].zips == {"33909"}


def test_unmatched_when_nothing_clears_candidate_floor():
    idx = m.build_assoc_index(_buildings())
    primary = FakeClient("p", "c1")
    rows, stats = m.match_filings([_filing("TOTALLY DIFFERENT TOWERS")], idx,
                                  primary=primary, judge=FakeClient("j", "c1"), matched_at=NOW)
    assert rows[0]["match_method"] == "unmatched"
    assert rows[0]["assoc_name_norm"] is None
    assert stats.unmatched == 1 and primary.calls == 0


def test_ambiguous_goes_to_llm_and_needs_agreement():
    """'GREY OAKS RESIDENCES' overlaps GREY OAKS and CAPISTRANO AT GREY OAKS — ambiguous."""
    idx = m.build_assoc_index(_buildings())
    rows, stats = m.match_filings([_filing("THE GREY OAKS RESIDENCES")], idx,
                                  primary=FakeClient("p", "c1"), judge=FakeClient("j", "c1"),
                                  matched_at=NOW)
    assert rows[0]["match_method"] == "llm_tiebreak"
    assert rows[0]["assoc_name_norm"] in {"GREY OAKS", "CAPISTRANO AT GREY OAKS"}
    assert rows[0]["primary_model"] == "p" and rows[0]["judge_model"] == "j"
    assert stats.llm_tiebreak == 1 and stats.llm_calls == 2


def test_disagreement_lands_in_needs_review_with_null_match():
    idx = m.build_assoc_index(_buildings())
    rows, stats = m.match_filings([_filing("THE GREY OAKS RESIDENCES")], idx,
                                  primary=FakeClient("p", "c1"), judge=FakeClient("j", "c2"),
                                  matched_at=NOW)
    assert rows[0]["match_method"] == "needs_review"
    assert rows[0]["assoc_name_norm"] is None
    assert "disagree" in rows[0]["reason"]
    assert stats.needs_review == 1


def test_both_none_is_confident_unmatched_not_review():
    idx = m.build_assoc_index(_buildings())
    rows, stats = m.match_filings([_filing("THE GREY OAKS RESIDENCES")], idx,
                                  primary=FakeClient("p", None), judge=FakeClient("j", None),
                                  matched_at=NOW)
    assert rows[0]["match_method"] == "unmatched"
    assert stats.llm_agreed_none == 1 and stats.needs_review == 0


def test_llm_band_disabled_routes_ambiguous_to_review():
    idx = m.build_assoc_index(_buildings())
    rows, stats = m.match_filings([_filing("THE GREY OAKS RESIDENCES")], idx,
                                  primary=None, judge=None, matched_at=NOW)
    assert rows[0]["match_method"] == "needs_review"
    assert "disabled" in rows[0]["reason"]


def test_llm_error_is_captured_not_raised():
    class Boom(FakeClient):
        def chat_json(self, **kw):
            raise LocalLLMSchemaError("empty content")

    idx = m.build_assoc_index(_buildings())
    rows, stats = m.match_filings([_filing("THE GREY OAKS RESIDENCES")], idx,
                                  primary=Boom("p", "c1"), judge=FakeClient("j", "c1"), matched_at=NOW)
    assert rows[0]["match_method"] == "needs_review"
    assert stats.llm_errors == 1


def test_county_scoping_never_crosses_counties():
    idx = m.build_assoc_index(_buildings())
    rows, _ = m.match_filings([_filing("BAYPOINT CONDOMINIUM ASSOCIATION", county="LEE")], idx,
                              primary=None, judge=None, matched_at=NOW)
    assert rows[0]["match_method"] == "unmatched"


def test_choice_result_shape():
    r = ChoiceResult(choice=None, confidence=1.0, reason="none", model="x")
    assert r.choice is None
    assert Candidate(id="c1", text="t").id == "c1"


# ── Collier PDF parser ───────────────────────────────────────────────────────

_PDF_TEXT = """As of January 2026
Reference # Association Name Building Building Address CO date
Next
Milestone Due
PL20230003940 100 LA PENINSULA CONDO 100 La Peninsula BLVD 01/01/1987 01/01/2034
PL20230004711 AVALON AT PELICAN BAY, A CONDO Building P 8315 Excalibur CIR 05/10/1994 01/01/2033
PL20230004117 ADMIRALTY OF VANDERBILT BEACH A VERY LONG NAME THAT
WRAPS Building 3 100 Somewhere DR 02/02/2002 01/01/2032
PL20230099999 NO DATES YET Building 1 1 Nowhere ST
"""


def test_pdf_parser_handles_wrapped_rows_and_missing_dates():
    as_of, rows = parse_collier_pdf_text(_PDF_TEXT)
    assert as_of == "January 2026"
    by = {r["permit_number"]: r for r in rows}
    assert len(rows) == 4
    assert by["PL20230003940"]["co_date"] == date(1987, 1, 1)
    assert by["PL20230003940"]["next_milestone_due"] == date(2034, 1, 1)
    assert by["PL20230004711"]["pdf_text"].startswith("AVALON AT PELICAN BAY")
    assert "WRAPS Building 3" in by["PL20230004117"]["pdf_text"]
    assert by["PL20230004117"]["co_date"] == date(2002, 2, 2)
    assert by["PL20230099999"]["co_date"] is None
