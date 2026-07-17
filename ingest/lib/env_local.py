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


def load_env_local(path: Optional[Path] = None) -> None:
    env_path = path if path is not None else _DEFAULT_PATH
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))
