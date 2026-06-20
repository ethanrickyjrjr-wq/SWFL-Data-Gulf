-- 2026-06-19 — Funnel bridge (FINAL BOSS 05): claim token carries brand + seed.
--
-- The claim token is the durable carrier across the unauthed→authed boundary (it
-- already survives the OTP login round-trip). A prospect arriving from the funnel
-- carries their scraped brand and a one-click deliverable seed in the token row so
-- the claimed project lands branded + pre-staging a weekly-email deliverable, with
-- nothing fragile threaded through /login?next=.
--
-- Additive + idempotent: two NULLABLE columns (ADD COLUMN IF NOT EXISTS) and a
-- function whose return type GROWS by two columns. No destructive write → no Gate-4
-- concern. Backward-compatible: currently-deployed code that selects only
-- items/title still works against the wider RETURNS TABLE.

ALTER TABLE public.claim_tokens ADD COLUMN IF NOT EXISTS brand jsonb;  -- {primary,secondary,logo_url,company_name}
ALTER TABLE public.claim_tokens ADD COLUMN IF NOT EXISTS seed  jsonb;  -- {template,scopeKind,scopeValue}

-- RETURNS TABLE changes the function's result type, which CREATE OR REPLACE cannot
-- do — DROP first (IF EXISTS keeps this re-runnable). The window where the function
-- is absent is sub-second and claims are rare.
DROP FUNCTION IF EXISTS public.consume_claim_token(text);

CREATE FUNCTION public.consume_claim_token(p_token text)
RETURNS TABLE (items jsonb, title text, brand jsonb, seed jsonb)
LANGUAGE sql
AS $$
  UPDATE public.claim_tokens AS ct
     SET consumed_at = now()
   WHERE ct.token = p_token
     AND ct.consumed_at IS NULL
     AND ct.expires_at > now()
  RETURNING ct.items, ct.title, ct.brand, ct.seed;
$$;

-- Re-apply the server-only EXECUTE grants (DROP cleared them).
REVOKE ALL ON FUNCTION public.consume_claim_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_claim_token(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_claim_token(text) TO service_role;
