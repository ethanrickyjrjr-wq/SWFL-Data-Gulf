# Round 5 SteadyAPI sweeps — synthesis + build sequencing (07/16/2026)

**Status: RESEARCH SYNTHESIS ONLY. Nothing in this document has been built.** This spec does not
re-verify any vendor claim or codebase state — that happens per RULE 0.4/0.5 at the moment each
item is actually picked up, not here. Treat every line below as a pointer back to its source doc,
not as settled fact.

## Why this doc exists

Five parallel Claude sessions spent today's unused SteadyAPI monthly call quota across five
independent research tracks, each answering a different operator ask. Each produced real,
evidence-backed findings and its own internal punchlist. None of them talk to each other. This
doc is the thing only a cross-read can produce: **a dependency map and a build sequence**, not a
re-tiering of what each source doc already ranked internally (read the source docs for that — this
doc adds ordering, not new prioritization logic).

## Source docs (read these for the actual evidence — this doc only sequences their outputs)

| Doc | Ask | Status |
|---|---|---|
| `docs/steadyapi-research/2026-07-16-self-marketing-social-listening-round5.md` | Our own Reddit/IG/X presence | Feeds `docs/superpowers/plans/2026-07-16-marketing-launch-plan.md` — already has its own sequenced punchlist + checks, not touched here |
| `docs/steadyapi-research/2026-07-16-round5-recurring-problems-solutions.md` | Validate/inform open product decisions via social listening | 3 findings — 2 are evidence for existing decisions (no new build), 1 is citation material |
| `docs/steadyapi-research/2026-07-16-new-implementations-ux-sweep.md` | New features/UX beyond email, across the whole product | 3 Tier-1 builds, 2 Tier-2 (1 needs a probe, 1 is a GTM tactic not code), 7 Tier-3 validation-only |
| `docs/steadyapi-research/2026-07-16-data-reliability-and-sourcing-sweep.md` | Stop silent data loss + find new sources | 2 reliability tactics, 3 new-source candidates |
| `docs/steadyapi-research/2026-07-16-realtor-full-scope-audit.md` | Full SteadyAPI/realtor.com field-scope audit | 6-item ranked punch list, cheapest-first |

## The dependency map (this is the actual synthesis)

**Fully independent — no blocker, can start in any order:**
- Zero-cost wins: `market_aggregates_details_dropped_fields` (existing check), `ingest_market_heat_swfl_column_gap_fill`, the neighborhood-typical half of `ingest_parcel_year_built_join`
- UX Tier-1 builds: `dataux_public_listing_chat`, `dataux_client_preference_brief`, `dataux_audit_trail_panel` — all reuse existing surfaces (`converse.ts`, `off-topic.ts`, cross-project-index, citation renderer), no external dependency
- The per-listing half of `ingest_parcel_year_built_join` — Lane 1 (FDOR), explicitly independent of SteadyAPI health per its own source doc
- `cre_lease_rollover_chart_data_probe` — a lake query, not a SteadyAPI call
- `ingest_new_source_redfin_migration_patterns` (existing vendor/infra) and `ingest_new_source_fl_doe_school_grades` (.gov static files) — neither touches SteadyAPI quota
- The marketing track — already sequenced in its own plan with its own Phase 0/1/2 (see that doc)

**Sequence-before-the-riskier-thing (not a hard blocker, a "do this first" call):**
- `ingest_deadman_switch_heartbeat` and `ingest_schema_fingerprint_check` are general infrastructure, but their payoff compounds if they land **before** the next bot-wall-prone or format-fragile source goes live, not after. `ingest_new_source_fl_oir_insurance` (form-driven query tool, likely scrape-and-parse, i.e. exactly the profile that produced the `leepa`/`news_swfl` incidents this reliability track was written to prevent) is the one new-source candidate that should wait for those two guardrails rather than land first.

**Narrow, real blocker — gated on `steadyapi_quota_unknown` + `steadyapi-429-rate-limited` resolving:**
- `assistant_property_urgency_tax_history_wiring` — its own source doc says explicitly: gated on the quota question before any new call volume ships.
- The lower-priority amenities/geo-details/mortgage-rate/new-construction endpoints (realtor-audit punch item 5) — same gate, lower priority anyway.
- **Nothing else in this synthesis is gated by this.** The three new sources, the zero-cost wins, the UX Tier-1 items, and both halves of the year_built join do not touch the `PHOTOS_API` real-estate-endpoint quota at all — don't let the open quota question read as blocking more than it does.

## Recommended build sequence

1. **Zero-cost wins** (no dependency, do first): close `market_aggregates_details_dropped_fields`,
   `ingest_market_heat_swfl_column_gap_fill`, neighborhood-typical year_built rollup.
2. **Reliability guardrails** (before the next risky source lands): `ingest_deadman_switch_heartbeat`
   (target `leepa-parcels-annual` first — cleanest, most-repeated failure evidence in the fleet),
   `ingest_schema_fingerprint_check`.
3. **New sources, cheapest-to-riskiest**: `ingest_new_source_redfin_migration_patterns` →
   `ingest_new_source_fl_doe_school_grades` → `ingest_new_source_fl_oir_insurance` (after step 2).
