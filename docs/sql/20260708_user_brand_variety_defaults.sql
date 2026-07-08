-- Account-level brand DEFAULTS for the M2 variety axes (M3 — "save your own
-- full-time brand setup"). Idempotent. STAGED, not yet run: the project-level
-- variety defaults already persist in projects.branding JSONB (no migration);
-- this migration is only for carrying those defaults to NEW projects at the
-- account level (user_brand_profiles), which needs real columns + a typed-client
-- regen (phantom columns are compile errors). See the M3 handoff:
-- docs/superpowers/plans/2026-07-08-email-builder-integration.md (M3-B).
--
-- preferred_recipe    — a RecipeId from lib/email/author-recipes.ts (RECIPE_IDS)
-- default_photo_ratio — a PhotoRatio from lib/email/doc/types.ts ("3:2"|"4:3"|"4:5"|"1:1")
ALTER TABLE public.user_brand_profiles
  ADD COLUMN IF NOT EXISTS preferred_recipe text,
  ADD COLUMN IF NOT EXISTS default_photo_ratio text;
NOTIFY pgrst, 'reload schema';
