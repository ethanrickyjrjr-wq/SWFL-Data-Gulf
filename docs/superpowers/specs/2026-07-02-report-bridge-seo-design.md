# Report→build bridge + SEO dressing (Lane C)

**Date:** 2026-07-02
**Status:** DESIGN — pending operator review of this doc before `writing-plans`.
**Parent:** `2026-07-02-commercial-spine-design.md` — Lane C ("report-bridge-seo"). Independent of D1/D2; D3 supplies the per-ZIP subscribe label.
**Scope:** `app/r/zip-report/[zip]/*` only, plus two small new shared files promoted out of route-local homes.
**Vendor-surface note:** no new vendor/API surface — every piece reuses an existing internal mechanism (RULE 0.5 probe, not RULE 0.4 crawl). No crawl4ai research pass required.

## Problem

`/r/zip-report/[zip]` is SWFL Data Gulf's highest-intent, highest-volume page shape (57 ZIPs × free organic search), but today it's a dead end: no SEO metadata (title/description are the Next.js default), no path from "I'm reading this" to "I built something from it," no reason to leave the page for another ZIP, and its subscribe CTA is the generic, non-ZIP-aware `DigestSubscribe` card. Three of these four gaps are pure loss (SEO, dead-end traffic, generic CTA); the fourth (build bridge) is the actual commercial lever the parent spec names this lane for.

## What already exists (RULE 0.5 probe results)

- **`OpenProjectCta`** (`app/welcome/_components/OpenProjectCta.tsx`) — POSTs `{zip, brand?, ref?}` to `/api/prospect/open-project`, which calls `planOpenProject` (`lib/prospects/open-project.ts`). That function is **already** seeded `{ template: "email", scopeKind: "zip", scopeValue: zip }` — i.e. it already builds exactly "a weekly branded email project for this ZIP." It mints a claim token and hands back `/claim?t=…`, which works unauthenticated (bounces through `/login?next=` then auto-claims) and authenticated (claims immediately). One current consumer: `app/welcome/page.tsx`. No test file.
- **`DigestSubscribe`** (`components/email/DigestSubscribe.tsx`) — already rendered on the zip-report page today as `<DigestSubscribe source="zip-report" />`, but generic: no ZIP awareness, no ZIP-specific label. Posts to `/api/email/subscribe`, which already accepts an optional `zip` in the body and stores it as `scope: {zip}` when in-scope — the wiring on the API side is already ZIP-aware; only the client call omits it today.
- **`generateMetadata`** — present on 4 sibling `/r/*` routes (`app/r/[slug]/page.tsx` is the closest analog) but absent from `app/r/zip-report/[zip]/page.tsx`.
- **`SWFL_ZIP_CENTROIDS`** (`lib/geo/zip-centroid.ts`) — lat/lng per in-scope ZIP, Census TIGER-derived. **`haversineMi`** exists but is private inside `refinery/lib/zip-resolver.mts` (used there for `resolveZipFromCoords`).
- **No county-level report route exists** — `/r/housing-swfl` etc. are SWFL-wide brain pages, not per-county. A "county rollup" link has no real target, so it is not part of this design (would be an invented link).

## Design

### 1. Build-bridge CTA

Promote `OpenProjectCta` from `app/welcome/_components/` to `components/prospect/OpenProjectCta.tsx` (no behavior change — it becomes a two-route shared component instead of a route-local one; `app/welcome/page.tsx` updates its import). Render it on the zip-report page inside a new banner section, positioned after the Southwest Florida dossier section and before `DigestSubscribe`:

- Heading: "Turn this into a weekly branded email"
- Blurb: "Free to build. We'll seed a project for {place}, {zip} — style it, then send whenever you're ready."
- `<OpenProjectCta zip={zip} />` — no `brand`/`refCode` (anonymous report visitor, not a funnel prospect carrying scraped brand attribution).

No new API route, no new data mechanism — this is pure UI wiring onto an already-built, already-tested-in-production bridge.

### 2. SEO metadata

Add `generateMetadata` to the page, mirroring the pattern in `app/r/[slug]/page.tsx`: pure, in-memory, uses `resolveZip` (same authority already called in the page body — no extra I/O).

