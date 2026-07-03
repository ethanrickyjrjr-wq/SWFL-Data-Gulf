-- Promote business_address to the account level on user_brand_profiles.
--
-- WHY: CAN-SPAM requires a valid physical postal address in every commercial
-- email (FTC compliance guide, verified via crawl4ai 07/03/2026). The field
-- already existed per-project (projects.branding.business_address -> ADDRESS
-- token via branding-to-tokens.ts) but wasn't in the account-level
-- carry-forward set, so every new project needed it re-entered. Same pattern
-- as COLOR_FIELDS/SOCIAL_FIELDS in app/api/user/brand/route.ts.
--
-- Multi-tenant: user_brand_profiles is one row per user_id with "own brand"
-- RLS (auth.uid() = user_id) — each account sets and stores its OWN address,
-- never shared across users.
--
-- Idempotent. This repo has no supabase/ CLI — migrations live in docs/sql/
-- and apply to prod directly via scripts/run-migration.ts.

ALTER TABLE public.user_brand_profiles
  ADD COLUMN IF NOT EXISTS business_address text;

NOTIFY pgrst, 'reload schema';

-- Verify:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'user_brand_profiles' AND column_name = 'business_address';
