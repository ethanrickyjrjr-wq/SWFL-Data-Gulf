-- docs/sql/20260702_outreach_demo.sql
-- Funnel demo email: cadence stage axis on outreach_recipients + claim attribution + scorecard.
-- Idempotent. Additive only — legacy drip rows keep track/stage NULL and are untouched.

alter table public.outreach_recipients
  add column if not exists track text,
  add column if not exists stage text,
  add column if not exists subject_variant text,
  add column if not exists snapshot jsonb,
  add column if not exists trial_sends int not null default 0;

comment on column public.outreach_recipients.track is 'demo track: agent | broker (NULL = legacy drip row)';
comment on column public.outreach_recipients.stage is
  'demo cadence: cold_t1|cold_t2|cold_t3|cold_t4|trial_active|cooldown|reengaged|retired|converted';
comment on column public.outreach_recipients.snapshot is 'ActivationSnapshot frozen at T1 send (delta left-operand)';

create index if not exists outreach_recipients_demo_due_idx
  on public.outreach_recipients (stage, next_send_at) where track is not null;

-- Claim attribution: the arrival ref (<recipient uuid>-<touch>) rides the claim token
-- across the OTP boundary so /api/claim can log 'claimed' + flip stage to 'converted'.
alter table public.claim_tokens add column if not exists ref text;

-- Cycle-1 scorecard: one SQL read = delivered -> opened -> clicked -> arrived -> claimed (+ complaints).
-- 'arrived'/'claimed' are written by app code; 'complained' becomes a distinct event
-- (lifecycle.ts) in the same build (today complaints log as 'unsubscribed').
create or replace view public.outreach_demo_funnel as
select
  r.campaign_id,
  r.track,
  r.subject_variant,
  count(distinct r.id)                                                  as recipients,
  count(distinct e.recipient_id) filter (where e.event = 'delivered')   as delivered,
  count(distinct e.recipient_id) filter (where e.event = 'opened')      as opened,
  count(distinct e.recipient_id) filter (where e.event = 'clicked')     as clicked,
  count(distinct e.recipient_id) filter (where e.event = 'arrived')     as arrived,
  count(distinct e.recipient_id) filter (where e.event = 'claimed')     as claimed,
  count(*)                       filter (where e.event = 'complained')  as complaints,
  count(*)                       filter (where e.event = 'unsubscribed') as unsubscribed
from public.outreach_recipients r
left join public.outreach_events e on e.recipient_id = r.id
where r.track is not null
group by 1, 2, 3;

revoke all on public.outreach_demo_funnel from anon, authenticated;
