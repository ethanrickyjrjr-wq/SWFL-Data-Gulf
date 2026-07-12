# Captured listing/comp links + link audit + send fallback ladder

**Date:** 2026-07-12 (brainstormed 07/11/2026)
**Build slug:** `email-link-destinations` · check: `email_link_destinations_live_verify`

## Problem

A user-sent email today can carry a button that looks clickable and isn't (ButtonBlock renders a
label with no URL as button-styled plain text), a listing card with no click-through, and comps
with no links at all. Nothing warns the user. The operator's requirements (07/11/2026):

1. We never send an email with a link that doesn't work.
2. Listing and comp links are PRESET from the address the user picked; a user-typed link overrides.
3. Any other slot that needs a URL asks the user through a popup.
4. Comps in a listing email must not advertise purchasable competitors.

## Evidence (verified in-session 07/11/2026, RULE 0.4/0.5)

- **SteadyAPI returns the realtor.com listing permalink.** `/v1/real-estate/search` returns
  `permalink` as the full detail URL (`https://www.realtor.com/realestateandhomes-detail/<slug>`);
  `/nearby-home-values` (the comp lane) returns the same in bare-slug form
  (`765-Geary-St_San-Francisco_CA_94109_M24733-64190`). Verified against docs.steadyapi.com via
  crawl4ai. Our normalizers currently parse the address out of it and DROP the URL
  (`lib/listings/steadyapi.ts:82-87` and the `normalizeNearbyComp` scrub).
- **Permalinks are capture-only.** The slug ends in realtor.com's internal property id
  (`_M54931-01642`) — not derivable from an address. An address-constructed URL is an invented link.
- **No construct-and-verify lane exists.** realtor.com bot-blocks automated fetches (probed live —
  block page). Links must be captured from API responses, never built and "checked".
- **`/nearby-home-values` supports `status=sold`** (docs: `for_sale`, `off_market`, `sold`,
  default all), and the chat comp helper (`lib/assistant/comp-helper.ts:231-265`) ALREADY defaults
  to sold comps with ≤2 exact recorded-sale enrichments (`fetchSoldEvent`). The email flyer's
  area-page active-listings scrape (`lib/email/listing-comps.ts` `fetchAreaComps`) is the outlier.
- **Recurring schedules rebuild per occurrence** (`scripts/email/run-schedules.mts` →
  `buildContentDoc`), so comps + captured links refresh together each send. Sequence one-shots are
  frozen at schedule time (operator-locked 07/05/2026) and keep their captured links.
- **The URL allowlist gate** (`lib/deliverable/url-lint.ts`) admits any href that appears verbatim
  in the doc/snapshot/branding — captured permalinks stored on the doc pass it with no gate change.

## Decisions (operator, 07/11/2026)

- **MLS-scrub unlock:** `permalink` is now CARRIED through both SteadyAPI normalizers as a
  functional link field. `listing_id`, `href`-other-than-permalink, and `source.id` stay dropped.
  Citations are unchanged: comp/listing citations still read "SWFL Data Gulf" / domain-level
  realtor.com — the permalink is where the reader GOES, not what we cite.
- **Comp source for listing emails: sold comps** (same lane as chat). Active comps in a listing
  email advertise the competition; sold comps justify the price.
- **Comp links → the realtor.com sold page** (captured permalink). Independent proof; a sold home
  can't detour a buyer. Known caveat: realtor.com pages show "similar homes nearby" — accepted.
  User can override any comp's link (an override replaces the row's URL; it is user-owned/sticky).
- **Popup scope: click-promising slots only** — a labeled `button` with no URL, a `listing` card
  with no `linkUrl`, a `multi-column` column with a `linkLabel` and no `linkUrl`. Decorative
  wrap-links (hero/text/image `linkUrl`) stay optional and never nag.
- **Send-gate floor: fallback ladder, never a hard block, never a dead button.**

## What we're building

### 1. Permalink capture (`lib/listings/steadyapi.ts`)

- New pure helper `canonicalRealtorUrl(permalink: string): string | null` — full-URL form passes
  through; bare-slug form becomes `https://www.realtor.com/realestateandhomes-detail/<slug>`;
  anything else (empty, unparseable) → null. Unit-tested on both doc shapes.
- `normalizeResult` (search lane): keep the URL as `Listing.sourceUrl?: string` (type lives in
  `lib/listings/` `Listing`; additive, optional).
- `normalizeNearbyComp` (comp lane): keep it as `NearbyComp.sourceUrl?: string | null`. Rewrite the
  scrub comment to name the 07/11/2026 unlock. `listing_id` / `source.id` still dropped;
  `propertyId` still internal-only.

### 2. Sold-comp flip for the listing flyer (`lib/email/build-doc.ts` flyer branch)

