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


def test_loads_utf8_file_with_non_cp1252_bytes(tmp_path: Path):
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
