-- 20260612_email_usage_increment_fn.sql
--
-- Atomic increment RPC for the email usage meter (Unit E). `lib/email/usage.ts`
-- `recordEmailSent()` upserts the (user_id, billing_period) row then calls this
-- function to bump sent_count in a single row-atomic statement. The base table
-- ships in 20260612_email_product.sql; this function was a missing dependency the
-- meter assumed existed — adding it here so the meter actually records.
--
-- Idempotent: CREATE OR REPLACE + idempotent GRANTs. Safe to re-run.

CREATE OR REPLACE FUNCTION public.increment_email_sent_count(
  p_user_id        uuid,
  p_billing_period text,
  p_n              integer
) RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.email_usage
     SET sent_count = sent_count + p_n,
         updated_at = now()
   WHERE user_id = p_user_id
     AND billing_period = p_billing_period;
$$;

-- Default function EXECUTE is granted to PUBLIC (incl. anon) — revoke it and grant
-- explicitly. The meter calls this with the service-role client; grant authenticated
-- too so a future client-side path works (RLS on email_usage still confines a user
-- to their own row under SECURITY INVOKER; anon has no UPDATE grant regardless).
REVOKE EXECUTE ON FUNCTION public.increment_email_sent_count(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_email_sent_count(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_email_sent_count(uuid, text, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
