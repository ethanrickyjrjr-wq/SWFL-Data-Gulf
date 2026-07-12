"""log_source_total — the /ops/census reconciliation ledger write is loud-but-SOFT.

An observability insert must never fail a nightly leg whose upserts/transitions
already committed: table-missing (migration not yet applied) or a transient DB
error prints a [warn] and returns. Pinned 07/12/2026 alongside landing the
stranded pipeline-census worktree.
"""
from ingest.pipelines.listing_lifecycle import distill


def test_log_source_total_dry_run_touches_no_connection(monkeypatch, capsys):
    def boom():
        raise AssertionError("dry_run must not open a connection")

    monkeypatch.setattr(distill, "_get_conn", boom)
    distill.log_source_total(12345, "SteadyAPI meta.total sum", dry_run=True)
    assert "would log source_total=12345" in capsys.readouterr().out


def test_log_source_total_write_failure_warns_and_never_raises(monkeypatch, capsys):
    def boom():
        raise RuntimeError('relation "data_lake.source_totals" does not exist')

    monkeypatch.setattr(distill, "_get_conn", boom)
    distill.log_source_total(12345, "SteadyAPI meta.total sum")  # must not raise
    out = capsys.readouterr().out
    assert "[warn] source_totals write failed" in out
    assert "does not exist" in out
