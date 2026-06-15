"""Registry-driven runner: live_search_config entries -> engine -> data_lake.daily_truth (idempotent merge).

CLI:  python -m ingest.pipelines.live_search.pipeline [--dry-run] [--metric <registry_key>]
Non-destructive ON CONFLICT merge (no replace/truncate) -> the Gate-4 non-null guard does not apply.
"""

from __future__ import annotations

import argparse
import os

import psycopg
import yaml
from psycopg.types.json import Json

from ingest.lib.guards import assert_min_rows
from ingest.pipelines.live_search import engine
from ingest.scripts.migrate_nfip_flood_zone_current import _uri

REGISTRY = os.path.join(os.path.dirname(__file__), "..", "..", "cadence_registry.yaml")

UPSERT = """
INSERT INTO data_lake.daily_truth
  (metric_key, area, period, value, unit, source_url, source_title, engine, query_text,
   agreement_n, verified_on_page, source_tag, status_reason, anomaly_flag, anomaly_delta_pct, metric_config)
VALUES (%(metric_key)s,%(area)s,%(period)s,%(value)s,%(unit)s,%(source_url)s,%(source_title)s,%(engine)s,
   %(query_text)s,%(agreement_n)s,%(verified_on_page)s,%(source_tag)s,%(status_reason)s,
   %(anomaly_flag)s,%(anomaly_delta_pct)s,%(metric_config)s)
ON CONFLICT (metric_key, area, period, source_tag) DO UPDATE SET
   value=EXCLUDED.value, source_url=EXCLUDED.source_url, source_title=EXCLUDED.source_title,
   engine=EXCLUDED.engine, query_text=EXCLUDED.query_text, agreement_n=EXCLUDED.agreement_n,
   verified_on_page=EXCLUDED.verified_on_page, status_reason=EXCLUDED.status_reason,
   anomaly_flag=EXCLUDED.anomaly_flag, anomaly_delta_pct=EXCLUDED.anomaly_delta_pct,
   retrieved_at=now(), metric_config=EXCLUDED.metric_config
"""


def entries(metric_filter: str | None = None) -> dict[str, dict]:
    reg = yaml.safe_load(open(REGISTRY, encoding="utf-8"))
    out: dict[str, dict] = {}
    for v in reg.get("pipelines") or []:  # `pipelines:` is a LIST of dicts (each carries a `name:`)
        if isinstance(v, dict) and "live_search_config" in v:
            name = v.get("name")
            if metric_filter is None or name == metric_filter:
                out[name] = v["live_search_config"]
    return out


def resolve(cfg: dict) -> list[engine.DailyTruthRow]:
    rows: list[engine.DailyTruthRow] = []
    for area in cfg.get("areas", []):
        if cfg.get("fetch_mode") == "api":
            rows.append(engine.resolve_metric_api(cfg, area))
        else:
            rows.append(engine.resolve_metric_search(cfg, area))
    return rows


def _params(r: engine.DailyTruthRow) -> dict:
    return dict(
        metric_key=r.metric_key, area=r.area, period=r.period, value=r.value, unit=r.unit,
        source_url=r.source_url, source_title=r.source_title, engine=r.engine, query_text=r.query_text,
        agreement_n=r.agreement_n, verified_on_page=r.verified_on_page, source_tag=r.source_tag,
        status_reason=r.status_reason, anomaly_flag=r.anomaly_flag, anomaly_delta_pct=r.anomaly_delta_pct,
        metric_config=Json(r.metric_config),
    )


def upsert(rows: list[engine.DailyTruthRow]) -> int:
    assert_min_rows(len(rows), 1, "daily_truth")  # we ran at least one metric/area
    with psycopg.connect(_uri(), connect_timeout=30) as conn, conn.cursor() as cur:
        for r in rows:
            cur.execute(UPSERT, _params(r))
        conn.commit()
    return len(rows)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--metric", default=None)
    args = ap.parse_args()

    all_rows: list[engine.DailyTruthRow] = []
    for name, cfg in entries(args.metric).items():
        rows = resolve(cfg)
        all_rows.extend(rows)
        for r in rows:
            print(
                f"[{name}] {r.area} {r.metric_key}={r.value} ({r.engine or 'none'}) "
                f"src={r.source_url} anomaly={r.anomaly_flag} reason={r.status_reason}"
            )
    if args.dry_run:
        print(f"-- dry-run: {len(all_rows)} rows, search queries fired={engine.query_count()} (not written)")
        return
    n = upsert(all_rows)
    print(f"-- wrote {n} rows; search queries fired={engine.query_count()}")


if __name__ == "__main__":
    main()
