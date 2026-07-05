-- Account-level brand profile: full BrandingBlock field set (spec
-- 2026-07-05-account-quick-access). Idempotent. Before this, "Save globally"
-- silently dropped every field without a column here.
ALTER TABLE public.user_brand_profiles
  ADD COLUMN IF NOT EXISTS nickname text,
  ADD COLUMN IF NOT EXISTS agent_title text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS font_display text,
  ADD COLUMN IF NOT EXISTS font_body text,
  ADD COLUMN IF NOT EXISTS text_color text,
  ADD COLUMN IF NOT EXISTS background_color text,
  ADD COLUMN IF NOT EXISTS surface_color text,
  ADD COLUMN IF NOT EXISTS surface_dark_color text;
NOTIFY pgrst, 'reload schema';
