-- Daily-digest subscriber list for SWFL Data Gulf (Email Marketing Phase 2).
--
-- SEPARATE from public.waitlist: the waitlist is "notify me at launch"; this is
-- "email me the daily digest" — a different consent. The Resend Segment (formerly
-- Audience) is the source of truth for delivery + the managed unsubscribe flow;
-- this table is the app-side mirror (analytics now, reply-driven prefs in Phase 3).
--
-- Idempotent: safe to re-run. Run directly (creds in .dlt/secrets.toml) — do NOT
-- hand to the operator (CLAUDE.md RULE 1).

create table if not exists public.email_subscribers (
  id          bigserial primary key,
  email       text not null unique,
  status      text not null default 'subscribed',  -- 'subscribed' | 'unsubscribed'
  source      text,                                 -- 'landing' | 'r-page' | ...
  segment_id  text,                                 -- Resend segment id (delivery target)
  contact_id  text,                                 -- Resend contact id
  interests   text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- service_role inserts/updates from the API route; no public access (reads via service_role).
grant insert, select, update on public.email_subscribers to service_role;

alter table public.email_subscribers enable row level security;
