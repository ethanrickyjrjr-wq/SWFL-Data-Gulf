# Open Issues — full inventory after the 07/11/2026 checks triage

**As of:** 07/11/2026
**Method:** 11 agents swept the entire open ledger, verifying each check against the live product, the
code, or the data. Nothing was closed without observed evidence; nothing was dropped.

**Result:** 333 open → **247 open**. 86 came off the board. 0 dropped. 5 new gaps found and logged.
2 checks were *reopened* after their own agent decided the evidence wasn't good enough.

Everything below is a real, currently-open problem confirmed this session — not a stale label.

---

## P0 — Wrong in front of users right now

**The scope fixes shipped in code but the live brains were never rebuilt.** This is the single biggest
finding, hit independently by five agents from five directions. The code says Lee + Collier. The live
product still says six counties. Nothing rebuilt them, so the ledger *thought* these were handled.

- `zip_scope_core_live_verify` — the live brain still says **"111 of 126 ZIPs"**. The core-scope fix
  never propagated.
- `scope_hurricane_tracks_fl_6county` — `brains/hurricane-tracks-fl.md` last built 06/19, still
  publishing six-county figures (9 landfalls / $93.6M / $3.39B).
- `scope_storm_history_swfl_charlotte` — `brains/storm-history-swfl.md` (v21, 06/29) still declares
  scope "LEE + COLLIER + CHARLOTTE". Code re-scope is real and tested; the brain is stale.
- `scope_env_swfl_6county` — code fix committed **and pushed**; `brains/env-swfl.md` still shows the
  stale six-county output.
- `answer_smallN_headline_stat` — fix landed at `f184e3e4`; the live brain (v29) predates it.
- `caveat_expiry_rebuild` — the top-level brain still served a 06/29 caveat on 07/11, because its
  upstream is itself frozen at 06/29.

**Action:** one targeted rebuild of the affected brains likely closes this entire cluster and pulls a
live overclaim off the site. This is the highest-value next move on the whole board.

Related, same family:
- `env_swfl_metric_scope` — source-level top-6 selection still isn't core-scoped (only the detail table is).
- `scope_more_brains_charlotte_leak`, `active_listings_zip_county_contamination` — 9 named out-of-scope
  ZIPs still present in the live listings data (n=1 each), confirmed by lake query.

---

## P1 — Features built on top of nothing (empty tables)

Confirmed live by direct query. The code exists; the data doesn't.

- `communities_swfl_live_verify` — `data_lake.community_profiles`: **0 rows**.
- `new_agent_radar_live_verify` — `public.dbpr_re_licensees`: **0 rows**.
- `platform_arc_nudges_live_verify` — `email_sequences`: **0 rows**, never armed.
- `email_lab_tracking_live_verify` — the events table exists but has **0 rows**; tracking has never
  fired live.
- `daily_truth_median_sale_unvalued` — 60/60 rows still `NULL` for median sale price; the desk falls
  back to a monthly index.
- `narratives_communities_surface` — 0 rows, not sitemap-published.
- `empty_brain_content_detector` — the detector for exactly this class of failure is itself unbuilt.

---

## P2 — Real bugs found during this sweep (newly opened)

These were discovered *while verifying something else*. None existed on the board before today.

- `new_listing_scope_address_missing_on_fresh_project` — a fresh listing project's `subject_address`
  never reaches `scope.address` when the project has zero items, so the address-lane flyer **silently
  never fires**. Root cause traced to `app/project/[id]/email-lab/page.tsx:172-191`.
- `map_nfm_lehigh_fix_reapply` — the North Fort Myers / Lehigh map fixes were **lost in a revert** and
  are still missing from the live map. Full history traced; they need re-landing.
- `aeo_static_pages_missing_jsonld` — two static brain pages shadow the dynamic route and ship with
  **zero structured data**, unlike every other brain page.
- `social_chart_project_surface_gap` — the chart button works on the email grid but was never wired
  into the project social page, which still shows a stale "coming soon".
- `master_conclusion_magnitude_descriptor` — residual jargon phrase in the top-level conclusion.

---

## P3 — Automation that is broken, dark, or never fired

- `cron_incident_chief_of_staff_nightly` — the nightly cron is **failing** (OIDC id-token permission).
  A fix is committed locally (`b8ae2c7f`) but unverified until it runs.
- `typed_client_deferred_data_bugs` — the news-crawl cron **500s on every run**
  (`app/api/cron/news-crawl/route.ts:40`, `projects.lat/lng`).
- `news_pulse_scoring_cron_locate` — that same route is **absent from `vercel.json`** entirely.
- `selfheal_rollback_bot_live_verify`, `selfheal_claude_triage_live_verify`,
  `selfheal_preview_smoke_live_verify` — the self-heal bots run **dark** (`ARMED=false`, or 0 runs
  ever, or only ever on `main`, never a preview). None has fired against a real incident.
- `selfheal_vercel_rollback_token` — token minted and wired, but the rollback POST scope has never
  been exercised.
- `cron_incident_corridor_pulse_weekly` — intentionally paused pending a crawl4ai retrofit that hasn't
  been done.
- `lee_permits_capdetail_waf_429` — intermittent WAF blocking; one clean manual run does **not** prove
  it fixed (this check was reopened for exactly that reason).
- `lee_permits_issued_date_cursor_window_mismatch` — 94 rows still stuck at the fallback date.

---

## P4 — Data quality / ingest gaps confirmed still real

- `dbpr_licenses_dropped_street_address` — the CSV carries address/city/zip in columns 5/8/9/10;
  `constants.py` drops all four.
- `market-details-swfl-land-blend-and-dupes` — the $30k/$34k land-blend distortion is unfixed.
- `steadyapi-429-rate-limited` — intermittent; unresolved billing question underneath.
- `collier_condo_unit_grain_gap`, `condo_multiunit_grain_systemic`, `marco_condo_address_match_failure`
  — the condo/multi-unit grain problem, still systemic.
- `typed_client_data_lake_typing` — **worse than baseline**: the untyped allowlist grew from 13 to 25
  files; the `data_lake` schema is still untyped.
- `asof_formatter_fragmentation` — 3-way duplication confirmed still present.
- `contacts_email_vs_public_lane` **[OVERDUE]** — two vCard parsers still unreconciled.
- `sold_resolution_crosswalk_recheck` — still 0 lat/lon on departures.

---

## P5 — Blocked on you (an agent structurally cannot close these)

These need a human hand or a decision. They are not "forgotten" — they're gated.

- Real sends / paid live runs: `link_click_routing_live_verify`, `showing_prep_packet_live_verify`,
  `multi_zip_city_chart_live_verify`, `engagement_staggered_send_live_verify`,
  `market_area_alerts_live_verify`, `email_s3_smoke_live_verify`.
- Vendor/product decisions: `contacts_csv_injection_policy` **[OVERDUE]**, `seed_test_prestep_decision`,
  `resend_account_upgraded`, `paid_path_wtp`, `cre_swfl_citation_raw_db_identifiers`,
  `hero_white_pill_size`.
- Infra flips: `email_digest_phase2_golive` (Vercel env), `api_b_open_rate_limit` (WAF dashboard rule),
  `anthropic_workspace_spend_limit`.
- Auth-gated surfaces an agent can't reach: `project_cockpit_live_verify`, `p1_ai_surface_prod_verify`.
- `stranded_bp_fold_worktree`, `stranded_bp_pipeline_census_worktree` — work stranded in worktrees,
  needs a push.

