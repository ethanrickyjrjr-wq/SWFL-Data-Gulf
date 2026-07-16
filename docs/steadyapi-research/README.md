# SteadyAPI Research — folder index

This is the one home for SteadyAPI-related research: social-listening question backlogs
(Reddit/X/Instagram pain-point mining) and any findings that come back from running them.
Before this folder existed, SteadyAPI material was scattered across `docs/handoff/`,
`docs/superpowers/plans/`, `docs/superpowers/specs/`, and `docs/vendor-notes/`. Those files
are NOT moved here (some are mid-build references other sessions may still be reading) —
this folder is for the *social-listening / market-research* track specifically, not the
API-integration build track. See the inventory below for where the rest lives.

## Files in this folder

- `2026-07-09-pain-point-questions-round1.md` — first-pass backlog of open questions across
  the whole product, organized by area, each tagged with platform + how to actually run it
  against SteadyAPI's real endpoint behavior (not its docs page). Start here.
- `2026-07-09-recurring-pain-questions-and-answers.md` — round 2: filtered the ops/checks ledger +
  cron-failure log + the operator's own archived "recurring problems" doc down to what social
  listening can actually answer, then ran ~14 LIVE SteadyAPI Reddit calls against the top 3. Real
  findings: CRE-broker pricing comps ($157–700/mo Reonomy, 3×+ for CoStar — we're priced well below
  category), a concrete Gmail-Promotions-tab-avoidance playbook (5 ranked tactics), and
  reconfirmation of the "Showing Prep Packet" finding two days on. Also documents what was searched
  and came up empty (photo-hotlink-rot, residential-agent pricing) so it isn't re-searched blind.
- `2026-07-09-round3-question-backlog.md` — round 3: triage of everything still open after rounds
  1–2, priority-ranked (Tier 1 = load-bearing for an active build/keystone check) with an exact
  run recipe per question and an explicit SteadyAPI-vs-crawl4ai tool split (two Tier-1 questions
  are crawl4ai-only). This is the handoff for the next research runner. The companion build triage
  (which SETTLED findings become specs vs. are already built) lives in the 07/09 session
  scratchpad, summarized in SESSION_LOG.
- `2026-07-09-round3-q3-q4-answers.md` — round-3 results, crawl4ai half: Q3/Q4 (the two
  crawl4ai-only Tier-1 questions from the backlog).
- `2026-07-09-round3-q1-q2-tier2-answers.md` — round-3 results, SteadyAPI half (~30 live Reddit
  calls): Q1 residential-agent WTP CLOSED ($50–100/mo/seat cluster, $80 ceiling, Saleswise.ai CMA
  at exactly $39/mo) · Q2 comp-adjustment ranking CLOSED (condition → comp-selection → sqft →
  garage/bed/bath → lot; view/landscaping de-prioritized) · Tier 2: Q6 snowbird (directional,
  r/Naples_FL), Q7 CRE broker pain (solo brokers already on Claude — bottom-up confirmed), Q8
  forecast-trust (falsifier-first confirmed), Q9 pre-send review QA (structurally absent
  industry-wide — genuine whitespace) · Q5 digest cadence searched EMPTY, stays open. All settled
  items are folded into round1 Section 1 as items 19–23; the `/v1/reddit/post` content-filter
  quirk is folded into the vendor note.

- `2026-07-10-outreach-brand-injection-research.md` — round 4: the outreach-to-agents pass
  (~55 live Reddit calls + crawl4ai on Brandfetch/logo.dev/DBPR) ahead of the first agent test
  send. Settles: cold sends text-forward + 1 chart, locked-brand-layer compliance shape,
  per-client-subdomain send-on-behalf, DBPR RE_rgn7.csv as the free weekly agent-name spine
  (no emails), Brandfetch/logo.dev as the brand-at-scale lanes. Q5 cadence: 5th empty search —
  decided from pinned 07/02 evidence. Also the source of the 403-default-UA vendor quirk.
