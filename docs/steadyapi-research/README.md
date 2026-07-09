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
