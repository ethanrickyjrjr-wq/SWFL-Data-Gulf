-- 20260721_supabase_db_metrics.sql
--
-- Leading indicator for DB-instance health, scraped hourly from the Supabase
-- Metrics API (beta) by scripts/supabase-metrics-scrape.mjs and rendered by
-- swfldatagulf-ops /db-health.
--
-- NOT egress: this feed carries zero storage metrics (verified 07/21/2026 across
-- all 317 returned metric families) and is not the invoice. The 07/21 burn was
-- Storage/S3 traffic, which this table can never show.
--
-- Long format on purpose — adding a gauge must never require a migration.
-- Idempotent. Applied live 07/21/2026; this file is the versioned record so a
-- fresh environment or DR rebuild can recreate it.
create table if not exists public.supabase_db_metrics (
  scraped_at timestamptz not null,
  metric     text        not null,
  value      double precision not null,
  primary key (scraped_at, metric)
);

comment on table public.supabase_db_metrics is
  'Supabase Metrics API gauges, hourly. DB instance only - no storage metrics, not the invoice. Written by scripts/supabase-metrics-scrape.mjs; read by swfldatagulf-ops /db-health. Retention 90 days, pruned by the scraper.';

-- The page asks "latest value per metric"; a future trend view asks
-- "this metric over time". Both are this index.
create index if not exists supabase_db_metrics_metric_time_idx
  on public.supabase_db_metrics (metric, scraped_at desc);

-- Service-role reads and writes only; service_role bypasses RLS. Enabled with
-- NO policies means anon/authenticated see nothing even if a GRANT is ever
-- added by mistake. Verified live 07/21/2026: relrowsecurity = true.
alter table public.supabase_db_metrics enable row level security;
