import time

from ingest.pipelines.community_profiles import raw_cache
from ingest.pipelines.community_profiles.raw_cache import fetch_all_paced


def _stub_fetch(calls: list[str]):
    def fetch(url: str) -> str:
        calls.append(url)
        return f"markdown for {url}"

    return fetch


def test_fetch_all_paced_writes_cache_and_paces_between_calls(tmp_path, monkeypatch):
    monkeypatch.setattr(raw_cache, "_CACHE_ROOT", tmp_path)
    sleep_calls: list[float] = []
    monkeypatch.setattr(time, "sleep", lambda s: sleep_calls.append(s))

    urls = ["https://naplesgolfguy.com/golf-communities/a/", "https://naplesgolfguy.com/golf-communities/b/"]
    calls: list[str] = []
    out = fetch_all_paced(urls, source="naplesgolfguy", fetch=_stub_fetch(calls))

    assert out[urls[0]] == "markdown for " + urls[0]
    assert out[urls[1]] == "markdown for " + urls[1]
    assert calls == urls  # both fetched, in order
    assert len(sleep_calls) == 1  # jitter between call 1 and call 2, none before the first
    assert (tmp_path / "naplesgolfguy" / "a.md").read_text(encoding="utf-8") == out[urls[0]]
    assert (tmp_path / "naplesgolfguy" / "b.md").read_text(encoding="utf-8") == out[urls[1]]


def test_fetch_all_paced_reads_cache_without_refetching_or_sleeping(tmp_path, monkeypatch):
    monkeypatch.setattr(raw_cache, "_CACHE_ROOT", tmp_path)
    cache_dir = tmp_path / "55places"
    cache_dir.mkdir(parents=True)
    (cache_dir / "heritage-bay.md").write_text("cached markdown", encoding="utf-8")

    sleep_calls: list[float] = []
    monkeypatch.setattr(time, "sleep", lambda s: sleep_calls.append(s))
    calls: list[str] = []

    url = "https://www.55places.com/florida/communities/heritage-bay"
    out = fetch_all_paced([url], source="55places", fetch=_stub_fetch(calls))

    assert out[url] == "cached markdown"
    assert calls == []  # never hit the network
    assert sleep_calls == []  # no pacing needed for an all-cache-hit batch


def test_fetch_all_paced_does_not_cache_empty_fetch_result(tmp_path, monkeypatch):
    monkeypatch.setattr(raw_cache, "_CACHE_ROOT", tmp_path)
    monkeypatch.setattr(time, "sleep", lambda s: None)

    url = "https://naplesgolfguy.com/golf-communities/blocked-page/"
    out = fetch_all_paced([url], source="naplesgolfguy", fetch=lambda u: "")

    assert out[url] == ""
    assert not (tmp_path / "naplesgolfguy" / "blocked-page.md").exists()


def test_fetch_all_paced_empty_url_list_is_a_noop(tmp_path, monkeypatch):
    monkeypatch.setattr(raw_cache, "_CACHE_ROOT", tmp_path)
    assert fetch_all_paced([], source="naplesgolfguy", fetch=lambda u: "x") == {}
    assert not (tmp_path / "naplesgolfguy").exists()  # no dir created for an empty batch
