-- ============================================================================
-- personal_vault — the second brain
-- ============================================================================
-- Source-of-truth schema for the Personal Strategic Vault.
--
-- WHY own schema (not public, not data_lake):
--   - public      = mixed app surface; vault is private soft data, not app data
--   - data_lake.* = public hard-data ingest (governed by the Brain-First Ingest
--                   Gate per CLAUDE.md §"Data Tier Policy"). A vault row has no
--                   consuming brain shipping in the same PR, so it would violate
--                   that gate.
--   - personal_vault = the right home: private, soft, single-tenant for now.
--
-- WHY single-tenant (no user_id):
--   - Today the platform is single-user (Ricky). Adding user_id now would be
--     premature complexity. Before this table is exposed to any non-Ricky user,
--     a `user_id UUID NOT NULL` migration is a hard prerequisite. Don't ship
--     external multi-tenant brain features without it.
--
-- API EXPOSURE:
--   The Supabase JS client only sees schemas listed under Project Settings →
--   API → "Exposed schemas". Add `personal_vault` there once after running
--   this file, or every vault tool will fail with PGRST106 "schema not found".
--
-- Run order: paste into Supabase SQL editor any time (idempotent).
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS personal_vault;

CREATE TABLE IF NOT EXISTS personal_vault.vault_fragments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context_slug    TEXT NOT NULL,                      -- short kebab handle, e.g. "i75-developer-flight"
  insight         TEXT NOT NULL,                      -- the strategic claim (one prose paragraph)
  tags            TEXT[] NOT NULL DEFAULT '{}',       -- SKOS concept IDs, validated at write time
  vintage         DATE NOT NULL DEFAULT CURRENT_DATE, -- when the thought was banked
  revisit_after   DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '90 days'),  -- soft TTL tripwire
  confidence      NUMERIC(3,2) NOT NULL DEFAULT 0.70  -- self-rated 0..1
                  CHECK (confidence BETWEEN 0 AND 1),
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'superseded', 'archived')),
  superseded_by   UUID REFERENCES personal_vault.vault_fragments(id),
  source_chat     TEXT,                               -- optional: free-form session marker
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_tags     ON personal_vault.vault_fragments USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_vault_status   ON personal_vault.vault_fragments (status);
CREATE INDEX IF NOT EXISTS idx_vault_vintage  ON personal_vault.vault_fragments (vintage DESC);
CREATE INDEX IF NOT EXISTS idx_vault_context  ON personal_vault.vault_fragments (context_slug);

-- updated_at trigger (mirror pattern from 20260516_base_tables_source_and_outcomes.sql)
CREATE OR REPLACE FUNCTION personal_vault.touch_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vault_fragments_updated_at ON personal_vault.vault_fragments;
CREATE TRIGGER trg_vault_fragments_updated_at
  BEFORE UPDATE ON personal_vault.vault_fragments
  FOR EACH ROW EXECUTE FUNCTION personal_vault.touch_updated_at();

GRANT USAGE  ON SCHEMA personal_vault TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON personal_vault.vault_fragments TO service_role;
GRANT EXECUTE ON FUNCTION personal_vault.touch_updated_at() TO service_role;

-- ============================================================================
-- ALTER block — run THIS if you applied an earlier version of the DDL that
-- had `revisit_after DATE` (nullable, no default) instead of the smart default.
-- Safe to re-run; the SET DEFAULT and SET NOT NULL statements are idempotent.
-- ============================================================================

-- Backfill any existing NULLs first so the SET NOT NULL won't fail.
UPDATE personal_vault.vault_fragments
   SET revisit_after = vintage + INTERVAL '90 days'
 WHERE revisit_after IS NULL;

ALTER TABLE personal_vault.vault_fragments
  ALTER COLUMN revisit_after SET DEFAULT (CURRENT_DATE + INTERVAL '90 days'),
  ALTER COLUMN revisit_after SET NOT NULL;
