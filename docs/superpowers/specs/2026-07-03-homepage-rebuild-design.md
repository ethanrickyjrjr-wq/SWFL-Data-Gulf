# Homepage rebuild — commercial spine Lane B

**Date:** 2026-07-03
**Status:** DRAFT — awaiting operator review. Operator was AFK during brainstorm questions; the two forks below (hero shape, capture seam) were taken on the recommended option and are flagged. Everything else follows the approved spine spec (`2026-07-02-commercial-spine-design.md`, D1/D2/D3 final).
**Amended 07/03/2026 (second session, operator escalation "make it not look like shit"):** phased execution + visual-craft addendum + fork-2 obsoleted — see "Phase split & visual addendum" section at the bottom. Phase 1 build started same session on the operator's escalation; local commits only, push held for operator review.
**Check:** `homepage_rebuild_live_verify` (opened via new-build 07/03/2026).
**Research basis:** crawl4ai pulls 07/02/2026 — altosresearch.com, keepingcurrentmatters.com, beehiiv.com, julian.com/guide/growth/landing-pages, unbounce.com landing-page best practices, cxl.com landing-page anatomy. reventure.app returned an empty JS shell; its patterns (search-as-hero, SAVE-15% badge) come from the spine spec's 07/02 pull. Raw markdown in session scratchpad (`crawl4ai-laneb/`), never committed.

---

## Problem

