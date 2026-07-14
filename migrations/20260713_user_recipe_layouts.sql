-- migrations/20260713_user_recipe_layouts.sql
--
-- THE PERSONAL LAYOUT — "build 12345 Street the same way I built 123 Street."
--
-- Operator, 07/13/2026: *"WHATEVER THEY MAKE, THAT IS HOW IT SAVES… IF IT IS 123
-- STREET, WE BUILD 12345 STREET THE SAME WAY WITH EVERY GRID THE SAME — BUT WITH
-- DATA AND COMMENTARY FOR 12345 STREET. WHY CAN'T WE DO THIS?"*
--
-- We couldn't because nothing ever PERSISTED a user's grid. A recipe's layout is
-- generated in code on every build (buildListingFlyer → buildLifecycleEmail), and
-- when the build ended, the user's edits died with it. There was no table, no save,
-- and no ask. This is the table.
--
-- ── WHAT A ROW HOLDS: A SHAPE, NEVER A LISTING ───────────────────────────────
--
-- `layout` is an EmailDoc that has been run through `stripToLayout`
-- (lib/email/doc/saved-layout.ts): every CONTENT field — price, beds, sqft, street
-- address, photo url, the property paragraph, the citations — is REMOVED before the
-- row is written. What remains is shape: which blocks, in what order, at what grid
-- spans, in what style, plus the agent's own brand chrome.
--
-- The strip happens at SAVE as well as at APPLY (which never copies a content field
-- out of a layout) because a stored figure is one careless spread away from being
-- rendered. The old house's price should not sit in this table even briefly.
--
-- One row per (user, recipe). Saving again overwrites: the LAST grid they built is
-- always what "the same way" means. `subject_label` is what the popup shows them —
-- "Use the layout you built for 326 Shore Dr?" — so the choice names something they
-- actually remember making, not a timestamp.
--
-- Idempotent. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_recipe_layouts (
  user_id      uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,

  -- lib/deliverable/recipes.ts RecipeKey — 'new-listing', 'just-sold', 'open-house'…
  -- The recipe's IDENTITY, never its prompt text. A layout belongs to the DELIVERABLE,
  -- so every door that builds a New Listing (hero pill, showcase card, campaign button,
  -- lab pick) lands on the same saved grid.
  recipe_key   text NOT NULL,

  -- A CONTENT-STRIPPED EmailDoc. Shape only. See stripToLayout — and note the two
  -- exceptions that are NOT content: the footer's postal address (CAN-SPAM) and the
  -- agent's own brand chrome (header/footer/agent-card). Those are the agent's, not
  -- the listing's, and they carry.
  layout       jsonb NOT NULL,

  -- The listing this grid was built for, in the user's words ("326 Shore Dr"). DISPLAY
  -- ONLY — it is what the next build's popup asks about. It is a label, never a source
  -- for a figure, and nothing reads it back into a doc.
  subject_label text,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, recipe_key)
);

COMMENT ON TABLE public.user_recipe_layouts IS
  'A user''s own grid for a recipe — "build the next one the same way I built the last one". SHAPE ONLY: layout jsonb is content-stripped (lib/email/doc/saved-layout.ts stripToLayout), so no figure, sentence or photo from the previous listing is stored here, let alone rendered into the next email.';

COMMENT ON COLUMN public.user_recipe_layouts.layout IS
  'Content-stripped EmailDoc (shape + brand chrome). NEVER write a raw built doc here — run stripToLayout first, or the last house''s price is now in the database.';

-- ── RLS — a user's layout is THEIRS. Never shared, never a template for anyone else ──
-- Operator: "FOR THEM ONLY."
ALTER TABLE public.user_recipe_layouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_recipe_layouts_owner ON public.user_recipe_layouts;
CREATE POLICY user_recipe_layouts_owner
  ON public.user_recipe_layouts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- service_role still needs an explicit grant per table (it is NOT implicit).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_recipe_layouts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_recipe_layouts TO authenticated;

-- PostgREST must be told the schema changed, or the new table 404s until a restart.
NOTIFY pgrst, 'reload schema';

COMMIT;
