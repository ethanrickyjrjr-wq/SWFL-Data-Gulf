-- Link-click routing — append-only per-link event ledger (OUR internal numbers).
--
-- One row per link ACTUALLY minted at send ('sent') and per click captured at the
-- redirect route ('clicked'). Click-through rate is a GROUP BY on these columns — no
-- join required (clicks ÷ links-sent, both grains carried independently). Sibling of
-- outreach_events, but at LINK grain (button_key) which the recipient-grain ledger lacks.
--
-- Identity matches the live outreach drip: recipient_id = outreach_recipients.id (the
-- `rid` the send path tags), campaign_id = outreach_recipients.campaign_id (text), step
-- = the drip cursor at mint time. NOT project_id/contact_id — those belong to a campaign
-- system that doesn't exist yet.
--
-- Service-role only (RLS on, no policy — the redirect route + runners write via the
-- service-role client). Idempotent: safe to re-run.

create table if not exists public.link_events (
  id              bigserial primary key,
  event_type      text not null,   -- 'sent' | 'clicked'
  recipient_id    uuid references public.outreach_recipients(id) on delete cascade,
  campaign_id     text,
  step            smallint,
  button_key      text not null,   -- which link in the email ('cta' for the drip today)
  destination_url text,
  channel         text not null default 'email',
  at              timestamptz not null default now()
);

-- CTR rollups: clicks ÷ sent per campaign × button, and per-recipient engagement.
create index if not exists link_events_campaign_button_idx
  on public.link_events (campaign_id, button_key, event_type);

create index if not exists link_events_recipient_idx
  on public.link_events (recipient_id, event_type);

alter table public.link_events enable row level security;
revoke all on public.link_events from anon, authenticated;

notify pgrst, 'reload schema';