4. **UX Tier-1, parallel track**: `dataux_public_listing_chat`, `dataux_client_preference_brief`,
   `dataux_audit_trail_panel` — independent of 1-3, pick by operator preference.
5. **Per-listing year_built join** — parallel track, real work (existing address-match code, partial
   coverage expected).
6. **CRE lease chart** — run `cre_lease_rollover_chart_data_probe` now (cheap); the actual chart
   build is a separate future decision gated on what the probe finds.
7. **Gated track, only after the quota question closes**: `assistant_property_urgency_tax_history_wiring`,
   then the lower-priority endpoints.
8. **Marketing** — runs on its own already-sequenced plan; one addition from today folds in there
   by reference (see below), not edited into that doc now.

## Cross-link to the marketing plan (by reference — `marketing-launch-plan.md` not re-edited)

- **Live personalized ZIP demos** (`marketing_live_personalized_zip_demos`, new check) — a real GTM
  tactic distinct from anything already in the marketing plan: an operator personally answering
  "give me your ZIP" live in Reddit comment threads (r/RealEstateTechnology, r/CommercialRealEstate,
  r/Naples_FL), using the product's own live ZIP-summary engine. Source: UX sweep Tier 2 #5 — a
  builder ran ~15 of these in one thread (57 comments) as pure social proof. Fold into the
  marketing plan's Reddit section next time that doc is touched.
- **"Agents already DIY-building this with Claude directly"** (UX sweep Tier 3 #3) — not a build,
  not a check; positioning ammo for cold-outreach copy under the existing
  `marketing_coldoutreach_engine_resume` check ("we do reliably, out of the box, what you built
  yourself with 19 custom skills").

## Validated / no-action items (cite, don't build)

From the recurring-problems sweep: the automation-trust boundary agents draw (admin/back-office
automated, client-facing send stays human-gated) validates the existing `campaigns_end_to_end_scheduled`
design as-is — no change, keep the pre-send edit gate non-negotiable. Price-cut/DOM as a motivation
signal (not valuation) informs `logistic_regression_listing_outcome`'s eventual framing but doesn't
unblock it — the labeled-training-set blocker is unchanged. Insurance-driven departure first-person
testimony is master-dossier citation material, not a product change.

From the UX sweep Tier 3: AI trust-calibration language matches the existing `[INFERENCE]`-tagging
convention (reinforcement, no action); "filtering is now the bottleneck, not finding" validates the
four-lane-provenance positioning (no action); portal/MLS-sync confusion validates the single-cited-
source positioning (no action, we're not a listing portal); lead-management notification-cadence
pain corroborates the client-preference-Brief finding above, explicitly NOT a lead-gen/CRM feature
to build (out of this product's scope).

From the realtor-full-scope audit: marketing/amenity tags (Waterfront, Den, Beach, Luxury) at
ingest scale stay genuinely blocked — no vendor field exists anywhere in SteadyAPI's 18 real-estate
endpoints, and realtor.com itself is confirmed anti-bot-blocked to unattended fetch. Stays parked on
the existing `community_profiles_zero_coverage` check; this synthesis doesn't change that status.

## Checks opened this session (project tag in brackets)

`dataux_public_listing_chat` [brain-platform] · `dataux_client_preference_brief` [brain-platform] ·
`dataux_audit_trail_panel` [brain-platform] · `cre_lease_rollover_chart_data_probe` [cre-swfl] ·
`ingest_deadman_switch_heartbeat` [ingest] · `ingest_schema_fingerprint_check` [ingest] ·
`ingest_new_source_fl_oir_insurance` [ingest] · `ingest_new_source_fl_doe_school_grades` [ingest] ·
`ingest_new_source_redfin_migration_patterns` [ingest] · `ingest_parcel_year_built_join` [ingest] ·
`ingest_market_heat_swfl_column_gap_fill` [ingest] · `assistant_property_urgency_tax_history_wiring`
[brain-platform] · `marketing_live_personalized_zip_demos` [marketing].

Deduped against the live ~366-row ledger before opening any of these — none pre-existed. Two close
relatives were found and cross-referenced instead of duplicated: `insiders_construction_yoy_series`
(same underlying FDOR year_built field, different consumer) and `market_aggregates_details_dropped_fields`
(exact match for realtor-audit punch item 2, referenced not reopened).

## What this spec deliberately does not do

- Does not pick a build order beyond the sequencing above — operator picks what actually gets
  worked, this just removes the "which one first" guesswork where there's a real dependency.
- Does not re-verify any of the four source docs' vendor claims, codebase reads, or Reddit citations
  — each stands on its own live-verification, cited inline in that doc.
- Does not open checks for validated/no-action items — those are citation material, not deferred
  work, and RULE 2.4 doesn't apply to findings that confirm an existing decision needs no change.
- Does not touch `docs/superpowers/plans/2026-07-16-marketing-launch-plan.md` — the one addition
  from today's sweeps is noted here by reference to avoid commit churn on an already-written,
  unpushed doc.
