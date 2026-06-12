-- 20260612_email_product.sql — 5-table foundation for the multi-tenant email product.
--
-- Tables: email_schedules, email_contacts, email_audiences, email_usage,
--         email_sender_config
--
-- Every table uses auth.uid() = user_id RLS (same pattern as 20260612_projects.sql):
--   - anon: no access
--   - authenticated: SELECT/INSERT/UPDATE/DELETE (scoped to owner via RLS)
--   - service_role: ALL (for cron worker + API routes)
--
-- Idempotent: safe to re-run. CREATE TABLE IF NOT EXISTS + DO $$ duplicate_object
-- guards + CREATE UNIQUE INDEX IF NOT EXISTS. Run directly (creds .dlt/secrets.toml) —
-- do NOT hand to the operator (CLAUDE.md RULE 1).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. email_schedules
--    Consumed by: cron worker (SELECT FOR UPDATE SKIP LOCKED on status='active' AND
--    next_run_at <= now(), then advances next_run_at / sets last_run_at) and the AI
--    command route (creates/pauses/stops rows).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_schedules (
  id             bigserial PRIMARY KEY,
  user_id        uuid NOT NULL,
  project_id     text,                                   -- soft-link to public.projects.id (no FK)
  status         text NOT NULL DEFAULT 'active',         -- active | paused | stopped
  cadence        text NOT NULL,                          -- daily | weekly | monthly
  day_of_week    smallint,                               -- 0-6 (weekly only)
  day_of_month   smallint,                               -- 1-28 (monthly only)
  send_hour_et   smallint NOT NULL,                      -- Eastern hour 0-23
  audience_slug  text,                                   -- soft-link to email_audiences.audience_slug
  template_id    text,                                   -- soft-link to templates lane
  next_run_at    timestamptz,
  last_run_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_schedules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY email_schedules_owner_all ON public.email_schedules
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

REVOKE ALL ON public.email_schedules FROM anon;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.email_schedules TO authenticated;
GRANT  ALL ON public.email_schedules TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. email_contacts
--    CSV upload target, per-user. Unique per (user_id, email) so bulk imports are
--    idempotent via ON CONFLICT DO UPDATE.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_contacts (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL,
  email       text NOT NULL,
  name        text,
  tags        text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_contacts_user_email_uidx
  ON public.email_contacts (user_id, email);

ALTER TABLE public.email_contacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY email_contacts_owner_all ON public.email_contacts
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

REVOKE ALL ON public.email_contacts FROM anon;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.email_contacts TO authenticated;
GRANT  ALL ON public.email_contacts TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. email_audiences
--    Resend audience sync target. One row per (user_id, audience_slug).
--    resend_audience_id populated after the Resend API creates the audience.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_audiences (
  id                  bigserial PRIMARY KEY,
  user_id             uuid NOT NULL,
  audience_slug       text NOT NULL,
  resend_audience_id  text,
  contact_count       integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_audiences_user_slug_uidx
  ON public.email_audiences (user_id, audience_slug);

ALTER TABLE public.email_audiences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY email_audiences_owner_all ON public.email_audiences
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

REVOKE ALL ON public.email_audiences FROM anon;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.email_audiences TO authenticated;
GRANT  ALL ON public.email_audiences TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. email_usage
--    Usage meter, period-keyed (YYYY-MM). Resets implicitly with a new billing_period
--    row — no reset cron needed. sent_count incremented atomically by the send worker.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_usage (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL,
  billing_period  text NOT NULL,              -- format 'YYYY-MM'
  sent_count      integer NOT NULL DEFAULT 0,
  tier            text NOT NULL DEFAULT 'free',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_usage_user_period_uidx
  ON public.email_usage (user_id, billing_period);

ALTER TABLE public.email_usage ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY email_usage_owner_all ON public.email_usage
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

REVOKE ALL ON public.email_usage FROM anon;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.email_usage TO authenticated;
GRANT  ALL ON public.email_usage TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. email_sender_config
--    Per-user verified-sender config. One row per user (unique on user_id).
--    dns_records holds the DKIM/SPF/DMARC records returned by Resend as JSONB.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_sender_config (
  id                bigserial PRIMARY KEY,
  user_id           uuid NOT NULL,
  domain            text,
  resend_domain_id  text,
  from_name         text,
  from_email        text,
  reply_to          text,
  domain_verified   boolean NOT NULL DEFAULT false,
  dns_records       jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_sender_config_user_uidx
  ON public.email_sender_config (user_id);

ALTER TABLE public.email_sender_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY email_sender_config_owner_all ON public.email_sender_config
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

REVOKE ALL ON public.email_sender_config FROM anon;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.email_sender_config TO authenticated;
GRANT  ALL ON public.email_sender_config TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- PostgREST schema reload
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
