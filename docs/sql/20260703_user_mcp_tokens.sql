-- Account-level MCP token — one token per user, reaches EVERY project the user
-- owns (project selected per tool call by name, server-side ownership enforced).
-- ADDITIVE: the per-project `projects.mcp_key` path is left fully intact; this is
-- the connect-once default, not a replacement. See
-- docs/superpowers/specs/2026-07-03-mcp-account-level-auth-design.md (amended live
-- 07/03/2026: coexist, do not drop mcp_key).
--
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.user_mcp_tokens (
  user_id    uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  token      text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_mcp_tokens ENABLE ROW LEVEL SECURITY;

-- Owner-only, mirroring projects_owner_all: the authenticated web session can
-- read/mint/revoke ONLY its own row. The MCP token→user lookup runs under
-- service_role (grant below), which bypasses RLS.
DROP POLICY IF EXISTS user_mcp_tokens_owner_all ON public.user_mcp_tokens;
CREATE POLICY user_mcp_tokens_owner_all ON public.user_mcp_tokens
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_mcp_tokens TO authenticated;
GRANT ALL ON public.user_mcp_tokens TO service_role;
-- anon: no grant (fail-closed).

-- Backfill: any user who already wired a per-project key gets an account token
-- so they are never left in a broken state when they switch to connect-once.
-- (They still repaste the new snippet — the header name differs.) base64url,
-- padding stripped, so it is a clean header value.
INSERT INTO public.user_mcp_tokens (user_id, token)
SELECT
  DISTINCT ON (user_id) user_id,
  'acct_' || replace(replace(replace(encode(gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'), '=', '')
FROM public.projects
WHERE mcp_key IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