The live homepage is the pre-spine demo: hero says "Real Data. Instant Answers." (fails Julian's litmus test — doesn't say what's sold), the choropleth runs on **mock fixture data** with a "Sample data" apology badge and defaults to Flood Risk (locked vision says default = Home Value), the persona cards aren't clickable, a comparison strip names competitor products (violates the no-competitor-trash-talk rule), there is no pricing anywhere, and the capture is a dead-end waitlist instead of the D3 weekly read.

## Goal

One page that sells the actual product to the paying audience (professionals) while still serving explorers through the same search CTA — pricing visible, capture compounding, every number on the page live and cited. D1/D2/D3 rendered, nothing invented.

## Research findings (what shaped the design)

- **Julian's homepage template:** navbar → hero (fully-descriptive header + subheader killing the top objection) → social proof → CTA → 3–6 features each pairing a value prop with its objection → repeat CTA → footer. Deviate and you add confusion. CTA copy continues the hero's promise ("Run a report", never "Learn more"). Litmus test: header alone tells you what's sold.
- **Altos (closest comparable):** the hero action IS a ZIP-input free-report capture ("no credit card required"); data-credibility trio (Timely/Precise/Actionable); testimonials carry the back half.
- **KCM:** problem-first narrative ("your clients hear the wrong story"), 3-step how-it-works, tier ladder on the homepage, trust kit ("No contract. Cancel anytime.").
- **Unbounce/CXL:** action above the fold; show the product in action (real screenshot, not abstract art); authentic social proof only — we have no testimonials yet, so our social-proof slot is filled by the thing we uniquely have: named sources with as-of dates. CXL's "strip navigation / one action" rules are for ad campaign pages, not homepages — not applied.

## Forks taken (operator was AFK — review these first)

1. **Hero shape — map stays in the hero** (recommended option). The interactive choropleth is our "product in action" shot, it already works, and Altos/Reventure lead with an interactive data visual. Rejected: slim SaaS hero with a screenshot and the map demoted — more conventional, but demotes working code and our most distinctive above-the-fold asset.
1b. **Map click → lab seed (operator-proposed 07/03, shape finalized while AFK).** Operator: "click on the map and you end up in the lab with basically the zip page built as an email." Adopted with one adjustment: the click **selects** (fills the data rail — no more surprise hard-navigation to `/z/[zip]`) and the rail's **primary CTA** is "Turn this into a branded email" → `/email-lab?zip=<zip>` pre-built; "Full report" → `/z/[zip]` rides secondary. Rationale: map clickers split professional/explorer — the lab door is now the map's headline story, but entered with intent; the pure straight-to-lab variant (operator's literal shape) is one line to flip to if preferred. Two hard requirements attached: the prebuild is **deterministic and cached** (composed from the same live blocks as the ZIP page — never an LLM authoring call per anonymous arrival; AI enters when the visitor edits), and it rides the **one unified email surface** (Cockpit D4: signed-in → project Email tab with the seed carried through and their brand applied; anonymous → the standalone taste-surface + existing claim flow, `/api/claim` carry-back → OTP → owned project) — no new auth machinery, no standalone-lab resurrection.
2. **Capture seam — Lane B ships storage, Lane D ships the engine.** The homepage capture posts to a new `POST /api/weekly-read/signup` which upserts into a new public table `weekly_read_signups` (email, zip_code, source, created_at; unique on email+zip). Signups accumulate empty-tolerantly until Lane D's enrollment engine consumes them (ODD-style seam). Rejected: waiting on Lane D's endpoint (couples the lanes) and reusing `/api/waitlist` (wrong shape — no ZIP, wrong semantics).

## Page structure (top to bottom)

### 1. Hero (D2 — professional-first, search stays the CTA)

- **H1 (passes litmus):** "Southwest Florida market intelligence, cited to the source — delivered to your clients' inboxes automatically."
- **Subheader (hook + top objection):** "Ask about any ZIP, address, or corridor and get an answer with every number sourced. Build a branded client report in minutes. Free to build — no credit card."
- Search bar unchanged in behavior: 5-digit ZIP → `/z/[zip]`, free text → `/ask?q=`. Button copy stays an action ("Search").
- Metric pills reordered; **default metric = Home Value** (locked vision), then Market Activity (listings/DOM — replaces New Construction, whose data was corridor-only; operator ruling 07/03/2026), then Flood Risk.
- Choropleth + data rail + stats bar stay structurally as-is but run on **live lake data** (wiring below). The "Sample data" badge dies; replaced by "Live data · Lee & Collier Counties · as of MM/DD/YYYY" (date stated once, from the freshest source vintage).
- **Map click = select, then two doors (fork 1b).** Clicking a ZIP fills the data rail (existing behavior) and no longer hard-navigates. The rail grows two CTAs: primary **"Turn this into a branded email"** → `/email-lab?zip=<zip>` (pre-built, § below); secondary **"Full report"** → `/r/zip-report/[zip]` directly (`/z/[zip]` is RETIRED — it 307-redirects there; hero search's ZIP branch should also point at the report route, one ZIP truth). Keyboard/tap behavior mirrors click; mobile keeps the rail reachable below the map.

### 1b. Lab seed — the ZIP email prebuild (operator-proposed)

**Projects and labs are ONE surface (Cockpit D4)** — the seed must honor the unification, not resurrect a standalone lab. `/email-lab?zip=<5-digit>` behaves per who arrives:
- **Anonymous** → the standalone taste-surface (its only remaining role) opens with a **pre-built weekly-read-style email for that ZIP** — the ZIP page's story as an email: place name, headline figures (value, listings/DOM, flood), short deterministic prose, sources listed, as-of date stated once. Reference rendering: the 07/03 mock artifact (built from real 33914 lake pulls). Edit → existing claim flow (`/api/claim`) turns it into an owned project. No new auth machinery.
- **Signed-in with a project** → today's redirect to `/project/<id>/email-lab` **carries the `?zip=` through** (`labDestination()` gains the param) and the project's Email tab seeds the same deterministic doc as a new draft **in their project, with their brand applied** — for an existing user the map becomes a one-click branded-report starter.
- **Signed-in, zero projects** → `AutoCreateProject` carries `?zip=` through its redirect; same result.

Shared mechanics:
- **Deterministic + cached:** one composer (`lib/email/zip-seed.ts`) builds the doc in code from the same live loaders the ZIP page/map use (zip-summary, `zhvi_zip_latest`, `active_listings_residential_zip_stats`, NFIP agg) — cacheable per ZIP per day. **No LLM call on arrival**; drive-by clicks and bots cost ~$0. The AI assistant engages only when the visitor edits — that's the taste moment.
- Invalid/unknown `?zip=` → each surface opens in its normal state (empty-tolerant, no error page).
- A "see the full report →" link inside the seeded doc covers anyone who actually wanted the data page.

### 2. Proof strip (social-proof slot, our version)

We have no testimonials; we have provenance. A slim strip: named sources with as-of dates (FEMA NFIP, Zillow ZHVI, SWFL Data Gulf listing stats, Census) + "57 ZIPs · every number cited." Real values injected server-side from the same loader as the map — no hardcoded counts. Never framed as "ZIP-level intelligence."

### 3. Persona cards (features & objections, part 1)

Keep the four existing cards (buyer / seller / broker / investor — good copy, right personas) but make each card a **live link to `/ask?q=<the card's question>`** so the feature demos itself. This is Julian's "choose your own adventure" persona routing done with real product instead of separate pages.

### 4. Deliverable showcase ("builds free, pay to send")

Product-in-action section for the paying audience: a real screenshot of a branded engine-built email report (static asset captured from the email lab — real output, not abstract art), 3-step how-it-works (KCM pattern: Describe it → AI builds it from live data → It sends on schedule), CTA "Build one free — no credit card" → `/email-lab`. Monetization framing per locked model: build free, send is the paywall.

### 5. Pricing strip (D1)

- Slim strip, not full cards: Free ($0 · 50 sends/mo · "the trial") + Starter $29 + Growth $79 + Pro $149, each with sends/mo and a one-liner; annual badge "SAVE ~15%"; trust kit line "No contract. Cancel anytime."
- **Every dollar imports from `lib/billing/tiers.ts`** (`BILLING_TIERS`, `FREE_SENDS_PER_MONTH`) — Lane A's declared single price root; its header comment already mandates the homepage imports it. No price literal in any landing component.
- CTA "See full pricing" → `/billing` (Lane A's live page owns checkout).

### 6. Weekly-read capture (D3 — replaces Waitlist)

- Email + ZIP → "Get the weekly [place] market read — built from the same data above, sent by the same engine. Unsubscribe anytime."
- Posts to `POST /api/weekly-read/signup` (fork 2). Duplicate signup = friendly "already subscribed" (idempotent upsert), same UX shape as today's waitlist states.
- `Waitlist.tsx` is **parked** (kept, no longer imported — same convention as ComparisonSection/MCPInstall); `/api/waitlist` route stays live (it holds real signups) but nothing on the page links to it; all `#waitlist` anchors die, including the Capabilities "Get Access" CTA which becomes "Build one free" → `/email-lab`.
- CAN-SPAM mechanics (unsubscribe link, sender identity, postal address) live in Lane D's send path, not here — this section only captures.

### 7. Objection FAQ

4–6 plain-text Q&As, each killing a real objection: Where do the numbers come from? (named sources, cited in every answer) · Is this only Lee & Collier? (map is; answers cover six SWFL counties) · Do I need a credit card? (no — building is free, you pay only to send) · Can I cancel? (anytime, no contract) · Can I put my brand on the reports? (yes). Plain text per output rules — no tables, no blockquotes.

### 8. Repeat CTA + footer

Final CTA repeats the hero's promise (search bar again or "Build one free"), then the existing global footer. **The named-competitor strip is deleted** — the deliverable showcase replaces its job with category framing ("what email tools and content subscriptions make you assemble by hand, this builds and sends for you") — no product names, per the locked no-trash-talk rule.

## Live-lake wiring (kills the mock)

**Sources (all verified present in `pg.data_lake` 07/03/2026):**
- Home Value: `data_lake.zhvi_zip_latest` (`zip_code`, `home_value_latest`, `latest_period`, …) — already read by the app via the typed client in `lib/email/market-context.ts`, proving the PostgREST path works.
- Flood: `data_lake.fema_nfip_zip_window_agg` (per-ZIP aggregate — exact column mapping verified in the plan against the live schema; metric shown = avg annual insured loss per property, matching the current sublabel).
- Permits: **RESOLVED by operator 07/03/2026 — the "New Construction" pill is DEAD.** `lee_building_permits` is the corridor-scoped scrape (288 rows total, 02/25–06/16/2026, zero rows for e.g. 33914), not county-wide coverage; the operator's ruling: we don't surface a metric where the data is bad. Replacement pill: **Market Activity** from `active_listings_residential_zip_stats` (live, ZIP grain, verified 07/03/2026) — choropleth colors by `listing_count` (or `avg_days_on_market`; pin one in plan), rail shows listings/median-list/DOM. Metric set is now Home Value (default) · Market Activity · Flood Risk. The stats-bar "Most New Construction" cell dies with it — replaced by a listings-derived cell from the same table. No permit ingest is blocked into this lane; a county-wide permits pill can return as its own build when a real source lands.
- Stats bar: active-listing count from `data_lake.listing_active_stats` / `active_listings_residential_zip_stats` (whichever holds the county-level count — pinned in plan), median value + a most-active-market cell (highest listing count or fastest DOM — pin in plan) + range computed in the loader from the rows above. Listing figures cite "SWFL Data Gulf" per the locked citation rule.

**Mechanics:**
- `app/page.tsx` becomes an async server component with `export const revalidate = 3600`; a new server-only loader `lib/landing/load-home-map-data.ts` queries the three sources with the typed Supabase client and returns the existing `HomeMapData` shape (plus per-metric as-of vintages). `Hero` takes it as a prop instead of importing the fixture.
- `lib/landing/home-map-data.ts` keeps the **types, color math, and `getZipMapColor`**; the hardcoded `HOME_MAP_DATA` fixture becomes the **fail-soft fallback** for Home Value and Flood Risk: a failing lake query → serve the fixture for that metric with the sample badge restored for honesty (page never blanks; mirrors the current SVG-fetch fail-soft). Market Activity has no fixture (the fixture's permits data is dead with the pill) — on failure that pill disables with a "temporarily unavailable" state rather than showing stale invented-adjacent numbers.
- Metric sublabels/as-of dates come from live vintages (e.g. ZHVI `latest_period`), formatted MM/DD/YYYY, stated once per surface — never a raw freshness token.
- Low/high color-scale bounds computed from the live rows, not hardcoded.

## Files

- `app/page.tsx` — server component, new section order, metadata rewrite (professional-first title/description, no "ZIP-level" phrasing).
- `lib/landing/load-home-map-data.ts` — NEW server loader (+ unit test with mocked db).
- `lib/landing/home-map-data.ts` — fixture demoted to fallback; types/color math unchanged.
- `components/landing/Hero.tsx` — props-driven data, Home Value default, new copy, live badge, click=select + two-door rail CTAs (hard-navigation removed).
- `app/email-lab/page.tsx` + `EmailLabClient.tsx` — accept `?zip=` seed on the anonymous path.
- `lib/project/lab-redirect.ts` (`labDestination`) + `app/email-lab/AutoCreateProject.tsx` — carry `?zip=` through the signed-in redirects (they drop query params today).
- Project Email tab (`app/project/[id]/…` email surface) — consume the carried `?zip=` and seed the deterministic doc as a new draft with the project's brand.
- `lib/email/zip-seed.ts` — NEW deterministic ZIP-email composer reusing existing loaders (+ unit test: known ZIP → doc with figures/sources/as-of; unknown ZIP → null).
- `components/landing/Capabilities.tsx` — clickable persona cards, competitor strip deleted, CTA retargeted.
- `components/landing/ProofStrip.tsx`, `DeliverableShowcase.tsx`, `PricingStrip.tsx`, `WeeklyReadCapture.tsx`, `ObjectionFaq.tsx` — NEW.
- `components/landing/home-explorer.css` — extended for new sections (existing look and feel maintained; `h-full`/`dvh`, never `h-screen`).
- `app/api/weekly-read/signup/route.ts` — NEW (validate email + 5-digit ZIP, idempotent upsert, rate-limit posture copied from `/api/waitlist`).
- SQL migration (Bun.SQL, idempotent, row-count verified): `weekly_read_signups` table + RLS (service-role writes only). No permits view — that metric is dead (operator ruling above); all three map metrics read existing granted tables.
- `components/landing/Waitlist.tsx` — parked, not deleted.

## Error handling

- Lake unreachable at revalidate → fixture fallback per metric + sample badge (page never 500s on data).
- Signup endpoint: invalid email/ZIP → 400 with field message; duplicate → 200 `already_subscribed`; db failure → 500, client shows the existing retry copy.
- SVG map fetch failure already fail-soft — unchanged.

## Testing & verification

- `bun test` for the loader (mocked db: happy path, partial failure → fallback, bounds computed) and signup route validation; tiers strip has no price literals (imports only — `tiers.test.ts` already guards the root).
- `bunx next build` locally (never bare `npx tsc`) before commit.
- `homepage_rebuild_live_verify` is **operator-run** post-deploy: live homepage shows Home Value default with live figures + as-of dates, map click fills the rail and both doors work (primary → seeded lab showing that ZIP's figures with zero LLM spend logged, secondary → `/z/[zip]`), persona cards route to `/ask`, pricing matches `/billing`, capture writes a row, no `#waitlist` anchor remains.
- Migration verification: row count on `weekly_read_signups` (0 after create); loader smoke asserts ≥40 ZIPs with non-null values per live metric.

## Phase split & visual addendum (07/03/2026 second session — operator escalation)

**Why:** operator escalated on the live page ("this is our fucking homepage?") and separately noted redesign fatigue ("not holding my breath for anything real to happen"). Response: execute the visible page NOW (Phase 1), defer the invisible machinery (Phase 2), and fix the visual failures this spec did not cover — diagnosed on the live page 07/03/2026 at 1440px and in the operator's screenshot.

### Phase 1 (this session): the visible page
Everything in "Page structure" EXCEPT fork 1b's machinery: live-lake loader + Hero wiring, Home Value default, metric set Home Value · Market Activity · Flood Risk, proof strip, clickable persona cards, deliverable showcase, pricing strip, weekly-read capture, objection FAQ, competitor strip + waitlist die. Rail CTAs ship both doors, but the primary lab door points at plain `/email-lab?zip=` (param accepted and IGNORED until Phase 2 — the lab opens normally; no dead promise copy: primary reads "Build a branded email" which the lab satisfies even unseeded, secondary "Full report" → the ZIP report).

### Phase 2 (next): fork 1b machinery
`lib/email/zip-seed.ts` deterministic composer, `?zip=` threading through claim/redirect surfaces, project-brand seeding, `/z/[zip]` 307 retirement.

### Fork 2 is OBSOLETE — Lane D landed first
Since this spec was written, Lane D's enrollment endpoint shipped to main (`POST /api/weekly-read/subscribe`, commit 4f2aa98a; `public.weekly_read_subscribers`; hard-400s out-of-scope ZIPs via `resolveZip`; consent recorded server-side). The homepage capture posts THERE with `source: "homepage"`. No new table, no migration, no seam. `weekly_read_signups` is dead — do not create it.

### Visual-craft addendum (the "looks like shit" fixes — none were in the spec)
1. **Choropleth scale: rank-based (quantile), not linear.** Linear t on skewed data (flood: $600–$30K; permits had the same shape) collapses ~90% of ZIPs to `c0` ≈ background — the live map reads as one dead slate mass. Color by rank percentile within the metric (ties averaged), keep the legend endpoints as real min/max values. Also lift each metric's `c0` to a clearly-visible low endpoint (≥ ~1.5× the luminance distance of `--gulf-slate-hi` from the canvas) so "low" reads as *data*, not *void*.
2. **Map framing.** The map must fit the fold at ≥1280px: legend visible without scrolling, no dead half-canvas between rail and coastline. Fix = tighter viewBox pad + `xMidYMid` centering inside a canvas whose height accounts for the actual hero block, and cap `map-layout` height so hero+map+stats-bar top edge land inside 100dvh.
3. **Rail default state: ranked list, not pin emoji.** Replace the 📍 "Select a ZIP code" void with the top-5 ZIPs by the active metric (rank · place name · value, clickable → selects on the map). The rail leads with data before any interaction; "click any area on the map" survives as one-line microcopy under the list.
4. **Identity stays gulf-token.** No new palette/font root — the 06-28 nautical swing was operator-reverted; the signature element is the map itself rendering alive. `'JetBrains Mono'` references in home-explorer.css fall back silently (font never loaded) — replace with `var(--font-geist-mono)`.
5. **Flood label honesty.** `fema_nfip_zip_window_agg` has no property count — "avg annual insurance loss per property" is NOT derivable and dies. Label becomes what the view holds: NFIP claims paid per ZIP over the window (window_end_year shown as as-of). Never a derived denominator (derivable ≠ source-faithful).
6. **Waitlist red error.** `Waitlist.tsx` shows "Select at least one interest" before any interaction (renders whenever `interests.length === 0`). Moot in Phase 1 (component parked), noted so un-parking never resurrects it.

## Out of scope

Weekly-read enrollment/sending (Lane D), per-ZIP subscribe buttons on report pages (Lane C), the `/r/zip-report/[zip]` → pre-seeded-project bridge (Lane C — **CROSS-LANE SEAM, operator to reconcile:** Lane C's spec of 07/02 routes its CTA through the `OpenProjectCta`/`planOpenProject` claim bridge with a `template:"email", scopeKind:"zip"` seed, while Lane B's map door seeds a deterministic prebuilt doc via `lib/email/zip-seed.ts`. Same intent, two mechanisms — either Lane C's template seed learns to use `zip-seed.ts` for its content, or Lane B's signed-in path adopts the claim-bridge planner; pin at plan time, don't ship both), Stripe mechanics (Lane A), homepage A/B testing, testimonials (none exist — revisit when real ones do), 6-county map asset (current SVG is Lee+Collier; honest badge instead).
