-- "It's Alive" activation-delta sequence — storage (Phase A).
--
-- Two safe-additive changes:
--   1. email_subscribers gains explicit-consent + scope columns (Resend AUP / CAN-SPAM).
--   2. prospect_activation: one row per enrolled prospect, holding the v1 snapshot the
--      delta diffs against. The snapshot is "what we showed you" — the delta cannot
--      claim a change we can't prove (platform moat #1).
--
-- Idempotent: safe to re-run. Run directly (creds in .dlt/secrets.toml) — do NOT hand
-- to the operator (CLAUDE.md RULE 1). Apply via scripts/email/migrate-activation.py.

-- 1) Consent + scope on the subscriber list -------------------------------------------
-- prospect_brand already exists (20260612_brand_persistence.sql); the consent + scope
-- columns are new. consent_text/consent_at record the explicit opt-in; scope is the
-- prospect's patch (e.g. { "zip": "33931" }) the report is built for.
alter table public.email_subscribers
  add column if not exists consent_text text,
  add column if not exists consent_at   timestamptz,
  add column if not exists scope        jsonb;

-- 2) prospect_activation — the 2-step sequence state -----------------------------------
create table if not exists public.prospect_activation (
  id            bigserial primary key,
  email         text not null,
  subscriber_id bigint references public.email_subscribers(id) on delete set null,
  scope         jsonb not null,                       -- { "zip": "33931" } — must be in-scope
  brand         jsonb,                                -- { primary, accent, logoUrl, companyName }
  step          int  not null default 0,              -- highest step sent (1 = email#1, 2 = email#2)
  snapshot      jsonb,                                -- ActivationSnapshot frozen at email#1
  next_send_at  timestamptz,                          -- when the next step is due (null = nothing pending)
  sent_at       timestamptz[] not null default '{}',  -- one entry per step actually sent
  status        text not null default 'active',       -- active | done | parked | unsubscribed
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Due-step claim index: the cron selects active rows whose next_send_at has passed.
create index if not exists prospect_activation_due_idx
  on public.prospect_activation (next_send_at)
  where status = 'active' and next_send_at is not null;

-- One active enrollment per (email, scope) — re-subscribing is an upsert, not a dupe.
create unique index if not exists prospect_activation_email_scope_active_idx
  on public.prospect_activation (email, (scope->>'zip'))
  where status = 'active';

alter table public.prospect_activation enable row level security;
grant insert, select, update on public.prospect_activation to service_role;
