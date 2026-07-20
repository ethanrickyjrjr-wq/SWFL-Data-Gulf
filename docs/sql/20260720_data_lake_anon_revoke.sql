-- data_lake anon/authenticated REST revoke + forward posture
-- Closes check: data_lake_anon_rest_leak (opened 07/18/2026, operator OK'd 07/19/2026)
-- The data_lake twin of docs/sql/20260608_anon_view_revoke.sql (which fixed the same
-- class for schema public). Apply via Bun.SQL with creds from .dlt/secrets.toml.
-- Idempotent: every statement is safe to re-run.
--
-- ── WHY THIS EXISTS ───────────────────────────────────────────────────────────
-- 07/18 live sweep: data_lake.fl_dbpr_licenses + census_acs_zcta had explicit
-- `GRANT SELECT ... TO anon, authenticated` (from the table's original PostgREST
-- wiring session), RLS off → both fully readable by anon via PostgREST.
-- 07/19 re-audit: those grants were GONE (0 of 91 relations anon-readable) with no
-- revoke ever applied — dlt `replace` re-ingests DROP + recreate tables, and
-- per-table grants die with the table. That accidental closure is the trap:
-- table-level grant state in data_lake is CHURNY, so the durable posture must be
-- schema-level. anon/authenticated still held USAGE on data_lake, and the
-- PostgREST 42501 hint text literally prescribes the re-opening GRANT.
--
-- Legitimate data_lake readers, verified 07/19:
--   * PostgREST: service_role only (rolbypassrls=true live) — app server code all
--     goes through createServiceRoleClientUntyped; zero data_lake consumers import
--     the anon/browser clients (rg sweep over every `.schema("data_lake")` file).
--   * Direct Postgres: `postgres` (dlt ingest, docs/sql runners, lake MCP via
--     SUPABASE_PG_USER=postgres) — owner, bypasses RLS.
-- anon and authenticated legitimately read NOTHING here.

BEGIN;

-- 1. Sweep every existing relation/sequence/function (no-op on 07/19 state; belt
--    so re-running this file can never regress).
REVOKE ALL ON ALL TABLES IN SCHEMA data_lake FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA data_lake FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA data_lake FROM anon, authenticated;

-- 2. THE DOOR — schema USAGE. This is the statement that outlives dlt table
--    recreation: without USAGE, a future stray per-table GRANT to anon is inert
--    over PostgREST. service_role keeps its own USAGE + SELECT (untouched).
REVOKE USAGE ON SCHEMA data_lake FROM anon, authenticated;

-- 3. Forward posture — new postgres-created objects in data_lake never auto-grant
--    anon/authenticated (mirrors the 20260608 flip for public).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA data_lake
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA data_lake
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA data_lake
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- 4. Defense-in-depth on the two named tables: RLS on, zero policies → any
--    non-bypass role is row-denied even if a grant reappears. postgres (owner)
--    and service_role (bypassrls) are unaffected. NOTE: a dlt `replace` that
--    recreates these tables resets RLS to off — layer 2 is what holds then.
ALTER TABLE data_lake.fl_dbpr_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_lake.census_acs_zcta  ENABLE ROW LEVEL SECURITY;

COMMIT;

-- PostgREST schema cache reload (run after commit).
NOTIFY pgrst, 'reload schema';

-- ── VERIFY AFTER RUNNING ──────────────────────────────────────────────────────
--   Schema door closed (expect anon=f, authenticated=f, service_role=t):
--     SELECT r.rolname, has_schema_privilege(r.rolname,'data_lake','USAGE')
--     FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role');
--   RLS on the two tables (expect t,t):
--     SELECT relname, relrowsecurity FROM pg_class c
--     JOIN pg_namespace n ON n.oid=c.relnamespace
--     WHERE n.nspname='data_lake' AND relname IN ('fl_dbpr_licenses','census_acs_zcta');
--   Live REST as anon (expect 42501 permission denied for schema data_lake):
--     GET {url}/rest/v1/census_acs_zcta?limit=1  [apikey: anon, Accept-Profile: data_lake]
--   Live REST as service_role (expect 200 + rows) — proves the app path survives.
