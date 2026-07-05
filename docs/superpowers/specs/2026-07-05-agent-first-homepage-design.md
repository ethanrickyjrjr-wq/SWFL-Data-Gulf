# Agent-first homepage: address-bar hero + campaign chips

**Date:** 2026-07-05
**Check:** `agent_first_homepage_live_verify`
**Status:** approved design (operator, 07/05/2026) — identity re-flip confirmed: homepage speaks to agents as the campaign engine; the cited data lake is the trust layer, no longer the headline. Supersedes the intelligence-first hero framing of `2026-07-03-homepage-rebuild-design.md` (Lane B); the map survives below the fold.

## Problem

The homepage hero sells "market intelligence, cited to the source" and makes the map the star. But the product's strongest working loop is the builder: click a ZIP → the email lab opens with a branded, sourced email already on canvas → schedulable with an idempotent send cron. The hero buries that loop behind a map click a visitor has no reason to make, and speaks to a research audience while the paying audience is agents who need their next listing marketed.

## Research evidence (RULE 0.4 — four lanes run 07/05/2026, all live)

**Competitive (crawl4ai, ~20 products):** the pieces are commodity, the loop is unowned. Address→content exists one-shot at $25/mo (Write.homes); scheduled local-market emails exist at $79/mo (Altos, no address anchor, no narrative); MLS lifecycle auto-switching exists as paid Facebook ads only (Ylopo Listing Rocket); the full loop exists at $299–$999/mo with humans doing the work (Curaytor). **Nobody** does address → build → auto-update → auto-send for organic email+social in software. **Nobody cites a single number inside the deliverable** — Altos/KCM brand the data, none cite per claim. **Everybody gates at build time** — builds-free/send-paywall is an unoccupied funnel. Solo-agent value zone: $50–$150/mo. Sources: homebot.ai/pricing/agent, altosresearch.com/pricing, topproducer.com/market-snapshot, ylopo.com/listing-rocket, curaytor.com/pricing, write.homes/pricing, listingai.co/pricing, canva.com/solutions/real-estate, coffeecontracts.com, agentcrate.com, keepingcurrentmatters.com/pricing.

**Reddit (SteadyAPI, 39 calls, verbatim threads):** the address-anchored recurring email is the single most-loved mechanic in the category (Homebot: "gets opened more than anything else I send out"), and the named failure modes map exactly to our moat: (1) auto-stats without interpretation are dismissed — "I can send this in two clicks, but has zero context" (r/realtors, 06/2025); (2) wrong numbers are the loudest churn driver — a lender canceled Homebot over "your home value dropped $50k" blowups (r/loanoriginators, 10/2024); (3) third-party content makes agents "feel ingenuine" — output must carry the agent's voice; (4) consumer AI backlash is enormous (28k-upvote thread mocking AI-altered listings) — marketing leads with "every number sourced," never "AI-generated"; (5) over-touching backfires — "fewer, better, data-backed sends" is a differentiator no incumbent claims; (6) subject-property AVM claims are the category's blowup risk — market-grain cited figures only.

**GitHub prior art:** no OSS incumbent for address → scheduled, data-refreshed campaign email (Homebot has zero clones). Reusable hardening patterns: dual-layer idempotency (same key as internal claim AND Resend `Idempotency-Key` header — SDK-native, from dubinc/dub), recipient-grain send ledger (listmonk), send-history on the schedule row + recipe-as-data/render-at-fire (hndigest — validates our block-canvas occurrence path).

**Internal audit:** this is wiring, not invention. Works today: recipe → lab handoff; `?zip=` deterministic prebuild (`lib/email/zip-seed.ts`); AI authoring where the model never types a number (`lib/email/author-doc.ts` id-selection + prose lint); production-grade recurring send (claim/reaper/idempotency, `lib/email/scheduler.ts` + `scripts/email/run-schedules.mts`). Gaps: (G1) typed address never resolves into the builder — the live-verified geocode→comps engine (`lib/geo/geocode-address.ts` → `lib/assistant/comp-helper.ts` → `lib/listings/steadyapi.ts`) is siloed in chat; `subject_address` on the project row is read by no builder; (G2) no address input or autocomplete on the homepage; (G3) just-sold and coming-to-market are slide-level recipes, not first-class campaigns (`lib/showcase/registry.ts`); (G4) no lifecycle sequence — the scheduler is one cadence per piece; (G5) scheduled listing emails can't refresh their own status/comps (follows G1); anonymous grid lab passes no scope, so figures come back empty without a resolved ZIP.

## Goal

