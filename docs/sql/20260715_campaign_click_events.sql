-- 20260715_campaign_click_events.sql — click-triggered listing-campaign agent alerts.
--
-- One row per (contact, schedule, day) a recipient clicks a link inside a listing-campaign
-- milestone email. The webhook inserts BEFORE sending the alert email; a unique-violation on
-- the dedup index means "already alerted today" and the send is skipped — insert-then-check,
-- not read-then-write, so a concurrent webhook retry can't double-alert.
--
-- Join path this table exists to close: email.clicked webhook (data.broadcast_id, data.to,
-- data.click.link) -> email_sends (broadcast_id -> user_id, schedule_id) -> email_schedules
-- (schedule_id -> project_id). See docs/superpowers/specs/2026-07-15-campaign-click-alerts-design.md.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.campaign_click_events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       uuid NOT NULL,
  project_id    uuid NOT NULL,
  schedule_id   bigint,
  broadcast_id  text,
  contact_email text NOT NULL,
  contact_name  text,
  link          text,
  clicked_at    timestamptz NOT NULL DEFAULT now(),
  click_date    date GENERATED ALWAYS AS ((clicked_at AT TIME ZONE 'utc')::date) STORED,
  alert_sent    boolean NOT NULL DEFAULT false
);

-- Dedup: one alert-worthy row per contact per schedule per day. A schedule_id can be NULL in
-- theory (broadcast_id resolved but the email_sends row predates a column, or the join failed
-- partway) — NULLs don't collide under a unique index, so a second safety net keys on
-- (project_id, contact_email, click_date) too, enforced in application code (the insert), not
-- a second index, since a schedule-less click still belongs to exactly one project per day.
CREATE UNIQUE INDEX IF NOT EXISTS campaign_click_events_dedup_uidx
  ON public.campaign_click_events (schedule_id, contact_email, click_date)
  WHERE schedule_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS campaign_click_events_project_idx
  ON public.campaign_click_events (project_id, clicked_at DESC);

ALTER TABLE public.campaign_click_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY campaign_click_events_owner_select ON public.campaign_click_events
    FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

REVOKE ALL ON public.campaign_click_events FROM anon, authenticated;
GRANT SELECT ON public.campaign_click_events TO authenticated;
GRANT ALL ON public.campaign_click_events TO service_role;

NOTIFY pgrst, 'reload schema';
