-- 20260611_usage_events_action.sql — add action dimension to usage_events. Idempotent.
ALTER TABLE public.usage_events
  ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'ask';

CREATE INDEX IF NOT EXISTS usage_events_action_week_idx
  ON public.usage_events (client_id, iso_week, action);
