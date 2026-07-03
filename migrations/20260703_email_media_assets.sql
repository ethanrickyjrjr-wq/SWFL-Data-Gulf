-- public.email_media_assets — the Email Lab media library.
-- One row per user-held image: uploads (resized/compressed derivative in the
-- email-media bucket), brand assets, and Pexels picks (attribution jsonb carries
-- {photographer, photographer_url, pexels_url} — "Photo by X on Pexels" rides
-- the image caption at insert time). Idempotent; run via
--   bun scripts/run-migration.ts migrations/20260703_email_media_assets.sql

CREATE TABLE IF NOT EXISTS public.email_media_assets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url         text NOT NULL,
  kind        text NOT NULL DEFAULT 'upload' CHECK (kind IN ('upload', 'brand', 'pexels')),
  label       text NOT NULL DEFAULT '',
  width       integer,
  height      integer,
  attribution jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_media_assets_user_idx
  ON public.email_media_assets (user_id, created_at DESC);

ALTER TABLE public.email_media_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_media" ON public.email_media_assets;
CREATE POLICY "users_own_media" ON public.email_media_assets
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role bypasses RLS automatically.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_media_assets TO service_role;

NOTIFY pgrst, 'reload schema';
