"""Unit tests for crawl4ai_client.py — download_step() guard behavior."""
import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from ingest.lib.crawl4ai_client import Crawl4aiError, Crawl4aiSession


def _make_session_with_mock_crawler(downloaded_files) -> Crawl4aiSession:
    """Build a Crawl4aiSession with a mocked crawler that returns the given downloaded_files."""
    mock_result = MagicMock()
    mock_result.downloaded_files = downloaded_files
    mock_result.success = True
    mock_result.html = ""

    session = Crawl4aiSession(session_id="test_dl", accept_downloads=True)
    session._crawler = MagicMock()
    session._crawler.arun = AsyncMock(return_value=mock_result)
    return session


def test_download_step_returns_file_bytes_when_files_present(tmp_path: Path) -> None:
    xlsx = tmp_path / "test.xlsx"
    xlsx.write_bytes(b"PK\x03\x04" + b"\x00" * 10)

    session = _make_session_with_mock_crawler([str(xlsx)])
    result = asyncio.run(session.download_step(click_js="(() => {})()", wait_seconds=1.0))

    assert result[:4] == b"PK\x03\x04"


def test_download_step_raises_crawl4ai_error_when_no_files() -> None:
    session = _make_session_with_mock_crawler([])
    with pytest.raises(Crawl4aiError, match="no file in downloaded_files"):
        asyncio.run(session.download_step(click_js="(() => {})()", wait_seconds=1.0))


def test_download_step_raises_when_downloaded_files_is_none() -> None:
    session = _make_session_with_mock_crawler(None)
    with pytest.raises(Crawl4aiError, match="no file in downloaded_files"):
        asyncio.run(session.download_step(click_js="(() => {})()", wait_seconds=1.0))
