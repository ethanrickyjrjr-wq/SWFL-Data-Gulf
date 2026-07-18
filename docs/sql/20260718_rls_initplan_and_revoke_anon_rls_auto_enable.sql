-- 2026-07-18 · Supabase advisor pass (applied to prod via MCP apply_migration)
-- Two migrations, mirrored here so prod is not silent-drift vs the repo.
--
-- (1) rls_initplan_optimization_owner_policies
--     Fixes 31 `auth_rls_initplan` WARN findings (performance advisor). Each
--     owner RLS policy re-evaluated auth.uid() once PER ROW; wrapping it in a
--     scalar subquery makes Postgres evaluate it once per query (InitPlan).
--     Access semantics are byte-identical (NULL/anon case unchanged); this is
--     purely a planner optimization. Fully reversible (unwrap the subquery).
--
-- (2) revoke_anon_execute_rls_auto_enable
--     Fixes 0028/0029 security-advisor WARN. public.rls_auto_enable() is a
--     SECURITY DEFINER *event-trigger* function; event triggers fire system-
--     side and never consult EXECUTE grants, so revoking EXECUTE does NOT
--     disable auto-RLS — it only removes the anon/authenticated REST-callable
--     surface (/rest/v1/rpc/rls_auto_enable). service_role retains EXECUTE.
--
-- Verified post-apply: 0 policies with an unwrapped auth.*() call remain;
-- has_function_privilege(anon|authenticated, rls_auto_enable, execute) = false,
-- service_role = true.

-- ── (1) RLS InitPlan optimization ─────────────────────────────────────────

-- ALL policies: (auth.uid() = user_id) in USING + WITH CHECK
ALTER POLICY "agent_profile_facts_owner" ON public.agent_profile_facts USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "buyer_intent_events_owner_all" ON public.buyer_intent_events USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "contact_segments_owner" ON public.contact_segments USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "email_audiences_owner_all" ON public.email_audiences USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "email_contacts_owner_all" ON public.email_contacts USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "users_own_media" ON public.email_media_assets USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "email_schedules_owner_all" ON public.email_schedules USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "email_send_ledger_owner_all" ON public.email_send_ledger USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "email_sender_config_owner_all" ON public.email_sender_config USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "email_sends_owner_all" ON public.email_sends USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "email_sequence_setups_owner_all" ON public.email_sequence_setups USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "email_sequences_owner_all" ON public.email_sequences USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "email_usage_owner_all" ON public.email_usage USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "lifecycle_nudges_owner_all" ON public.lifecycle_nudges USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "project_feed_owner_all" ON public.project_feed USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "owner_all" ON public.project_templates USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "projects_owner_all" ON public.projects USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "social_accounts_owner_all" ON public.social_accounts USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "social_schedules_owner_all" ON public.social_schedules USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "social_send_ledger_owner_all" ON public.social_send_ledger USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "own brand" ON public.user_brand_profiles USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "user_mcp_tokens_owner_all" ON public.user_mcp_tokens USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "users_own_connections" ON public.user_mls_connections USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "user_recipe_layouts_owner" ON public.user_recipe_layouts USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));

-- ALL policies: (user_id = auth.uid()) form
ALTER POLICY "contacts_own" ON public.contacts USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY "email_blasts_own" ON public.email_blasts USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));

-- SELECT-only policies: USING only, no WITH CHECK
ALTER POLICY "campaign_click_events_owner_select" ON public.campaign_click_events USING (((select auth.uid()) = user_id));
ALTER POLICY "email_events_owner_select" ON public.email_events USING (((select auth.uid()) = user_id));
ALTER POLICY "switch_forwards_owner_read" ON public.switch_forwards USING (((select auth.uid()) = user_id));
ALTER POLICY "switch_passes_owner_read" ON public.switch_passes USING (((select auth.uid()) = user_id));

-- SELECT policy with EXISTS subquery
ALTER POLICY "owner can read project_activity" ON public.project_activity USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_activity.project_id
      AND projects.user_id = (select auth.uid())
  )
);

-- ── (2) Revoke anon/authenticated EXECUTE on the SECURITY DEFINER event fn ──
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
