# Build 2 — Grounded Just-Sold email builder (HANDOFF SPEC)

**For:** a fresh Claude executing this build. **Slug:** `sold-email-builder`.
**Check:** `sold_email_builder_live_verify` (open). **Status:** designed, not built.
**Parent epic:** `docs/superpowers/specs/2026-07-01-new-listing-lifecycle-project-design.md` (Build 2 of 5).
**Depends on:** Build 1 (`2026-07-01-listing-project-address-design.md`) for the saved subject address →
property resolution. Can partly stand alone from a pasted sold-listing URL.
**Research:** `_ASSISTANT/research/2026-07-01-listing-lifecycle-marketing-research.md` (the Just-Sold stage =
social proof + a sold recap; the comps/compare angle is the highest-engagement message).
**Memory:** [[project_new-listing-lifecycle-project]], [[feedback_listing-citations-say-swfl-data-gulf]].

Re-open every `file:line` before editing (verified 07/01/2026).

---

## Goal

A first-class **Just-Sold email** built from REAL recorded-sale data — the current gap. Today "just sold"
routes to the generic listing flyer (`listing-intent.ts:13` matches "just sold" but
`build-doc.ts:355-396` builds a `buildListingFlyer`), and the only sold layouts are static placeholder
presets (`default-docs.ts:179,744`, `$512K` stand-ins). The sold *data* already exists but is unwired to any
builder. This build adds `buildSoldEmail` grounded in the recorded sale, plus the intent/route fork.

Leads with **Just Sold → recorded sale price + sale date → address → beds/baths/sqft**, a short social-proof
recap, and (reusing Build-1/comp data) a **comps/market recap** (e.g. "sold in N days; area median $X"). One
photo if available (Build 1 single-photo rule). Framing: positive/social-proof by default; downside angles
only if the user asks; **never invent a sale figure** — no recorded sale → a cited lane-4 need, not a guess.

---

## Current state (verified seams)

- **Template to clone:** `buildListingFlyer(facts, current)` (`lib/email/listing-flyer.ts:31-94`) — pure,
  returns a NEW `EmailDoc`, keeps the agent's sticky brand blocks (`keepOrDefault`), invents nothing. Block
  order: header → hero photo (`facts.photos[0]`) → hero (price + address) → stats (beds/baths/sqft, never a
  0) → text (`facts.remarks` verbatim, clamped 2000) → agent-card → button (CTA to `facts.sourceUrl`) →
  footer.
- **Facts shape:** `ListingFacts` (`lib/email/listing-scrape.ts:22-40`): address/city/state/zip, `price`
  (verbatim string), beds/baths/sqft, remarks, `photos: string[]`, lat/lon, `sourceUrl`.
- **Sold data:** `SoldEvent = { soldPrice: number; soldDate: string /* ISO */ }`; `parseSoldEvent` (pure,
  `steadyapi.ts:301`) + `fetchSoldEvent(propertyId, deps?)` (`steadyapi.ts:321`) — one SteadyAPI
  `/property-tax-history` call, needs `process.env.PHOTOS_API`, **empty-tolerant → null** (no key / non-200 /
  no Sold event). Consumed today ONLY by `comp-helper.ts`.
- **How a `propertyId` is obtained:** `NearbyComp.propertyId` (`steadyapi.ts:219`) from
  `fetchNearbyValues({lat, lon, ...})` (`steadyapi.ts:262`). There is **no subject-property lookup** that
  returns the subject's own `propertyId` — this is the main data seam to close (see Design §Data).
