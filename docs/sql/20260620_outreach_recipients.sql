-- Outreach Increment 2 — cold-outreach recipient ledger.
-- One row per (campaign, email): the unsubscribe id, the suppression state, AND the
-- drip cursor, all in one. Operator-internal data — RLS enabled with NO policy so only
-- the service role (which bypasses RLS) can read/write it; anon + authenticated denied.
-- Idempotent: safe to re-run.

create table if not exists public.outreach_recipients (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      text not null,
  email            text not null,
  name             text,
  domain           text,
  zip              text,
  brand            jsonb,            -- the scraped ActivationBrand (primary/accent/logoUrl/companyName)
  brand_source     text,            -- enrich source, or 'house' when confidence-gated to SWFL
  brand_confidence real,
  arrival_url      text,            -- the branded click-back (buildArrivalUrl)
  status           text not null default 'active',  -- active | engaged | unsubscribed | bounced
  step             int  not null default 0,         -- drip step sent so far
  next_send_at     timestamptz,                     -- when the next drip email is due
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists outreach_recipients_campaign_email_uq
  on public.outreach_recipients (campaign_id, lower(email));

create index if not exists outreach_recipients_due_idx
  on public.outreach_recipients (status, next_send_at);

alter table public.outreach_recipients enable row level security;
-- No policy on purpose: service-role only (bypasses RLS). Belt-and-suspenders revoke:
revoke all on public.outreach_recipients from anon, authenticated;
