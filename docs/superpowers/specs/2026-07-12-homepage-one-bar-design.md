# Homepage rebuild — one working bar, no theater

**Date:** 2026-07-12
**Status:** operator-approved direction (07/12/2026 session); this spec supersedes §v2 of
`2026-07-12-homepage-one-site-design.md` (the CampaignReveal centerpiece is dead).
**Check:** `homepage_one_bar_live_verify`

## Problem

Operator review 07/12/2026, after the v2 "campaign reveal" shipped:

1. **Three real inputs plus one fake one.** Hero bar → email lab; map-section bar → ZIP report
   or /ask; floating Ask AI pill → chat; and the demo's bar-shaped element is decorative spans
   you cannot type into. Nobody — including the operator — could say where each goes.
2. **The centerpiece performed the wrong artifact with the worst number.** `buildCampaignDemo`
   auto-picked the "most distinctive figure" of the busiest ZIP with no floor on quality, and
   led the entire site with "1 new permit." It also performed a ZIP-scoped email being
   assembled — a deliverable the operator has already rejected; the good artifact (combined
   market areas → full reports that feed email, `lib/email/zip-events/market-areas.ts` +
   `/r` report pages) went unshown.
3. **GuidesStrip was parked** and replaced by a one-line link; the operator noticed
   immediately and wants it back.
4. **Nothing on the page did real work.** The AI machinery that runs everywhere else
   (assistant engine grounded on the nightly synthesis, highlighter, tappable fact chips on
   report metrics, per-block AI edit in the lab) was absent from the front door.

## Evidence (research pass, 07/12/2026, crawl4ai)

