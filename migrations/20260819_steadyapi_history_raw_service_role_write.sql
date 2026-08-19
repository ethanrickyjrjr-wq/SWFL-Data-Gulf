-- The build path can now KEEP what it fetches — but only if it is allowed to write.
--
-- 20260802_steadyapi_property_history_raw.sql granted SELECT only. That was enough while the
-- sole writer was the ingest lane, which connects directly as `postgres` and never touches a
-- PostgREST grant. The TypeScript build path (lib/listings/sold-event-store.ts, wired
-- 08/19/2026) writes through PostgREST as `service_role`, and without these two privileges every
-- landing fails with 42501 permission denied — caught by a live smoke test, invisible to the unit
-- suite, and silent in production because the writer is non-fatal by contract.
--
-- No DELETE: nothing in the product removes a landed body. The row is the provenance.
GRANT INSERT, UPDATE ON data_lake.steadyapi_property_history_raw TO service_role;
NOTIFY pgrst, 'reload schema';
