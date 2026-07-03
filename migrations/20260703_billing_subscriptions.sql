-- Idempotent: billing_subscriptions — Stripe tier source of truth (Lane A).
-- checkUsageLimit reads tier here; email_usage stays a pure send counter.
CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  user_id                uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  stripe_customer_id     text UNIQUE NOT NULL,
  stripe_subscription_id text,
  tier                   text NOT NULL DEFAULT 'free',
  status                 text NOT NULL DEFAULT 'none',
  current_period_end     timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_subscriptions_customer_idx
  ON public.billing_subscriptions (stripe_customer_id);

-- RLS on, no row policies: service_role is the only reader/writer
-- (matches 20260701_api_usage_log.sql).
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.billing_subscriptions TO service_role;
NOTIFY pgrst, 'reload schema';
