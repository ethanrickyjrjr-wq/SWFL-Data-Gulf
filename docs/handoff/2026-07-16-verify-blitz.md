# Verify Blitz — burn down the verify-class checks in sittings, not one-at-a-time

**Date:** 07/16/2026 · **Owner:** Ricky (operator) — most of these only you can close.
**State when written:** 388 open checks → classified as 102 defect · 84 verify (after 1 drop) · 19 idea · 182 task.
This doc covers the **verify** class: work that is BUILT and tested, waiting for one live confirmation.

**The loop per item:** open the surface → confirm the one thing listed → run the close command with what you saw.

```
node scripts/check.mjs close <check_key> --evidence "<what you actually observed>"
```

Rules (same as the 07/11 triage handoff): never close without observing it; if it fails, that's a new
defect-class check (`node scripts/check.mjs open <project> <key> "<label>" --class defect`), not a close.

---

## Group A — CLICK NOW on prod (~2 min each; one sitting kills this group)

All believed deployed. If a page 404s or the feature is absent, it's actually Group B — skip and note it.

Prod: `https://www.swfldatagulf.com` · Ops: `https://swfldatagulf-ops.vercel.app`

**Desk sitting (open /desk once, close 4):**
- `desk_v2_additions_live_verify` — command bar, watchlist, alerts, histogram, correlation heatmap all render
- `trend_fit_engine_live_verify` — fitted trend lines carry a code-computed read (no hand-waved trajectory prose)
- `trend_window_menu_live_verify` — window menu zooms + re-fits the read per window
- `homes_only_sold_median_live_verify` — a Lee ZIP shows a homes-only county-deed sold median with source

**Homepage/report sitting:**
- `homepage_one_site_live_verify` — one-site redesign live, no dead sections
- `homepage_one_bar_live_verify` — the one working bar builds/answers, no theater
- `gallery_listing_hero_live_verify` — "Pick a Starting Point" gallery routes; Listing Campaign hero present
- `welcome_smoke_no_invention` — ask a 33931 AAL question on /welcome: leads with the email hook, offers a cited build, invents nothing
- `multi_zip_city_chart_live_verify` — a city question yields the ZIP-by-ZIP chart
- `chat_chart_honesty_live_verify` — chat never "negotiates" a chart it can't build; grounding routes correctly
- `place_gazetteer_phase1_live_verify` — a gazetteer place resolves; a missing place refuses instead of mis-resolving

**Email Lab sitting (open /email-lab/grid once, close ~10):**
- `email_lab_text_styling_live_verify` — 14 fonts, block formatting, overlay opacity
- `grid_email_canvas_v2_live_verify` — persistence + AI sections survive reload
- `lab_entry_root_live_verify` — blank skeleton, project/address popups, autosave + leave guard
- `sold_email_builder_live_verify` — build a grounded Just-Sold email
- `new_listing_grid_fill_live_verify` — New Listing fills its grid from a real listing (photo+price+specs)
- `listing_flyer_email_live_verify` — paste a listing URL → flyer w/ scraped comps chart
- `listing_flyer_design_variants_live_verify` — variants switch, sticky default holds
- `chart_picker_parity_live_verify` — chart-type picker shows 12/12 registry frames
- `prochart_rendering_live_verify` — hi-res chart renders in email + PDF export
- `saved_layout_live_verify` — build New Listing → edit grid → build a DIFFERENT address → same grid, all-new data
- `agent_profile_live_verify` — AI bio persists, cites live data
- `contact_segments_live_verify` — segment picker filters a blast audience
- `bklit_chart_vendoring_live_verify` — live-line/pie/sankey render

**Project/cockpit sitting:**
- `project_cockpit_live_verify` — unified email+social workspace on open-project
- `unify_contact_stores_live_verify` — one canonical contact store; vCard import dedupes
- `property_watch_live_verify` — nearby-movement nudge appears on a watched address
- `platform_arc_nudges_live_verify` — nudge chip appears once a sequence is armed for a live address
- `showing_prep_packet_live_verify` — packet builds for a listing
- `p1_ai_surface_prod_verify` — the P1 AI-surface fixes visible in project chat

**Ops/pipeline sitting:**
- `spend_tripwire_live_verify` — /spend shows real figures; tripwire-hourly green on the accepted-dispatch list
- `answer_path_observability_live_verify` — coverage snapshot + red-main sentinel on ops
- `data_contracts_doctor_live_verify` — doctor JSON on /census; A→C rollup renders
- `incremental_ingest_live_verify` — dlt cursors present; per-source replace/merge audit clean
- `deliverability_diagnostic_panel_live_verify` — panel renders w/ real DNS/domain state
- `send_window_guidance_live_verify` — send-time picker clamps + shows guidance
- `email_lab_tracking_live_verify` — send a test to self, open it: email_events row lands

## Group B — AFTER NEXT PUSH (built local/worktree; verify immediately post-deploy)

