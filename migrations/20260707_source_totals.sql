-- Source-of-truth totals captured from the SAME origin each pipeline ingests
-- from (an ArcGIS returnCountOnly query, a SteadyAPI meta.total, etc.) — read
-- by /ops/census (swfldatagulf-ops) to detect silent ingestion drift.
-- Insert-only ledger; the census page reads the latest row per pipeline_name.
CREATE TABLE IF NOT EXISTS data_lake.source_totals (
  id BIGSERIAL PRIMARY KEY,
  pipeline_name TEXT NOT NULL,        -- matches a name in ingest/cadence_registry.yaml
  source_label TEXT NOT NULL,         -- e.g. "SteadyAPI meta.total (Lee+Collier+Hendry city sweep)"
  value BIGINT NOT NULL,
  method TEXT NOT NULL,               -- "arcgis_count" | "api_meta_total"
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS source_totals_pipeline_fetched_idx
  ON data_lake.source_totals (pipeline_name, fetched_at DESC);

GRANT SELECT, INSERT ON data_lake.source_totals TO service_role;
GRANT USAGE, SELECT ON SEQUENCE data_lake.source_totals_id_seq TO service_role;
NOTIFY pgrst, 'reload schema';
