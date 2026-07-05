# Address spine: typed address resolves to property + comps in the builder

**Date:** 2026-07-05
**Check:** `address_spine_live_verify`
**Parent design:** `2026-07-05-agent-first-homepage-design.md` (build 2 of the approved 5-build ladder — the design decision and research evidence live there; this doc pins build-2 mechanism only).

## Problem

A typed listing address reaches the email builder as prose in the AI prompt and nothing more. The live-verified address→comps engine (`lib/geo/geocode-address.ts` → `lib/assistant/comp-helper.ts` → `lib/listings/steadyapi.ts`) is siloed in the chat answer engine; `projects.subject_address` is read by no builder. So a "new listing" or "just sold" email carries area-grain figures only — never the listing's own nearby sold set — and a scheduled listing email can't refresh its comp set.

## Goal

When a build carries an address (hero flow, or a listing project's saved `subject_address`), the figure menu additionally contains up to 6 nearby SOLD comps — each a cited figure (price kind tagged: recorded sale / estimate / last list; sources per the comp rules: never the vendor name, never an MLS id) — and every scheduled occurrence re-pulls that comp set at send time for free, because the fetch lives inside the builder's one data feed.

## Mechanism (all extension, no new gate — RULE C2)

1. **`compsForAddress(address, deps)`** — extract the post-parse core of `compHelper` (geocode → Lee/Collier gate → nearby sold → ≤2 sale enrichments, ≤3 vendor calls total) into a reusable function; `compHelper` delegates. Pure refactor, existing DI tests keep passing.
2. **`lib/email/address-context.ts` (new)** — `loadAddressFigures(address)` → `MarketFigure[]`: one figure per comp (`key: comp_N`, label = address line + beds/baths/sqft + price-kind wording, value = price, source = "SWFL Data Gulf · realtor.com", as_of = the price date or call date). Empty-tolerant; out-of-footprint or geocode miss → `[]`.
3. **`BuildScope.address?: string`** (`lib/email/build-doc.ts:73`) — enrichment field beside kind/value (kind stays `"zip"`; nothing branching on kind changes). `fetchLakeParts` merges `loadAddressFigures(scope.address)` into the figure feed — which makes authorDoc, buildContentDoc, the social calendar's shared freshness root, AND every scheduled occurrence inherit address comps with zero scheduler changes.
4. **Carry the address into scope** — (a) anonymous hero: `heroDestination` adds `addr=` for the three listing chips; the grid page threads `?zip=`/`?addr=` into the shell's scope; (b) signed-in listing project: the project email tab adds `address: project.subject_address` where it already builds the scope prop.
5. **Occurrence refresh** — nothing to build: the EmailDoc schedule lane re-runs `buildContentDoc` with the deliverable's frozen scope. Freeze `scope_address` alongside `scope_kind`/`scope_value` IF the deliverable save path already persists a scope object; if it requires a DB column, defer the frozen-address piece to a follow-up check and rely on (4b) — the project-tab rebuild path — for refreshed listing sends. Decision made at execution against the live schema (probe step in the plan).

## Hard lines

- **No subject-property value estimate, ever** (parent spec; Reddit blowup evidence). Comps are the neighbors' recorded sales — the subject gets no AVM figure.
- Vendor never surfaced: no "SteadyAPI" string in any figure label/source; no MLS/property ids (already scrubbed at the normalizer).
- Empty-tolerant everywhere: no address, bad address, out-of-footprint, vendor down → the build proceeds exactly as today.
- ≤3 vendor calls per build (the compHelper cap, inherited).

## Success criteria

- Hero → New Listing with a real Lee/Collier street: the authored email can cite nearby sold comps (visible in the figure menu / sources list).
- `compHelper` chat behavior byte-identical (existing tests green).
- A scheduled listing email's occurrence rebuild pulls fresh comps (proven via the occurrence build path in a test with injected deps).
- `bunx next build` green; `address_spine_live_verify` closed by operator on prod.
