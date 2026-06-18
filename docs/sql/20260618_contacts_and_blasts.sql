-- Briefcase email-blast feature (2026-06-18): user-owned contact list + blast audit.
-- RLS is auth.uid()-scoped (the repo's proven own-rows-only pattern) so a contact
-- or blast is invisible to every user but its owner.

-- contacts: one row per (user, email). The user authors and owns these.
CREATE TABLE IF NOT EXISTS public.contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text,
  email        text NOT NULL,
  phone        text,
  tags         text[] NOT NULL DEFAULT '{}',
  unsubscribed boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, email)
);

CREATE INDEX IF NOT EXISTS contacts_user_id_idx ON public.contacts (user_id);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contacts_own ON public.contacts;
CREATE POLICY contacts_own ON public.contacts
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- email_blasts: an audit row per blast send.
CREATE TABLE IF NOT EXISTS public.email_blasts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deliverable_id text NOT NULL,
  contact_ids    uuid[] NOT NULL,
  status         text NOT NULL DEFAULT 'pending', -- pending | sending | sent | failed
  sent_count     int NOT NULL DEFAULT 0,
  failed_count   int NOT NULL DEFAULT 0,
  sent_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_blasts_user_id_idx ON public.email_blasts (user_id);

ALTER TABLE public.email_blasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_blasts_own ON public.email_blasts;
CREATE POLICY email_blasts_own ON public.email_blasts
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- PostgREST role grants (RLS still gates rows). service_role (unsubscribe route,
-- metering) bypasses RLS; authenticated reaches its own rows through the policies.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_blasts TO authenticated;
GRANT ALL ON public.contacts, public.email_blasts TO service_role;

NOTIFY pgrst, 'reload schema';
