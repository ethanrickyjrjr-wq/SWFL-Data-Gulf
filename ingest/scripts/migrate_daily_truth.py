"""Idempotent DDL for data_lake.daily_truth — the sourced-freshness spine table.

A first-class Tier-2 citizen the brains reason over (freshness-pulse). Safe to re-run.
Creds: DESTINATION__POSTGRES__CREDENTIALS env, else .dlt/secrets.toml (reuses
ingest/scripts/migrate_nfip_flood_zone_current._uri).
"""

from __future__ import annotations

import psycopg

from ingest.scripts.migrate_nfip_flood_zone_current import _uri  # reuse the exact creds resolver

DDL = """
CREATE SCHEMA IF NOT EXISTS data_lake;
CREATE TABLE IF NOT EXISTS data_lake.daily_truth (
  metric_key        text        NOT NULL,
  area              text        NOT NULL,
  period            date        NOT NULL,
  value             numeric,
  unit              text,
  source_url        text,
  source_title      text,
  engine            text,
  query_text        text,
  retrieved_at      timestamptz NOT NULL DEFAULT now(),
  agreement_n       int         NOT NULL DEFAULT 0,
  verified_on_page  boolean     NOT NULL DEFAULT false,
  source_tag        text        NOT NULL DEFAULT 'live_search',
  status_reason     text,
  anomaly_flag      boolean     NOT NULL DEFAULT false,
  anomaly_delta_pct numeric,
  metric_config     jsonb,
  CONSTRAINT daily_truth_pk PRIMARY KEY (metric_key, area, period, source_tag)
);
CREATE INDEX IF NOT EXISTS daily_truth_retrieved_idx ON data_lake.daily_truth (retrieved_at DESC);
GRANT SELECT ON data_lake.daily_truth TO service_role;
"""


def main() -> None:
    with psycopg.connect(_uri(), connect_timeout=30) as conn:
        with conn.cursor() as cur:
            cur.execute(DDL)
            cur.execute("NOTIFY pgrst, 'reload schema';")
        conn.commit()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT count(*) FROM information_schema.columns "
                "WHERE table_schema='data_lake' AND table_name='daily_truth';"
            )
            n = cur.fetchone()[0]
            assert n >= 17, f"daily_truth columns missing (got {n})"
    print(f"migrate_daily_truth: OK ({n} columns)")


if __name__ == "__main__":
    main()
