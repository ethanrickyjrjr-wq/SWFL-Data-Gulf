-- docs/sql/20260608_data_requests_components.sql  (idempotent)
-- Never-dead-end doctrine, Task 4 — deterministic gap-logging.
--
-- Adds the named missing pieces to each data request. When a highlighted
-- metric resolves to a methodology entry with role:"need" components, the
-- converse route logs those component names here (alongside answered=false).
-- The Ops coverage page (SP2) reads this column to show, per metric/brain,
-- exactly what we don't yet hold — the gap ledger that drives ingest priority.
--
-- ACCESS: inherits the service_role-only grants on public.data_requests
-- (docs/sql/20260608_data_requests.sql). No new grants needed.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS, so re-running is a no-op.

BEGIN;

ALTER TABLE public.data_requests
  ADD COLUMN IF NOT EXISTS needed_components text[] NOT NULL DEFAULT '{}';

COMMIT;

-- PostgREST must reload schema to see the new column.
NOTIFY pgrst, 'reload schema';

-- Verify after running:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='data_requests' AND column_name='needed_components';  -- 1 row