An anonymous visitor types a Lee/Collier address, clicks a campaign chip, and lands in the email lab with a branded, sourced email already on canvas in under ~10 seconds — then can schedule it after signup with zero extra configuration. Homepage identity: "hand us the listing, we run the campaign — every number sourced." Build free; send is the paywall (unchanged, locked).

## What we're building (build 1 of the 5-build ladder)

### Hero

- Headline (operator's line): **"Research done. Send. We'll take care of the rest."** Subline: "Type your next listing's address. We build the campaign from live Southwest Florida data — every number sourced — and send it on your schedule." The word "AI" does not appear in the hero. Anti-drip note rides subcopy ("fewer, better sends").
- **One address bar** with autocomplete (Mapbox Search/Geocoding, proximity-biased to Lee/Collier), accepting street address, ZIP, or city. Autocomplete is net-new; the server-side geocoder exists (`refinery/lib/geocode.mts` via `lib/geo/geocode-address.ts`).
- **Four campaign chips** under the bar: New Listing · Just Sold · Coming to Market · Market Update. Address (or ZIP/city) + chip → lab opens prebuilt.

### Flow (hero → lab), ZIP-grade fallback by design

1. Input resolves to a scope before the lab opens (the audit's empty-figures trap): street address → geocode → ZIP (+ the address itself carried forward); bare ZIP/city → existing scope path.
2. Lab opens as `?zip=` does today — deterministic prebuild from ranked signals + lifecycle digest ($0 until edit) — plus the chip's campaign recipe seeded with the typed address filled into its `[[your listing address]]` blank, and the address stored so signup → project creation lands it in `subject_address`.
3. Honest grain: build 1 ships market-grain figures with the address on the piece. Property-anchored comps arrive in build 2 (the address spine). No subject-property value estimates ever (Reddit blowup evidence).

### Campaign chips are real (in this build)

- New Listing (`listing-to-close`) and Market Update (`market-pulse` newsletter) seed recipes are live today.
- **Just Sold** and **Coming to Market** get promoted from slide-level recipes to first-class live campaigns (`campaign.status:"live"` + `seedRecipe` in `lib/showcase/registry.ts`, slugs registered per the vocab gate, capture assets via `scripts/capture-showcase.mjs`). Chips must never dead-end.

### Map demotes, doesn't die

Choropleth + rail + stats bar move below the fold as the proof-of-data section, retitled to its real job ("The data your campaigns are built on"). Mechanics unchanged: ZIP clicks still open the lab; the report/ask paths remain there as the research audience's door. Metric pills, ramps, stats-bar semantics untouched.

## The ladder (each build = own spec + check when it starts)

1. **This build** — hero swap + chip promotion + address→ZIP resolution + map demotion.
2. **Address spine** — wire geocode→comps into the builder: address kind on the build scope, subject comps in the figure menu, builders read `subject_address`, scheduled occurrences re-resolve listing status + comp set (closes G1/G5).
3. **Lifecycle sequences** — one listing campaign fires coming-soon → new-listing → comps → under-contract → just-sold on milestones; the single-cadence scheduler stays the primitive (closes G4).
4. **Send hardening** — Resend `Idempotency-Key` on every send (dual-layer with our claim), send-history on the schedule row, recipient-grain ledger.
5. **Voice/brand depth** — the agent's own voice in commentary (Reddit: "your newsletter should reflect you"); gets its own brainstorm before any scope is fixed.

## Non-goals

- No new data-lake gates, no new pre-materialization stage (RULE C2).
- No changes to `--- OUTPUT ---` shapes, packs, or the answer engine.
- No AVM / subject-property value estimate — four-lane cited figures only.
- No paid-ads surface (Ylopo's lane), no lender-sponsored tier yet (noted as a future growth channel).
- The grid shell stays the one lab surface (locked 07/03/2026) — this build feeds it, never forks it.

## Success criteria

- Anonymous: address typed → chip → prebuilt branded email on canvas, live figures, sources in the collapsed list, < ~10s.
- Every chip lands a working seeded recipe (no dead chips).
- ZIP/city input and map clicks keep working exactly as today.
- Signup from that lab session carries the address into the project (`subject_address`).
- `bunx next build` green; vocab gate green for any new recipe slugs.
- Live verify closes `agent_first_homepage_live_verify` (operator-run, prod).

## Open questions (build 2+ inputs, not blockers)

- Autocomplete vendor call: Mapbox Search JS vs. plain Geocoding API + our own dropdown (decide in plan; token scoping per mapbox-token-security).
- Whether Market Update chip should ask for ZIP/city instead of address (it's area-grain by nature) — default: bar accepts both, chip works with either.
- Social chip surface (chips open the email lab in build 1; social lands with the spine/sequence builds).
