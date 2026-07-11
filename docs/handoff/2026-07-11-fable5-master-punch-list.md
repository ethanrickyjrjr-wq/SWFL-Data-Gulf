# Master punch list for Fable 5 — everything open, high level

**Written 07/11/2026.** Companion to `2026-07-11-fable5-builder-send-chrome-handoff.md` (do that one
first — it's the priority). This file is the rest: every high-level problem, spec, plan, or big design
that's been discussed and still needs work, pulled from `git log`, `SESSION_LOG.md`,
`_AUDIT_AND_ROADMAP/build-queue.md` (101 lines), the `checks` ledger (311 open entries), and memory.
Not a status board to edit — flip real markers in the actual build-queue/checks, not here.

## Git / repo state (as of 07/11/2026)

- 3 commits ahead of `origin/main`, unpushed: desk-geo JSON-LD spatialCoverage fix, price-signal source
  correction (daily-asking reads the cleaned view not the raw seed), and a quotable-takeaway SSR feature.
  None touch the builder/send path — safe to push independently whenever Ricky's ready.
- 1 untracked file: `docs/superpowers/plans/2026-07-11-desk-discovery-flywheel-plan.md` — a real,
  not-yet-implemented plan (SEO/Dataset-JSON-LD/backlink-widget work for `/desk` + `/r/*`), explicitly
  gated on an operator moat-vs-reach decision before the robots.txt step. Check
  `desk_discovery_flywheel_live_verify`.
- 311 open `checks` total. This file surfaces the high-signal subset; the rest is retrievable any time via
  `node scripts/check.mjs list`.

---

## 1. AI builder health (deep detail lives in the Chrome handoff)

- **Grid email canvas is the crown jewel** — the ONE email surface (`EmailLabGridShell` + `GridCanvas`);
  old block shell deleted 07/07. Never propose reviving it. `grid_email_canvas_v2_live_verify` [11d].
- **Three render engines diverge on fonts** (free-tier `EmailDocRenderer`, grid-tier `compile-grid.ts`,
  PDF `email-doc-pdf.tsx`) — a font/style change must touch all three or it silently breaks one render path.
- **Seed templates may bake fake numbers into AI-owned fields** — `seed_static_figures_bypass_invention_gate`,
  `email_palette_demo_figures` (hero $485K, "4521 Surfside Blvd" style baked demo values). The no-invention
  lint doesn't cover this class yet. Directly relevant to the Chrome test — watch for it.
- Several open live-verifies with no known break, just unproven in prod: `email_grid_plan_fill_live_verify`,
  `email_supply_contract_live_verify`, `email_grid_fence_system_live_verify`, `email_voice_guard_live_verify`,
  `email_lab_block_editing_live_verify`, `email_lab_text_styling_live_verify`, `email_lab_shared_panel_live_verify`,
  `email_lab_tracking_live_verify`, `lab_entry_root_live_verify`, `template_preview_gallery_live_verify`.
- `chart_registry_fold_into_contract`, `canvas_email_stats_layout_parity` — smaller structural gaps in the
  block/chart contract.
- **Project build path / AI author route**: `author_layout_recipes_live_verify` needs Ricky's
  `PEXELS_API_KEY` in Vercel + a push before it can close. `social_ai_author_live_verify`,
  `social_canvas_composer_live_verify`, `project_cockpit_live_verify` all open live-verifies.
- **Batch deliverable authoring** — deliberately PARKED, trigger-gated on ≥25 builds/window or ~$50/mo
  spend. A 27-deliverable run was reported near/at that trigger 07/10 — worth checking whether it actually
  fired (`batch_narrative_bake_live_verify`).
- **Quick-start campaigns** — SHIPPED 07/05, but `campaign_quick_start_live_verify` still open (operator-run).
- **Socials are two unwired systems** — `lib/social/` (real publish engine, gated behind
  `SOCIAL_PUBLISH_ENABLED`, dry by default) vs `lib/email/social-calendar/` (lab's "Generate Week", Haiku,
  EmailDoc cards). Not connected. Auto-post go-live blocked per-platform on OAuth creds + app review
  (Meta Business Verification, X ~$200/mo paid tier, LinkedIn partner approval, GBP allowlist). TikTok:
  not built. `social_media_storage_upload` — rendered social PNG never wired to the public bucket
  (`mediaUrl` stays null).

## 2. Sending email health

- **`resend_account_upgraded`** [29d] — flags the Resend account may still be free-tier capped
  ("1/day, 19/month"); confirm current plan before assuming any volume test will just work.
- **`email_first_live_send`** [6d] — no scheduled email has ever landed a real `email_sends` row yet;
  needs `DIGEST_SENDER_ADDRESS`/`DIGEST_BROADCAST_SECRET` set in Vercel + one live dispatch of schedule id=6.
- **`scheduled_send_minute_jitter`** — sends fire exactly on the hour; ~70% of volume clusters in the
  first 10 minutes of every hour (real deliverability risk, not yet fixed).
- **Resend has no native A/B or DMARC tracking** (verified via crawl4ai 07/08) — any subject/CTA split
  test or DMARC-status check is a from-scratch build, not a vendor feature to flip on.
- **Digest cron has zero content-quality gate** — only a numeric delta detector; a real issue shipped with
  backwards dates, internal pack-ID strings as attribution text ("master brain", "housing-swfl"), a
  month-old item mislabeled BREAKING, and a CTA/content mismatch. Open: `digest_no_quality_gate`,
  `breaking_no_recency_filter`, `master_conclusion_jargon_leak`, `cta_report_link_mismatch`.
- Contact-store housekeeping still undecided: `contacts_csv_injection_policy`,
  `contacts_email_vs_public_lane` (two lanes — `email_contacts` vs `public.contacts` — need reconciling).
- Monetization not wired: `email_stripe_billing` (Stripe checkout → tier upgrade), `stripe_billing_live_verify`.
- `email_inbound_reply` — Resend inbound webhook → schedule-command parser, not built.
- `link_click_routing_live_verify` — wrapped `/api/r` click tracking not proven live yet.

## 3. Brains not working / broken pipelines

- **`daily_truth_median_sale_unvalued`** — all `median_sale_price` rows NULL (19 days × 3 cities). Root
  cause: the Gemini grounded-search leg has 429'd on "prepayment credits depleted" since 06/21 — a Google
  AI Studio billing gap, not a code bug; won't self-heal. Separately, a same-day design correction
  concluded sold price never has a true daily source anyway — the real fix is the new Redfin
  city-sold-price pipeline (`ingest/pipelines/redfin_city_swfl/`, proven live, 1,917 rows, HELD for push).
- **Scope/geography contamination cluster** (mostly opened 07/11, tag `[scope-integrity]`) — several
  brains (env-swfl, hurricane-tracks-fl, storm-history-swfl, econ-dev-swfl, licenses-swfl) leak
  Charlotte/Glades/Sarasota/Hendry figures into what should be a locked Lee+Collier-core scope. Root
  cause identified: the live assistant's own system prompt (`conversation-path.ts` `PUBLIC_SYSTEM`)
  literally lists the 6 counties. One certified answer-proof (`flood_proof_0703_overclaim_pull`) may need
  pulling or re-verifying because it blesses an overclaiming answer. A flood-AAL figure
  (`flood_county_aal_30075_untraceable`) traces to no real brain metric at all.
- **Condo/multi-unit grain — a genuine systemic class**, not three separate bugs: Marco Island
  address-matching (0/360 matched), `land_manufactured_swfl` parked with zero pipeline code, and Collier
  condo unit-grain gap (FDOR only gives parcel/building grain, no per-unit folio) were each discovered
  independently and never connected until flagged as `condo_multiunit_grain_systemic`.
- **Cron / vendor-WAF failures**: `lee_permits_capdetail_waf_429` (Accela WAF blocking enrichment, only
  one write has ever landed live), `lee_permits_issued_date_cursor_window_mismatch`,
  `steadyapi_429_no_retry`, and a separate `steadyapi_subscription_suspended` (HTTP 403 "access
  suspended," verified 07/07 — check current status, this blocks listing-lifecycle/rentals/market-aggregates
  entirely if still true). Plus logged cron incidents: `cron_incident_corridor_pulse_weekly`,
  `cron_incident_lee_permits_weekly`. `crexi_cron_cf_yield_verify` — Estero/FMB Cloudflare clearance may
  need a paid residential proxy.
- **Silent data-loss on ingest** (cheap to keep, currently dropped): DBPR loader drops street address
  despite ZIP-grain being a platform priority; FRED citation URL wrong every run; market-aggregates and
  cap-rate fields discarded at parse time.

## 4. Other high-level unbuilt specs/plans/ideas

- **Vertical-plays / non-real-estate monetization** (`docs/vertical-plays/00-04`) — design-only, no code
  yet. Insurance (FL DFS bulk email+phone list) flagged as the top reachability opportunity; contractors/
  mortgage brokers researched but gated on channel legality (no cold SMS; FDACS license needed for cold
  calling).
- **Self-healing deploy bots** — rollback bot, preview-smoke, Claude auto-triage all BUILT but
  un-live-verified; 3 pieces explicitly parked pending paid Vercel tiers (Checks API gate, Rolling
  Releases canary, Observability Plus error-spike bot).
- **Chief-of-staff nightly** — BUILT locally, needs push + two `workflow_dispatch` runs + a week of
  precision grading before it's trusted.
- **Desk discovery flywheel** (the untracked plan file) — Dataset JSON-LD, SSR takeaways, embeddable
  backlink widget, `llms.txt`, and a robots.txt carve-out for answer-engine bots. The robots step is
  explicitly gated on an operator moat-vs-reach call — don't auto-flip it.
- **Generic/dynamic charting** (`generic_chart_capability`, `chart_asof_anchoring`) — "any data → any
  chart" without per-scope pre-wiring, still open after 30 days.
- **Row-tier** (`row_tier_build_remaining`) — deferred behind a named consumer, no urgency signal yet.
- **Highlighter data-gap loop** (`highlighter_chat_data_loop`) — log what users ask + an "Ask for More
  Data" button, unbuilt.
- **Methodology registry** (`methodology_registry_expand`) — `/r/method` only explains tourism-TDT so far.
- **MCP widget host bug** — blocked upstream on `claude-ai-mcp#61`/`#165`, nothing to do until Anthropic
  closes those.
- **Claude web-search writeback** (`claude_search_writeback_r`) — persisting native web-search results
  into `/r/` pages, unbuilt.
- **City permit portal ingest** (`city_permits_ingest_odd`) — Cape Coral/Naples/Fort Myers city permits,
  meant to replace a lane-3 fallback.
- **Cross-project AI awareness** (`cross_project_ai_knowledge`) — in-project AI reading all of a user's
  projects, unbuilt.
- **Insiders Edition** (Fable 5's own editorial desk, `_FABLE5/FABLE5.md`) — composer built (Phase B), no
  issue shipped yet; `insiders_desk_stats_mock_grounding` is a pre-existing RED grounding test on `main`
  (mock data import) worth fixing alongside anything else touched there.
- **Guides hub** — public best-practices pages, built, not live-verified.
- **Records-request outbound engine** and **DBPR new-agent radar** — both BUILT + locally smoked
  07/11, both HELD purely for Ricky's push decision, not for more building.

---

*Full detail on any line: `node scripts/check.mjs list` (311 entries) or
`_AUDIT_AND_ROADMAP/build-queue.md` (101 lines, priority = line order).*
