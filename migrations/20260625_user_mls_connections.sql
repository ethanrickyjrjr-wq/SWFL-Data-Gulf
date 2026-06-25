-- public.user_mls_connections
-- Stores one record per (user, board). Bearer token lives in env — NOT here.

CREATE TABLE IF NOT EXISTS public.user_mls_connections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_slug       text NOT NULL CHECK (board_slug IN ('swfl_mls', 'nabor')),
  member_mls_id    text NOT NULL,
  last_entity_event_sequence bigint,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'error')),
  connected_at     timestamptz NOT NULL DEFAULT now(),
  last_synced_at   timestamptz,
  error_message    text,
  UNIQUE (user_id, board_slug)
);

ALTER TABLE public.user_mls_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_connections" ON public.user_mls_connections
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role bypasses RLS automatically.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_mls_connections TO service_role;
