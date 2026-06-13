-- Section 4 — Brand Persistence (S4)
-- Plan: docs/superpowers/plans/2026-06-12-email-template-adapter/s4-brand-persistence__SONNET__NOW.md
--
-- Brand resolution hierarchy (most specific first):
--   project.branding  ->  user_brand_profiles  ->  null (prompt; never SWFL defaults for an authed user)
-- Consumers wired in 571c6cf: lib/email/templates/resolve-brand.ts (4B),
--   app/api/projects/route.ts (4C), app/auth/callback/route.ts (4D),
--   app/api/templates/[id]/run/route.ts (4E).
--
-- Idempotent. Kept in docs/sql/ (this repo has no supabase/ CLI; a
-- supabase/migrations/ file would be an orphan). Already applied to prod.

-- 4A.1 — user_brand_profiles: one row per user, account-level brand default
CREATE TABLE IF NOT EXISTS public.user_brand_profiles (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  primary_color          text,
  accent_color           text,
  logo_url               text,
  company_name           text,
  website_url            text,
  sender_name            text,
  sender_address         text,
  sender_domain_verified boolean NOT NULL DEFAULT false,
  source                 text NOT NULL DEFAULT 'manual',
  -- 'manual' | 'project_derived' | 'email_signup' | 'brandfetch'
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_brand_profiles_user_id_key UNIQUE (user_id)
);

ALTER TABLE public.user_brand_profiles ENABLE ROW LEVEL SECURITY;

-- own-brand RLS: a user may only see/write their own row (this repo's
-- auth.uid() RLS pattern). DROP+CREATE for idempotency across PG versions.
DROP POLICY IF EXISTS "own brand" ON public.user_brand_profiles;
CREATE POLICY "own brand" ON public.user_brand_profiles
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.user_brand_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_brand_profiles TO service_role;

-- 4A.2 — prospect_brand on email_subscribers: carries brand from an outbound
-- branded prospecting email. Written at send time, read at signup (4D) to
-- pre-fill user_brand_profiles. Shape: { primary_color, accent_color, logo_url }
ALTER TABLE public.email_subscribers
  ADD COLUMN IF NOT EXISTS prospect_brand jsonb;

NOTIFY pgrst, 'reload schema';

-- Verify:
--   SELECT COUNT(*) FROM public.user_brand_profiles;
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'email_subscribers' AND column_name = 'prospect_brand';
