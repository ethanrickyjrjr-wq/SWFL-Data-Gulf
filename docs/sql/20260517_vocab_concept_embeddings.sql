-- ============================================================================
-- 20260517_vocab_concept_embeddings.sql
--
-- Phase P4a — receiver schema for SKOS concept embeddings.
--
-- Adds pgvector if not already enabled and creates
-- public.vocab_concept_embeddings — one row per (concept_id, model)
-- combination. The embedder (Voyage AI / OpenAI / local) is deferred to
-- P4b; this migration only puts the receiver in place so the moment a
-- provider is keyed the writer side can land without a schema change.
--
-- Vector dimension is 1024 — Voyage AI's default (voyage-3 / voyage-3.5).
-- If a non-1024-dim provider is chosen later, ALTER the column or write
-- to a sibling table; do NOT mix dims in one column (pgvector indexes
-- are dim-bound).
--
-- The IVFFlat index targets cosine distance (the standard for text
-- semantic similarity). lists=10 is correct for 45-200 rows; rebuild
-- with a larger lists value once row count > 1000.
--
-- Idempotent: re-running is a no-op. Discovered Session 7: brain-platform's
-- key is `service_role`; new tables need explicit GRANT SELECT TO service_role.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.vocab_concept_embeddings (
    concept_id      TEXT NOT NULL,
    model           TEXT NOT NULL,
    embedding       vector(1024) NOT NULL,
    source_text     TEXT NOT NULL,
    embedded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    vocab_schema_version TEXT NOT NULL,
    PRIMARY KEY (concept_id, model)
);

COMMENT ON TABLE public.vocab_concept_embeddings IS
    'P4a receiver: one row per (SKOS concept, embedding model). source_text is the verbatim string fed to the embedder (prefLabel + altLabels + scope_note); reproducible. embedder (Voyage/OpenAI) is wired in P4b.';

COMMENT ON COLUMN public.vocab_concept_embeddings.source_text IS
    'The verbatim string the embedder was given. Stored so the embedding is reproducible without re-reading the vocab — a vocab edit that renames prefLabel will create a new row, not silently overwrite the old.';

-- IVFFlat cosine index — standard for text semantic similarity.
-- Build with `lists = sqrt(rows)` rule of thumb; lists=10 fits 45-200 rows.
CREATE INDEX IF NOT EXISTS vocab_concept_embeddings_cosine_idx
    ON public.vocab_concept_embeddings
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 10);

-- Per Session 7: brain-platform's connection uses the `service_role` key,
-- and any new public schema table needs explicit SELECT grant for the
-- service_role role to be queryable from the application.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vocab_concept_embeddings TO service_role;