---

## Overdue (4)

- `contacts_email_vs_public_lane` — due 07/04
- `contacts_csv_injection_policy` — due 07/04
- `smoke_prod_runner_live_verify` — due 07/06 *(closed this sweep — 9/9 assertions passed)*
- `fl_dbpr_applicants_rebaseline` — due 07/10 *(closed this sweep — re-baselined from two real counts)*

---

## Complete open inventory — all 247, by area

*(Generated live from the ledger on 07/11/2026. `check.mjs list` is always the source of truth.)*

### aeo-jsonld (1)

- `aeo_static_pages_missing_jsonld` — Static override pages (app/r/housing-swfl/, app/r/communities-swfl/) shadow the dynamic [slug] route and ship with NO JSON-LD at all, unlike every other brain page

### brain-platform (113)

- `mcp_project_tools_live_verify` — their-Claude flow: fetch->add->build returns working /p/ URL; bad key clean error
- `meter_uid_attribution` — Per-account paywall prerequisite: attribute gated actions (build/deliver_*/upload) to the owner uid, not the anon sdg_cid cookie
- `chart_color_refactor_p3` — Phase 3: repo-wide chart-color refactor to gulf palette (own PR)
- `lee_permits_history_source` — Lee residential permits: Accela General Search date filter is INERT (Jan-2024 query returns 2026 permit IDs) — pre-2026 history not loadable as-is
- `briefcase_examples_live_verify` — /p/example-* live-verify: each of the 4 seeded example deliverables opens, renders cited content, and quotes a CURRENT freshness token matching live /r/* (one-pager/market-overview/bov-lite/client-email)
- `p1_ai_surface_prod_verify` — P1 AI-surface fixes prod live-verify
- `bare_hour_clarify_surfacing` — Surface bare-hour clarify when a free-text schedule-hour surface lands
- `digest_rev_rider_fields` — computeRev omits significantChanges/activeEvents (same gap as the fixed branding/recentActivity)
- `cross_project_enrichment_verify` — Prod live-verify TIER-B cross-project awareness in the in-project analyst chat after deploy (incl. tokenByKey freshest-wins polish)
- `prochart_rendering_live_verify` — High-res any-color all-types chart rendering for email + PDF live-verify
- `incremental_ingest_live_verify` — Incremental ingest: dlt cursors + per-source replace/merge audit live-verify
- `email_lab_tracking_live_verify` — Email Lab click/open tracking: webhook endpoint + email_events table live-verify
- `listing_flyer_email_live_verify` — Listing to flyer email: scrape facts, transform layout, scraped comps chart live-verify
- `grid_email_canvas_v2_live_verify` — Grid email canvas v2 - persistence, friction features, AI sections live-verify
- `email_lab_text_styling_live_verify` — Email Lab: 14 fonts, block text formatting, image overlay opacity live-verify
- `grid_lab_socials_live_verify` — Grid lab socials: schedule + status + per-platform output live-verify
- `sold_resolution_latlon_crosswalk_live_verify` — Sold-resolution: lat/long parcel crosswalk (Lee) live-verify
- `sold_resolution_crosswalk_recheck` — Re-run sold-resolution lat/long crosswalk spike after Jul 2 scheduled listing-lifecycle runs — active rows now have live lat/lon (99%), but the 2,709 current departures are all seed-origin with zero lat/lon; check for a lat/lon-bearing departure before building
- `listing_lifecycle_coord_to_zip_backstop` — listing_lifecycle extract_api.py derives zip_code from the permalink slug only, no coord_to_zip lat/lon fallback like lee_permits/pipeline.py uses when site zip is missing/out-of-scope — not broken today (zip ~100% populated live) but inconsistent with the G1-compliant pattern; decide whether to backstop
- `chart_palette_extension_live_verify` — On-brand chart palette extension + legible labels (Task B) live-verify
- `listing_project_address_live_verify` — New Listing project + saved address live-verify
- `sold_email_builder_live_verify` — Grounded Just-Sold email builder live-verify
- `project_cockpit_live_verify` — Project cockpit — unified email + social workspace live-verify
- `hendry_first_sweep_land` — First scheduled Hendry sweep (15:00 UTC) lands ~1.06k seed=True api_feed rows clean; then decide whether to retire the 298 superseded lifecycle_seed Hendry rows
- `brand_tokens_one_root_live_verify` — Brand tokens, one root — fonts + surfaces across email/PDF/social live-verify
- `funnel_demo_email_live_verify` — Two-track funnel demo email + cadence engine live-verify
- `lab_first_funnel_landing_live_verify` — Lab-first funnel landing: zip CTA -> seeded email lab + send-to-self OTP capture live-verify
- `lee_permits_capdetail_waf_429` — lee_permits: CapDetail enrichment hit sustained Accela WAF 429s on GHA (07/03 manual live run) despite existing backoff/retry (3 retries, 1-3s/60s) in crawl_client.py -- most/all 95 rows lost issued_date (detail fetch empty), cursor's on_cursor_value_missing=exclude dropped them, 0 rows written. Only the 06-16 first-live-write has ever succeeded. Need: confirm Monday 07/06 cron result; if it also writes 0 rows, diagnose concurrency/backoff tuning or WAF escalation with ingest-engineer.
- `unify_contact_stores_live_verify` — One canonical contact store (public.contacts) + unified vCard parser live-verify
- `uncloseable_check_proof_live_verify` — Un-closeable check without live prod proof live-verify
- `send_surface_hardening_live_verify` — Block-canvas public /p view + house-brand defaults + loud scheduler send failures live-verify
- `lab_email_truth_guards_live_verify` — Lane-4 prompt anchors + menu-label fidelity + real unsubscribe binding live-verify
- `cron_incident_corridor_pulse_weekly` — cron failure: corridor-pulse-weekly
- `scheduled_send_minute_jitter` — Scheduled sends fire exactly on the hour — add minute jitter (Validity: ~70% of volume hits the first 10 min of each hour; evidence notes doc s11)
- `gmail_shared_from_unsub_audit` — Verify Gmail Manage-Subscriptions one-click unsub on the shared From cannot blanket-suppress other agents' sends (evidence notes doc s11)
- `spend_tripwire_live_verify` — Daily spend tripwire + advisor verdict live-verify
- `communities_swfl_live_verify` — SWFL community intelligence — golf, fees, amenities, homes, nearby & distances live-verify
- `address_spine_live_verify` — Address spine: typed address resolves to property + comps in the builder live-verify
- `grid_lab_phone_live_verify` — Grid lab phone layout — Build/Preview tabs live-verify
- `grid_lab_phone_layout_v2` — Grid lab phone layout v2 — operator wants a layout change-up later (candidates: fit-to-width Preview scale of the ~600px canvas, broader rework); starts with its own brainstorm + spec per RULE 3.5. Deferred 07/05/2026 — a lot in flight.
- `lab_entry_root_live_verify` — One root for every email-lab entry - blank skeleton, project/address popups, autosave + leave guard live-verify
- `multi_zip_city_chart_live_verify` — Multi-ZIP city ZIP-by-ZIP chart live-verify
- `property_watch_live_verify` — Property Watch — nearby market movement nudges live-verify
- `new_listing_grid_fill_live_verify` — New Listing recipe fills its fixed grid from the real listing (photo+price+specs) live-verify
- `condo_multiunit_grain_systemic` — Condo/multi-unit grain is broken as a CLASS across the platform — 3 independent discoveries, 3 separate defers, never connected
- `pulse_event_thread_ledger` — Phase 2: durable event-thread lifecycle ledger (extend project_events — promotion, states, open/terminal, rolling summary, active checks, tiered retention)
- `pulse_per_user_delivery_memory` — Phase 3: per-user delivery memory (Store 3/Tier B) + backward-reference composer — 'the Walmart I told YOU about' gated on real delivery rows
- `pulse_aggressive_gather_gapfill` — Phase 3: aggressive all-day free crawl cadence + escalation rung-3 targeted paid web_search gap-fill (off by default, budgeted)
- `listing_flyer_design_variants_live_verify` — Listing flyer design variants (cross-category, sticky default) live-verify
- `pulse_pool_evict_enable` — Schedule the raw-pool eviction + run the first real apply=true, once coordinated with the news_swfl owner (news_articles_swfl is shared)
- `selfheal_vercel_rollback_token` — Mint + scope-verify a Vercel token that can POST project rollback (existing VERCEL_KEY is under-scoped); wire into rollback workflow env
- `selfheal_preview_smoke_live_verify` — Preview-smoke: a PR preview deploy triggers smoke against its preview URL, no prod-check stamping
- `selfheal_rollback_bot_live_verify` — Rollback bot: a confirmed critical red smoke rolls back the bad prod deploy + opens an incident issue
- `selfheal_claude_triage_live_verify` — Claude auto-triage: incident issue drives a severity/cause classification; in-repo-code cause yields a draft PR, infra yields comment-only
- `selfheal_gate_before_live_parked` — PARKED: gate-before-live via Vercel Checks API (OAuth2 integration + receiver); revisit after Builds A-C
- `selfheal_canary_parked` — PARKED: canary via Rolling Releases (included on Pro, one project); enable in project settings + start/complete in CI
- `selfheal_error_spike_parked` — PARKED: error-spike bot via Observability Plus + Drains (included on Pro); query error/latency, alert or rollback
- `pulse_dedup_before_distill` — C1: dedup matched articles against existing city_pulse/corridor source_urls BEFORE the Sonnet distill (overlapping daily windows currently re-pay for already-processed articles; dedup is at write_rows, after the paid call)
- `ingest_daily_ceiling_preflight` — LOCKED ingest/CLAUDE.md decree not wired: scheduled LLM pipelines must preflight today's api_usage_log spend vs INGEST_DAILY_CEILING_USD and exit 1 before the first call. Neither api_usage.py nor the pulse pipelines implement it.
- `answer_jargon_leak_zscore_accela` — Answer engine leaks raw stats/vendor jargon (z-score, sigma, Accela) into consumer answers - rules-of-engagement rule 5 'no jargon' only bans 5 literal words (master/brain/payload/grain/dossier), not general jargon from pack dossier text
- `answer_smallN_headline_stat` — sector-credit-swfl RANKING_MIN_RESOLVED=5 lets a 7-loan sample get headlined as a confident 100pct survival rate with no small-n hedge beyond the generic ranking floor
- `hero_white_pill_size` — Homepage white pill sized differently from the AI-chat pill (operator-reported). AI+Briefcase FAB = rounded-full px-4 py-3; candidate white pills px-4 py-2 (SiteShell nav) — confirm exact element w/ operator, match size.
- `pulse_geo_scope_reweighting` — Re-architect pulse to finest-grain place + reach-weighting (kills Naples-cluster dupes, generalizes to all areas)
- `place_gazetteer_phase1_live_verify` — Sourced place gazetteer (Phase 1 of hyperlocal geo-scope) live-verify
- `showing_prep_packet_live_verify` — Showing Prep Packet live-verify
- `bklit_chart_vendoring_live_verify` — Bring in bklit-ui live-line/pie/sankey charts live-verify
- `visual_regression_prepush_wiring` — Wire bun run test:visual into pre-push hook — currently manual step
- `storybook_visual_regression_gap` — Storybook stories have no visual regression of their own (only react-email previews covered)
- `visual_regression_ci_job` — No CI job runs Storybook tests or visual regression yet — everything local-only
- `email_supply_contract_live_verify` — Email builder shared supply/design contract (M1) live-verify
- `email_default_photo_ratio_build_thread` — Apply saved default_photo_ratio at build: thread it BuildArgs→AssembleArgs→assembleAuthoredDoc so authored photo blocks get props.ratio, + account-level ratio picker UI (column already accepted by /api/user/brand PATCH; needs new threading — deferred from M3-B type-lift 07/08/2026)
- `seed_static_figures_bypass_invention_gate` — SEED_DOCS bake hard figures (rate-watch 6.75%, year-in-review 4,217, agent-spotlight 127/98%/phone) into figure-bearing fields the AI is meant to own. The no-invention moat (id-selection + author-doc.ts:880 prose lint) only governs MODEL-written numbers; seed-static numbers never cross it. CONFIRMED escape: tryParsePatch drops a block's patch per-block, applyPatch (build-doc.ts:362 'if (!p) return b') passes it through verbatim; docSkeleton also feeds the baked figure to the model as 'current text'. Fix: convert to the empty-value + instructional-label convention (trend-snapshot/skeleton-* already do) + add a zero-digit-in-figure-fields invariant test (mirrors author-recipes.ts). ALSO VERIFY: whether an unfilled seed can reach a real send (no doc-value lint found on send/blast path). Handoff: docs/superpowers/specs/2026-07-08-seed-slot-playbook-handoff.md
- `deliverability_diagnostic_panel_live_verify` — Deliverability diagnostic panel live-verify
- `chat_chart_honesty_live_verify` — Chat stops negotiating charts; fix the brain router feeding chat grounding + AI email charts live-verify
- `active_listings_zip_county_contamination` — active-listings-swfl / listing-momentum-swfl carry out-of-region ZIPs and a dual-county ZIP
- `reach_topic_rules_backfill` — Backfill reach topic rules for high-value unreachable brains: safety/unemployment/yield/condo-SIRS/price-drops/hurricane-history/mortgage/traffic/communities/airport/econ-dev/licenses/rental-inventory/freight + plural regex fixes
- `answer_path_coverage_signal` — Coverage snapshot JSON + ops matrix + graphify edges for the 6 answer-path joints (registry/catalog/geo/topic/chart-fallback/excuse-lists) + verify-proof last-attempt signal
- `seed_previews_recapture_after_enrichment` — Re-run bun scripts/capture-seed-previews.mts after email_cadence_enrichment lands (captures show pre-enrichment templates); same pass: add a 2nd chart variant so weekly-pulse's three chart slots don't repeat one chart, and re-audit SEED_PREVIEW_FILL figures' as-of dates
- `tracked_links_domain_alignment_on_custom_sender` — When per-agent custom sending domains ship (domain-verify UI), wrapped /api/r links must ride the sender's domain or wrapping is skipped for those sends — misaligned tracking domain is the one real deliverability risk found in Q3 research (docs/steadyapi-research/2026-07-09-round3-q3-q4-answers.md)
- `seed_test_prestep_decision` — Pick a lane for pre-send seed-testing: GlockApps API v2 (\/mo Essential, 360 credits) vs MailReach Spam Test API (credit-priced) vs reject monthly cost. Research done, feature shape validated (round1 item 14 + round2 tactic 5); spec blocked on vendor choice
- `email_accent_ink_palette_gate_live_verify` — Accent-ink guards + brand palette contrast warn (Fence 6) live-verify
- `answer_path_observability_live_verify` — Answer-path coverage snapshot + red-main sentinel live-verify
- `engagement_staggered_send_live_verify` — Engagement-staggered blast sending (warm first, widen +2h) live-verify
- `stagger_send_modal_surface` — Surface 'N sent now, M scheduled +2h' in the send modal - blast response now returns {sent, failed, scheduled} but the modal files were held by other live sessions on 07/09; UI line still unbuilt
- `zip_page_destination_live_verify` — ZIP page as homepage destination — narration, radius news, Down the Road live-verify
- `anthropic_workspace_spend_limit` — Operator: set Anthropic Console workspace monthly spend limit (vendor-side backstop for the ~$199k API balance) before narrative-bake ships — only guard outside our code
- `insiders_edition_live_verify` — Insiders Edition — Fable 5 flagship monthly + event minis + editorial desk live-verify
- `narratives_communities_surface` — Phase E follow-up: communities/neighborhood narrative surface — adapter + /r/communities-swfl mounts (pages exist, not sitemap-published; needs own input-assembly design)
- `market_area_alerts_live_verify` — Event-fired market-area alert emails live-verify
- `alert_signup_conversion_funnel` — Zip-page readers vs subscribe conversions — instrument funnel in alerts dashboard, then diagnose why readers don't sign up
- `send_window_guidance_live_verify` — Email send-window clamp + researched best-time guidance live-verify
- `market_alert_thresholds_tuning` — Tune [PROVISIONAL] alert thresholds on first engagement data — observed 07/10/2026: 33904 had 34 price cuts/wk vs BURST_PRICE_CUTS_N=3 (big ZIPs would alert near-daily); heat rank empty until a second 30-day sold window accrues (~08/10); revisit MIN_SOLD_SAMPLE=5 + surge baseline floor then
- `chief_of_staff_nightly_live_verify` — Nightly chief-of-staff cron: checks-vs-git morning brief live-verify
- `global_coachmark_overlaps_nav_cta` — Global rotating coachmark pill (top-right) overlaps Log In / Get Access buttons on app-bar pages — observed on /insiders at 1440px 07/10/2026, pre-existing site-wide chrome, screenshot in session scratchpad
- `canvas_email_stats_layout_parity` — Canvas shows narrow stats side-by-side while email stacks them (colPx only passed by compile-grid) — same overflow class remains possible for metric-card/listing in narrow ghost columns
- `desk_showpiece_parked` — Parked idea (operator liked it 'somewhere', not /insiders): live data-desk showpiece board — live line + gauges + wire ticker as its own page; build AFTER the /charts glow-up lands (reuses its vendored bklit components); brief in docs/handoff/2026-07-10-charts-glowup-handoff.md + spec 2026-07-10-chart-social-object-design.md Handoffs section
- `zip_scope_core_live_verify` — Core-scope ZIP authority (Lee+Collier=57) across brains, denominators + Stage-4 lint live-verify
- `new_agent_radar_live_verify` — Weekly DBPR new-agent radar (Lee/Collier) live-verify
- `desk_loaders_county_guard` — Wire isCoreCounty into lib/desk/loaders.ts (filter stats.counties/zips) as a display-layer guard behind the listing_active_stats view fix — deferred, file held by a parallel session on 07/11
- `cron_incident_chief_of_staff_nightly` — cron failure: chief-of-staff-nightly
- `deliverable_coherence_gate_live_verify` — Deliverable coherence gate (chart<->headline) + Naples luxury ring fixture live-verify
- `promised_deliverable_element_coherence_audit` — Audit every chart-bearing template: headline<->chart magnitude coherence, then extend the same rule-ships-with-item pattern to pictures/commentary/examples
- `chart_picker_parity_live_verify` — Email Lab chart-type picker parity (12/12 registry frames) live-verify
- `retire_emailchartspec_outreach` — Migrate outreach/drip-email + listing-flyer off EmailChartSpec onto ChartSpec registry (deferred, not blocking Build 1/2)
- `line_band_frameid_trips_istimeseries_regex` — line-band reshape frameId string false-trips isTimeSeries regex, freezes re-reshape (found in Task 2 review, not currently exploitable — only call site always uses a fresh spec — but Phase B frames build on the same regex)
- `composition_segments_missing_value_key_reshape_deadend` — composition fabricate case writes segments:{label,valuePct} with no value key; extractPoints reads segments[].value unconditionally (no rows fallthrough) so re-reshaping an already-composition spec silently no-ops (pts=[]). Found in Task 3 review, not currently exploitable (production call site always feeds a fresh spec), but asymmetric with donut's segments:{label,value} pattern and will bite the first future reshape-away-from-composition path.
- `social_chart_2a_exec_gated` — Build 2a (social manual Add Chart) is PLANNED, execution gated: needs Build-1 spec-to-png switch landed (P1) + coherence-gate chartMagnitudeFromSpec exported (P2). Plan: docs/superpowers/plans/2026-07-11-social-chart-registry-manual-path.md
- `social_chart_2b_ai_author` — Build 2b (AI-author seeds a chart on a social post) — deferred follow-up to 2a. Probe templates.ts/serialize.ts first, add wantsChart/chartPrompt model field + code-set post-pass mirroring attachListingPhoto; coherence guard is definition-of-done. Design: social-chart-registry spec §5
- `data_contracts_doctor_live_verify` — Data contracts + doctor: checks-on-the-data, wiring verifier, one health rollup (A→C) live-verify
- `homes_only_sold_median_live_verify` — Homes-only county-deed sold median per ZIP (Lee now, Collier fast-follow) live-verify
- `social_chart_project_surface_gap` — ProjectSocialClient.tsx (/project/[id]/social) missing Chart palette button + stale 'coming soon' inspector copy — chart-attach only wired on EmailLabGridShell.tsx (/email-lab/grid Social), found live-verifying social_chart_registry_live_verify 07/11
- `new_listing_scope_address_missing_on_fresh_project` — New Listing project's subject_address never reaches build scope (empty items -> scope undefined, address-lane flyer never fires)
- `map_nfm_lehigh_fix_reapply` — Re-apply NFM CDP clip + Lehigh CDP gap-fill to the LIVE public/map/lee-collier.svg (never landed there; only ever briefly on the dead public/maps/ copy, since gutted)

### briefcase (3)

- `carry_back_bridge_live_verify` — Plan B carry-back: live anonymous handoff → claim → /project/{id} lands under a real account (post-deploy)
- `claim_tokens_expired_row_cleanup` — pg_cron cleanup for expired claim_tokens rows
- `chart_lint_insert_split` — Split buildChartItem lint/insert — close the saved_charts orphan window in BOTH swfl_project_add and swfl_project_handoff

### charts (1)

- `generic_chart_capability` — Dynamic chart capability — any-data → any-chart without per-scope pre-wiring

### chat-context (1)

- `chat_context_followups` — Path B chat unify + per-page-type smarts + project-awareness + MIS-8 (highlighter on /p,/c)

### citations (1)

- `email_sources_after_citationlist` — Verify the email/PDF deliverable still renders correctly after the centralized CitationList refactor, and decide whether emails should gain a cleaned sources list

### communities-swfl (1)

- `collier_condo_unit_grain_gap` — FDOR centroid + cadastral layers give Collier condos at parcel/building grain only — no per-unit folio or unit number anywhere

### contacts-import (2)

- `contacts_csv_injection_policy` **[OVERDUE 2026-07-04]** — Decide + pin CSV/formula-injection policy for contact import
- `contacts_email_vs_public_lane` **[OVERDUE 2026-07-04]** — Reconcile email_contacts vs public.contacts two-lane + dedupe vCard parsers

### crawl4ai (2)

- `supercrawl4ai_built` — supercrawl4ai Phase 1 layer built + benchmark-proven (34 tests, local battle-test); migrate first pipeline onto it to close
- `crawl4ai_doctor_preflight` — crawl4ai-doctor preflight shipped advisory across 7 crons; flip to hard-fail after one green workflow_dispatch confirms runner exit codes

### cre-swfl (8)

- `mhs_period_end_item_c` — MHS prior_12mo_ending=2026-03-31 is INFERRED (item C); re-verify period-end + cadence on mhsappraisal.com and mirror the reworded prior_12mo_ending_source into off-main load_mhs.py
- `corridor_gap_north-naples` — Structural gap: North Naples has city_pulse news but 0 verified corridors
- `corridor_gap_sanibel` — Structural gap: Sanibel has city_pulse news but 0 verified corridors
- `corridor_gap_marco-island` — Structural gap: Marco Island has city_pulse news but 0 verified corridors
- `corridor_gap_north-fort-myers` — Structural gap: North Fort Myers has city_pulse news but 0 verified corridors
- `corridor_gap_east-naples` — Structural gap: East Naples has city_pulse news but 0 verified corridors
- `corridor_gap_golden-gate` — Structural gap: Golden Gate has city_pulse news but 0 verified corridors
- `cre_swfl_citation_raw_db_identifiers` — cre-swfl key_metrics citations embed raw DB identifiers (corridor_profiles, cap_rate_pct, vacancy_rate_pct, seasonal_index) that surface as real snake_case in tier-3 raw audit and sit latent in ungated sourceFull; decide whether to rewrite to plain-English provenance at the pack (Layer 2 root fix; pack edit + rebuild = ask-first). Layer 1 symptom fix shipped in speaker.mts shortSourceLabel.

### daily-price-dual-signal (3)

- `retire_gemini_price_websearch` — Retire dead Gemini median_sale_price web-search (cascade all-NULL); ripples into freshness-pulse pack + brain-vocabulary (Gate 5) — do as a clean separate change
- `naples_asking_vs_sold_geography` — Naples geography mismatch: live-listing 'Naples' is broad (asking ~279k) vs Redfin 'Naples, FL' incorporated city (sold ~1.235M) — pick one consistent geography before wiring the Naples hero
- `price_source_wire_off_stale_seed_table` — Wire daily county/city asking price off listing_active_stats/listing_state, never the stale active_listings_residential seed table (blends land into 'residential', gives $309k for Collier vs $610k on the live table - Redfin sold is $625k, 2.4% gap once on the right table)

### daily-truth (1)

- `daily_truth_median_sale_unvalued` — daily_truth median_sale_price rows exist but ALL values are NULL (19 days x 3 cities, verified 07/11) — desk hero + desk-price-trend panel fall back to ZHVI monthly until the writer fills values; self-heals on fix

### data-contamination (1)

- `market-details-swfl-land-blend-and-dupes` — market_details_swfl: realtor.com ZIP medians are land-blended at the VENDOR (33972 sold $30k/list $34k vs rent $1,950) — needs a display-layer plausibility caveat, NOT a rewrite

### data-quality (3)

- `empty_brain_content_detector` — Brains pass freshness while content says 'no data yet' (communities-swfl, franchise-outcomes) — build a content-emptiness detector
- `caveat_expiry_rebuild` — Stale caveats never expire: 06/29 macro-florida failure still served on 07/11 master — add caveat TTL/re-lift hygiene to rebuild
- `tier_divergence_dag_orphan` — tier-divergence-swfl fully built+tested but never wired into rebuild DAG, 404s live — ship it or delete it

### email (13)

- `resend_account_upgraded` — Upgrade Resend to paid plan before any digest goes live — free tier is 1/day 19/month
- `email_digest_phase2_golive` — Email digest Phase 2 go-live flip
- `email_broadcast_reply_to` — Wave 2 pre-flight: broadcast reply_to passthrough -> F unverified-sender path
- `email_scheduler_f_live_verify` — Unit F scheduler live verify
- `email_s3_smoke_live_verify` — S3 3D live verify — POST composed email to /api/email/broadcast send:false + Gmail render check
- `prospect_brand_write_side` — Write brand to email_subscribers.prospect_brand at prospecting-send time (4D write-side)
- `email_scope_column` — Task 01: add scope jsonb to email_schedules + parser scope capture (safe-additive, no send-time change); resolve via lib/place-context, 6-county gate
- `email_inbound_reply` — Task 05: Resend inbound webhook -> existing schedule-command parser -> two-step confirm; reuse parser, signature-verify
- `email_hero_mirror_to_storage` — Mirror resolved hero/listing photos into our storage at build time — hotlinked CDN photos (ap.rdcpix.com etc.) rot after closings; scheduled/occurrence re-sends get red X's (docs/standards/email-images.md)
- `download_artifact_inline_images` — If a download-as-file HTML artifact ships, add the inline-images (data URI) render post-pass — saved HTML breaks in iOS Quick Look (network blocked); until then hand out hosted links, never raw .html attachments (docs/standards/email-images.md)
- `rdcpix_rot_head_reprobe` — Re-run rdcpix HEAD probe on the 07/05/2026 sold/withdrawn photo set at 60-90 days of sold history — falsifier for the INFERRED months-scale rot claim in the email-hero-mirror spec
- `overnight_data_update_window` — Move all lake/brain data updates into a 2-5 AM ET window so next-day sends and morning builds carry that morning's data (operator directive 07/05/2026, lifecycle-sequences brainstorm)
- `email_cadence_enrichment` — Monthly+ templates thinner than weekly-pulse: year-in-review 2nd chart, monthly-digest depth, magazine-issue feature-card image slots, market-spotlight chart slot, just-sold photo slot, luxury-market-report serif display (verified 07/09), optional 16:9 banner ratio

### email-builder (2)

- `m2_fences_bounds_of_space` — M2 soft-user side: canvas has zero span/accent bounds-warning
- `chart_registry_fold_into_contract` — Follow-up from M1: fold CHART_REGISTRY into the block/supply contract so charts register the same way blocks do (chart-capable flag). Deferred in M1 (different shape, not drifting) to keep the refactor behavior-neutral. Also: write the one short user-facing 'why our layouts look this way' approach explainer somewhere.

### email-digest (5)

- `breaking_no_recency_filter` — city-pulse-swfl BREAKING items have no event-recency filter (own doc says breaking TTL=1d, unenforced) — surfaced month-old news as breaking in 07/09 send
- `cta_report_link_mismatch` — digest 'View Full Report' CTA always links /r/housing-swfl regardless of email content (master synthesis + city voices have no matching page) — needs a product decision on target page
- `digest_no_quality_gate` — digest cron (build-digest.mts) has zero content-quality gate, only a numeric delta detector; voice-guard.ts only covers the AI-authored grid-email path, not this pipeline — needs its own lint before next send
- `asof_formatter_fragmentation` — lib/format-date.ts's formatDisplayDate duplicates lib/project/as-of.ts's asOfFromIso (same MM/DD/YYYY logic, two files) — format-date.ts's own comment cross-references as-of.ts and still didn't reuse it. Also a local mdY() in lib/landing/load-home-map-data.ts. Not touched in the 07/09 friendlyAsOf dedupe (out of that scope) — consolidate when next in this area
- `master_conclusion_magnitude_descriptor` — composeConclusion's magnitude descriptor ('high/moderate/low magnitude') still reaches tier-2 conclusion text after cleanConclusionText -- confidence + trust-tier + driven-by are stripped, magnitude is not; check_key master_conclusion_jargon_leak named all three, closed for the confidence/trust-tier fix, this narrow item tracks the magnitude residual specifically (operator call on whether it counts as jargon under the CLEAN rule)

### email-grid-fence (1)

- `phase1_canvas_span_accent_warnings` — Canvas has zero span/accent bounds-warning UI

### email-lab (1)

- `lab_phone_side_panel_visibility` — Phone: side panel not visible in the lab (operator report 07/09/2026) — bring lab tool visibility in line with the grid-lab phone spec; follow-up outside zip-page-destination build

### email-report (1)

- `email_report_multizip_revival` — Revive email-report ZIP-comparison bars + sparkline

### franchise-outcomes (1)

- `franchise_foia_first_run` — First automated quarterly SBA FOIA pipeline run lands real franchise data in Tier-1 Parquet

### funnel (1)

- `phase3_welcome_funnel` — Phase 3 — Welcome conversion funnel: brainstorm + build (welcome_sessions, turn-4 email gate, 20-turn cap, grounded free branded build, free_build_used check-and-set, freemail work-domain hook)

### glass (1)

- `gradeable_polarity_frame_audit` — Frame-dependent polarity: name+surface the frame, grade the frame-free trajectory & gloss bull/bear per-frame, per-frame polarity (or none) for bivalent slugs

### highlighter (2)

- `highlighter_chat_data_loop` — Log what users ask + surface data gaps — chat logging table + Ask for More Data button
- `highlighter_realtime_prompts` — Real-time follow-up prompts: generate next-question chips after each /r/ answer + pass selection-type for awareness

### homes-only-sold-median (2)

- `collier_parcels_fdor_query_lockdown` — FDOR statewide cadastral now rejects all attribute-field WHERE (400) — collier_parcels ingest can't refresh, blocks Collier homes-only sold median
- `active_listing_median_land_blend` — listing_active_stats median blends land parcels into 'median asking price' — ZIP 33972 reports $35k vs $355k SF; no property_type filter anywhere; interim-guard target for homes-only median

### ingest (17)

- `odd_scaffold_ready` — Operation Dumbo Drop — EVERY un-auto-ingestable source (rotating-URL PDF, paywall, manual portal, hand-keyed) ships the ODD-ready scaffold in the brain's SAME PR: empty-tolerant consumer + parked cadence entry (probe-excluded) + Tier-1 cold target + source_tag provenance + idempotent merge. Then the manual quarterly drop is a ZERO-CODE graduation (move cadence block to pipelines:), never a pipeline break or silent contamination.
- `haiku_vs_sonnet_final_run` — ONE final comparison run on 07/08/2026 (3 days of fresh Sonnet-era TTL drift), append to verification/haiku-vs-sonnet-distill.md, then close
- `capture_method_quality_compare` — After retrofit's first live run: compare crawl4ai+Sonnet gathering vs old web_search rows per verification/capture-method-comparison.md (overlap/missed/new-only/freshness; PARITY-BETTER-WORSE rubric)
- `land_manufactured_swfl_graduation` — land_manufactured_swfl ODD scaffold parked since 07/01/2026, zero pipeline code
- `vendor_extraction_ceiling_audit_followup` — Action on 07/08 vendor extraction-ceiling audit — see _ASSISTANT/2026-07-08-vendor-extraction-ceiling-audit.md (cheap wins: FDOR sale price, BLS QCEW industry cut, FDLE offense breakdown, C&W Medical Office, NOAA flood/waterspout event types, FEMA penetration rate; larger: Lee GIS permit layers replacing Accela scrape, LeePA layers 19-23 unresolved)
- `market_aggregates_details_dropped_fields` — market_aggregates_details parse_market_details() silently drops market_comparison block + market_temperature extras (national_hotness_score, hot_market_badge, etc) already present in the paid SteadyAPI response body — zero extra cost to wire in, pure code gap
- `lee_associates_missing_naples` — lee_associates_swfl only pulls Fort Myers; Lee & Associates publishes a parallel Naples/Collier report set at the same URL pattern (confirmed live HTTP 200 on all 4 sector PDFs) — zero extra cost to add, whole county missing today
- `brevitas_lease_only_hardcoded` — brevitas_listings hardcodes transaction_type=for_lease in the API call; brevitas.com/search (for-sale) is a distinct live endpoint never queried — for-sale CRE listings aren't fetched at all, not just filtered
- `dbpr_licenses_dropped_street_address` — fl_dbpr_licenses/fl_dbpr_applicants source CSVs (CONSTRUCTIONLICENSE_1.csv, constr_app.csv) carry full street address in already-downloaded columns but _DBPR_COLUMNS drops them — zero ZIP-grain license data today despite the platform's ZIP-grain priority (CLAUDE.md ZIP gates G1/G2)
- `collier_permits_missing_applied_series` — collier_permits only pulls the Issued-series XLSX; the Applied-series XLSX (leading indicator, what's coming vs what's built) is published on the same page, same cadence, deliberately excluded pending a composite (permit_number, series) PK — real scoped gap, not vendor ceiling
- `listing_lifecycle_sold_sampling_bias` — listing_lifecycle sold-capture (closings) is budget-sampled at SOLD_CHECK_CAP=8/run/county (~480 calls/mo), prioritized list-price-desc — cheaper closings systematically wait longer or never get probed; also listed_date is a confirmed-available vendor field (property_history[].listing.list_date) read for sold-window math but never persisted to the row
- `test_extract_api_stale_type_lookup` — 3 tests in test_extract_api.py assert against pre-type_lookup contract (property_type=other not single_family without type_hint, search_calls excludes type_pages, dry_run expects zero calls) — already red on main independent of any other work, found while landing the stranded pipeline-census worktree 07/10/2026
- `crexi_lease_only_hardcoded` — crexi_listings only queries crexi.com/lease + api-lease.crexi.com/assets/search (lease-only); for-sale Crexi listings (crexi.com/properties, Cloudflare-gated) are not ingested at all - parallel gap to brevitas_lease_only_hardcoded
- `source_liveness_weekly_cron` — Wire ingest/scripts/probe_source_liveness.py as weekly GHA cron (exit 1 on BROKEN); catches silently-locked ArcGIS sources the freshness probe is structurally blind to (collier_parcels false-green 06/06-07/11)
- `source_liveness_registry_block` — Extend cadence_registry with source_liveness: {url,where,floor} + check_source_liveness() in check_freshness.py (mirror liveness_view pattern, C2 extend); makes every ArcGIS/REST source self-checking in the daily probe
- `fema_probe_real_filter` — Pin FEMA NFHL real WHERE filter in probe_source_liveness.py - 1=1 504s on the national service; grep ingest/pipelines/fema for the DFIRM_ID/bbox it uses
- `lee_no_second_parcel_source` — Do NOT add a second Lee parcel ingest - LeePA live 548,330; FDOR centroid CO_NO=46 (556,100) is a duplicate. Lee=LeePA, full stop. Kill any in-flight Lee-from-FDOR ingest

### lee-permits (1)

- `lee_permits_issued_date_cursor_window_mismatch` — Lee permits nets ~1 row/run after WAF fix: run 28908149044 fetched 87/87 CapDetail (100%, WAF beaten) but only 1 row written — the other 86 enriched permits have real issued_dates before the incremental cursor start (06-16) so they're filtered out; 94 stale fallback-dated 06-16 rows can't be corrected via the normal flow. Search-window vs issued_date-cursor mismatch, separate from the now-fixed CapDetail 429.

### licenses-swfl (1)

- `dbpr_license_chunk_undercount` — DBPR license 'chunk undercount' RESOLVED — NEVER add CONSTRUCTIONLICENSE_2/_3 (frozen 2019, 20-col county-as-name, all expired 08/31/2020 = regression). Only open Q: do cilb_certified/registered carry Lee/Collier licenses absent from _1? (diff sets)

### link-click-routing (1)

- `link_click_routing_live_verify` — Send a real drip email, click the wrapped /api/r link, confirm a link_events 'clicked' row + 302 to the CTA

### listing-lifecycle (3)

- `marco_condo_address_match_failure` — Marco Island condo units: 0/360 matched on address-key during the 06/30 seed-to-api_feed catchup bridge
- `steadyapi_429_no_retry` — fetch_steadyapi_city (extract_api.py) has no retry/backoff on non-200 — a single 429 on any page fails that county's whole scan; hit Lee 07/07 11:52 UTC + Collier 07/07 14:36 UTC, both scheduled runs, zero rows ingested each time
- `steadyapi_migrate_city_seed_to_county_level` — listing_lifecycle uses SWFL_CITY_SEED (city-by-city /search) while rentals/market_aggregates already use county-level location strings; county-level is simpler (1 call vs N) AND more complete (catches ~4% of Lee listings the curated city list drops). See docs/handoff/2026-07-07-steadyapi-full-scope-handoff.md

### market-heat-region-trend (1)

- `market_trend_sweep_followup` — Whole-sweep follow-up: replicate the region-monthly-trend pattern to price-distribution / market-temperature / listing-momentum (via aggregate-at-source region-trend SQL views, since they read _latest) + the daily active-listings/listing-lifecycle inventory+DOM trend, once crons accumulate depth. Then the single charting wire (time-series detail_table -> zhvi-area/trendChartSvg) lights up trend lines in scheduled emails. NOTE: charting wire must prefer the varying-month trend table over market_heat_by_zip's constant month column.

### mcp (1)

- `mcp_widget_host_bug_blocked` — Re-enable swfl_fetch MCP App widget when claude-ai-mcp#61/#165 close

### mcp-connector (1)

- `claude_search_writeback_r` — Persist Claude native web-search results into /r/ pages (writeback) + decide merge-into-facts vs separate From-the-web block

### moat (1)

- `api_b_open_rate_limit` — Rate-limit /api/b/* + /api/mcp (Vercel Firewall ~60 rpm/IP) — robots.txt is advisory and does NOT stop a direct bulk-clone of the whole lake (sitemap lists every slug; endpoint is open JSON, ACAO:*, no auth/rate-limit)

### new-listing-grid-fill (2)

- `new_listing_flyer_baths_remarks_enrichment` — Address-lane flyer omits baths+remarks (city photo feed lacks them) — enrich via nearby-values/permalink
- `new_listing_flyer_bigcity_paging_cap` — Subject address match caps at 4x200 pages — a very large city could miss a real listing and fall to the ask

### news_swfl (2)

- `news_county_sources_rotted` — news_swfl county sources rotted — leegov 404+auth-wall, colliercountyfl moved to collier.gov SPA; baseline rows there are nav-chrome false positives
- `news_wink_rss_adopt` — Adopt WINK News county-scoped RSS 2.0 feeds (Lee + Collier) as the primary replacement for the broken leegov/collier.gov scrape - free, structured, verified hours-old

### outreach (2)

- `agent_contact_factory_build` — Agent contact factory (DBPR spine + directory email crawls) — parked for parallel session, handoff docs/handoff/2026-07-10-agent-contact-factory-handoff.md; gates cycle-1 send
- `vertical_plays_xig_deepmine` — Deep-mine X/IG captions+threads for insurance/mortgage/contractor tokens (live surfaces, counts-only this round); pick + pilot insurance adapter as next vertical deep dive

### parcels (1)

- `parcels_lee_zip_source_layer` — Lee parcels ZIP source-layer: join situs-address/parcel-centroid → zip_code, scope-gate, wire pipeline + surface in properties-lee-value (G2/G3)

### pivoted-views (1)

- `view_vintages_backtestable_flip` — EXCLUDED->BACKTESTABLE flip for ZHVI/ZORI after ~9mo view_vintages history (08c)

### platform-arc-nudges (1)

- `platform_arc_nudges_live_verify` — PLATFORM_ARC auto-advance nudges — live-verify: a nudge chip appears once a sequence is armed for a live api_feed address; dismiss persists

### projects (5)

- `piece1_workspace_shell_verify` — Prod live-verify Piece 1 §D-I workspace shell after deploy
- `piece3_dismiss_ui` — Shared dismiss affordance for feed + cross-project prompts (P3 feed signals surface live but the top-1 prompt has no dismiss button; markFeedSeen seam + route + read_at fold are wired & tested — only the UI is missing, matching P2's deferred dismissed_overlap_keys UI)
- `piece3_track_a_verify` — Prod live-verify P3 Track A after deploy: claim/import a draft -> outside-action feed rows land bound to the project (project_feed); /project/[id] renders the feed-fueled prompt; readProjectFeed returns bound + Tier-2 scope-matched rows together
- `piece3_track_b_verify` — Prod live-verify P3 Track B data-change cron after deploy
- `piece4_edit_refresh_trash_verify` — P4 prod live-verify: build->open->Refresh forks a new slug (today's data) while the old /p/[id] stays frozen; Edit (item/steer) forks a gated version, cosmetic template/color edits in place; Delete->Recently-deleted->Restore; trashed /p/[id] 404s; sweep --dry-run counts only >7d trash

### records-request (2)

- `dbpr_re_emails_confirm_lane` — Confirm DBPR licensee email path (records-request vs online-lookup scrape) and pin the real records-custodian address before first send
- `fldor_collier_nal_confirm_source` — Confirm FL DOR Collier NAL roll is not already reachable via the FDOR ArcGIS FeatureServer we ingest for collier_parcels, and pin the filing channel

### resilience (2)

- `master_freshness_drift_gap` — master.md frontmatter drift while no source is newer than the oldest brain: rebuild_due gate returns run=false, so the drift-fail-loud capture step never runs that cycle (self-heals on the next source-triggered run)
- `master_expires_vs_cadence_policy` — master re-quotes slow-cadence upstreams as perpetually-expired (7-day citation window on annual/quarterly sources)

### revenue (2)

- `paid_path_wtp` — Smallest paid path / willingness-to-pay (keystone): one-function bearer gate in app/api/mcp/auth.ts + a paid higher-value surface (deliverables/MCP/bulk) => one LCAR/NABOR demo. (Per-ZIP $39/$79 page KILLED 2026-06-14 - no one pays per-ZIP.)
- `highlighter_pricing_matrix` — Cross-feature pricing matrix — which features wall when + free counts (charts/searches/Highlighter caps, tier/bundle structure). Highlighter+charts+boards ship the METER mechanism (usage_events) with enforcement OFF; this talk sets the numbers AND the real charge path.

### row-tier (3)

- `row_tier_t1_transitive_invalidation` — DEFERRED TRIPWIRE — transitive cache invalidation (dag.mts walkConsumers exists, auto-invalidation caller unwired). Reopen ONLY if nightly full-DAG rebuild is abandoned for incremental.
- `row_tier_t2_tenancy_seam` — DEFERRED TRIPWIRE — tenancy seam at the payload-assembly edge, NOT Postgres RLS. Reopen ONLY when the asset-management multi-client brain un-parks. MCP auth.ts is a live no-op stub; /r/source and /embed read Postgres directly.
- `row_tier_build_remaining` — Row tier: R1 row-candidate confirmation (deferred behind named consumer). Track-B backward-engine HOLD lifted 2026-06-07 (flywheel backtest shipped, N=144)

### scope-integrity (4)

- `scope_env_swfl_6county` — env-swfl brain carries a 6-county footprint (Lee+Collier+Charlotte+Glades+Hendry+Sarasota) — contradicts locked Lee+Collier core scope. Re-scope NFHL/NFIP joins to Lee+Collier (+Hendry minor), rebuild, recompute AAL/exposure metrics.
- `scope_hurricane_tracks_fl_6county` — hurricane-tracks-fl 6-county HURDAT2xNFIP join emits Charlotte/Glades/Sarasota + '6-county' framing in live answers (9 landfalls, $93.6M avg, $3.39B worst are 6-county aggregates). Re-scope to Lee+Collier(+Hendry), rebuild.
- `scope_storm_history_swfl_charlotte` — storm-history-swfl includes Charlotte (Lee+Collier+Charlotte). 95 property-damage events / 13 cyclones are 3-county aggregates. Re-scope to Lee+Collier, rebuild.
- `scope_more_brains_charlotte_leak` — MORE brains leak Charlotte/Sarasota beyond the 3 flood/storm ones: econ-dev-swfl ('Lee + Collier + Charlotte') and licenses-swfl/DBPR ('Lee, Collier, Charlotte, Sarasota, Hendry'). Found in catalog.mts L245/L280 while re-scoping. Re-scope their sources + scope strings to Lee+Collier core.

### showcase-overlays (1)

- `showcase_watch_it_build_gif` — Watch-it-build GIF/video slide — record the email lab building a showcase deliverable in real time, add as a slide/step

### social (3)

- `social_media_storage_upload` — Wire renderSocialImage PNG -> public Supabase Storage URL in social cron worker; DRY run must populate social_posts.media_url
- `social_x_media_v2_scope_verify` — Verify X v2 media upload end-to-end + media.write scope wired in U1 OAuth; re-verify x.ts after concurrent edits land
- `social_u1_connect_live_verify` — Live-verify a real OAuth connect once creds set: /api/social/connect/{platform}/start -> consent -> callback storeTokens (encrypted social_accounts row, status=connected); disconnect revokes + auto-pauses that platform's active schedules

### social-pulse-swfl (1)

- `social_pulse_cadence_flip` — Flip social-pulse-scan cron to Mon/Thu after 3-week bootstrap (due 07/26/2026)

### steadyapi (1)

- `steadyapi-429-rate-limited` — SteadyAPI new PHOTOS_API key: authenticates but 429-throttled, scans discarded, no data lands

### surface (1)

- `methodology_registry_expand` — Extend /r/method ƒ explainer beyond tourism-tdt

### swfl-data-gulf (1)

- `steadyapi_lot_sqft_acres_capture` — SteadyAPI normalizeResult drops description.lot_sqft to null — capture it + surface acres in the listing flyer Lot cell (free data, one-line fix)

### tier-divergence-swfl (1)

- `tier_divergence_graduation` — tier-divergence-swfl graduation gate (after first clean live cycle) — one combined pass

### typed-client (4)

- `typed_client_drift_guard_ci` — Wire 'bun run check:schema-drift' into CI (DB secret on runner) AND extend it to validate database.types.ts MergeDeep overrides vs live — today it is manual-only so live-DB types can silently go stale (false confidence)
- `typed_client_generator_fix` — Fix scripts/gen-supabase-types.ts: IDENTITY id cols wrongly REQUIRED in Insert (checks column_default, ignores is_identity) + Functions hardcoded empty blocks .rpc() typing; then re-gen to retire the id? overrides + RPC untyped hatches
- `typed_client_deferred_data_bugs` — Fix live data-write bugs the typed client surfaced+deferred: buildCollisionRow writes surface/user_action/gate_reason absent on data_readiness_alerts (PGRST204; lib/signals/log-collision.ts + confirm-value); news-crawl projects.lat/lng (derive from items jsonb); int8->uuid String() in data-readiness/route.ts:80
- `typed_client_data_lake_typing` — Type the data_lake schema and retire the untyped hatches across the 13 allowlisted files incl lib/reso bare-injected SupabaseClient; shrink verification/supabase-untyped-allowlist.json

### welcome (1)

- `welcome_smoke_no_invention` — Browser /welcome smoke: a 33931 AAL question leads with the auto-email-to-clients hook + offers a cited build, and NEVER invents a number (no flood/AAL figure from the un-grounded chat)

### worktrees (2)

- `stranded_bp_fold_worktree` — Dangling worktree bp-fold: 1 unpushed commit (79794ed3, billing/socials-promo), branch wt/fold already deleted, dir never removed — needs manual fast-forward push + worktree remove
- `stranded_bp_pipeline_census_worktree` — Dangling worktree bp-pipeline-census: 3 unlanded commits creating data_lake.source_totals + SteadyAPI meta.total capture — ask-first territory (ingest write to data_lake.*), not landed by this session

### zip-email-reskin (1)

- `zip_report_helper_page_migration` — Migrate app/r/zip-report/[zip]/page.tsx onto lib/zip-report/load-ranked-signals.ts so email/webpage rank parity is STRUCTURAL, not by-convention

### zip-scope-core (3)

- `ops_coverage_matrix` — Ops coverage matrix: per-metric how many of 57 core ZIPs we hold + why gaps (swfldatagulf-ops repo)
- `national_avg_compare` — National-average companion for income/poverty/employment (ACS US benchmark) on ZIP cards
- `env_swfl_metric_scope` — env-swfl can still emit a non-core key_metric for a top-6 flood ZIP; lint gates detail rows only, not metric slugs — fixing needs care not to move the regional direction vote

### zip-signal-hero (2)

- `zip_hero_pool_all_brains` — Widen ZIP hero candidate pool to all brains via ZIP machine (follow-up to option-2)
- `city_permits_ingest_odd` — City permit portals ingest (Cape Coral / Naples / Fort Myers city) — ODD scaffold, replaces lane-3 Find-it for permits
