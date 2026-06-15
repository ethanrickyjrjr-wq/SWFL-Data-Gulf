"""Schema-validate every live_search_config block in cadence_registry.yaml."""

import pathlib

import yaml

REG = yaml.safe_load((pathlib.Path(__file__).parents[1] / "cadence_registry.yaml").read_text(encoding="utf-8"))


def _live_search_entries():
    return {
        v.get("name"): v
        for v in (REG.get("pipelines") or [])  # `pipelines:` is a LIST of dicts (each carries a `name:`)
        if isinstance(v, dict) and "live_search_config" in v
    }


def test_every_live_search_config_is_well_formed():
    entries = _live_search_entries()
    assert entries, "expected at least one live_search_config entry"
    for k, v in entries.items():
        c = v["live_search_config"]
        assert c["fetch_mode"] in ("search", "api"), k
        assert c["metric_key"] and isinstance(c["areas"], list) and c["areas"], k
        assert c["unit"] in ("usd", "pct", "count"), k
        lo, hi = c["expected_range"]
        assert lo < hi, k
        assert 0 < c["tolerance_pct"] <= 50, k
        # per-metric anomaly band (vs our OWN prior value, not vendor) — required, real value
        assert 0 < c["anomaly_threshold_pct"] <= 100, k
        if c["fetch_mode"] == "search":
            assert c["questions"] and isinstance(c.get("denylist_domains", []), list), k
        else:
            assert c["api_config"]["provider"] and c["api_config"]["series_id"], k


def test_freshness_table_is_daily_truth():
    for k, v in _live_search_entries().items():
        assert v["freshness_table"] == "data_lake.daily_truth", k
        assert v["freshness_column"] == "retrieved_at", k
