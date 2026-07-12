"""Every enum member's fix-text must NAME the file/workflow it applies to (spec §11)."""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from ingest.lib import prescriptions as rx


def test_all_ten_members_exist():
    assert rx.ALL == [
        rx.ACTION_VERSION,
        rx.SECRET_NOT_WIRED,
        rx.SCHEMA_NAME_DRIFT,
        rx.TIMEOUT_KILL,
        rx.GAP_SENTINEL,
        rx.NEVER_LANDED,
        rx.ZERO_COVERAGE,
        rx.WAF_BLOCK,
        rx.TRANSIENT,
        rx.UNKNOWN,
    ]
    assert len(set(rx.ALL)) == 10


# (code, ctx kwargs, tokens that MUST appear in the fix text)
_CASES = [
    (rx.ACTION_VERSION,     {"workflow": "daily-rebuild.yml"},                          ["daily-rebuild.yml", "uses:"]),
    (rx.SECRET_NOT_WIRED,   {"workflow": "news-swfl-daily.yml"},                        ["news-swfl-daily.yml", "env:"]),
    (rx.SCHEMA_NAME_DRIFT,  {"pipeline": "leepa", "table": "data_lake.leepa_parcels"},  ["ingest/pipelines/leepa/pipeline.py", "ingest/cadence_registry.yaml"]),
    (rx.TIMEOUT_KILL,       {"workflow": "corridor-pulse-weekly.yml"},                  ["corridor-pulse-weekly.yml", "timeout-minutes"]),
    (rx.GAP_SENTINEL,       {"workflow": "steady-listings.yml"},                        ["steady-listings.yml"]),
    (rx.NEVER_LANDED,       {"workflow": "redfin.yml", "table": "data_lake.redfin_city_swfl"}, ["redfin.yml", "data_lake.redfin_city_swfl", "ingest/cadence_registry.yaml"]),
    (rx.ZERO_COVERAGE,      {"table": "data_lake.parcel_subdivision"},                  ["data_lake.parcel_subdivision", "ingest/cadence_registry.yaml"]),
    (rx.WAF_BLOCK,          {"workflow": "lee-permits-daily.yml"},                      ["lee-permits-daily.yml", "ingest/lib/guards.py"]),
    (rx.TRANSIENT,          {"workflow": "zhvi-monthly.yml"},                           ["zhvi-monthly.yml"]),
    (rx.UNKNOWN,            {"subject": "graphify-republish.yml"},                      ["graphify-republish.yml", "ingest/lib/prescriptions.py"]),
]


@pytest.mark.parametrize("code,ctx,tokens", _CASES, ids=[c[0] for c in _CASES])
def test_fix_text_names_the_file_or_workflow(code, ctx, tokens):
    text = rx.fix_text(code, **ctx)
    for tok in tokens:
        assert tok in text, f"{code} fix-text does not name {tok!r}: {text}"


def test_every_member_is_covered_by_a_case():
    assert {c[0] for c in _CASES} == set(rx.ALL)


def test_timeout_kill_never_retries_money_guard():
    assert rx.should_retry(rx.TIMEOUT_KILL) is False
    assert rx.should_retry(rx.WAF_BLOCK) is False
    assert rx.should_retry(rx.TRANSIENT) is True


def test_doctor_assignable_is_a_strict_subset():
    assert rx.DOCTOR_ASSIGNABLE < set(rx.ALL)
    # Phase-2 / log-reading classes are NOT doctor-observable.
    for code in (rx.ACTION_VERSION, rx.SECRET_NOT_WIRED, rx.SCHEMA_NAME_DRIFT, rx.WAF_BLOCK):
        assert code not in rx.DOCTOR_ASSIGNABLE


def test_unknown_code_raises_rather_than_inventing():
    with pytest.raises(ValueError):
        rx.fix_text("MADE_UP_CLASS", workflow="x.yml")


def test_missing_context_is_stated_not_silently_blank():
    text = rx.fix_text(rx.TIMEOUT_KILL)  # no workflow supplied
    assert "workflow unknown" in text
