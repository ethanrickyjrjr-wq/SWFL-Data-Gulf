"""--dry-run must never target S3 or the inventory table.

Four Tier-1 workflows (storm-history-monthly, zhvi-tier1-monthly, zori-tier1-monthly,
hurdat2) pass --dry-run to modules that had no argparse, so a dispatched "dry run" did
the full production write. Scope scan 09/20/2026: 41 workflow-invoked modules receive
the flag, these 4 never read it. Same shape as usgs (b9184668): run() takes a target
and gates the S3 config + inventory upsert on an s3:// prefix.
"""
import importlib
import inspect
from unittest.mock import patch

import pytest

MODULES = [
    "ingest.duckdb_pipelines.storm_history_swfl.pipeline",
    "ingest.duckdb_pipelines.zhvi_swfl.pipeline",
    "ingest.duckdb_pipelines.zori_swfl.pipeline",
    "ingest.duckdb_pipelines.hurdat2_fl.pipeline",
]


@pytest.mark.parametrize("modname", MODULES)
def test_dry_run_never_targets_s3_or_the_inventory_table(modname):
    mod = importlib.import_module(modname)

    with patch.object(mod, "run") as mock_run:
        mod.main(["--dry-run"])
    assert not mock_run.call_args.kwargs["target"].startswith("s3://")

    with patch.object(mod, "run") as mock_run:
        mod.main([])
    assert mock_run.call_args.kwargs == {}


@pytest.mark.parametrize("modname", MODULES)
def test_inventory_upsert_is_gated_on_an_s3_target(modname):
    """The temp target is only a dry run if run() skips the inventory row for it."""
    src = inspect.getsource(importlib.import_module(modname).run)
    gate = src.rfind('target.startswith("s3://")')
    assert gate != -1 and gate < src.index("upsert_inventory_row(")
