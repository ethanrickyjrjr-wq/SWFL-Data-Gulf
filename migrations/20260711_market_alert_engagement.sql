-- migrations/20260711_market_alert_engagement.sql
-- Per-recipient × per-trigger engagement for market-area alerts (`ma`-tagged sends).
-- PINNED paid-tier prerequisite (spec 07/10/2026): recipient identity + trigger on
-- EVERY row, so "which of your contacts opened the price-cut alert" is a QUERY when
-- the agent-branded tier ships — never aggregate this away.
-- Idempotent; run via `bun scripts/run-migration.ts migrations/20260711_market_alert_engagement.sql`.

create table if not exists public.market_alert_engagement (
  id bigint generated always as identity primary key,
  wid text not null,               -- weekly_read_subscribers.id (send-time tag)
  issue_id text not null,          -- runner-assigned issue id (`ma` tag value)
  trigger text,                    -- detector type that caused the send (or 'baseline')
  area_id text,                    -- market area
  event text not null check (event in ('opened','clicked','bounced','complained','delivered')),
  occurred_at timestamptz not null default now()
);

create index if not exists market_alert_engagement_wid_idx
  on public.market_alert_engagement (wid);
create index if not exists market_alert_engagement_trigger_idx
  on public.market_alert_engagement (trigger, event);

grant select, insert, update, delete on public.market_alert_engagement to service_role;

notify pgrst, 'reload schema';