- Replace `fetchAreaComps`/`deriveAreaUrl`/`buildCompsSpec` in the flyer branch with the sold-comp
  lane: geocode the subject address (the same geocode the comp helper uses), call
  `fetchNearbyValues({status:"sold"})`, enrich ≤2 with `fetchSoldEvent` — reusing the comp-helper's
  fetch/enrich seam (extract its fetch+enrich core into a shared function if the chat wrapper
  doesn't export one; ONE comp source, one authority).
- Chart: "Recent sales near <subject street>" — subject bar = list price, labeled "(Subject —
  asking)"; comp bars = sold price where held, else AVM estimate/last-list, with the bar label
  carrying the honest kind (the comp-helper's `PriceKind` labeling already does this). Citation:
  same domain-level realtor.com/SWFL Data Gulf citation shape used today; as-of = the build date,
  stated MM/DD/YYYY by the existing chart renderer.
- Comp rows: a `list` block under the chart, title "Recent sales nearby", one row per comp —
  `lead` = sold price + date (MM/DD/YYYY), `text` = street address. Per-row links: `list` items
  have no link field today, so EXTEND `ListItem` with optional `linkUrl` (additive; schema +
  renderer + AI-strip parity — `linkUrl` joins the strip-mode-dropped keys like every other link
  field). Rows render "View →" only when a captured URL exists; a comp with no permalink renders
  without a link, never an invented one.
- `fetchAreaComps` and its helpers retire from the flyer path. `lib/email/listing-comps.ts` is
  deleted if nothing else imports it (verify with grep at implementation time).

### 3. Subject-link preset (engine-owned, model never writes URLs)

- Pasted-URL flow: `facts.sourceUrl` (already returned) presets the `listing` block `linkUrl` and
  the hero photo link (hero already does this).
- Address-click flow (SteadyAPI lookup): the captured `Listing.sourceUrl` presets the same slots.
- Button preset order for a LISTING email with no user/brand CTA: subject listing page. (An
  engine-set `mailto:` reply CTA still survives `applyBrand`, unchanged.)
- All presets are written into doc fields at assembly — they pass `url-lint` verbatim.

### 4. Post-build link audit + popup (new `lib/email/link-audit.ts` + lab UI)

- Pure `auditDocLinks(doc): LinkAsk[]` — one entry per click-promising slot (scope above):
  `{ blockId, blockType, label, suggestions: LinkSuggestion[] }`. Suggestions assembled from what
  the caller holds: subject listing page (if held), brand website (footer `websiteUrl`),
  reply-by-email (`mailto:` the sender address the blast already uses), hosted report page
  (`/p/{id}` when a deliverable id exists).
- Lab: after a build resolves (and before send), if the audit is non-empty, ONE modal lists every
  ask — a text input plus suggestion chips per row. Answers write through the existing
  inspector-write path into user-owned sticky fields. Dismissing the modal leaves slots empty
  (the send gate is the floor, not the modal).

### 5. Send gate with the fallback ladder (blast + claim-and-send + scheduled paths)

- Shared pure `applyLinkFallbacks(doc, ctx): { doc, applied: AppliedFallback[] }` — for each
  unresolved ask, fill the first available rung: subject listing page → brand website →
  `mailto:` reply → `/p/{id}`. `/p/{id}` and `mailto:` always exist at blast time, so the ladder
  cannot come up empty there.
- `POST /api/deliverables/[id]/blast` and `claim-and-send`: run the audit server-side after the
  existing URL lint; apply the ladder; include `applied` in the response so the UI can toast what
  was auto-filled. Never 4xx for a missing link (the 422 stays reserved for the invented-URL lint).
- Scheduled occurrences + sequence one-shots (no human present): apply the ladder inside the
  occurrence build, log one line per applied fallback. A cron send never blocks on a link.
- Renderers stay pure and unchanged EXCEPT the dead-button case can no longer reach them from a
  send path; the lab preview keeps today's render (label-as-text) so the user can SEE the gap the
  modal is asking about.

### 6. Refresh behavior (no new machinery)

- Recurring schedules: the occurrence rebuild re-runs the sold-comp fetch — new sales appear,
  links re-capture in the same response, chart/rows/links never skew.
- Frozen one-shots: captured links ship as frozen; realtor.com detail pages persist after close.

## Non-goals

- No change to citations (domain-level, ONE root) or to the chat comp helper's answer shape.
- No realtor.com scraping, no constructed URLs, no link "verification" fetches.
- No tracked-link (`/api/r`) expansion — user-send click tracking is a separate open check.
- No popup for decorative wrap-links; no link asks in the social/PDF surfaces beyond what the
  shared doc already carries.

## Testing

- `canonicalRealtorUrl`: full-URL pass-through, slug promotion, garbage → null.
- steadyapi scrub tests updated: `sourceUrl` carried on both lanes; `listing_id`/`source.id`
  still never present (the existing scrub test's assertion list gains the new field).
- `auditDocLinks`: labeled-button-no-URL flagged; unlabeled button not flagged; listing card
  without link flagged; hero/text/image wrap-links never flagged; multi-column label-no-URL flagged.
- `applyLinkFallbacks`: ladder order; `/p/{id}` terminal rung; idempotent on a fully-linked doc.
- Comp `list` block build: sold-enriched row shows sold price + MM/DD/YYYY; AVM row labeled as
  estimate; permalink-less comp renders without a link.
- Schema parity: `ListItem.linkUrl` round-trips; AI content-patch strips it (schema.test.ts
  pattern).
- `url-lint`: a doc with captured permalinks passes; a hand-constructed realtor.com URL NOT in the
  doc data still strips/fails.
- Verify with `bunx next build` (never `npx tsc`) + the touched unit suites.

## Files touched (expected)

`lib/listings/steadyapi.ts` · `lib/listings/rentcast.ts` (the shared `Listing` interface lives
there — additive `sourceUrl?` field) ·
`lib/assistant/comp-helper.ts` (export the fetch+enrich core) · `lib/email/build-doc.ts` ·
`lib/email/listing-flyer.ts` · `lib/email/doc/types.ts` + `schema.ts` + `blocks/ListBlock.tsx` ·
new `lib/email/link-audit.ts` · `app/api/deliverables/[id]/blast/route.ts` ·
`app/api/lab/claim-and-send/route.ts` · `lib/email/emaildoc-occurrence.ts` ·
lab modal component under `components/email-lab/` · tests beside each.