- In-scope: title `"{place} {zip} Market Report — SWFL Data Gulf"` (fallback `"ZIP {zip} Market Report — SWFL Data Gulf"` if no resolved place name); description `"Home values, flood risk, and building permits for {place}, {zip} in {county} County, FL — cited to the source."`; canonical `https://www.swfldatagulf.com/r/zip-report/{zip}`.
- Out-of-scope or malformed ZIP: minimal fallback title only (`"ZIP Report — SWFL Data Gulf"`), no fabricated place name — mirrors the page body's own out-of-scope branch.
- **Out of scope for this lane:** JSON-LD / schema.org structured data. The lane brief says "metadata/titles for search," which `generateMetadata` covers. Structured data is a bigger, separate decision that should be done consistently across all `/r/*` pages (several already have it via `lib/jsonld.ts`'s `brainJsonLd`, which is brain-shaped and doesn't fit the zip-report's composite-of-three-brains shape without its own design pass) — noted as a follow-up idea, not a gap in this lane.

### 3. Neighbor-ZIP links

New pure helper `lib/geo/nearest-zips.ts`:

```
export function nearestZips(zip: string, count = 5): { zip: string; place: string | null; distanceMi: number }[]
```

- Export `haversineMi` from `refinery/lib/zip-resolver.mts` (currently private) instead of duplicating it; `nearest-zips.ts` imports it plus `SWFL_ZIP_CENTROIDS`.
- Selection: nearest-by-distance to the current ZIP's centroid, **cross-county allowed** (matches how a buyer actually thinks about "nearby," and avoids sparse/skewed results for the small counties — Glades/Hendry have very few ZIPs each). Excludes the current ZIP itself. Ties broken by ZIP string ascending (deterministic).
- Each result's `place` comes from `resolveZip(candidateZip)` (same call already used elsewhere on the page), so an unresolvable centroid never surfaces an invented place name — `place: null` renders as the bare ZIP.
- Render as a "Nearby ZIPs" link row (5 links to `/r/zip-report/[neighborZip]`) placed near the bottom of the page, after the Southwest Florida section and before the new build-bridge banner.

### 4. Per-ZIP subscribe button

`DigestSubscribe` gets one new optional prop: `presetZip?: string`. When supplied:
- The ZIP is sent in the POST body (`zip: presetZip`) without rendering the `activation` mode's ZIP input box or consent checkbox — this stays the lightweight, single-email-field digest opt-in (existing non-activation behavior), not the heavier "send my report" activation flow, since the user isn't being asked anything new (we already know the ZIP from the URL).
- `heading`/`blurb` props are overridden by the caller (already supported) to the D3 label: heading `"Subscribe to {zip}'s weekly read"`, blurb `"A short weekly market read for {place}, built and sent by our engine — see it before you build your own."`

Call site becomes `<DigestSubscribe source="zip-report" presetZip={zip} heading={...} blurb={...} />`, replacing the current generic call in place.

CAN-SPAM: unchanged — the component's existing footer (unsubscribe-anytime line + privacy-policy link) already satisfies D3's "CAN-SPAM basics only" requirement; no new consent text needed for this lightweight opt-in tier (consent-checkbox mode remains reserved for `activation`, used elsewhere).

## Page layout after this lane (bottom-to-top order of new/changed pieces)

1. (existing) Southwest Florida dossier section
2. (existing) `CitationList`
3. **NEW** "Nearby ZIPs" link row
4. **NEW** build-bridge banner (`OpenProjectCta`)
5. (changed) `DigestSubscribe` — now ZIP-aware, D3-labeled
6. (existing) `ColorLegend`, `ReportFooter`

## Testing

- `lib/geo/nearest-zips.test.ts` — pure function: correct count, excludes self, deterministic tie-break, cross-county inclusion, unresolvable-place → `place: null` never invented.
- `generateMetadata` — unit test asserting in-scope vs out-of-scope output shape (no live-render needed, same pattern as sibling routes if they have metadata tests; otherwise a plain function-level test against the exported logic).
- `DigestSubscribe` — existing coverage (if any) extended for the `presetZip` prop; otherwise a minimal new test confirming `presetZip` reaches the POST body and suppresses the activation-mode ZIP box.
- No test needed for the `OpenProjectCta` relocation itself (pure file move + import-path update, zero behavior change) — verified by `bunx next build` succeeding and the existing `/welcome` page continuing to render.

## Out of scope

- JSON-LD/structured data (noted above).
- Any change to `/api/prospect/open-project`, `/api/email/subscribe`, or `/claim` — all reused unmodified.
- A county-level rollup link (no target route exists; not invented).
- Lane D's actual weekly-read send mechanics — this lane only wires the *subscribe* capture, which already existed before this lane and is unchanged in its backend behavior.
