-- migrations/20260714_contact_segments.sql
--
-- Contact segmentation for the ONE-OFF BLAST lane (ContactPickerModal /
-- POST /api/deliverables/[id]/blast). Spec: docs/superpowers/specs/2026-07-14-contact-segments-design.md
--
-- contact_segments is NOT email_audiences (the tag -> Resend-segment-id cache
-- for the recurring DIGEST broadcast lane, lib/email/audience-sync.ts).
-- Different table, different send path — see lib/email/CLAUDE.md.
--
-- Idempotent. Safe to re-run.

BEGIN;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS attribs jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.contacts.attribs IS
  'Arbitrary per-contact key/value attributes (e.g. city, budget), captured from CSV import columns not already recognised (email/name/tags). All values are strings. Read by lib/email/segments/filter.ts -- nothing else writes to this column.';

CREATE TABLE IF NOT EXISTS public.contact_segments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name       text NOT NULL,
  filter     jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.contact_segments IS
  'A user''s saved contact filter for the ONE-OFF BLAST lane (ContactPickerModal / POST /api/deliverables/[id]/blast). NOT email_audiences (tag -> Resend-segment-id cache for the recurring DIGEST broadcast lane, lib/email/audience-sync.ts) -- different table, different send path. filter is a lib/email/segments/filter.ts Condition AST -- never raw SQL.';

ALTER TABLE public.contact_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_segments_owner ON public.contact_segments;
CREATE POLICY contact_segments_owner
  ON public.contact_segments
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- service_role still needs an explicit grant per table (it is NOT implicit).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_segments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_segments TO authenticated;

-- PostgREST must be told the schema changed, or the new table/column 404s until a restart.
NOTIFY pgrst, 'reload schema';

COMMIT;
