"""The ONE .env.local loader for ingest pipelines (extracted 07/16/2026).

Replaces the _load_env copy pasted across 14 pipeline modules. The copies read
.env.local with Path.read_text()'s LOCALE-default encoding — cp1252 on Windows
— and crashed on any UTF-8 multibyte content (GHA never hit it; Linux defaults
to UTF-8). Reads UTF-8 with errors="replace": a stray byte in an unrelated
line can never kill env parsing, and KEY=VALUE lines are ASCII in practice.

setdefault semantics: values already present in os.environ always win.
Migration of the remaining copies: check env_local_loader_migrate_pipelines.
"""
import os
from pathlib import Path
from typing import Optional

# repo root = ingest/lib/env_local.py -> three parents up
_DEFAULT_PATH = Path(__file__).parent.parent.parent / ".env.local"


# Test guard. Set by ingest/conftest.py for the whole suite.
#
# WHY: pipelines call this at runtime, so any test exercising a pipeline code
# path inherits PRODUCTION credentials. Found 07/22/2026 the hard way — with the
# loader actually working, `test_fetch_steadyapi_no_key_is_a_gap` stopped testing
# the no-key gap and instead made a REAL billed SteadyAPI call, returning 6,077
# realtor.com property records against a 50k/mo quota; `test_default_run_config_
# is_neutral` likewise picked up a real proxy.
#
# This was never Windows-only. Path.read_text() defaults to UTF-8 on Linux, so
# the loader has always worked in CI — the cp1252 crash was accidentally
# SHIELDING local Windows runs from a hazard CI already had.
#
# Checked at call time, not import time, so it holds for every caller regardless
# of how the name was bound.
_SUPPRESS_ENV = "INGEST_NO_ENV_LOCAL"


def load_env_local(path: Optional[Path] = None) -> None:
    if os.environ.get(_SUPPRESS_ENV) == "1":
        return
    env_path = path if path is not None else _DEFAULT_PATH
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))
