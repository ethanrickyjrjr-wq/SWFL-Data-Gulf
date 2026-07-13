-- migrations/20260713_agent_profile.sql
--
-- THE AGENT PROFILE — a bio our AI writes, that cites live data, and that grows.
-- Spec: docs/superpowers/specs/2026-07-13-agent-profile-design.md
--
-- Two things:
--
--   1. `user_brand_profiles.agent_bio` — THE COLUMN THAT WAS NEVER CREATED.
--      The Brand panel has a bio textarea (BrandingBlock.tsx:201), it maps to an
--      AGENT_BIO token (branding-to-tokens.ts:69), and apply-brand.ts:42 renders it
--      onto the agent card. But there is no column, and `agent_bio` appears NOWHERE in
--      app/api/user/brand/route.ts. An agent types their bio and the save DROPS IT.
--      "Type it once — we'll remember" has been false for the bio all along.
--
--      What it stores is a TEMPLATE, not finished prose: the agent's own words plus
--      LIVE TOKENS ({{farm.home_value}}, {{farm.yoy}}). A market figure frozen into
--      saved text is a lie with a delay — "$339,699" is true today and false by winter.
--      Tokens resolve at BUILD time, so the bio updates itself.
--
--   2. `agent_profile_facts` — one fact, one row, one SOURCE.
--      Modeled on the memory system ("like you save information about me").
--
--      WE HOLD ZERO FACTS ABOUT THE AGENT AS A PERSON — no tenure, no volume, no awards.
--      So the AI may never write a credential. But the AGENT knows all of it, so we ask
--      and we save what they say. `source` is the load-bearing column: a fact with no
--      source CANNOT EXIST, which makes an invented credential structurally impossible
--      rather than merely discouraged. That distinction is the whole lesson of 07/13,
--      when four of seven deliverables shipped a falsehood and NOT ONE contained an
--      invented number — what was invented was the CLAIM.
--
-- Idempotent. Safe to re-run.

BEGIN;

-- ── 1. The bio column ────────────────────────────────────────────────────────
ALTER TABLE public.user_brand_profiles
  ADD COLUMN IF NOT EXISTS agent_bio text;

COMMENT ON COLUMN public.user_brand_profiles.agent_bio IS
  'The bio TEMPLATE: the agent''s own words plus live {{farm.*}} tokens. Tokens resolve at BUILD time (lib/brand/bio-tokens.ts) so the bio never carries a stale figure. NEVER store a resolved number here.';

-- ── 2. The facts store ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_profile_facts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,

  -- Stable slug: origin_story · specialty · farm_area · years_active · credential …
  key          text NOT NULL,

  -- THE AGENT'S OWN WORDS, verbatim. Never AI-rewritten in storage: the moment we
  -- store a paraphrase, we have lost the ability to prove what they actually said.
  value        text NOT NULL,

  -- THE LOAD-BEARING COLUMN. Three legal sources — the four lanes, minus lane 1
  -- (our own data never describes a person). NOT NULL + CHECK, so a fact with no
  -- provenance cannot be written at all.
  source       text NOT NULL
                 CHECK (source IN ('agent_stated', 'agent_upload', 'web_cited')),

  -- web_cited → the URL. agent_upload → the document. agent_stated → null.
  source_detail text,

  captured_at  timestamptz NOT NULL DEFAULT now(),

  -- Append-only correction. A fact is never destructively rewritten — it is superseded,
  -- so the history of what an agent told us stays intact.
  superseded_by uuid REFERENCES public.agent_profile_facts (id) ON DELETE SET NULL,

  -- A web-cited fact MUST name where it came from. An uncited "web" fact is invention
  -- wearing a lane-3 costume.
  CONSTRAINT web_cited_needs_a_source
    CHECK (source <> 'web_cited' OR (source_detail IS NOT NULL AND source_detail <> ''))
);

-- One LIVE fact per key per agent (superseded rows are exempt — they are history).
CREATE UNIQUE INDEX IF NOT EXISTS agent_profile_facts_live_key
  ON public.agent_profile_facts (user_id, key)
  WHERE superseded_by IS NULL;

CREATE INDEX IF NOT EXISTS agent_profile_facts_user
  ON public.agent_profile_facts (user_id);

COMMENT ON TABLE public.agent_profile_facts IS
  'What the agent has told us about themselves — one fact, one row, one SOURCE. We hold no facts about an agent as a person, so the AI may never invent a credential; it may only restate what is here. Grows as deliverables discover gaps and the AI asks.';

-- ── 3. RLS — an agent sees only their own facts ──────────────────────────────
ALTER TABLE public.agent_profile_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_profile_facts_owner ON public.agent_profile_facts;
CREATE POLICY agent_profile_facts_owner
  ON public.agent_profile_facts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- service_role still needs an explicit grant per table (it is NOT implicit).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_profile_facts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_profile_facts TO authenticated;

-- PostgREST must be told the schema changed, or the new table 404s until a restart.
NOTIFY pgrst, 'reload schema';

COMMIT;
