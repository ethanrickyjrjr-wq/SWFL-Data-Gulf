import sys
import os

import pytest

sys.path.insert(0, os.path.dirname(__file__))

from ingest.pipelines.listing_lifecycle import extract_api  # noqa: E402


@pytest.fixture(autouse=True)
def _no_steadyapi_pacing(monkeypatch):
    """No-op the 1 req/s pacer for every test: mocked calls must never real-sleep, and
    the module-level last-request stamp must not leak across tests. The pacer itself is
    exercised explicitly in test_extract_api.py's pacing tests (they re-patch the seams)."""
    monkeypatch.setattr(extract_api, "_pace_sleep", lambda s: None)
    monkeypatch.setattr(extract_api, "_last_request_ts", None)
