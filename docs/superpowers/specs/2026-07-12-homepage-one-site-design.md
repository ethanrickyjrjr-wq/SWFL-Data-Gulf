# Homepage one-site redesign

**Date:** 2026-07-12
**Check:** `homepage_one_site_live_verify`
**Operator brief (07/12/2026):** "Insiders, Desk, Guides, all excellent. Only problem is they are all
better than the homepage. Send out crawl4ai on frontend designs for homepages that generate users and
interest, especially for data and deliverables. What do we do to make a user not get lost and it looks
like it flows with the rest of the site? If we need to move or cut down on things we do it. Make it all
feel like one site. Work on AI pill if you have to."

## Problem

The homepage is structurally a different site from the product it fronts:

1. **Two navs.** `SiteShell` renders a marketing bar on `/` (anchors: How It Works / Live Data /
   Explore the Data) and the real product bar everywhere else (Insiders · Desk · Showcase · Projects ·
   Charts · Maps · Alerts). The three best pages are unreachable from the front door, and the nav swaps
   identity on the first click.
2. **Dead primary CTA.** "Get Access" → `#waitlist` in 4 nav spots (home + app bar, desktop + mobile)
   plus 2 report-page `SourcesGate` CTAs. Nothing has rendered `id="waitlist"` since the 07/03 rebuild
   parked `Waitlist.tsx`. (Open check `get_access_dead_anchor`.)
3. **Ten sections, three funnels.** Build (hero) / explore (map) / ask (persona cards) / build again
   (showcase) / guides / pricing / subscribe (weekly-read) / FAQ / build-or-ask. No single primary action.
4. **Tells instead of shows.** The "deliverable showcase" is a hand-faked miniature email while 27 real
   captured template previews sit committed in `public/showcase/seed-previews/`, and live desk loaders
   already exist. Insiders/Desk prove themselves with real data; the homepage doesn't.
5. **Scope overclaim.** FAQ says "data across six Southwest Florida counties" — violates the locked
   07/07 scope correction (Lee + Collier core).

## Research evidence (crawl4ai, RULE 0.4 — 07/12/2026)

- **NN/g, "Homepage Design: 5 Fundamental Principles" (nngroup.com):** primary navigation in a highly
  noticeable place; homepage visually distinct *yet aligned* with site style; **reveal content through
  real examples**, not category descriptions; descriptive CTA labels ("Get Access" fails, and it's
  broken); one clear visual hierarchy; no popups before the user gets value (flags our first-visit
  auto-opening AI panel on `/`).
