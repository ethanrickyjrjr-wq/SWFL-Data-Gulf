-- 20260726_social_posts_account_id_nullable.sql
--
-- Post-now (Task 4, spec 2026-07-26-bluesky-post-now) publishes via an
-- env-credential Bluesky app password (BSKY_IDENTIFIER/BSKY_APP_PASSWORD),
-- never OAuth — so there is no social_accounts row to point at. The column
-- was NOT NULL (verified live 07/26/2026 via information_schema.columns),
-- which would reject every post-now insert. Idempotent: DROP COLUMN
-- constraint IF EXISTS isn't a thing for NOT NULL, but re-running
-- ALTER COLUMN ... DROP NOT NULL on an already-nullable column is a no-op,
-- not an error.
alter table public.social_posts
  alter column social_account_id drop not null;
