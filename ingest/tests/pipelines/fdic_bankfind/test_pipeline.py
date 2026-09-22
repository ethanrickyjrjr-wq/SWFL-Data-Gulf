from unittest.mock import patch


_FAKE = {"fdic_sod": [{"id": "a"}], "fdic_locations": [{"id": "b"}], "fdic_institutions": [{"id": "c"}]}


def test_dry_run_skips_dlt():
    with patch("dlt.pipeline") as mock_pipeline, \
         patch("ingest.pipelines.fdic_bankfind.pipeline.collect_all_datasets", return_value=_FAKE):
        from ingest.pipelines.fdic_bankfind.pipeline import main

        assert main(["--dry-run"]) == 0
    mock_pipeline.assert_not_called()


def test_real_run_fetches_once_and_loads_three_resources():
    with patch("dlt.pipeline") as mock_pipeline, \
         patch("ingest.pipelines.fdic_bankfind.pipeline.collect_all_datasets", return_value=_FAKE) as collect:
        from ingest.pipelines.fdic_bankfind.pipeline import main

        assert main([]) == 0
    collect.assert_called_once()
    run = mock_pipeline.return_value.run
    run.assert_called_once()
    resources = run.call_args.args[0]
    assert sorted(r.name for r in resources) == ["fdic_institutions", "fdic_locations", "fdic_sod"]
