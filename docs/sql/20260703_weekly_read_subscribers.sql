-- Weekly-read subscribers (Lane D free taste).
-- Spec: docs/superpowers/specs/2026-07-03-weekly-read-design.md
--
-- SEPARATE from public.email_subscribers (daily digest = one generic Resend Segment
-- broadcast): this list is personalized per-ZIP and sent by our own engine via
-- resend.batch.send. One active subscription per address; re-subscribing with a new
-- ZIP updates the existing row (upsert on email).
--
-- Idempotent: safe to re-run.
-- Run: bun scripts/run-migration.ts docs/sql/20260703_weekly_read_subscribers.sql

create table if not exists public.weekly_read_subscribers (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  zip           text not null,                    -- 5-digit, in-scope gated at the API
  status        text not null default 'active',   -- 'active' | 'unsubscribed' | 'bounced'
  next_send_at  timestamptz,                      -- null = due on the next run (first issue)
  issues_sent   int not null default 0,
  source        text,                             -- 'zip-report' | 'homepage' | ...
  consent_text  text,                             -- canonical wording, server-set only
  consent_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- service_role only (API routes + runner); no public access.
grant insert, select, update on public.weekly_read_subscribers to service_role;
alter table public.weekly_read_subscribers enable row level security;
