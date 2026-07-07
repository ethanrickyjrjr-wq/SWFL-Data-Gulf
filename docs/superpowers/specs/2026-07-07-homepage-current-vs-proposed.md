# Homepage: proposed agent-first redesign vs. what's live today

**Date:** 2026-07-07
**Purpose:** Give the operator an accurate side-by-side before greenlighting an "agent-first homepage" build.
**Scope:** Comparison only — no implementation code. (Operator said hold off on building.)

---

## Headline finding (read this first)

**The agent-first homepage "Build 1" is already live in production.** The plan
(`docs/superpowers/plans/2026-07-05-agent-first-homepage.md`) and its design spec
(`docs/superpowers/specs/2026-07-05-agent-first-homepage-design.md`) were implemented and pushed to
`origin/main`. The 07/07 drift audit's claim of "zero implementing commits — pure spec, nothing built"
is **factually wrong**.

Primary evidence:

- `ed3c5822` — `feat(hero): HeroCampaign — address bar + chip-driven placeholder + suggest dropdown (agent-first-homepage T4)`
- `fb1e8c48` — `feat(homepage): agent-first hero live — address bar + campaign chips; map demoted to proof-of-data section (agent-first-homepage T6)`
- Both commits are on `origin/main` (verified via `git branch -r --contains`), i.e. deployed.
- Follow-on refinements landed after: `abfa1691` (drop ambient zip param) and the lab-entry migration
  (`db572470`, `0083c880`) that relocated `heroDestination` into `lib/lab-entry/destination.ts`.
- Every file the plan says to create/modify exists live: `lib/geo/search-box.ts` (+ test),
  `app/api/address-suggest/route.ts`, `app/api/address-retrieve/route.ts`,
  `components/landing/HeroCampaign.tsx`, `HERO_CAMPAIGNS`/`heroDestination`, the grid ZIP-seed prebuild,
  and the demoted `Hero.tsx` map section.

**So the operator's real decision is not "build the agent-first homepage."** It is: (a) close out two
small residual deltas vs. the design spec, and/or (b) fund builds 2–5 of the ladder (address spine,
lifecycle sequences, send hardening, voice depth) — none of which have any commits yet.

---

## Section-by-section: design spec vs. live code

| Section | Proposed (2026-07-05 design spec) | Live today | Status |
|---|---|---|---|
| **Hero headline** | "Research done. Send. We'll take care of the rest." | Exact string in `HeroCampaign.tsx` (h1). | **Live** |
| **Hero subline** | "Type your next listing's address. We build the campaign from live Southwest Florida data — every number sourced — and send it on your schedule." | Exact string in `HeroCampaign.tsx`. | **Live** |
| **"AI" absent from hero** | Word "AI" must not appear | Not present anywhere in `HeroCampaign.tsx`. | **Live** |
| **Address bar** | One bar, as-you-type suggestion dropdown, accepts address/ZIP/city | `HeroCampaign.tsx` single input + `.hero-suggest` dropdown; bare-ZIP fast path; free-text fallback. | **Live** |
| **Autocomplete vendor** | Mapbox Search Box API, `/suggest` per keystroke → `/retrieve` on pick, one `session_token`/session, token server-side only | `lib/geo/search-box.ts` builders + `app/api/address-suggest` & `app/api/address-retrieve` proxies; `MAPBOX_TOKEN` server-side. | **Live** |
| **Four campaign chips** | New Listing · Just Sold · Coming to Market · Market Update | `HERO_CAMPAIGNS` in `lib/campaigns.ts`, exactly this order. | **Live** |
| **Chip-driven placeholder** | Listing chips → "Type your next listing's address…"; Market Update → "Type a city or ZIP…"; no second field, no error states | Implemented verbatim in `HeroCampaign.tsx`. | **Live** |
| **Hero → lab flow** | Input resolves to scope before lab opens; lab opens `?zip=` prebuilt + chip recipe with address filled into the `[[blank]]` | `heroDestination` fills the blank → `/email-lab/grid?...`; `app/api/address-retrieve` resolves ZIP + scope on pick. | **Live** |
| **Grid ZIP-seed prebuild** | Anonymous `?zip=` grid lab opens on the deterministic ZIP-seed doc | `app/email-lab/grid/page.tsx` calls `buildZipSeedDoc(zip)`; `EmailLabGridClient` accepts `seedDoc`. | **Live** |
| **Map placement** | Choropleth + rail + stats demoted below the fold as "The data your campaigns are built on"; mechanics unchanged; report/ask retained | `Hero.tsx` is now the proof-of-data `map-section` with that exact heading; ZIP-click→lab, pills, stats, report/ask search all intact. | **Live** |
| **Page order** | HeroCampaign above the demoted map | `app/page.tsx`: `<HeroCampaign />` then `<Hero />`. | **Live** |
| **Metadata copy** | Re-flipped to the build-and-send framing, no "AI" | `app/page.tsx` metadata already re-flipped verbatim. | **Live** |
| **No subject-property AVM** | No property value estimates | Market-grain only; no AVM path added. | **Live** |

