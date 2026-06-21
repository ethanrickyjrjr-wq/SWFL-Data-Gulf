-- Brand color palettes (saved schemes) on user_brand_profiles
--
-- Adds an account-level library of color schemes the user builds over time.
-- Each palette: { id, name, colors: [primary, accent, extra] }. The library
-- carries to NEW projects (pre-fill in ProjectWorkspace) but never rewrites
-- branding already saved on past projects (project.branding stays authoritative).
--
-- Consumers: app/api/user/brand/route.ts (GET returns it, PATCH replaces it),
--   app/project/[id]/ProjectWorkspace.tsx (pre-fill + persist),
--   app/project/[id]/workspace/BrandingBlock.tsx (picker UI).
-- Shape + validation: lib/brand/palette.ts (sanitizePalettes).
--
-- Idempotent. This repo has no supabase/ CLI — migrations live in docs/sql/
-- and are applied to prod directly. The API degrades gracefully if this
-- column is missing (colors still save; the palette library just no-ops),
-- so deploying the code before this runs does not 500.

ALTER TABLE public.user_brand_profiles
  ADD COLUMN IF NOT EXISTS color_palettes jsonb NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';

-- Verify:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'user_brand_profiles' AND column_name = 'color_palettes';