- `checks_class_triage_live_verify` — THIS build: next session start shows "N defect" headline
- `concoctions_live_verify` + `concoctions_wave2_live_verify` — Dataset browser → splice → Update chip
- `lab_inline_text_edit_live_verify` — click-to-type on canvas; sent HTML byte-identical
- `sell-side-framing_live_verify` — wt/sell-side-framing @ 623f69d9, 16 commits, unpushed
- `corridor_grain_fix_live_verify` — needs deploy + brain rebuild; pairs with defect `corridor_grain_bug_is_live_on_embed_and_brain`
- `recipe_parity_engine_live_verify` — every entry point builds the same recipe
- `carry_back_bridge_live_verify` — PUSH HELD (MCP surface): anon handoff → claim → /project/{id}
- `briefcase_examples_live_verify` — held on is_example migration + seeding
- `piece1_workspace_shell_verify` · `piece3_track_a_verify` · `piece3_track_b_verify` · `piece4_edit_refresh_trash_verify` · `cross_project_enrichment_verify` — projects-track deploys
- `per_unit_coverage_ledgers_live_verify` + `per-unit-coverage-ledgers_live_verify` — **DUPLICATE PAIR (07/15)** — read the spec, merge into one (close one with "duplicate of <other>" once confirmed same scope)
- `email_link_destinations_live_verify` — pushed 07/12 per TODAY.md; if live already this is Group A: pasted-URL listing email → self-blast → links resolve, link_fallbacks empty
- `desk_wire_links_pressure_scatter_live_verify` + `desk_hero_hover_dot_line_mismatch` — Desk files owned by a live session 07/16; verify after that session lands

## Group C — OPERATOR-GATED (a send, a credential, a decision — not a click-through)

- `link_click_routing_live_verify` — real drip send → click wrapped link → link_events 'clicked' + 302
- `email_s3_smoke_live_verify` · `email_scheduler_f_live_verify` — composed broadcast + Gmail render check
- `engagement_staggered_send_live_verify` — real blast: warm first, widen +2h
- `send_safety_floor_live_verify` — blocked by task `platform_postal_address_operator` (real postal address)
- `market_area_alerts_live_verify` — first real event-fired send
- `campaign_click_alerts_live_verify` — real click → agent alert
- `funnel_demo_email_live_verify` — gated on domain purchase + cycle-1 CSV
- `social_u1_connect_live_verify` · `social_x_media_v2_scope_verify` — OAuth creds + app review (long pole)
- `selfheal_rollback_bot_live_verify` · `selfheal_claude_triage_live_verify` — both run ARMED=false; arming is your call
- `selfheal_preview_smoke_live_verify` — needs a PR preview deploy to exercise
- `zip_page_destination_live_verify` — first paid narration bake is operator-gated
- `brand_tokens_one_root_live_verify` — needs your branding-UI pass + an Outlook spot-check
- `mcp_project_tools_live_verify` — blocked by defect `mcp_post_transport_500` (MCP POST 500s on prod)

## Group D — AWAITING A SCHEDULED/EXTERNAL RUN (check the data, not a page)

- `hendry_first_sweep_land` — one lake query: seed=True Hendry api_feed rows (~1.06k expected)
- `franchise_foia_first_run` — quarterly SBA FOIA cron's first real landing
- `crawl4ai_doctor_preflight_monthly_crons` — 4 monthly crons need one green preflight before hard-fail flip
- `chief_of_staff_nightly_live_verify` — latest run FAILED 07/16 (has its own incident check); verify on first green SCHEDULED run
- `insiders_edition_live_verify` — **SCOPE MISMATCH:** "event minis" (Phase D) never built; either narrow the label to the shipped monthly flagship or hold for Phase D

## Blocked-by-defect (fix the named defect first, then these verify free)

- `zip_scope_core_live_verify` ← live brain still serves old scope; needs targeted rebuild (memory: a code fix isn't live until the brain rebuilds)
- `new_agent_radar_live_verify` ← `dbpr_re_licensees` 0 rows live
- `communities_swfl_live_verify` ← `community_profiles` 0 rows (`community_profiles_zero_coverage`)
- `listing_project_address_live_verify` ← `new_listing_scope_address_missing_on_fresh_project` + hero never saves address
- `lab_first_funnel_landing_live_verify` ← `sendtoself_modal_orphaned_after_grid_retire`
- `pdf_html_visual_parity_live_verify` ← parity test currently RED (`agent_hero_pdf_html_aspect_ratio_mismatch`)

## Never close

- `uncloseable_check_proof_live_verify` — the deliberate canary for the proof gate. Leave it.

---

**Dropped this pass (1):** `sold_resolution_latlon_crosswalk_live_verify` — nothing was ever built to
verify (commit 6d84855c docs-only, confirmed by the 07/11 sweep); superseded by open task
`sold_resolution_crosswalk_recheck`.

**Deliberately NOT closed despite committed fixes:** `steadyapi_429_no_retry` +
`steadyapi_migrate_city_seed_to_county_level` — the fix exists at HEAD (b0a3ce2f, `_get_with_retry`
+ pacing in extract_api.py) but isn't deployed; `steadyapi_failed_calls_post_deploy` tracks the
post-deploy steps and these two close with the first clean cron run as evidence.

**All 7 `cron_incident_*` checks stay open:** every one of those workflows' latest runs is still
failing as of 07/16 (freshness-probe 2 days, corridor-pulse since 07/05, graphify-republish daily,
crexi 07/12, brevitas 07/14, chief-of-staff 07/16, daily-rebuild 07/15). They are current defects,
not stale rows — close on the designed loop (next green run = evidence; the incident logger reopens
them if the cron re-fails).
