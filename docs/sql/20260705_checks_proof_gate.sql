-- 20260705_checks_proof_gate.sql — Operation July task 16: un-closeable-without-proof
-- Spec: docs/superpowers/specs/2026-07-05-uncloseable-check-proof-design.md
-- Shared Supabase (public schema). Apply via Bun.SQL (psql is NOT installed on this box —
-- see memory reference_run-migrations-via-bun-sql; .dlt/secrets.toml creds, sslmode=require).
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS.
--
-- WHAT IT DOES: a check can no longer transition INTO state='done' without a valid `proof`.
--   * signal-bearing check (public.checks.signal IS NOT NULL) → proof must be a FRESH, PASSING
--     record of running THAT stored signal (the CLI `scripts/check.mjs close` makes the live
--     HTTP/DB call itself and writes the observed result).
--   * signal-less check → proof must be a recorded, non-empty human attestation (--evidence).
--   The stored `signal` is immutable once set (blocks swapping in a trivially-passing one),
--   except from a deliberate operator session that has SET app.allow_signal_edit='1'.
--
-- ⚠ OPS-REPO CLOSE PATH: the /checks page + API live in swfldatagulf-ops. If that surface has a
--   "close" button that PATCHes state='done' WITHOUT proof, this trigger will now REJECT it.
--   The additive nullable `proof` column is safe for any SELECT. Before applying to prod, confirm
--   the ops surface is read-only for closes (or route its close through the proof path). That is a
--   separate repo / separate PR.
--
-- ⚠ RAW ATTEST UPDATES STOP WORKING: a bare `UPDATE public.checks SET state='done' ...` (like the
--   historical 20260531_checks_resolve_volume_guard.sql) is now rejected — every close carries proof.

-- 1. Audit trail + what the trigger validates.
ALTER TABLE public.checks ADD COLUMN IF NOT EXISTS proof jsonb;

-- 2. The guard.
CREATE OR REPLACE FUNCTION public.checks_require_proof()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  is_close       boolean;
  stored_signal  jsonb;
BEGIN
  -- (1) Signal immutability: a set signal cannot be rewritten by an ordinary UPDATE
  -- (e.g. a closing session swapping in a trivially-passing signal). Only escape: a
  -- deliberate operator session that has SET app.allow_signal_edit='1'.
  IF TG_OP = 'UPDATE'
     AND OLD.signal IS NOT NULL
     AND NEW.signal IS DISTINCT FROM OLD.signal
     AND coalesce(current_setting('app.allow_signal_edit', true), '') <> '1' THEN
    RAISE EXCEPTION
      'checks: signal is immutable once set (check_key=%). Change it only via a Bun.SQL session that has SET app.allow_signal_edit=''1''.',
      NEW.check_key
      USING ERRCODE = 'check_violation';
  END IF;

  -- (2) Gate ONLY transitions INTO 'done'. Metadata edits, reopen, and --drop
  -- (state='dropped') pass untouched — abandoning a check is not attesting it.
  is_close := (NEW.state = 'done')
              AND (TG_OP = 'INSERT' OR OLD.state IS DISTINCT FROM 'done');
  IF NOT is_close THEN
    RETURN NEW;
  END IF;

  IF NEW.proof IS NULL THEN
    RAISE EXCEPTION
      'checks: cannot close % into done without proof — run `scripts/check.mjs close` (it asserts the live signal).',
      NEW.check_key
      USING ERRCODE = 'check_violation';
  END IF;

  -- (3) Tier from the STORED signal (immutable on UPDATE; NEW on INSERT).
  stored_signal := CASE WHEN TG_OP = 'UPDATE' THEN OLD.signal ELSE NEW.signal END;

  IF stored_signal IS NOT NULL THEN
    -- Signal-bearing (strong tier): a fresh, passing proof that recorded running THIS signal.
    IF NEW.proof->>'kind' IS DISTINCT FROM 'signal' THEN
      RAISE EXCEPTION
        'checks: % is signal-bearing; close requires proof.kind=signal (no downgrade to manual evidence).',
        NEW.check_key USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.proof->>'ok' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION
        'checks: % proof.ok is not true — the live signal did not pass.',
        NEW.check_key USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.proof->'signal' IS DISTINCT FROM stored_signal THEN
      RAISE EXCEPTION
        'checks: % proof.signal does not match the stored signal — proof must record running the stored assertion.',
        NEW.check_key USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.proof->>'observed_at' IS NULL THEN
      RAISE EXCEPTION 'checks: % proof missing observed_at.', NEW.check_key
        USING ERRCODE = 'check_violation';
    END IF;
    IF now() - (NEW.proof->>'observed_at')::timestamptz > interval '1 day' THEN
      RAISE EXCEPTION
        'checks: % proof is stale (observed_at % — older than 1 day). Re-run the live signal.',
        NEW.check_key, NEW.proof->>'observed_at' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    -- Signal-less (manual tier): a recorded, non-empty human attestation.
    IF NEW.proof->>'kind' IS DISTINCT FROM 'manual'
       OR length(coalesce(NEW.proof->>'evidence', '')) = 0 THEN
      RAISE EXCEPTION
        'checks: % is manual (no signal); close requires proof.kind=manual with non-empty evidence (pass --evidence).',
        NEW.check_key USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

-- 3. Wire it.
DROP TRIGGER IF EXISTS checks_require_proof_trg ON public.checks;
CREATE TRIGGER checks_require_proof_trg
  BEFORE INSERT OR UPDATE ON public.checks
  FOR EACH ROW
  EXECUTE FUNCTION public.checks_require_proof();
