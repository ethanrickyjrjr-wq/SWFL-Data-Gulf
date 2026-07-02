# Latitude 26 gap analysis + cockpit punch list

> **Recommended model:** ⚡ Sonnet

**Date:** 2026-07-02
**Inputs:** cockpit Phase 1 build (9 commits, `0e59124e..7e3aaae4`, pushed) + the Latitude 26
demo campaign (`C:\Users\ethan\Downloads\latitude26-campaign`, 6 emails + social pack + index,
built same night in a parallel session).
**Status:** punch list / brief — each build item goes through `node scripts/new-build.mjs`
(RULE 3.5) when picked up; obligations live in the `checks` ledger, not markers here.

## The headline finding

The Latitude 26 campaign is the quality bar — full lifecycle (Coming Soon → New Listing →
Comps → Pending → Sold → Agent Intro), one invented brand, one palette, real lake numbers
(465 Gordonia Rd, $14.8M, 6bd/7,733sqft/1.52ac; 156 of 8,067 Collier listings at $10M+;
ZHVI 34108 −17.0% from the 02/2024 peak, flat 6mo; six live comps at $1,643 avg $/sqft vs
subject $1,914), listing photos with click-throughs, cited captions, CAN-SPAM footer.

**And it was NOT built with the grid lab.** The session was told to use the grid lab and
instead hand-authored email-table HTML. That choice IS the gap measurement: when an expert
author needs this fidelity, the block canvas can't express it yet. Phase 1 made the grid the
default canvas; this list is what it takes for the grid to produce Latitude 26 natively.

**One thing the campaign got WRONG that we already do right:** its charts are inline `<svg>`,
which Gmail/Outlook strip (research already pinned in `lib/email/chart-image.ts` header —
caniemail, 2026-06-25). Our path (data → SVG → resvg PNG → hosted `email-media` URL →
`chartImageBlock` with optional `linkUrl`) is the correct, deliverable one. So the campaign
is a **design target, not a technical template** — recreate the look through the PNG path.

---

## A. Grid knowledge — what the grid lab needs to reach Latitude 26

Verified against `lib/email/doc/types.ts`, `components/email-lab/AddBlockPanel.tsx` BLOCK_MENU,
`lib/email/chart-image.ts`, `lib/email/inject-chart.ts`, `lib/brand/palette.ts`.

1. **Typography pairing.** `EmailGlobalStyle` holds ONE `fontFamily`; the campaign's entire
   luxury feel is a serif display (Georgia) + sans body (Arial) pairing plus letter-spaced
   small caps. Add `displayFontFamily?` to globalStyle (additive; atomic type-lift rule
   applies) + letter-spacing/small-caps treatment on hero/kicker/ribbon text. Route any new
   fonts through the `FONT_ROUTING` dial (`lib/email/lab/capabilities.ts`), never hardcoded.
2. **Palette depth.** Brand slots are 4 (primary/accent/text/backdrop); the campaign runs ~6
   (deep teal, pine, two golds, two creams, sage muted-text) — i.e. slot colors + DERIVED
   tints/shades. Derive programmatically from the 4 slots (tint/shade ramps) rather than
   adding slots; applyBrand + PDF + social all read the same ONE brand root.
