"""Report provenance + labelling tests (FM 1, FM 8, FM 11)."""
from __future__ import annotations

from datetime import date

from ingest.analysis._report import (
    GATE_LABEL,
    NON_GATE_LABEL,
    SCOPE_BOUNDARY,
    SEASONALITY_CAVEAT,
    Report,
    as_of_display,
)


def _report(**kw):
    return Report(
        title="Parcel structure pass",
        command="python -m ingest.analysis.parcel_structure",
        as_of=date(2026, 7, 22),
        source_counts={"data_lake.lee_parcels": 556_083,
                       "data_lake.collier_parcels": 290_973},
        **kw,
    )


# ---------------------------------------------------------------- FM 8
# "Reports drifting from the code that produced them."

def test_report_header_provenance():
    text = _report(week_span="06/29/2026 – 07/13/2026").render()
    assert "07/22/2026" in text                       # as-of, MM/DD/YYYY
    assert "**Commit:**" in text                      # SHA stamp
    assert "python -m ingest.analysis.parcel_structure" in text
    assert "556,083" in text and "290,973" in text    # source row counts
    assert "06/29/2026 – 07/13/2026" in text          # week span


def test_as_of_is_mmddyyyy_never_a_raw_token():
    assert as_of_display(date(2026, 7, 22)) == "07/22/2026"


def test_report_filename_is_dated():
    r = _report()
    assert r.write.__doc__ and "YYYY-MM-DD" in r.write.__doc__


def test_report_writes_dated_file(tmp_path):
    path = _report().write("parcel-structure", directory=tmp_path)
    assert path.name == "2026-07-22-parcel-structure.md"
    assert "07/22/2026" in path.read_text(encoding="utf-8")


# ---------------------------------------------------------------- FM 11
# "The challenger's null result misread as 'parcels don't help'." The boundary
# is part of the header, not prose someone has to remember.

def test_scope_boundary_is_in_every_report_header():
    assert SCOPE_BOUNDARY in _report().header()


def test_scope_boundary_names_the_missing_link():
    assert "NO parcel columns" in SCOPE_BOUNDARY
    assert "never in the feature set" in SCOPE_BOUNDARY


def test_header_states_nothing_is_served():
    assert "no served path" in _report().header()


# ---------------------------------------------------------------- FM 1
# "The flattering number gets quoted as the gate."

def test_report_labels_present_and_only_timeforward_gates():
    r = _report()
    r.add(f"## {NON_GATE_LABEL}\n\nlog loss 0.41")
    r.add(f"## {GATE_LABEL}\n\nlog loss 0.55")
    text = r.render()
    assert GATE_LABEL in text and NON_GATE_LABEL in text
    # Exactly one section claims to be the gate.
    assert text.count("THIS is the number that gates") == 1
    assert "NOT A GATE" in text


def test_gate_label_is_the_timeforward_one():
    assert "time-forward" in GATE_LABEL
    assert "grouped-CV" in NON_GATE_LABEL and "NOT A GATE" in NON_GATE_LABEL


# ---------------------------------------------------------------- FM 10
# Stated limit, no code fix — the caveat must exist and say why.

def test_seasonality_caveat_states_no_split_fixes_it():
    assert "No validation split fixes" in SEASONALITY_CAVEAT