Sources: Nielsen Norman Group (https://www.nngroup.com — "Homepage Design: 5 Fundamental
Principles" 03/15/2024, "Tabs, Used Right", "113 Design Guidelines for Homepage Usability"),
Julian Shapiro's landing-page guide (https://www.julian.com), Marketing Examples' landing-page
guide (https://marketingexamples.com), CXL (https://cxl.com), and Zillow's live homepage
(https://www.zillow.com).

Findings that drive this design:

- **One top task, emphasized alone.** NN/g: "if everything is emphasized, nothing stands
  out." Zillow — the biggest place-search product on the web — has exactly ONE bar; modes are
  labeled switches, never additional bars.
- **Tabs done right:** few tabs, concise labels, one selected by default, selected state
  prominently highlighted, same layout with different data per tab.
- **Show real, representative samples** — and never feature unrepresentative content that
  warps what visitors think you sell (the "1 permit" failure is NN/g's warning verbatim).
- **Minimize motion**; auto-playing assembly animations read as ads and get skipped.
- **Settled page skeleton** (all three guides agree): hero with a fully descriptive headline
  + one primary action → proof → features with objections answered → FAQ → repeat CTA.
  Julian's formula: conversion = desire − (labor + confusion).
- **Descriptive header litmus test:** if a visitor reads ONLY the headline, they know exactly
  what we sell.

## Design constraint (operator, 07/12/2026)

**One system, not fifty.** Every control on the page wires into a tool that already exists —
the lab, the report routes, the assistant engine, the highlighter/fact-chip machinery, the
live map loaders. No new engines, no new endpoints, no canned demos, no decorative controls.
Every element either does real work on the page or is honestly a link.

## What we're building

### Page spine (`app/page.tsx`)

1. **HeroBar** — the only text input on the page (new `components/landing/HeroBar.tsx`,
   absorbing HeroCampaign's autocomplete + lab-entry logic)
2. **Map trust section** — existing `Hero.tsx` map/rail/stats, **its search bar deleted**
3. **SiteDoors** — two doors: Desk, Insiders (Guides door removed; it becomes a full section)
4. **GuidesStrip** — restored, full card strip from the guides registry
5. **PricingStrip** (unchanged)
6. **ObjectionFaq** (unchanged)
7. **Final CTA** (unchanged)

Parked components stay parked (ProofStrip, Capabilities, DeliverableShowcase,
WeeklyReadCapture, Waitlist, ComparisonSection, MCPInstall, Charts).

### The bar — one input, three labeled modes

Modes as tabs above the bar, NN/g tab rules applied: **Campaign** (default) ·
**Market Report** · **Ask the Data**. The selected mode changes the placeholder, the submit
button label, and a one-line "what you get" under the bar. Same layout every mode.

- **Campaign** (default): placeholder "Type your next listing's address…", button "Build it".
  Behavior is HeroCampaign's today, verbatim: campaign-type chips (New Listing / Just Sold /
  Coming to Market / Market Update) render in this mode only; address autocompletes via
  `/api/address-suggest` (one session token per typing session); a pick resolves via
  `/api/address-retrieve` so ZIP + scope are settled BEFORE the lab opens; submit lands the
  user **mid-build in the lab, never on a blank canvas**. Bare-ZIP path keeps the existing
  `openZipLab` door for now — re-seeding bare-ZIP entries to market areas is lab work, tracked
  under `builder_grid_ai_breakdown_chart` follow-ups, not smuggled into this build.
- **Market Report**: placeholder "ZIP, city, or neighborhood…", button "Open the report".
  Bare 5-digit ZIP → `/r/zip-report/<zip>` (the one-ZIP-truth route); anything else →
  `/r/search?q=` (every dataset covering that place, at the grain held). What-you-get line:
  "Every dataset we hold for that place — cited and dated."
- **Ask the Data**: placeholder "Ask anything about the SWFL market…", button "Ask". Submit
  does NOT navigate: the cited answer **streams inline under the bar** using the same
  assistant hook the report dock uses (`lib/assistant/use-assistant.ts` /
  `converse.ts` → `/api/assistant`, SSE). No reportId → the engine's existing conversation
  path grounds the answer on the region-wide nightly read. Below the streamed answer: one
  link, "Keep going →" to `/ask?q=<question>`. No new endpoint, no new spend surface —
  same guarded engine that already serves the pill and highlighter on every page. Note for
  implementation: the engine call happens only on submit (zero cost at page load), and the
  existing per-path spend guards apply unchanged.

Routing lives in a pure function `heroBarDestination(mode, input)` (plus an `inline` marker
for Ask) so every route is unit-tested without a browser.

Free-text submits never error (existing rule): carry the text to the destination as-is.

### Live figures — the map's numbers stop being dead print

The rail's Top-ZIP values and the stats bar figures render as tappable facts using the
existing fact-chip machinery (`FactChip` + the app-root `HighlighterProvider`'s `chipFact` —
`GlobalHighlighter` is already mounted on `/` and already handles chip taps off-report).
Tap a figure → the popup opens seeded with that exact figure, place, and as-of date. This is
wiring an existing seam, not a new gate (RULE 3 C2).

One static caption near the map (no ticker, no animation): "Tap any figure — or select any
sentence on this page — to ask about it."

**Implementation deviation (07/12/2026):** rail Top-ZIP values are inside
`<button class="rail-top-row">` rows that already open the ZIP report — nesting a
FactChip button there is invalid HTML and a click conflict. Chips therefore ride the
stats-bar figures only; the rail rows keep their existing click-through. The caption
covers both affordances.

### Copy

Headline must pass the descriptive-header litmus test (reading it alone tells you what we
sell). Working draft — final wording at implementation, tested against the litmus:
"Type a place. Get the campaign, the report, or the answer — built from live Southwest
Florida data." Sub keeps the current sourcing promise. The word "AI" stays out of hero copy
(carried rule from the agent-first spec); "Ask the Data" is the mode label. Coverage claims
follow the locked Lee+Collier wording. `metadata.description` updated to name the three
modes; no grain framing (four-lane rule).

### Deletions (outright, same PR)

- `components/landing/CampaignReveal.tsx`
- `lib/landing/campaign-demo.ts` + `campaign-demo.test.ts`
- `components/landing/HeroCampaign.tsx` (logic absorbed into HeroBar)
- `Hero.tsx`: the `search-wrap` block + `submitSearch` (map keeps badge, heading, filter
  pills, rail, canvas, stats)
- Related dead CSS in `home-explorer.css`

Nothing auto-picks a "most interesting figure" anywhere on the page. The only numbers shown
are the map loaders' own metrics — labeled, sourced, dated, and chosen by us.

### What deliberately does NOT change

- Ask AI pill (`AppShell`) — global chrome, works, stays.
- GlobalHighlighter — already live on `/`; we only add the caption.
- `/r`, `/ask`, the lab — untouched; the bar routes into them.
- PricingStrip, ObjectionFaq, final CTA — unchanged.

## Error handling

- Ask-mode stream failure → the same graceful error the dock shows, plus the "Keep going →"
  link to `/ask` (fail toward a working page, never a dead control).
- Suggest/retrieve fetch failures → existing fall-throughs (submit carries raw text).
- Map data on sample fallback → section renders as today; nothing else on the page depends
  on it anymore (the demo that did is deleted).

## Testing

- `heroBarDestination` unit tests: campaign address / campaign bare ZIP / report ZIP /
  report city / ask inline marker / empty input.
- **One-input pin:** a page-level test renders the homepage spine and asserts exactly ONE
  text input (the regression that caused this rebuild can never return silently).
- Spine pin (`home-wire.test.ts` pattern): section order as specced; `CampaignReveal` no
  longer imported; `GuidesStrip` present; `Hero` renders no search input.
- Ask-mode: hook-level test that submit invokes the assistant client with the typed
  question and no reportId (stream mocked, matching existing converse tests).
- Gates: `bunx next build` green; prod-build fingerprint via the verify skill (served bytes,
  not the diff); pack/vocab gates untouched (no pack changes).

## Out of scope (checks opened)

- `builder_grid_ai_breakdown_chart` — in the BUILDER: click a grid block → AI adds a live
  cited breakdown; click → generates a chart of that block's info (operator idea 07/12).
- Bare-ZIP lab entries re-seeded to combined market areas (noted above, same check).
