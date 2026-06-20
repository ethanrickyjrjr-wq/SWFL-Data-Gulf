-- 20260619b_phase_f_alert_columns.sql — Phase F evidence columns on data_readiness_alerts.
-- Idempotent. Run directly against prod (creds .dlt/secrets.toml) — do NOT hand to operator (RULE 1).
ALTER TABLE public.data_readiness_alerts
  ADD COLUMN IF NOT EXISTS user_action           text,  -- 'confirmed' | 'dismissed' | 'ignored'
  ADD COLUMN IF NOT EXISTS surface               text,  -- 'in_project' | 'email'
  ADD COLUMN IF NOT EXISTS gate_reason           text,  -- why the gate fired / skipped
  ADD COLUMN IF NOT EXISTS crawl_confirmed_value text;  -- null until F6 (crawl confirm)

NOTIFY pgrst, 'reload schema';
