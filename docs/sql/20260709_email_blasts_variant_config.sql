-- 20260709_email_blasts_variant_config.sql — store the real split-test text
-- (so results can label "Variant B: '...'" instead of a bare index).
-- Idempotent: safe to re-run.

ALTER TABLE public.email_blasts
  ADD COLUMN IF NOT EXISTS variant_config jsonb;

NOTIFY pgrst, 'reload schema';
