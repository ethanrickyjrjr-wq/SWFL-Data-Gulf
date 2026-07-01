# On-demand comp helper (SteadyAPI Sole-Spine — Phase 2B)

**Date:** 2026-06-30 · **Slug:** `steadyapi-comp-helper` · **Area:** `lib/assistant` (answer engine) + `lib/listings` + `lib/geo`
**Status:** Design approved (Ricky, 06/30/2026). No code yet — this is the spec a fresh Claude turns into an implementation plan.

## Problem

When a user asks the assistant to value or comp a property ("what are comps near 3412 Atlantic Circle, Cape Coral?"),
the answer engine has nothing to answer with: the four-lane cascade holds ZIP/county aggregates, not per-property
comps, and the assistant has **no street-address grain at all** today — `lib/zip-dossier.ts` returns
`{ kind: "address-unsupported" }` (the deliberately-deferred "pre-geocoder" gap), which `conversation-path.ts` maps
to an out-of-scope reply. So a comp ask dead-ends.

## Goal

A collaborative, on-demand comp path wired into the live answer engine that pulls **real** nearby comps for a
**Lee or Collier** address, states them in plain text with an as-of date, cites them in the collapsed sources
accordion, and — when it can't finish — says exactly what it needs so the user can fill the gap. Never invents a
number; never leaks an MLS number or the data vendor's name.

## Verified vendor contracts (crawl4ai on docs.steadyapi.com, 06/30/2026 — RULE 0.4 evidence, do NOT re-fetch to plan)

Base `https://api.steadyapi.com/v1/real-estate` · auth `Authorization: Bearer ${PHOTOS_API}` · Cloudflare-fronted
(browser UA + `Origin`/`Referer` = `steadyapi.com`, already handled by `lib/listings/steadyapi.ts` `BROWSER_HEADERS`).
Rate limit 15 req/sec. Every endpoint weight 1. No webhooks / no delta cursor → request-time polling only.

**`GET /nearby-home-values?lat=&lon=&radius=&status=&limit=`** — the comp source, **1 call**. `radius` default `5mi`;
`limit` default 25, max 100; `status` ∈ {for_sale, off_market, sold} (omit = all). Response:
```
body.statistics.list_price      { min, max, avg, median }
body.statistics.estimated_value { min, max, avg, median }
body.statistics.status_counts   { for_sale, sold, ... }
body.properties[] = {
  property_id, listing_id, status,           // ids: internal join only — NEVER surfaced
  list_price,                                 // last list price (NOT the sold price)
  href, permalink,                            // realtor.com URL + M-code slug — NEVER surfaced
  address: { line, city, state_code, postal_code },
  description: { beds, baths (string, e.g. "2.5"), sqft, lot_sqft },
  estimates: { best: { value, date }, all: [{ value, date }, ...] }   // realtor.com AVM
}
```
**Key fact that drives the design:** `/nearby-home-values` carries **last list price + AVM estimate + status**, but
**NOT the recorded sold price/date** for sold comps. Exact sold price requires the +1 call below.

**`GET /property-tax-history?propertyId=`** — exact sold price+date, **+1 call per chosen comp**. Response:
```
body.property_history[] = { date, event_name ("Listed"|"Sold"|"Price Changed"|...), price, price_change,
                            source_name, listing: { list_date, ... } }
```
The most-recent `event_name == "Sold"` row gives the exact **sold price** (`price`) + **sold date** (`date`). Also the
source of the legacy `list_date`.

