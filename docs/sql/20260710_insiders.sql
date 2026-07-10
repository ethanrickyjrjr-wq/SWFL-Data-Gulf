-- Insiders Edition subscribers (the Fable 5 flagship monthly).
-- Spec: docs/superpowers/specs/2026-07-10-insiders-page-design.md (page + capture)
-- Parent: docs/superpowers/specs/2026-07-10-insiders-edition-design.md
--
-- SEPARATE from weekly_read_subscribers (per-ZIP weekly) and email_subscribers
-- (daily digest broadcast): this list is the regional monthly flagship, no ZIP.
-- One active subscription per address; re-subscribing reactivates (fresh opt-in
-- outranks a stale unsubscribe). insiders_issues lands with Phase C (archive).
--
-- Idempotent: safe to re-run.
-- Run: bun scripts/run-migration.ts docs/sql/20260710_insiders.sql

create table if not exists public.insiders_subscribers (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  status        text not null default 'active',   -- 'active' | 'unsubscribed' | 'bounced'
  issues_sent   int not null default 0,
  source        text,                             -- 'insiders-page' | 'homepage' | ...
  consent_text  text,                             -- canonical wording, server-set only
  consent_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- service_role only (API route + future send runner); no public access.
grant insert, select, update on public.insiders_subscribers to service_role;
alter table public.insiders_subscribers enable row level security;
