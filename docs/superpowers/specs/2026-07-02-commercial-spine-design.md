# Commercial Spine — pricing, hero identity, free taste

**Date:** 2026-07-02
**Status:** APPROVED by operator 07/02/2026 ("good to go") — D1/D2/D3 are final and gate the homepage, billing, and funnel lanes. Two OPEN items remain inside D1 (actual vendor plan tiers; Resend broadcast-vs-transactional billing) — both must resolve before Stripe goes live, neither blocks lane start.
**Research basis:** crawl4ai pulls on 07/02/2026 of altosresearch.com (+ /pricing), keepingcurrentmatters.com (+ /pricing), reventure.app (+ /pricing), beehiiv.com/pricing, similarweb.com/pricing, statista.com, placer.ai, julian.com/guide/growth/landing-pages, unbounce.com landing-page best practices, cxl.com landing-page anatomy. Raw markdown in session scratchpad.

---

## Why this doc exists

Three commercial decisions appear in every downstream lane (homepage rebuild, Stripe/billing, funnel emails, welcome flow). Pinning them once here prevents three parallel sessions from inventing three different answers.

## D1 — Pricing ladder

**DECISION (provisional): Starter $29/mo · Growth $79/mo · Pro $149/mo. Free stays 50 sends/mo. Annual billing at ~15% off, with the annual saving badged on the pricing UI (Reventure badges "SAVE 15%"; KCM nudges "Most agents switch to annual").**

Derived cost-first (our data → vendor list prices → comps as market ceiling):

**Measured unit costs (lane 1 — public.api_usage_log, live query 07/02/2026; log began 07/01/2026, small sample of 10 calls per type):**
- Deliverable authoring call (Sonnet 4.6): avg $0.0213, max $0.0255.
- Assistant answer (Haiku 4.5): avg $0.0144.
- Model rates behind those: Sonnet 4.6 $3 in / $15 out per MTok, Haiku 4.5 $1/$5, Opus 4.8 $5/$25 — `refinery/agents/anthropic.mts` RATES, crawl-verified against platform.claude.com 07/01/2026.

**Vendor list prices (lane 3 — crawled 07/02/2026):**
- Resend (resend.com/pricing): Free 3,000 emails/mo (100/day cap); Pro $20/mo = 50,000 emails/mo; overage $0.90 per 1,000. Within-quota effective cost ≈ $0.0004/email; overage rate $0.0009/email. CAVEAT: figures are the transactional tab; confirm broadcast/marketing sends bill the same before Stripe launch.
- Vercel (vercel.com/pricing): Hobby $0; Pro $20/mo per seat with $20 usage credit, then metered.
- Supabase (supabase.com/pricing): Free $0 (2 projects, pauses after inactivity); Pro $25/mo incl. $10 compute credit, then metered.

**Per-tier marginal serve cost at FULL utilization (worst case, Resend overage rate + heavy authoring):**
- Free (50 sends): sends ≈ $0.05; one weekly scheduled deliverable ≈ $0.09/mo authoring (4.33 builds × $0.0213) → ≈ $0.15–0.50/mo with assistant use.
- Starter (500 sends): sends ≈ $0.45; several weekly deliverables + assistant ≈ $1–2/mo total.
- Growth (2,000 sends): sends ≈ $1.80; ≈ $3–5/mo total.
- Pro (10,000 sends): sends ≈ $9.00; even 50 scheduled weekly deliverables add only ≈ $4.60 authoring → ≈ $10–15/mo total.

**Fixed platform floor:** Vercel Pro $20 + Supabase Pro $25 + Resend Pro $20 = $65/mo list, before any customer. Daily brain-rebuild LLM spend is NOT in api_usage_log yet (only 21 rows; rebuilds log to the ops mirror) — [INFERENCE] ≈ $20/mo (32 Sonnet calls/day × measured $0.0213/call avg); falsifier: rebuild calls carry much larger inputs than deliverable builds — reconcile against the ops /spend page before trusting. OPEN: confirm which Vercel/Supabase/Resend plans we're actually on (list prices assumed above).

**Conclusion:** marginal margins are 93–97% at $29/$79/$149; the cost floor is irrelevant to unit pricing (even $19 clears it) — what costs impose is fixed-stack breakeven: ~3 Starter subscribers cover the ~$85/mo floor. So price is set by value and market ceiling, not COGS. Market anchors (crawled 07/02/2026): Altos Research $29/$79/$149 (closest comparable — same buyer, same job); KCM $59.95–$99.95 monthly; Reventure $39/mo ($33 annual); beehiiv free-forever then ~$43–$96. $29/$79/$149 sits at the comparable's proven points, covers worst-case serve cost 15–30×, and clears fixed costs at 3 customers.