**`GET /similar-homes?propertyId=`** and **`/gallery-similar-homes`** — REJECTED as the comp source: both are keyed by
`propertyId` (needs a prior lookup we don't have from a typed address), are "algorithmically similar" not "nearby,"
and *also* lack the sold price. `/gallery-similar-homes` carries `primary_photo` + a `source.id` board code (another
id to scrub). Reserve `/gallery-similar-homes` as a later photo-enrichment only.

**Mapbox forward-geocoding (Mapbox docs MCP, 06/30/2026):** address→lat/lon is **temporary geocoding**, Mapbox's
default mode — their own doc lists "real estate search" and "one-time address lookups" as the canonical temporary use
cases. It is free at our volume; only **permanent** geocoding (`permanent=true`, for *storing* coordinates in a DB)
is billed. **Guard: never pass `permanent=true`, never persist the coordinate** — use it transiently to call Steady,
then drop it. `MAPBOX_TOKEN` already exists server-side (`lib/listings/aerial.ts`).

## Locked operator decisions (06/30/2026)

1. **Scope: Lee (12071) + Collier (12021) only** for now — not the full six-county footprint.
2. **Subject resolution: geocode the typed address** (Mapbox), built so a project-subject fallback is a trivial later add.
3. **Output: prose grounding + collapsed sources accordion.** Chart is Increment 2. User-link lane is Increment 3.
4. **Branding (hard):** **never say "SteadyAPI" anywhere** (not prose, not sources, nowhere). In prose, state comps +
   the **MM/DD/YYYY** date only — **no source named in prose** (not even realtor.com). Sources ride only in the
   **collapsed accordion**, limited to **SWFL Data Gulf** (swfldatagulf.com) and, because the AI reached the internet
   for it, the **realtor.com homepage** (`https://www.realtor.com` — homepage only, never the deep permalink).
5. **Never surface an MLS number** — or any realtor.com id (`property_id`/`listing_id`/`permalink`/`source.id`).
6. **Sold-price enrichment** capped so a request is **≤3 Steady calls** (1 nearby + ≤2 tax-history on the top sold comps).
7. **Can't-finish → say what it needs** (lane 4), never a silent no-op.

## Architecture

A structural twin of the existing `webFallbackForConversation` (`lib/assistant/web-fallback.ts` + its two hook points in
`lib/assistant/conversation-path.ts`): cheap gate → fetch live → render a grounding block the model reads + a
`{type:"sources"}` frame → append/push at the same seams. Everything degrades to empty and the normal answer still streams.

New units:

- **`lib/geo/geocode-address.ts`** → `geocodeAddress(text): Promise<{ lat; lon; matchedAddress; county } | null>`
  Mapbox forward-geocode, FL-bounded, **temporary** (no `permanent=true`, not stored), empty-tolerant (null on any
  failure). Derives county (Mapbox context or ZIP→county via `fixtures/swfl-zip-county.json`) so the caller can enforce
  Lee/Collier. The assistant's first street-address resolver.

- **`lib/listings/steadyapi.ts`** (extend the existing client) →
  - `fetchNearbyValues({ lat, lon, radius?, status?, limit? }): Promise<NearbyComp[]>` — one `/nearby-home-values` call,
    normalized + **MLS-scrubbed at the boundary** (ids/permalink/href/source.id dropped; only address line, beds/baths/
    sqft, list_price, AVM estimate+date, status, distance survive). Reuses `PHOTOS_API` auth + `BROWSER_HEADERS` +
    hour-cache + never-throws pattern already in the file.
  - `fetchSoldEvent(propertyId): Promise<{ soldPrice; soldDate } | null>` — one `/property-tax-history` call, reads the
    latest `event_name == "Sold"` from `property_history`. `propertyId` is a function arg only; it never appears in output.

- **`lib/assistant/comp-helper.ts`** (the web-fallback twin) →
  - `looksLikeCompAsk(question): boolean` — cheap regex gate (comps / comparable / "what's X worth" / "value of" /
    estimate + an address-ish signal). Zero latency on non-comp asks.
  - `extractAddress(question): string | null` — pull the address span to geocode.
  - `compHelper(question, deps): Promise<CompResult>` — DI orchestrator (inject geocode/fetchNearby/fetchSold for tests):
    gate → extract → geocode → **Lee/Collier check** → `fetchNearbyValues` → keep top N nearest → enrich top 1–2 **sold**
    comps via `fetchSoldEvent` (≤3 total Steady calls) → return `{ comps[], asOf, needs[] }`.
  - `renderCompBlock(result): string` — grounding block: "these are comparable nearby properties as of MM/DD/YYYY;
    state them in plain text with the date; do NOT name any website, data provider, or MLS; never invent a number." Plus
    a **needs** branch (lane 4) when `needs[]` is non-empty. Contains **no** "SteadyAPI"/"realtor.com" strings for the
    model to echo.
  - `compSources(result): WelcomeSource[]` — `[{ SWFL Data Gulf, swfldatagulf.com }, { realtor.com, https://www.realtor.com }]`
    for the collapsed accordion, via the one citation root (`components/CitationList.tsx` / `lib/citations/clean-url.ts`).

- **`lib/assistant/conversation-path.ts`** (edit) — a `compForConversation(lastUser, ...)` call beside
  `webFallbackForConversation` at the two existing hook points; **composes with**, does not replace, web-fallback.

## Data flow

`looksLikeCompAsk` (gate) → `extractAddress` → `geocodeAddress` (1 free Mapbox call, temporary) → Lee/Collier gate →
`fetchNearbyValues` (1 Steady call: statistics + up to 25 comps) → top N nearest → optional `fetchSoldEvent` on the top
1–2 sold comps (≤2 Steady calls) → `renderCompBlock` appended to the system prompt + `compSources` pushed as a
`{type:"sources"}` prelude frame. Hard cap **3 Steady calls / request**; nearby is hour-cached; the gate keeps non-comp
asks at zero cost.

## Branding + MLS scrub (structural, not AI-trust)

The scrub is at the normalizer boundary — ids/permalink/href/source.id are dropped so they are **never in the surfaced
object** and cannot reach an answer (this is the "structural guarantee, not AI virtue" posture). The grounding block
carries only comp facts + the as-of date + the "don't name the source in prose" instruction, and contains no vendor
strings. A unit test asserts **no output string contains "steadyapi" (case-insensitive)** — belt-and-suspenders, like the
existing `display-leak.test.mts` wall. Accordion sources are homepage-only (`https://www.realtor.com`, never the M-code
permalink) and never include SteadyAPI.

## Error handling → lane-4 "what I need to finish"

Every fetch returns `[]`/`null` on any failure (no key, non-200, quota, bad body) and never throws. Instead of a silent
no-op, `compHelper` returns a precise `needs[]`, rendered as an ask-the-user block (mirrors web-fallback's `unfound` lane):

- **Couldn't pin the address** (incomplete, or a neighborhood not a street): ask for the full street address + city/ZIP.
- **Pinned but outside Lee/Collier**: "I'm running comps for Lee and Collier right now — what's the Lee or Collier address?"
- **Fewer than ~2 nearby comps**: offer to widen the radius, or invite the user to add comps they know.
- **Thin subject detail**: offer to tighten if they add beds/baths/sqft.

**The user fills the gap two ways:** (a) reply with the address/ZIP → next turn geocodes cleanly; (b) type comps they
already know (property + price) → a **valid lane** under the no-invention contract ("a figure you gave us"), relayed as
*figures you provided* and chartable through the assistant's existing user-figure chart path — no new code for that.

## Increments (one spec, sequenced so nothing is vaporware)

- **v1 core** — geocode a Lee/Collier address → `/nearby-home-values` (+ ≤2 `/property-tax-history` for exact sold) →
  prose grounding (date-only, no source named in prose) + sources accordion (SWFL Data Gulf + realtor.com homepage) +
  the lane-4 needs-block. Structural MLS/SteadyAPI scrub + the no-leak test. Fully offline-tested; **live-verify is the
  one gated item.**
- **Increment 2** — comps bar chart (subject vs comps) via the existing chart frame (mirror the labs' `buildCompsSpec` in
  `lib/email/listing-comps.ts`), emitted as a `{type:"chart"}` prelude frame.
- **Increment 3** — the user-pasted-link lane: SSRF-safe fetch (reuse the `safeLogoUrl` / `welcome_logo_ssrf_allowlist`
  posture — http(s) only, block internal IPs) + reuse `lib/email/listing-scrape.ts` (JSON-LD `PostalAddress`/offers +
  Haiku fallback) to extract the pasted property → fold in as a candidate comp cited to **that site's homepage**; if the
  page can't be read → lane-4 ask for address + price. User-*typed* comps already relay today (no new code).

## Testing (all offline — zero live Steady calls) + the one live gate

Fixtures are the **verbatim docs response JSON** captured in the contracts section above. Unit coverage:
- `looksLikeCompAsk` gate (comp asks true; small-talk false).
- `fetchNearbyValues` normalizer: no `property_id`/`listing_id`/`permalink`/`href`/`source.id` in any output field.
- `fetchSoldEvent`: latest "Sold" event → correct sold price + date; no Sold event → null.
- ≤3 Steady-call cap holds (assert call count with injected fakes).
- **No-leak test:** no `renderCompBlock`/`compSources` output string contains "steadyapi" (case-insensitive).
- `renderCompBlock` content: comps + MM/DD/YYYY, no vendor name in prose; needs-block wording per failure mode.
- Empty-tolerance per failure mode (no key / non-200 / bad body → `[]`/null, answer still streams).
- Lee/Collier gate: a Sarasota/Charlotte address → the out-of-footprint needs-block, no Steady call.

**Live-verify (gated on operator SteadyAPI key authorization — same gate as all of Phase 2):** one comp request →
cited nearby comps, ≤3 calls, no MLS# and no "SteadyAPI" leak, date as MM/DD/YYYY. Check `steadyapi_comp_helper_live_verify`.

## Constraints inherited (do not violate while planning/building)

- **No live SteadyAPI call without operator key authorization** — `PHOTOS_API` is a Vercel env var, NOT a repo secret
  (`gh secret list` has no PHOTOS/STEADY entry). Keep calls minimal. All build + tests are offline against fixtures.
- **Never surface an MLS number** — internal join key only.
- **Never invent a number** — four-lane sourcing; a gap fills from the next lane or the user, never a refusal.
- **`lib/assistant` conventions** (`lib/assistant/CLAUDE.md`): plain text (no blockquotes/tables), no `§`/pack-ids/tier
  codes/`master` leakage, dates MM/DD/YYYY (never the raw `SWFL-…-YYYYMMDD` token), never frame as "ZIP-level".

## Out of scope (tracked, not built here)

- Project-subject fallback (option 3) — trivial later add on the same `compHelper` seam.
- `/similar-homes` / `/gallery-similar-homes` photo enrichment.
- Organic sold-lake capture (Phase 2 Part A — a separate ingest build, serial after Phase 1).
- Email Lab / Social RentCast→Steady rewire (check `email_social_steadyapi_rewire`).
