"""fdic_bankfind resource tests — each named for the failure it stops.

No network: every test patches ``requests.get``. No creds: nothing here touches dlt.
"""
from unittest.mock import MagicMock, patch

import pytest

from ingest.lib.guards import ContentContractError, VolumeGuardError
from ingest.pipelines.fdic_bankfind import resources as R


def _resp(rows, total=None):
    m = MagicMock()
    m.ok = True
    m.status_code = 200
    m.json.return_value = {
        "meta": {"total": len(rows) if total is None else total},
        "data": [{"data": r, "score": 0} for r in rows],
    }
    return m


def test_sod_filter_uses_branch_county_not_hq_county():
    # THE TRAP (09/22/2026): STCNTY on /sod is the bank's HEADQUARTERS county. Filtering on it
    # returned 26 Lee rows for 2025 (locally chartered banks only). STCNTYBR is the branch county
    # and returns 160. The 08/02 scout got this wrong; this test keeps it from coming back.
    f = R.sod_filter("12071")
    assert f == "STCNTYBR:12071"
    assert not f.startswith("STCNTY:")


def test_partial_page_raises_instead_of_landing_a_short_sweep():
    # meta.total says 5, the API handed back 3 and then nothing — a silent 60% pull would pass
    # every downstream check. Must raise before any row is yielded.
    with patch.object(R.requests, "get", side_effect=[_resp([{"ID": "1"}] * 3, total=5), _resp([], total=5)]):
        with pytest.raises(VolumeGuardError):
            R.fetch_all("sod", "STCNTYBR:12071", label="t")


def test_paging_follows_offset_until_total_reached():
    pages = [
        _resp([{"ID": "1"}, {"ID": "2"}], total=3),
        _resp([{"ID": "3"}], total=3),
    ]
    with patch.object(R.requests, "get", side_effect=pages) as get, patch.object(R, "PAGE_LIMIT", 2):
        rows = R.fetch_all("sod", "STCNTYBR:12071", label="t")
    assert [r["ID"] for r in rows] == ["1", "2", "3"]
    offsets = [call.kwargs["params"]["offset"] for call in get.call_args_list]
    assert offsets == [0, 2]


def test_missing_required_field_raises_before_first_row():
    # A vendor rename (DEPSUMBR -> DEPOSITS) would coerce to NULL on every row with a healthy row
    # count. assert_header_has fires on the first row's keys.
    rows = [{"ID": "2025_1_0", "YEAR": 2025, "CERT": 1, "BRNUM": 0, "STCNTYBR": 12071}]
    with pytest.raises(ContentContractError):
        R.require_fields(rows, R.SOD_REQUIRED, label="sod")


def test_institutions_filter_batches_certs():
    certs = list(range(1, 131))  # 130 -> 50 + 50 + 30
    batches = list(R.cert_batches(certs))
    assert len(batches) == 3
    assert batches[0].startswith("CERT:1 OR CERT:2 OR ")
    assert batches[2].count("CERT:") == 30


def test_normalize_keeps_every_vendor_field_lowercased_and_stamps_ingested_at():
    row = {"ID": "2025_34489_0", "DEPSUMBR": 170188, "STCNTYBR": 12071, "SIMS_LATITUDE": 26.55}
    out = R.normalize(row, ingested_at="2026-09-22T00:00:00+00:00")
    assert out["id"] == "2025_34489_0"
    assert out["depsumbr"] == 170188
    assert out["sims_latitude"] == 26.55
    assert out["ingested_at"] == "2026-09-22T00:00:00+00:00"
    assert len(out) == len(row) + 1  # nothing dropped, nothing invented


def test_collect_all_datasets_pulls_institutions_for_every_cert_seen():
    sod_rows = [
        {"ID": "2025_1_0", "YEAR": 2025, "CERT": 1, "BRNUM": 0, "STCNTYBR": 12071, "DEPSUMBR": 10},
        {"ID": "2025_2_0", "YEAR": 2025, "CERT": 2, "BRNUM": 0, "STCNTYBR": 12021, "DEPSUMBR": 20},
    ]
    # Every required header present (the header guard is tested on its own above).
    loc_rows = [{**dict.fromkeys(R.LOCATIONS_REQUIRED), "ID": "9", "CERT": "3", "STCNTY": "12071"}]
    inst_rows = [{**dict.fromkeys(R.INSTITUTIONS_REQUIRED), "ID": str(c), "CERT": c} for c in (1, 2, 3)]

    def fake_fetch(endpoint, filters, label=""):
        if endpoint == "sod":
            return [r for r in sod_rows if filters.endswith(str(r["STCNTYBR"]))]
        if endpoint == "locations":
            return loc_rows if filters.endswith("12071") else []
        if endpoint == "institutions":
            return inst_rows
        raise AssertionError(endpoint)

    with patch.object(R, "fetch_all", side_effect=fake_fetch), \
         patch.object(R, "SOD_MIN_ROWS", 0), patch.object(R, "LOCATIONS_MIN_ROWS", 0), \
         patch.object(R, "INSTITUTIONS_MIN_ROWS", 0):
        data = R.collect_all_datasets()

    assert {r["cert"] for r in data["fdic_institutions"]} == {1, 2, 3}
    assert len(data["fdic_sod"]) == 2
    assert len(data["fdic_locations"]) == 1
    assert all("ingested_at" in r for r in data["fdic_sod"])


def test_volume_floor_blocks_a_thin_sweep_before_any_write():
    with patch.object(R, "fetch_all", return_value=[]):
        with pytest.raises(VolumeGuardError):
            R.collect_all_datasets()