3. **Missing block shapes** (each = an author-engine target, not just a menu item):
   - stage ribbon (letter-spaced band: "COMING SOON" / "UNDER CONTRACT")
   - spec strip (N stats with top-rule, serif numerals — stats block is close but the
     treatment isn't reachable)
   - framed fact callout (tinted box + serif lede + cited caption — the "156 of 8,067" unit)
   - comp card (photo + click-through + address + price + $/sqft + status chip; a comp-set
     block is a REPEATED comp card with a subject-vs-avg readout)
   - hero photo with gradient overlay + brand wordmark
   - preheader text — no support anywhere in `lib/email` (grep clean); add
     `EmailDoc.preheader?` rendered as the hidden div. Small, high-deliverability win.
4. **Charts in the grid author.** Plumbing exists and is brand-aware (`TrendChartOpts`
   takes accent/grid/axisText; bar/sparkline/gauge/stacked in
   `lib/email/templates/charts/`). Gaps are selection + voice: (a) author engine should
   reach the ZHVI/ZORI trend series for a "value trend" ask, (b) chart titles/captions in
   campaign voice ("The window a buyer has been waiting for" + annotation "the reset has
   stopped resetting" + cited as-of line) — title/annotation belongs to the narrative pass,
   never invented numbers; (c) charts colored to the USER's brand palette by default in the
   lab (today's default theme is house colors).
5. **Listing photos: promote, don't hotlink.** The campaign hotlinks `ap.rdcpix.com`.
   Product emails must copy listing photos into the public `email-media` bucket at build
   time (the promote seam exists for filed photos — extend to listing-feed photos), with the
   listing page as `linkUrl`. Hotlinked CDN photos rot and hurt deliverability.
6. **Section rhythm.** The campaign alternates cream/dark sections to create the editorial
   feel. Grid blocks render on one backdrop; per-block (or per-row) background override is
   what makes the dark chart card + cream body possible.

## B. Social fixes

1. **The two systems are still two systems.** Publish engine (`lib/social/`) vs the lab's
   calendar (`lib/email/social-calendar/`) — unchanged by Phase 1 (scope guard held). Wiring
   them is the go-live work item and now blocks TWO surfaces (grid shell social mode + the
   new `/project/[id]/social` page).
2. **Composer fidelity vs the campaign's cards.** The social pack's four formats are all
   photo-as-background + gradient overlay + letter-spaced badge + serif display type. The
   Konva composer has text/stat/cta/image/logo only: no background-cover photo mode, no
   gradient overlay element, no badge treatment. The AI author is template-backed — add an
   estate/luxury template family with these layers.
3. **Chart element is a placeholder.** The campaign's landscape "Market Pulse" card carries
   a real trend line + headline stat. The composer's chart element renders a placeholder
   today (noted in `useSocialComposer` — author-seeded only). Feed it the same
   `chart-image.ts` PNG (or draw the polyline natively in Konva from the same series).
4. **Caption voice.** Campaign captions are a strong reference (scarcity stat + honest
   trend + one CTA + 5-8 hashtags) — fold into the calendar's day-theme prompts.
5. **Schedule defaults from Phase 1** (queue schedule-all): all connected platforms, weekly
   on the post's day, 9am ET. Revisit when engagement polling has real data.
6. **Scheduler cron go-live** (`social-scheduler.yml` commented out) — exit criterion below.

## C. Cockpit Phase 1 follow-ups (from the build just pushed)

1. **Exit criteria (operator calls, launch blockers):** (a) scheduler go-live decision —
   uncomment the cron blocks in `email-scheduler.yml` + `social-scheduler.yml` OR keep the
   "Queued — sending activates at launch" copy (already shipped in schedule-all);
   (b) verify `week_generated` / `project_open` / `week_schedule_all` firing in prod
   `usage_events`.
2. **Live-verify** `project_cockpit_live_verify` (operator-run; week generation spends
   Anthropic calls): open project → queue populates → tweak in grid → toggle dialog →
   social tab → schedule one post → schedule-all → rows with non-null `next_run_at`.
3. **Email queue card is generic** ("This week's market email") — derive title/excerpt from
   the built doc's hero/subject (`emaildoc-subject.ts` exists).
4. **Email never reaches "scheduled" state in the queue** — `ScheduleSendModal` has no
   success callback (`SendWeeklyHandle` swallows it). Add an `onScheduled?` callback so the
   card flips; today the schedules lane is the truth and the card stays "approved".
5. **`ui_state` whole-bag PATCH race** — workspace, email-lab toggle, and queue each merge
   client-side then PATCH the whole bag; two surfaces open at once can clobber keys.
   Pre-existing pattern, now with more writers. Fix direction: server-side merge of the
   `ui_state` PATCH (jsonb merge in the route) instead of client whole-bag.
6. **`project_open` fires on every RSC render** including `router.refresh()` after queue
   generation — the 7-day-return query must count DISTINCT days (or dedupe within a
   session), or the metric inflates.
7. **Queue rows + the refresh path untested** — queue materials have `items_snapshot: []`;
   the per-material refresh (`materials/[did]/refresh`) drives "stale queue items refresh
   their data" (spec D0). Confirm it re-fills a block-canvas doc with empty snapshot.
8. **Place-scoped projects get region-grain data** in the week route — `fetchMasterDossier`
   recognizes zip/county only; `kind:"place"` falls through to the SWFL-wide dossier. Fine
   under the four-lane rule (grain follows what's held) but the email copy should name the
   place, not "Southwest Florida", when a place is known.
9. **Double-generation race across two tabs** — accepted for Phase 1 (loser's rows are
   extra draft materials); revisit only if it shows up in prod.
10. **Anonymous `/email-lab/grid` still standalone** (D4 covered signed-in only — by spec;
    Phase 2 kills the anonymous labs).

## D. Phase 1.5 — the campaign IS the reference target (biggest item)

The listing lifecycle state machine (pre-specced in the cockpit spec) now has a concrete
deliverable spec: **Latitude 26 is what the queue should draft on each transition.**
`listing_transitions` ingests daily and already carries the triggers: coming_soon/active →
Coming Soon + New Listing sets; `price_delta < 0` → price-improvement set; pending →
Under Contract (with DOM-vs-rivals corroboration); sold → the closer with
`sold_price`/`sold_date`. Content producers the campaign proves we need (all deterministic
queries over `active_listings`/`listing_transitions`, narrative on top):

- **comp set**: subject vs N live comps (photo, link, price, $/sqft, status) + subject
  premium/discount readout
- **pending corroboration**: subject DOM vs comparable actives' DOM; sibling pendings at
  the same tier
- **sold wave context**: recent closed/pending estates in the corridor as social proof
- **scarcity fact**: tier count vs total inventory ("156 of 8,067 at $10M+")

Plus **campaign-as-unit**: the ask produced SIX coordinated materials under one brand. The
unit today is one material / one week. A `campaign` grouping (listing project's lifecycle
set, one brand, one palette, rendered as a set like the campaign's index page) is the
natural Phase 1.5 shape — the This Week queue (D0) is its delivery surface. Separate
brainstorm + spec per RULE 3.5 once Phase 1 is live-verified.

## Suggested order

1. C1/C2 (exit criteria + live-verify — everything else waits on the cockpit being real)
2. A5 (photo promotion — deliverability correctness) + A3 preheader (small)
3. Phase 1.5 lifecycle brainstorm with this doc + the campaign folder as inputs (D + A3
   comp-card block travel together — the comps email needs the block)
4. A1/A2/A6 (typography pairing, palette tints, section rhythm — the "luxury look" wave)
5. A4 + B3 (brand-themed trend charts in grid author + real chart element in social)
6. B1 (publish-engine ⇆ calendar wiring — with scheduler go-live)
7. C3–C8 as fast-follows alongside whichever wave touches those files
