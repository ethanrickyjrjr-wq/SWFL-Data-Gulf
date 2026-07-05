-- 20260705_deliverables_campaign_key.sql
-- Campaign provenance for blast-send tagging (agent-launch build 1, operator-
-- ratified full thread 07/05/2026). The lab stamps the quick-start campaign key
-- at deliverable creation; the blast route reads it back as the `campaign`
-- Resend tag, which rides into webhook events — Build 2's results strip
-- aggregates those from day one. Idempotent.
ALTER TABLE public.deliverables
  ADD COLUMN IF NOT EXISTS campaign_key text;

COMMENT ON COLUMN public.deliverables.campaign_key IS
  'Quick-start campaign key that seeded this deliverable (ShowcaseCampaign.key, lib/showcase/registry.ts); null = not campaign-seeded. Set once at creation, never on doc PATCH.';
