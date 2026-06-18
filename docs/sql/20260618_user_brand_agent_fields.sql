-- Add agent identity fields to user_brand_profiles so the BrandingBlock's
-- four fields (agent_name, photo_url, license, brokerage) can be saved as a
-- user-level default and auto-applied to new projects.
-- Idempotent. Already applied: check with the verify query below.

ALTER TABLE public.user_brand_profiles
  ADD COLUMN IF NOT EXISTS agent_name text,
  ADD COLUMN IF NOT EXISTS photo_url  text,
  ADD COLUMN IF NOT EXISTS license    text,
  ADD COLUMN IF NOT EXISTS brokerage  text;

NOTIFY pgrst, 'reload schema';

-- Verify:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'user_brand_profiles'
--       AND column_name IN ('agent_name', 'photo_url', 'license', 'brokerage');
--   -- Should return 4 rows.
