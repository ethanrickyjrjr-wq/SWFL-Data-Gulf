"""load_env_local — the ONE .env.local loader (extracted 07/16/2026).

Fourteen pipelines carried a copy-pasted _load_env that read .env.local with
Path.read_text()'s LOCALE default — cp1252 on Windows — and crashed on any
UTF-8 multibyte byte (0x90 at position 5383 killed the first local redfin
retarget run; GHA never hit it because Linux defaults to UTF-8). This helper
reads UTF-8 with errors="replace" so a stray byte in an unrelated line can
never kill env parsing.
"""
import os
from pathlib import Path

from ingest.lib.env_local import load_env_local


def test_loads_utf8_file_with_non_cp1252_bytes(tmp_path: Path, monkeypatch):
    # conftest suppresses the loader suite-wide; this is the loader's own test against a
    # tmp file, so lift the guard here only (it was silently failing under it).
    monkeypatch.delenv("INGEST_NO_ENV_LOCAL", raising=False)
    monkeypatch.delenv("FOO", raising=False)
    monkeypatch.delenv("BAZ", raising=False)
    p = tmp_path / ".env.local"
    # UTF-8 content whose bytes include 0x90 (the em-dash-adjacent byte that
    # crashed cp1252): '𐀀' (U+10000) encodes as f0 90 80 80.
    p.write_bytes("FOO=bar\n# note \U00010000 comment\nBAZ='qux'\n".encode("utf-8"))
    os.environ.pop("FOO", None)
    os.environ.pop("BAZ", None)
    load_env_local(p)
    assert os.environ["FOO"] == "bar"
    assert os.environ["BAZ"] == "qux"


def test_existing_env_wins_and_missing_file_is_noop(tmp_path: Path):
    os.environ["PRESET"] = "keep-me"
    p = tmp_path / ".env.local"
    p.write_bytes(b"PRESET=overwrite-attempt\n")
    load_env_local(p)
    assert os.environ["PRESET"] == "keep-me"  # setdefault semantics preserved
    load_env_local(tmp_path / "does-not-exist")  # must not raise


def test_no_ingest_module_loads_a_dotenv_file_outside_the_guarded_loader():
    """Failure mode (found 09/20/2026): three pulse pipelines + storage_uploader called
    dotenv's load_dotenv() AT IMPORT TIME. Importing any of them in a test poured every
    production key into os.environ, walking straight past conftest's INGEST_NO_ENV_LOCAL
    guard - and test_fetch_steadyapi_no_key_is_a_gap then made a REAL billed SteadyAPI call
    on every full local run. load_env_local() is the ONE loader; it honors the guard."""
    import re

    root = Path(__file__).resolve().parents[1]
    offenders = []
    for f in root.rglob("*.py"):
        parts = set(f.parts)
        if ".venv" in parts or "scripts" in parts or f.name.startswith("test_"):
            continue  # scripts/ are operator-run one-offs, never imported by a test
        if re.search(r"^\s*(from dotenv import|import dotenv)", f.read_text(encoding="utf-8", errors="replace"), re.M):
            offenders.append(str(f.relative_to(root)))
    assert not offenders, f"use ingest.lib.env_local.load_env_local instead of dotenv in: {offenders}"
