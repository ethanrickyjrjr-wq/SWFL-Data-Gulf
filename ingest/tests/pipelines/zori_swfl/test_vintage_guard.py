"""Tests for the ZORI Tier 2 vintage guard (_ensure_tier1_fresh)."""
from __future__ import annotations

import os
import sys
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest

from ingest.pipelines.zori_swfl.pipeline import ZORI_PARQUET_ID, _ensure_tier1_fresh


def _make_psycopg_mock(row) -> MagicMock:
    """Build a mock psycopg module whose connect(dsn) context-manager returns row."""
    cur = MagicMock()
    cur.__enter__ = lambda s: s
    cur.__exit__ = MagicMock(return_value=False)
    cur.fetchone.return_value = row

    conn = MagicMock()
    conn.__enter__ = lambda s: s
    conn.__exit__ = MagicMock(return_value=False)
    conn.cursor.return_value = cur

    psycopg_mock = MagicMock()
    psycopg_mock.connect.return_value = conn
    return psycopg_mock


@patch.dict(os.environ, {"DESTINATION__POSTGRES__CREDENTIALS": "postgresql://fake"})
def test_missing_inventory_row_exits():
    """No _tier1_inventory row → SystemExit containing the Parquet ID."""
    psycopg_mock = _make_psycopg_mock(row=None)
    with patch.dict(sys.modules, {"psycopg": psycopg_mock}):
        with pytest.raises(SystemExit, match=ZORI_PARQUET_ID):
            _ensure_tier1_fresh()


@patch.dict(os.environ, {"DESTINATION__POSTGRES__CREDENTIALS": "postgresql://fake"})
def test_stale_vintage_exits():
    """Vintage older than yesterday → SystemExit mentioning 'older than yesterday'."""
    stale = date.today() - timedelta(days=2)
    psycopg_mock = _make_psycopg_mock(row=(stale,))
    with patch.dict(sys.modules, {"psycopg": psycopg_mock}):
        with pytest.raises(SystemExit, match="older than yesterday"):
            _ensure_tier1_fresh()


@patch.dict(os.environ, {"DESTINATION__POSTGRES__CREDENTIALS": "postgresql://fake"})
def test_fresh_vintage_proceeds():
    """Vintage = today → no SystemExit; guard returns normally without calling dlt."""
    fresh = date.today()
    psycopg_mock = _make_psycopg_mock(row=(fresh,))
    with patch.dict(sys.modules, {"psycopg": psycopg_mock}):
        _ensure_tier1_fresh()  # must not raise