---

## Two residual deltas (spec asked for X; live does Y)

These are the only places the LIVE homepage diverges from the 07/05 **design spec**. Both are
deliberate — the **plan** flagged them — but they remain open vs. the design spec's wording:

1. **Just Sold / Coming to Market are slide-recipes, not first-class campaigns.**
   The design spec ("Campaign chips are real") called for promoting these two to
   `campaign.status:"live"` + their own `seedRecipe` in `lib/showcase/registry.ts`, with registered
   vocab slugs and captured assets. Live code instead reads them off the existing `listing-to-close`
   showcase's **slide** recipes: `slideRecipe("listing-to-close", "Sold")` and
   `slideRecipe("listing-to-close", "Coming Soon")` (`lib/campaigns.ts`). The chips work and don't
   dead-end, but they are not first-class campaigns. This matches the plan's Task 1 (which chose the
   slide mechanism because a showcase carries at most one `campaign`) but diverges from the design
   spec. Impact: functional today; a future spec that wants distinct Just-Sold/Coming-Soon recipe
   content would need the promotion.

2. **Mapbox is IP-default proximity, not Fort Myers / Lee-Collier bias.**
   The design spec asked for `proximity` = Fort Myers + `bbox` = Lee+Collier. The live
   `lib/geo/search-box.ts` `buildSuggestUrl` sends only `country=US`, `types`, `limit=6`,
   `language=en` — no `proximity`, no `bbox`. The plan and the file's own comment justify this (IP
   proximity is the documented default and the right bias for visitors already in SWFL). Impact:
   suggestions are US-wide-ranked by IP location rather than hard-biased to the two counties; low risk
   for local users, but a national or VPN visitor's top suggestions won't favor SWFL.

---

## What is genuinely NOT built — the ladder (builds 2–5)

The design spec describes a 5-build ladder. Only **Build 1 (the hero swap)** shipped. If the
operator's "redesign" means anything beyond the hero, **this is the actual unbuilt scope** — zero
commits on any of these:

| Build | What it adds | Status |
|---|---|---|
| **2 — Address spine** | Wire `geocode → comps` into the builder; address kind on the build scope; builders read `subject_address`; scheduled occurrences re-resolve listing status + comp set (closes gaps G1/G5). | **Not built** |
| **3 — Lifecycle sequences** | One listing campaign fires coming-soon → new-listing → comps → under-contract → just-sold on milestones (closes G4). | **Not built** |
| **4 — Send hardening** | Resend `Idempotency-Key` on every send (dual-layer with our claim), send-history on the schedule row, recipient-grain ledger. | **Not built** |
| **5 — Voice / brand depth** | The agent's own voice in commentary; gets its own brainstorm before scope. | **Not built** |

Note: Build 1 ships **market-grain figures with the address on the piece** by design — property-anchored
comps are explicitly Build 2 (the address spine). So today, a typed address seeds the recipe and resolves
a ZIP, but the deliverable's numbers are ZIP/market-grain, not property-specific. That is intended, not a bug.

---

## Bottom line for the build/no-build call

- **Do not rebuild the homepage hero.** It is live and matches the design spec on every headline element.
- The `agent_first_homepage_live_verify` check is **operator-run on production** and is the correct place
  to confirm the live flow end-to-end (paid Mapbox call — not done in this offline audit).
- If "redesign" means the two residual deltas → those are small, scoped follow-ups, not a rebuild.
- If "redesign" means the address-anchored product loop → that is **builds 2–5**, and those are the
  real, unbuilt work.
