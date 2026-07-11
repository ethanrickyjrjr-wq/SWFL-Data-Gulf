"""Dry-run smoke test — mocks the network fetch, exercises the real filter/guard/print path
without hitting DBPR or the DB. Live-file verification happens in Task 7."""
from unittest.mock import patch

from .test_parse import AARNIO_LEE, AARON_COLLIER


def _fake_rows():
    # 9,000 Lee + 6,000 Collier synthetic-but-shaped rows to clear the volume floors,
    # built by varying the license_number on the two real fixture rows.
    rows = []
    for i in range(9_000):
        row = list(AARNIO_LEE)
        row[13] = f"L{i}"
        rows.append(row)
    for i in range(6_000):
        row = list(AARON_COLLIER)
        row[13] = f"C{i}"
        rows.append(row)
    return rows


def test_dry_run_reports_count_and_skips_db():
    with patch(
        "ingest.pipelines.dbpr_re_licensees.pipeline._stream_csv",
        return_value=_fake_rows(),
    ), patch("ingest.pipelines.dbpr_re_licensees.pipeline.get_db_conn") as mock_conn:
        from ingest.pipelines.dbpr_re_licensees.pipeline import main

        result = main(["--dry-run"])

    assert result == 0
    mock_conn.assert_not_called()


def test_volume_guard_aborts_on_collapse():
    with patch(
        "ingest.pipelines.dbpr_re_licensees.pipeline._stream_csv",
        return_value=[AARNIO_LEE],  # 1 row — far below FLOOR_TOTAL
    ):
        from ingest.pipelines.dbpr_re_licensees.pipeline import main

        try:
            main(["--dry-run"])
            raised = False
        except SystemExit as exc:
            raised = exc.code == 1
    assert raised
