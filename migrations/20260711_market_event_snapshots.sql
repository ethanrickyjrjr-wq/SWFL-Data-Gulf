-- migrations/20260711_market_event_snapshots.sql
-- Detection state for market-area alerts (spec 2026-07-10-market-area-alerts-design.md):
-- ONE row per ZIP — the facts last shown + heat inputs + as-of. Advanced ONLY after a
-- confirmed send (Property Watch lesson: never stamp without a real send).
-- Idempotent; run via `bun scripts/run-migration.ts migrations/20260711_market_event_snapshots.sql`
-- (psql is not installed on this box).

create table if not exists public.market_event_snapshots (
  zip text primary key,
  payload jsonb not null,          -- ZipMetricsSnapshot (lib/email/zip-events/types.ts)
  as_of date not null,             -- underlying data as-of
  advanced_at timestamptz,         -- last confirmed-send advance; null = seeded only
  updated_at timestamptz not null default now()
);

comment on table public.market_event_snapshots is
  'Market-area alerts: per-ZIP last-shown snapshot; advances only after confirmed send.';

grant select, insert, update, delete on public.market_event_snapshots to service_role;

notify pgrst, 'reload schema';