- **Intent/route:** `isListingIntent` (`listing-intent.ts`) requires a URL AND listing wording (incl "just
  sold"/"open house"); the branch in `build-doc.ts:355-396` builds the flyer + comps chart.

---

## Design

### The builder — `buildSoldEmail(subject, sold, comps, current)`
New pure function beside `listing-flyer.ts` (e.g. `lib/email/sold-email.ts`). Mirror `buildListingFlyer`'s
sticky-brand pattern (`keepOrDefault` for header/agent-card/footer, new `globalStyle` clone). Blocks:
1. header (kept).
2. hero photo — `subject.photos[0]` if present (single-photo rule; no gallery).
3. hero — kicker **"Just Sold"**, value = **recorded sale price** (`sold.soldPrice`, formatted USD), label =
   address. NOT the list price.
4. stats — beds/baths/sqft (only cells we have; never a 0), and optionally a "Sold" cell = sale date
   (MM/DD/YYYY, converted from `sold.soldDate` ISO — never the raw token).
5. text — a short social-proof recap. If an AI narrative is wanted here, it may only use REAL numbers
   (sale price/date, DOM, area median from comps); no invented superlatives about price. Default positive.
6. comps recap (optional) — reuse `buildCompsSpec`/comp data (Build-1 comp seam) for an "area context" chart
   or line ("sold vs N nearby active/sold, area median $X"). Cited "SWFL Data Gulf".
7. agent-card (kept) → CTA (e.g. "Thinking of selling? See what your home could bring" → agent) → footer (kept).

Signature (indicative):
```ts
export function buildSoldEmail(
  subject: ListingFacts,            // address, beds/baths/sqft, photos, sourceUrl (list page)
  sold: SoldEvent,                  // recorded soldPrice + soldDate (the grounding fact)
  comps: Comp[] | null,             // optional area context (reuse comp data)
  current: EmailDoc,                // sticky brand/agent/footer source
): EmailDoc
```

### Data — resolving the sale (the risk)
The recorded sale comes from `fetchSoldEvent(propertyId)`. Getting the **subject's** `propertyId`:
- **Preferred (with Build 1):** the saved subject address → geocode → a SteadyAPI subject lookup returning
  `propertyId` (+ facts + photo). This needs a small **subject-lookup helper** (new; the existing
  `fetchNearbyValues` returns *neighbors*, not the subject). Add `fetchSubjectProperty({lat,lon}|address)` in
  `lib/listings/steadyapi.ts` returning `{ propertyId, facts, photoUrl }` (empty-tolerant → null).
- **Standalone (pasted URL):** scrape `ListingFacts` from a sold-listing URL for the subject facts, but the
  **recorded sale** still comes from `fetchSoldEvent` (the list page shows list price, not the county-recorded
  sale). If `propertyId` can't be resolved, or `fetchSoldEvent` returns null → build the email with a cited
  lane-4 `[Need: recorded sale price + date for {address}]` line; **never invent the sale**.

### Intent + route fork
- Split "just sold" out of the generic flyer branch: in `build-doc.ts` (near :355), when the prompt is a
  **sold** intent (a `isSoldIntent` helper, or a `stage:"sold"` signal once Build 3 exists), route to
  `buildSoldEmail` instead of `buildListingFlyer`. Add `isSoldIntent(prompt)` to `listing-intent.ts`
  (matches "just sold"/"sold"/"closed") — but keep it distinct so a generic listing ask still flyers.
- Retire the placeholder `$512K` presets (`default-docs.ts:179,744`) as the default sold path once the
  grounded builder ships (leave the layout as a fallback skeleton only).

---

## Constraints
- **Four-lane / no-invention:** the sale price/date MUST come from `fetchSoldEvent` (county-recorded) or a
  figure the user supplies — never invented, never the list price relabeled as "sold". Missing → lane-4
  `[Need: …]`. Cited "SWFL Data Gulf", dates MM/DD/YYYY.
- **Framing (operator):** social-proof/positive by default; a "why it may not have been a strong sale" angle
  only if the user asks, and only from real numbers (e.g. sale vs area median) — guard omits, never errors.
- **PHOTOS_API gating:** `fetchSoldEvent`/subject lookup are empty-tolerant; with no key they return null and
  the builder degrades to lane-4 — the build never crashes and never blocks (RULE 0.7). Live SteadyAPI calls
  are operator-run (`sold_email_builder_live_verify`); do NOT spend paid calls to "verify".
- **Offline verification only:** `bunx next build` + `bun test` (inject `fetchSold`/`fetchImpl` in tests —
  no live call). Commit + SESSION_LOG, STOP for push.
- **Isolation:** worktree; explicit staging; parallel sessions active in email/social.
- Extend existing seams; no new mandatory gate (RULE 3 C2). Never surface "SteadyAPI" in output.

## Test plan (offline, TDD)
1. `parseSoldEvent` already tested — reuse. `buildSoldEmail(subject, {soldPrice:512000, soldDate:"2026-06-10"},
   null, doc)` → hero kicker "Just Sold", value "$512,000", sale date rendered "06/10/2026", address label,
   stats for present cells only, sticky header/agent/footer kept, `globalStyle` cloned.
2. No recorded sale → `buildSoldEmail` (or the route) emits a lane-4 `[Need: recorded sale price + date …]`
   line and NEVER a fabricated/relabeled list price. Assert the doc contains no invented number.
3. `isSoldIntent("we just sold 123 Main St")` true; a generic listing ask still routes to the flyer (no
   regression to `isListingIntent`).
4. Subject-lookup helper (if added) empty-tolerant: no key / no match → null; builder degrades to lane-4.
5. `bunx next build` clean; touched-file tests green. No live model/SteadyAPI call.

## Acceptance criteria
- A sold prompt (or a "build sold email" action) produces a Just-Sold email grounded in the recorded sale
  price + date, or a cited lane-4 need — never an invented/relabeled figure.
- Positive/social-proof framing by default; downside only on request, from real numbers.
- Generic listing asks still flyer (no regression). All offline checks green; nothing pushed without
  operator confirmation.

## Files (create/modify)
- Create: `lib/email/sold-email.ts` (`buildSoldEmail`) + `lib/email/sold-email.test.ts`.
- Modify: `lib/listings/steadyapi.ts` (add `fetchSubjectProperty` subject-lookup, empty-tolerant) + its test.
- Modify: `lib/email/listing-intent.ts` (`isSoldIntent`) + test; `lib/email/build-doc.ts` (sold route fork).
- Optionally trim: `lib/email/doc/default-docs.ts:179,744` (placeholder sold presets → fallback only).

## Next after Build 2
Build 3 (stage gameplan — makes "build sold email" a stage action) → Build 4 (social per stage) → Build 5
(lake→product read path, so a real `active→sold` transition auto-offers this email). See the parent epic.
