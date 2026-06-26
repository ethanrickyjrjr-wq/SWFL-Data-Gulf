-- 20260626_email_schedule_deliverable.sql — link a recurring email_schedules row to a
-- built block-canvas EmailDoc deliverable, so the cron worker can RE-RENDER that exact
-- Email Lab design with fresh lake data + fresh AI commentary + a fresh chart each
-- occurrence (the EmailDoc → scheduler "missing send wire", N6).
--
-- Before this column, a Lab-built EmailDoc could only be scheduled by forcing it through
-- the grounded-REPORT lane (deliverableToScheduleRecipe always set template_id='report'
-- and required a ZIP), which threw the user's branded/charted design away. With a
-- deliverable_id the worker reads the saved doc + its build prompt (deliverables.instruction)
-- + scope + branding straight off the deliverable row and re-runs buildContentDoc.
--
-- ONE additive, nullable column. The claim RPC is `RETURNS SETOF public.email_schedules`
-- (20260612_email_schedule_claim_fn.sql:38) so it returns s.* — this new column rides
-- along on real claims for free, no function change needed. Existing rows get NULL and
-- keep meaning "not an EmailDoc schedule" (the digest/report/scoped lanes are unchanged).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + re-emit grants. Safe to re-run.
-- Run directly (creds in .dlt/secrets.toml) — do NOT hand to the operator (CLAUDE.md RULE 1).

ALTER TABLE public.email_schedules
  ADD COLUMN IF NOT EXISTS deliverable_id text;   -- soft-link to public.deliverables.id (no FK; text slug)

-- Re-emit the existing grants verbatim (idempotent insurance; dlt does NOT auto-grant
-- PostgREST roles — even though table-level grants cover future columns in Postgres,
-- the operator RUNBOOK decree is to re-emit). Same block as 20260613_email_schedule_scope.sql.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_schedules TO authenticated;
GRANT ALL ON public.email_schedules TO service_role;

NOTIFY pgrst, 'reload schema';
