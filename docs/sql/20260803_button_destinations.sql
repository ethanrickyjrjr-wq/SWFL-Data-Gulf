-- 08/03/2026 — per-role button destinations, saved in the agent's brand.
--
-- Operator decree: "the agent can change all links and should be able to save that
-- in their brand. We don't want anyone coming to our site unless they need to or we
-- are activly marketing to."
--
-- ONE nullable jsonb column, not five text columns: the roster in
-- lib/email/button-destinations.ts (BUTTON_ROLES) will grow, and adding a role should
-- never cost a migration. Shape, keyed by role slug:
--   {"primary-cta": "https://agent.example", "community": "https://agent.example/hoods"}
--
-- Readers tolerate absence by contract (roleDestinationsFromBrand returns {} for a
-- missing map, a blank value, or an unknown key), so this is additive and safe to run
-- before or after the code ships. Idempotent — re-running is a no-op.

ALTER TABLE public.user_brand_profiles
  ADD COLUMN IF NOT EXISTS button_destinations jsonb;

COMMENT ON COLUMN public.user_brand_profiles.button_destinations IS
  'Per-role email button destinations, keyed by the role slugs in lib/email/button-destinations.ts (BUTTON_ROLES). Read by roleDestinationsFromBrand(); flattened to BUTTON_DEST_* tokens by brandingToTokens().';
