import sys
import os

import pytest

sys.path.insert(0, os.path.dirname(__file__))

from ingest.pipelines.listing_lifecycle import extract_api  # noqa: E402


@pytest.fixture(autouse=True, scope="session")
def _tests_never_load_production_env():
    """No test may pick up real credentials out of the local env file.

    Pipelines call load_env_local() at runtime, so any test touching a pipeline
    code path inherits production secrets. On 07/22/2026 that was not theoretical:
    `test_fetch_steadyapi_no_key_is_a_gap` stopped testing the no-key gap and made
    a REAL billed SteadyAPI call, pulling 6,077 realtor.com property records
    against a 50k/mo quota, and `test_default_run_config_is_neutral` picked up a
    live proxy. Both then failed — which is the LUCKY outcome, because a test that
    silently succeeds against production spends money without ever telling you.

    Not Windows-specific: read_text() is UTF-8 on Linux, so CI has always loaded
    it. Session-scoped so it lands before any pipeline module is imported.
    """
    os.environ["INGEST_NO_ENV_LOCAL"] = "1"
    yield
    os.environ.pop("INGEST_NO_ENV_LOCAL", None)


@pytest.fixture(autouse=True)
def _no_steadyapi_pacing(monkeypatch):
    """No-op the 1 req/s pacer for every test: mocked calls must never real-sleep, and
    the module-level last-request stamp must not leak across tests. The pacer itself is
    exercised explicitly in test_extract_api.py's pacing tests (they re-patch the seams)."""
    monkeypatch.setattr(extract_api, "_pace_sleep", lambda s: None)
    monkeypatch.setattr(extract_api, "_last_request_ts", None)