- Tier slugs and send limits are already wired and do NOT change: `lib/email/usage.ts` TIER_LIMITS — free 50, starter 500, growth 2,000, pro 10,000 sends per calendar month (UTC).
- The free tier IS the trial (beehiiv model). No time-boxed trial, no credit card to build. Trust kit on every tier: no contract, cancel anytime. Free-tier worst-case serve cost ≈ $0.50/mo is the CAC budget it buys.
- Rejected: $19/$49/$99 (margin says it's viable, but it anchors the brand cheap for no acquisition evidence); $49/$99/$199 (premium without testimonials to carry it).

## D2 — Hero identity

**DECISION (provisional): professional-first headline; explorer search stays the hero CTA.**

- Headline direction (copy to be finalized in the homepage lane, must pass Julian's litmus test — header alone tells you what's sold): "Southwest Florida market intelligence, cited to the source — delivered to your clients' inboxes automatically."
- Subheader carries the hook + kills the top objection: "Ask about any ZIP, address, or corridor and get an answer with every number sourced. Build a branded client report in minutes. Free to build — no credit card."
- The search bar remains the primary above-the-fold action (Reventure/Altos pattern): ZIP → `/r/zip-report/[zip]`, free text → `/ask`.
- Altos and KCM both lead professional-first; the explorer audience still gets served by the CTA itself.
- Rejected: explorer-first (buries the paying audience's message); dual-door router (weakest single message; the four persona cards below the fold already do the routing as live `/ask` links).
- Never framed as "ZIP-level intelligence" — four-lane at any grain.

## D3 — Free taste (replaces the waitlist)

**DECISION (provisional): recurring weekly read. Email + ZIP → enrolled in a weekly market read built and sent by our own engine.**

- Replaces `components/landing/Waitlist.tsx` as the homepage's capture. Also placed per-ZIP on report pages ("subscribe to this ZIP's weekly read").
- Every issue is a recurring product demo + sales touch ending in "build your own version of this." Reuses the demo-cadence machinery shipped 07/02/2026 (stage engine, gates, renderDripEmail extensions).
- One-shot free report (Altos pattern) rejected as the primary: single touch, no compounding. It can be added later as the instant-gratification step of the same capture ("Both" upgrade) without rework — the enrollment flow simply also fires issue #1 immediately.
- CAN-SPAM basics only: working opt-out, accurate headers, honest subject.

## What these gate (lane map)

- **Lane A — Stripe/billing:** checkout mechanics can start before confirmation (tier slugs are stable); the displayed dollars come from D1. Files: `app/billing`, new `app/api/stripe/*`, quota read stays `lib/email/usage.ts`.
- **Lane B — Homepage rebuild:** D1 (pricing strip), D2 (hero), D3 (capture section). Files: `app/page.tsx`, `components/landing/*`, `home-explorer.css`, live-lake wiring of `lib/landing/home-map-data.ts` (map defaults to Home Value per locked vision).
- **Lane C — Report→build bridge + SEO:** independent of D1/D2; D3 supplies the per-ZIP subscribe label. Files: `app/r/zip-report/[zip]/*` only.
- **Lane D — Weekly-read subscription:** entirely D3. Touches outreach/demo-cadence surfaces — must not run parallel with other outreach sessions.
- **Lane E — Conversion furniture:** send-ceiling meter (reads `checkUsageLimit` shape), template gallery, auth polish. Independent of all three decisions; check open `piece2_*` checks before assigning.

## Out of scope here

Homepage copy finalization, Stripe product IDs, weekly-read template design, SEO metadata shape — each belongs to its lane's own spec/plan. This doc only pins the three shared decisions.

---

## Appendix — lane briefs (paste one into each parallel session)

Every lane session: read this spec first, then run its own brainstorm → `node scripts/new-build.mjs <lane-slug> "<label>"` → plan → execute. Worktree isolation per RULE 1.5 (`node scripts/worktree.mjs new <label>`) when lanes overlap files; A/B/C are disjoint and safe in parallel. Lane D must run ALONE among outreach-touching sessions.

**Lane A — stripe-billing.** Wire Stripe checkout + customer portal to the existing tiers. Prices from D1 ($29/$79/$149, ~15% annual discount). Tier slugs/limits stay `lib/email/usage.ts` TIER_LIMITS; `email_usage.tier` is the source of truth the webhook updates. Files: `app/billing/*`, new `app/api/stripe/*`. Verify Stripe API surfaces via crawl4ai in-session (RULE 0.4). Resolve the two D1 OPEN items before go-live. Not blocked by anything.

**Lane B — homepage-rebuild.** Rebuild `app/page.tsx` + `components/landing/*` per the approved structure: professional-first hero (D2) with search as CTA, live-lake wiring of `lib/landing/home-map-data.ts` (map defaults Home Value), proof strip with named sources + as-of dates, clickable persona cards → `/ask?q=`, deliverable showcase ("builds free, pay to send"), pricing strip (D1), weekly-read capture (D3) replacing Waitlist, objection FAQ. Kill `#waitlist` CTAs. Never "ZIP-level" framing.

**Lane C — report-bridge-seo.** `app/r/zip-report/[zip]/*` only: bottom-of-report CTA into a pre-seeded project ("turn this into a weekly branded email — free to build"), per-ZIP metadata/titles for search, neighbor-ZIP + county internal links, per-ZIP "subscribe to this ZIP's weekly read" button (D3 label). Not blocked.

**Lane D — weekly-read.** The D3 free taste: capture (email + ZIP) → enrollment → recurring weekly market read built/sent by our engine, reusing the demo-cadence machinery (`lib/email/outreach/*`, `lib/prospects/*`). Unsubscribe + CAN-SPAM basics. Exclusive lock on outreach surfaces while running.

**Lane E — conversion-furniture.** Send-ceiling meter in project UI (reads `checkUsageLimit` shape from `lib/email/usage.ts`), first-run template gallery, auth-moment polish (typo-guard, sign-out). Check open `piece2_*` checks before starting — overlaps project surfaces.