- `2026-07-16-self-marketing-social-listening-round5.md` — round 5: a different question from
  rounds 1-4 — not outreach TO agents, but how SWFL Data Gulf builds its OWN organic presence.
  13 live calls across Reddit/Instagram/Twitter. Settles: Instagram (#swflrealestate 211K/
  #fortmyersrealestate 60.7K/#napleshomes 52.5K) is 100% agent listing content with zero
  market-data posts — a real whitespace; r/dataisbeautiful is a proven channel for real-estate
  data visualizations specifically; local SWFL subreddits reward humble build-in-public framing
  over any promotional post; X/Twitter has zero organic discovery for this niche (confirmed a
  second independent time). New vendor quirk: `/v1/reddit/posts?url=` needs the full
  `reddit.com/r/<name>` URL, a bare name always 200s false. Feeds
  `docs/superpowers/plans/2026-07-16-marketing-launch-plan.md`.

## Existing SteadyAPI material elsewhere (inventory, as of 07/09/2026)

**API mechanics / vendor reference:**
- `docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md` — full endpoint reference (Instagram, Twitter,
  Reddit, ScrapeFlow) + field-verified quirks not in the crawled vendor docs. Read this before
  writing any SteadyAPI call — the generic `/search` endpoints are unreliable per-platform (see
  the pain-point file's "how to run this" notes, sourced from here).
- `docs/handoff/2026-07-05-vendor-note-steadyapi-reddit.md` — the Reddit quirks fold-in note.
- `docs/handoff/2026-07-07-steadyapi-full-scope-handoff.md` — county-scope decision (Lee +
  Collier + Hendry only) and location-slug coverage finding.

**Prior social-listening sweeps (Reddit + Instagram + Twitter, 07/08/2026) — the real pain-point source:**
- `docs/superpowers/plans/2026-07-08-reddit-ai-cheats-and-deliverable-hacks.md` — 20 Reddit calls +
  crawl4ai verification. Bucket A (Claude Code discipline, internal-only), B (email-design pain,
  additive to the 07/05 evidence notes), C (data/deliverable growth hacks — **the "Showing Prep
  Packet" finding lives here, the single most implementable, highest-fit pain point found to date**),
  D (Reddit endpoint quirks pending fold-in to the vendor note). Has a prioritized "what to build
  next" list. An addendum (same file, later Opus 4.8 session) adds a second Reddit-only slice
  (tool-mention frequency, `voiceGuard` origin story) cross-referencing the companion doc below.
- `docs/superpowers/plans/2026-07-08-ai-design-and-email-marketing-hacks-sweep.md` — the full
  3-surface sweep (Reddit + Instagram + Twitter), ~24 AI design/email tools crawled and broken into
  spec skeletons, tier-ranked (Tier 1: `voiceGuard`, per-agent brand voice, subject-line variants,
  Ideogram flyer text; Tier 2/3: citation-index rewrite, cadence templates, brand-kit lint, remix
  gallery, etc). This is competitor/tool landscape research, not raw customer-voice — read it before
  treating any of its territory as an open social-listening question.

**Product build track (comps, listings, sold-capture):**
- `docs/superpowers/plans/2026-06-30-steadyapi-sole-spine/` — the de-facto build hub (10 files:
  foundation catalog, phase 1-5 plans, orchestration, the full audit/continue decision doc).
  `06-full-audit-and-continue-decision.md` §4 is the ONE file in the repo with genuine
  Reddit/BiggerPockets social-listening findings prior to this folder — read it before assuming
  a pain point is unresearched.
- `docs/superpowers/plans/2026-06-30-steadyapi-comp-helper-handoff.md`
- `docs/superpowers/specs/2026-06-30-steadyapi-comp-helper-design.md`
- `docs/superpowers/plans/2026-07-01-steadyapi-comp-helper-remaining-handoff.md`
- `docs/superpowers/specs/2026-07-01-steadyapi-sold-capture-design.md`
- `lib/listings/steadyapi.ts` + `.test.ts` + `steadyapi-comps.test.ts` — the actual client code.

**Memory (persistent, cross-session):**
- `reference_steadyapi-no-property-type-field.md` — `/search` has no property-type field,
  filter-only via enum `condos`.
- `project_steadyapi-comp-helper-phase2b.md` — comp helper specced; never surface "SteadyAPI"
  as a name to users, it's backend-only.

Never surface the SteadyAPI name to end users — it's plumbing, not a feature.
