-- Outreach Increment 2 — append-only event ledger (OUR internal numbers).
-- Resend delivers; we capture every sent/delivered/opened/clicked/bounced/unsubscribed
-- event here via the Resend webhook. Dedup on (resend_email_id, event) so webhook
-- retries never double-count. Service-role only (RLS on, no policy). Idempotent.

create table if not exists public.outreach_events (
  id              bigserial primary key,
  recipient_id    uuid references public.outreach_recipients(id) on delete cascade,
  campaign_id     text,
  event           text not null,   -- sent | delivered | opened | clicked | bounced | unsubscribed
  resend_email_id text,            -- Resend's message id, for idempotent retries
  at              timestamptz not null default now(),
  meta            jsonb
);

create unique index if not exists outreach_events_dedup_uq
  on public.outreach_events (resend_email_id, event)
  where resend_email_id is not null;

create index if not exists outreach_events_recipient_idx
  on public.outreach_events (recipient_id, event);

create index if not exists outreach_events_campaign_idx
  on public.outreach_events (campaign_id, event, at);

alter table public.outreach_events enable row level security;
revoke all on public.outreach_events from anon, authenticated;
