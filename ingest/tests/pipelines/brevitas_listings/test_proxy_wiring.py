"""Proxy-wiring tests for the Brevitas JSON-API extractor.

The dead-wiring bug: ``.github/workflows/ingest-brevitas-listings.yml`` exposed
``CRAWL4AI_PROXY`` in its env block, but ``extract.py`` used plain
``urllib.request.urlopen`` and never read the var — so GitHub-runner datacenter IPs
kept 403'ing with the residential-proxy secret doing nothing. These tests prove the
fix without any real network call:

  (a) CRAWL4AI_PROXY unset  -> _api_get uses the exact prior transport (direct urlopen).
  (b) CRAWL4AI_PROXY set    -> a ProxyHandler is wired into the opener AND _api_get routes
                              through that opener instead of the direct urlopen.

Import-light on purpose: this touches only ``ingest.pipelines.brevitas_listings.extract``
+ stdlib urllib (no crawl4ai / psycopg), so it runs on any interpreter.
"""
from __future__ import annotations

import io
import json
import urllib.request

import pytest

from ingest.pipelines.brevitas_listings import extract as mod


# ─── _proxy_url_from_env: normalize CRAWL4AI_PROXY (mirrors ProxyConfig.from_string) ──


def test_proxy_url_none_when_unset(monkeypatch) -> None:
    monkeypatch.delenv("CRAWL4AI_PROXY", raising=False)
    assert mod._proxy_url_from_env() is None


def test_proxy_url_none_when_blank(monkeypatch) -> None:
    monkeypatch.setenv("CRAWL4AI_PROXY", "   ")
    assert mod._proxy_url_from_env() is None


def test_proxy_url_full_url_with_creds_passthrough(monkeypatch) -> None:
    monkeypatch.setenv("CRAWL4AI_PROXY", "http://user:pass@proxy.example.com:8080")
    assert mod._proxy_url_from_env() == "http://user:pass@proxy.example.com:8080"


def test_proxy_url_full_url_no_creds_passthrough(monkeypatch) -> None:
    monkeypatch.setenv("CRAWL4AI_PROXY", "http://proxy.example.com:8080")
    assert mod._proxy_url_from_env() == "http://proxy.example.com:8080"


def test_proxy_url_socks5_passthrough(monkeypatch) -> None:
    # Passed through verbatim so the value matches the crawl4ai path (urllib can't dial it
    # without PySocks, but we never silently rewrite the operator's secret).
    monkeypatch.setenv("CRAWL4AI_PROXY", "socks5://proxy.example.com:1080")
    assert mod._proxy_url_from_env() == "socks5://proxy.example.com:1080"


def test_proxy_url_colon_form_with_creds(monkeypatch) -> None:
    monkeypatch.setenv("CRAWL4AI_PROXY", "1.2.3.4:8000:bob:secret")
    assert mod._proxy_url_from_env() == "http://bob:secret@1.2.3.4:8000"


def test_proxy_url_colon_form_no_creds(monkeypatch) -> None:
    monkeypatch.setenv("CRAWL4AI_PROXY", "1.2.3.4:8000")
    assert mod._proxy_url_from_env() == "http://1.2.3.4:8000"


def test_proxy_url_invalid_form_raises(monkeypatch) -> None:
    monkeypatch.setenv("CRAWL4AI_PROXY", "not-a-proxy-string")
    with pytest.raises(ValueError):
        mod._proxy_url_from_env()


# ─── _proxy_opener: the handler is actually built and wired ───────────────────────────


def test_proxy_opener_none_when_unset(monkeypatch) -> None:
    monkeypatch.delenv("CRAWL4AI_PROXY", raising=False)
    assert mod._proxy_opener() is None


def test_proxy_opener_wires_proxyhandler_for_http_and_https(monkeypatch) -> None:
    monkeypatch.setenv("CRAWL4AI_PROXY", "http://user:pass@proxy.example.com:8080")
    opener = mod._proxy_opener()
    assert opener is not None

    proxy_handlers = [
        h for h in opener.handlers if isinstance(h, urllib.request.ProxyHandler)
    ]
    assert proxy_handlers, "no ProxyHandler wired into the opener"
    # Exactly our handler (our instance suppresses build_opener's default system-env one).
    proxies = proxy_handlers[0].proxies
    assert proxies.get("http") == "http://user:pass@proxy.example.com:8080"
    assert proxies.get("https") == "http://user:pass@proxy.example.com:8080"


# ─── _api_get: transport selection (no real network) ──────────────────────────────────


class _FakeResp:
    """Minimal stand-in for an http response context manager."""

    def __init__(self, payload: bytes) -> None:
        self._payload = payload

    def __enter__(self) -> "_FakeResp":
        return self

    def __exit__(self, *exc) -> bool:
        return False

    def read(self) -> bytes:
        return self._payload


def test_api_get_direct_urlopen_when_proxy_unset(monkeypatch) -> None:
    """(a) Unset -> the exact prior transport: urllib.request.urlopen, no opener built."""
    monkeypatch.delenv("CRAWL4AI_PROXY", raising=False)

    calls: dict[str, object] = {}

    def _fake_urlopen(req, timeout=None):  # noqa: ANN001
        calls["req"] = req
        calls["timeout"] = timeout
        return _FakeResp(json.dumps({"pins": [{"uuid": "abc"}]}).encode())

    # Real _proxy_opener() runs (returns None because the var is unset) -> direct urlopen.
    monkeypatch.setattr(urllib.request, "urlopen", _fake_urlopen)

    # Guard: the real opener really is None on this path (no proxy built).
    assert mod._proxy_opener() is None

    out = mod._api_get("https://brevitas.com/api/search?x=1")
    assert out == {"pins": [{"uuid": "abc"}]}
    assert calls["timeout"] == 20  # preserved verbatim
    assert isinstance(calls["req"], urllib.request.Request)


def test_api_get_routes_through_proxy_opener_when_set(monkeypatch) -> None:
    """(b) Set -> _api_get calls opener.open (proxied), never the direct urlopen."""

    class _SpyOpener:
        def __init__(self) -> None:
            self.opened: list[tuple] = []

        def open(self, req, timeout=None):  # noqa: ANN001
            self.opened.append((req, timeout))
            return _FakeResp(json.dumps({"items": [{"uuid": "z"}]}).encode())

    spy = _SpyOpener()
    monkeypatch.setattr(mod, "_proxy_opener", lambda: spy)

    def _boom(*a, **k):  # noqa: ANN002, ANN003
        raise AssertionError("direct urlopen used while a proxy opener was available")

    monkeypatch.setattr(urllib.request, "urlopen", _boom)

    out = mod._api_get("https://brevitas.com/api/search/listings/z")
    assert out == {"items": [{"uuid": "z"}]}
    assert len(spy.opened) == 1
    _req, _timeout = spy.opened[0]
    assert _timeout == 20
    assert isinstance(_req, urllib.request.Request)