- **NN/g, "Consistency and Standards" (heuristic #4):** internal consistency — same patterns, colors,
  components everywhere; Jakob's Law; a design system as single source of truth.
- **Julian Shapiro, julian.com landing-page guide:** Purchase Rate = Desire − (Labor + Confusion);
  header litmus test (descriptive, not a slogan — the sub must carry "what is this" since the H1
  "Research done. Send." is the operator's chosen flourish); CTA = continuation of the hero promise.
- **Harry Dry, marketingexamples.com step-by-step guide:** above the fold = value / how / **real product
  visual** / proof / call-to-value CTA ("Build one free — no credit card" is exactly his pattern);
  below = concrete features → FAQ → repeat CTA; razor: "would this help me sell in person? If not,
  remove it."
- **hex.tech (live data-product homepage):** thin live announcement ticker on top, descriptive H1,
  real product UI as the hero visual.

Crawl outputs live in the session scratchpad only (never committed — `*crawl4ai*` gitignore rule).

## Operator decisions (recorded 07/12/2026)

1. Direction: **Approach B — one-site assembly** ("What does the research say? I think B" — evidence above).
2. Logged-out nav CTA: **"Build one free" → `/email-lab`** (via `EMAIL_LAB_LANDING`).
3. Homepage email capture: **Insiders capture**; weekly-read stays on ZIP report pages.
4. AI pill: **rename to "Ask AI" + no auto-open on the homepage** (auto-open stays on deep-entry pages).

## Design

### One nav
- Delete the `HomeBar` variant. `AppBar` renders on every page including `/`; on home it is fixed +
  transparent over the hero and solidifies on scroll (keeps the premium feel — NN/g's "distinct yet
  aligned"). Tabs, logo, account cluster identical everywhere.
- Logged-out CTA in both bar states + mobile menus: "Build one free" → `EMAIL_LAB_LANDING` (imported —
  the `destination.static.test.ts` door-pin forbids raw `/email-lab` literals).
- `SourcesGate` on `/r/[slug]` + `/r/cre-swfl/[corridor]`: CTA `/#waitlist` → `/login` (it is a
  "Members only" access story, not a build story; gate visuals unchanged — no scope creep).

### Page spine (10 sections → 8, one primary action)
1. **HeroCampaign** — unchanged mechanics (address bar + campaign chips, locked identity). Copy: H1
   stays; the badge/sub carries the descriptive job.
2. **The Wire (new)** — reuse the insiders `WireTicker` component + `.ins-wire` styles verbatim (one
   authority, no third ticker fork). Items from a new pure builder `lib/landing/home-wire.ts` (+ bun
   test): ZHVI metro medians ×3, ZORI metro rents ×3, news-desk story count — deliberately disjoint
   from the door tiles so no figure appears twice. Note line carries "desk updated MM/DD/YYYY ·
   Zillow through <Month> · SWFL Data Gulf". Empty-tolerant: lake degrades → ticker hides.
3. **Hero map section** — unchanged (id="data", ZIP click → /r/zip-report funnel) minus the 4-cell
   stats bar (its job moves to the data door).
4. **Two doors (new `ProductDoors`)** — replaces persona cards + fake email mock.
   Data door: `payload.stats` tiles (Active Listings / Most Active ZIP / Highest Home Value) + LIVE
   pulse + "Open the Data Desk →" (/desk). Deliverables door: 3 real seed previews (new-listing ·
   weekly-pulse · market-letter) each linking `seedGalleryDestination(id)`, caption
   `SEED_PREVIEW_CAPTION`, CTAs "Build one free" → `EMAIL_LAB_LANDING` + "See all NN layouts" →
   /showcase (count from `SEED_PREVIEWS.length`).
5. **Insiders band (new `InsidersBand`)** — editorial strip wrapped in `insiders-page` scope +
   Instrument Serif; reuses `InsidersCapture` (`source="homepage-band"`) as THE homepage capture;
   link to /insiders. WeeklyReadCapture leaves the homepage.
6. **GuidesStrip** — unchanged (trust section).
7. **PricingStrip** — unchanged.
8. **ObjectionFaq** — scope line rewritten: map covers Lee + Collier; gaps fill from named sources,
   never invented. Then final CTA (unchanged).

Parked (files kept, imports removed — same pattern as 07/03): `ProofStrip`, `Capabilities`,
`DeliverableShowcase`, `WeeklyReadCapture`.

### AI pill
- `shouldAutoOpenPill` gains `home: boolean` (pure fn + tests) — never auto-open on `/`.
- Label "AI + Briefcase" → "Ask AI" (pill, panel header, discovery-ticker tip, aria labels).
  Briefcase vocabulary survives inside the panel.

## Implementation checklist (plan inlined here per RULE 0.6 — no separate plan doc)

1. `lib/landing/home-wire.ts` + `home-wire.test.ts` — pure wire builder (twin-comment the local
   month-label helper against the insiders page copy).
2. `components/nav/SiteShell.tsx` — HomeBar deleted, AppBar `isHome` variant, CTA swap (+ motion
   import dies with HomeBar).
3. `app/r/[slug]/page.tsx` + `app/r/cre-swfl/[corridor]/page.tsx` — SourcesGate href → `/login`.
4. `components/landing/ProductDoors.tsx` (new), `components/landing/InsidersBand.tsx` (new).
5. `app/page.tsx` — new spine; loads `loadDeskStats` + `loadMetroTrend` (zhvi/zori) alongside
   `loadHomeMapData`; imports `app/insiders/insiders.css`.
6. `components/landing/Hero.tsx` — stats bar removed (payload Pick narrows to data+badge).
7. `components/landing/ObjectionFaq.tsx` — scope answer rewrite.
8. `lib/briefcase/pill-mount.ts` + test, `components/briefcase/AiBriefcasePill.tsx`,
   `components/briefcase/BriefcasePanel.tsx`, `components/highlighter/DiscoveryTicker.tsx` — pill picks.
9. CSS: `app/insiders/insiders.css` gains `.ins-band`; `home-explorer.css` gains door styles.
10. Gates: `bun test` (lib/briefcase, lib/landing, lib/lab-entry, components/nav, seed-previews) +
    `bunx next build`. SESSION_LOG entry; commit only owned files; **no push without operator OK**.

## Verification
- Suites above green; `bunx next build` exit 0.
- Manual after deploy (closes `homepage_one_site_live_verify`): homepage shows product nav; every nav
  CTA lands somewhere real (no `#waitlist` anywhere); wire shows live sourced figures; door previews
  render the committed webps; Insiders capture inserts a `insiders_subscribers` row with
  `source=homepage-band`; pill reads "Ask AI" and does not auto-open on `/`.
- `get_access_dead_anchor` check closes on the same deploy evidence.

## Out of scope
- SourcesGate membership/blur behavior (only the dead href moves).
- Deleting parked components; `/embed/waitlist` + `/api/waitlist` (separate live surface).
- Weekly-read product itself (capture stays on ZIP pages).
- Desk/Insiders/Guides pages — untouched.
