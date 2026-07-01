# Handoff — plan the on-demand comp helper (SteadyAPI Phase 2B)

**For:** a fresh Claude. **Your job:** turn the approved spec into an implementation plan via the
`superpowers:writing-plans` skill, then build **v1 core** TDD. Brainstorming is DONE — do not re-brainstorm.

**Spec (read first):** `docs/superpowers/specs/2026-06-30-steadyapi-comp-helper-design.md`
**Parent build folder:** `docs/superpowers/plans/2026-06-30-steadyapi-sole-spine/` (README + `phase-2-sold-lake-and-comps.md`
Part B + `00-foundation-endpoint-catalog.md`). This build is Part B only — the answer-engine comp path.
**Check to close on live-verify:** `steadyapi_comp_helper_live_verify` (open in the ledger).

## Start here (RULE 0.5 probe-first — the prior art is already in the tree)

- `lib/assistant/web-fallback.ts` — **the pattern to mirror.** Gate (`looksLikeFigureAsk`) → fetch live → render a
  "state ONLY these" grounding block + `unfound` lane-4 ask. Your comp helper is its structural twin.
- `lib/assistant/conversation-path.ts` — hook points at the two `webFallbackForConversation(lastUser, system)` calls
  (region-wide ~line 619, located ~line 701). Add `compForConversation(...)` beside them; **compose, don't replace**.
- `lib/listings/steadyapi.ts` — the existing TS Steady client (`fetchPhotoListings`). Reuse its `PHOTOS_API` auth,
  `BROWSER_HEADERS`, hour-cache (`next.revalidate`), and empty-tolerant/never-throws shape for the two new fetchers.
- `lib/listings/aerial.ts` — proves `MAPBOX_TOKEN` is available server-side (for `geocode-address.ts`).
- `lib/zip-dossier.ts` — where `{ kind: "address-unsupported" }` lives (the pre-geocoder gap you're filling); and
  `fixtures/swfl-zip-county.json` for ZIP→county (Lee 12071 / Collier 12021 gate).
- `lib/email/listing-comps.ts` + `lib/email/listing-scrape.ts` — reuse for Increment 2 (`buildCompsSpec`) and
  Increment 3 (JSON-LD/Haiku extraction of a pasted link).
- `components/CitationList.tsx` + `lib/citations/clean-url.ts` — the ONE citation root; do not rebuild it.
- Area conventions: **read `lib/assistant/CLAUDE.md`** before editing there.

## Verified vendor contracts (crawl4ai 06/30/2026 — in the spec; do NOT re-fetch to plan)

- `/nearby-home-values?lat=&lon=&radius=&status=&limit=` → `body.statistics.{list_price,estimated_value,status_counts}`
  + `body.properties[]{ property_id, listing_id, status, list_price, href, permalink, address{line,city,state_code,
  postal_code}, description{beds,baths(string),sqft,lot_sqft}, estimates.best{value,date} }`. **No sold price here.**
- `/property-tax-history?propertyId=` → `body.property_history[]{ date, event_name, price, ... }`; latest
  `event_name=="Sold"` → exact sold price+date.
- `/similar-homes` / `/gallery-similar-homes` → REJECTED as comp source (need a prior propertyId, no sold price).
- Mapbox forward-geocode = **temporary** (free at our volume) — never `permanent=true`, never persist the coordinate.

## Increment sequencing (build v1 first; 2 and 3 are follow-ons)

**v1 core:** `geocode-address.ts` (`geocodeAddress`) → `steadyapi.ts` (`fetchNearbyValues`, `fetchSoldEvent`) →
`comp-helper.ts` (`looksLikeCompAsk`, `extractAddress`, `compHelper` DI orchestrator, `renderCompBlock`, `compSources`) →
wire `compForConversation` into `conversation-path.ts`. Prose grounding (date-only, no source in prose) + accordion
(SWFL Data Gulf + realtor.com homepage) + lane-4 needs-block. Structural MLS/SteadyAPI scrub + the no-leak test.
**≤3 Steady calls/request** (1 nearby + ≤2 tax-history). Lee/Collier gate. All offline against the doc-JSON fixtures.

**Increment 2:** comps bar chart (subject vs comps) via the existing `{type:"chart"}` prelude frame, mirroring
`buildCompsSpec`.

**Increment 3:** user-pasted-link lane — SSRF-safe fetch (reuse the `safeLogoUrl`/`welcome_logo_ssrf_allowlist` posture:
http(s) only, block internal IPs) + reuse `listing-scrape.ts` to extract the pasted property → candidate comp cited to
that site's homepage; unreadable page → lane-4 ask for address+price. User-*typed* comps already relay today (no new code).

## Hard rules (locked by the operator — do not drift)

1. **Never say "SteadyAPI" anywhere** — prose, sources, logs-that-surface, nowhere. It's invisible plumbing.
2. **Prose = comps + MM/DD/YYYY only.** No source named in prose (not even realtor.com). Sources live only in the
   **collapsed accordion**: SWFL Data Gulf + realtor.com **homepage** (never the deep permalink).
3. **Never surface an MLS number** or any realtor.com id — scrub `property_id`/`listing_id`/`permalink`/`href`/`source.id`
   at the normalizer boundary (structural, not a prompt instruction).
4. **Lee (12071) + Collier (12021) only.** Anything else → the out-of-footprint needs-block, no Steady call.
5. **Never invent a number** — four-lane sourcing; a gap fills from the next lane or the user, never a refusal.
6. **No live SteadyAPI call without operator key authorization.** `PHOTOS_API` is Vercel env, NOT a repo secret. Build +
   test entirely offline against the doc-JSON fixtures. Live-verify (≤3 calls, no MLS#/SteadyAPI leak, MM/DD/YYYY) is the
   single gated item → close `steadyapi_comp_helper_live_verify` from prod.

## Definition of done — v1 core

- `bun test` green (gate + normalizer scrub + sold-event + call-cap + no-leak + render + empty-tolerance + Lee/Collier gate).
- `bunx next build` clean (per project rule: verify with next build, not bare tsc).
- No `data_lake.*` writes, no `/api/b/*` changes, no new package (pure fetch + existing deps) → RULE-1 "just push" docs/lib
  additions, but confirm with the operator before the first push touching the live answer engine (`conversation-path.ts`).
- SESSION_LOG entry + `steadyapi_comp_helper_live_verify` stays open until prod live-verify.
