import json
from pathlib import Path

from ingest.pipelines.neighborhood_amenities.pipeline import plan_worklist, run_batch

FIXTURE = Path(__file__).parent / "fixtures" / "amenities_naples_6588181567.json"


def _fixture():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


SQUARE = {
    "type": "Polygon",
    "coordinates": [[[-81.6, 26.0], [-81.4, 26.0], [-81.4, 26.2], [-81.6, 26.2], [-81.6, 26.0]]],
}


def test_plan_worklist_skips_properties_inside_known_boundaries():
    properties = [
        {"property_id": "1", "lat": 26.1, "lon": -81.5},   # inside SQUARE -> local assign
        {"property_id": "2", "lat": 27.0, "lon": -82.0},   # outside -> needs a call
        {"property_id": "3", "lat": None, "lon": None},     # no coords -> needs a call
    ]
    known = [{"slug_id": "Known_Naples_FL", "boundary": SQUARE}]
    assigned, to_call = plan_worklist(properties, known)
    assert assigned == [{"property_id": "1", "slug_id": "Known_Naples_FL"}]
    assert [p["property_id"] for p in to_call] == ["2", "3"]


def test_run_batch_collects_neighborhood_amenities_and_assignment():
    calls = []

    def fake_fetch(property_id: str):
        calls.append(property_id)
        return 200, _fixture()

    properties = [{"property_id": "6588181567", "lat": 26.27, "lon": -81.55}]
    result = run_batch(properties, known=[], fetch=fake_fetch, max_calls=10, as_of="2026-08-03")
    assert calls == ["6588181567"]
    assert len(result["neighborhoods"]) == 1
    assert result["neighborhoods"][0]["slug_id"] == "Rural-Estates_Naples_FL"
    assert len(result["assignments"]) == 1
    assert result["amenities"], "business rows landed"


def test_run_batch_respects_max_calls_and_reports_remaining():
    def fake_fetch(property_id: str):
        return 200, _fixture()

    properties = [
        {"property_id": str(i), "lat": 27.0 + i, "lon": -82.0 - i} for i in range(5)
    ]
    result = run_batch(properties, known=[], fetch=fake_fetch, max_calls=2, as_of="2026-08-03")
    assert result["calls_made"] == 2
    assert result["remaining"] == 3


def test_run_batch_learned_boundary_assigns_followers_without_a_call():
    """After the first call stores a boundary, a second property inside that
    polygon must be assigned locally — zero additional vendor calls."""
    fixture = _fixture()
    ring = fixture["body"]["neighborhoods"][0]["boundary"]["coordinates"][0]
    # centroid of the (trimmed) ring is inside the polygon for this fixture
    cx = sum(p[0] for p in ring) / len(ring)
    cy = sum(p[1] for p in ring) / len(ring)
    calls = []

    def fake_fetch(property_id: str):
        calls.append(property_id)
        return 200, fixture

    properties = [
        {"property_id": "6588181567", "lat": 26.27, "lon": -81.55},
        {"property_id": "follower", "lat": cy, "lon": cx},
    ]
    result = run_batch(properties, known=[], fetch=fake_fetch, max_calls=10, as_of="2026-08-03")
    assert calls == ["6588181567"], "follower cost no vendor call"
    follower = [a for a in result["assignments"] if a["property_id"] == "follower"]
    assert follower and follower[0]["slug_id"] == "Rural-Estates_Naples_FL"


def test_to_load_rows_keeps_native_types_for_dlt():
    """Failure mode that killed the first live write (08/03/2026): boundary/scores
    handed to dlt as json.dumps STRINGS and as_of as an ISO STRING made dlt infer
    varchar, which Postgres refused to cast into the pre-created jsonb/date
    columns. Load rows must carry dict/list/date natively."""
    from datetime import date

    from ingest.pipelines.neighborhood_amenities.pipeline import to_load_rows

    result = {
        "neighborhoods": [
            {"slug_id": "X_Naples_FL", "boundary": {"type": "Polygon", "coordinates": []},
             "scores": [{"label": "Quiet", "value": 9.1, "text": "quiet"}], "as_of": "2026-08-03"}
        ],
        "amenities": [
            {"slug_id": "X_Naples_FL", "category": "golf", "name": "A", "categories": ["Golf"],
             "as_of": "2026-08-03"}
        ],
        "assignments": [{"property_id": "1", "slug_id": "X_Naples_FL", "as_of": "2026-08-03"}],
    }
    # duplicate property (sale + rent lanes) must collapse to ONE assignment row
    result["assignments"].append({"property_id": "1", "slug_id": "X_Naples_FL", "as_of": "2026-08-03"})
    nbhds, amenities, assignments = to_load_rows(result)
    assert len(assignments) == 1
    assert isinstance(nbhds[0]["boundary"], dict)
    assert isinstance(nbhds[0]["scores"], list)
    assert isinstance(nbhds[0]["as_of"], date)
    assert isinstance(amenities[0]["categories"], list)
    assert isinstance(amenities[0]["as_of"], date)
    assert isinstance(assignments[0]["as_of"], date)


def test_write_needed_empty_spine_is_a_clean_no_op():
    """Failure mode this guards: the spine query selects only UNASSIGNED api_feed
    properties, so once the book is drained a quiet day yields zero rows — and
    _write's assert_min_rows(minimum=1) would fail the daily cron on a run that
    did exactly what it should. An empty spine must skip the write, exit 0."""
    from ingest.pipelines.neighborhood_amenities.pipeline import write_needed

    empty = {"neighborhoods": [], "amenities": [], "assignments": [], "gaps": []}
    assert write_needed(0, empty) is False


def test_write_needed_true_when_the_batch_produced_rows():
    from ingest.pipelines.neighborhood_amenities.pipeline import write_needed

    result = {
        "neighborhoods": [],
        "amenities": [],
        "assignments": [{"property_id": "1", "slug_id": "X_Naples_FL", "as_of": "2026-08-03"}],
        "gaps": [],
    }
    assert write_needed(1, result) is True


def test_write_needed_stays_loud_when_work_existed_but_nothing_landed():
    """The volume guard must still fire when the spine HAD properties and every
    one of them gapped (vendor 500s / unparseable bodies) — that is a real
    failure, not a quiet day, and it must not be silenced by the fix above."""
    from ingest.pipelines.neighborhood_amenities.pipeline import write_needed

    all_gapped = {"neighborhoods": [], "amenities": [], "assignments": [], "gaps": ["9", "10"]}
    assert write_needed(2, all_gapped) is True


def test_run_batch_records_gap_on_non_200_never_fabricates():
    def fake_fetch(property_id: str):
        return 500, None

    properties = [{"property_id": "9", "lat": 27.0, "lon": -82.0}]
    result = run_batch(properties, known=[], fetch=fake_fetch, max_calls=10, as_of="2026-08-03")
    assert result["neighborhoods"] == []
    assert result["assignments"] == []
    assert result["gaps"] == ["9"]
