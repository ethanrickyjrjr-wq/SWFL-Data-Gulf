-- Monthly usage cap for anonymous (keyless) MCP callers — swfl_fetch / swfl_reconcile
-- are intentionally keyless (v1 connect-once design), so this doctrine mirrors
-- build_usage / increment_build_count (migrations/20260716_switch_pass.sql) but
-- keys on a hashed caller IP instead of user_id: there is no account for an
-- anonymous MCP caller to key on. MONTHLY, not daily (Ricky, 2026-09-15): a
-- daily reset never actually runs out, so it never produces the "I've used my
-- free lookups" moment that a real cap needs to convert — see lib/mcp/anon-usage.ts.
-- Abuse/cost guard on lake reads, not a paywall — any caller presenting
-- X-Account-Key or X-Project-Key skips this table entirely (see
-- app/api/mcp/usage-gate.ts).
BEGIN;

CREATE TABLE IF NOT EXISTS public.mcp_anon_usage (
  ip_hash       text NOT NULL,
  month         date NOT NULL, -- first day of the UTC month, e.g. 2026-09-01
  request_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, month)
);
ALTER TABLE public.mcp_anon_usage ENABLE ROW LEVEL SECURITY;
-- No client policies: metering is service-role-only, invisible to callers.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_anon_usage TO service_role;

CREATE OR REPLACE FUNCTION public.increment_mcp_anon_usage(p_ip_hash text, p_month date, p_n integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.mcp_anon_usage (ip_hash, month, request_count)
  VALUES (p_ip_hash, p_month, p_n)
  ON CONFLICT (ip_hash, month) DO UPDATE SET request_count = public.mcp_anon_usage.request_count + p_n;
$$;
-- PostgREST exposes functions to any role with EXECUTE; default is PUBLIC.
-- Metering is service-role-only — close the default-open grant.
REVOKE EXECUTE ON FUNCTION public.increment_mcp_anon_usage(text, date, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_mcp_anon_usage(text, date, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_mcp_anon_usage(text, date, integer) TO service_role;

ALTER TABLE public.mcp_anon_usage DROP CONSTRAINT IF EXISTS mcp_anon_usage_count_nonnegative;
ALTER TABLE public.mcp_anon_usage ADD CONSTRAINT mcp_anon_usage_count_nonnegative CHECK (request_count >= 0);

NOTIFY pgrst, 'reload schema';
COMMIT;
