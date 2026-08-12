# HANDOFF — wire the ZIP that already exists into Listings Digest's build path

**Written 08/12/2026.** Read this before touching the /go door, `heroDestination`, or
`listings-digest` again — a prior pass in this same session got the diagnosis wrong once and
this corrects it. Operator, after being told "no ZIP resolver exists": *"which makes no sense,
but it is what it is"* — he was right to be skeptical. One exists. It's just not wired through.

---

## 0 — SCOPE CORRECTION (read this first)

This was never about `/go` specifically. Operator: *"we are building it for showcase, what are
you talking about? i never said go had it. We just build emails through swfldatagulf, so it
shouldn't be hard if we already did it."* `/go` is one door into the same email-lab build path
every other door uses — the fix here is generic (`heroDestination`, used by every hero/pill
door, not a `/go`-only file). Fixing it fixes every caller, not a special case.

**Showcase is done, separately, already shipped.** `public/new-emails/listings-digest-email.html`
+ its preview thumbnail + the `NEW_EMAIL_FILE_FOR_KEY` registry entry are committed and verified
live in `/showcase` (commit `8f70f58f`). That part of the original ask is closed. This handoff is
only about making the recipe **buildable** again through the real product, not the showcase card.

## 1 — WHY THE 08/03 PROOF-SEND ISN'T A COUNTEREXAMPLE

The original real send (Resend id `b6de57eb`, "30 homes in Fort Myers", ZIP 33919, 08/03/2026)
did **not** go through any UI door — `/go` did not exist yet (`components/go/OneClickHero.tsx`
was created 08/10/2026, confirmed via `git log --diff-filter=A`). The build plan
(`docs/superpowers/plans/2026-08-03-listings-digest-grid.md`, lines 938-947) shows it was a
throwaway, gitignored dev script (`scripts/email/tmp-listings-digest-send.mts`, pattern
`tmp-*.mts` — never committed by design) with **the ZIP hardcoded as a literal**. Nothing about
that build proves the normal product path ever worked; it proves a developer could always
sidestep the gap by writing the ZIP directly into code, same as this session's own
`render-listings-digest.mts` does tonight.

## 2 — THE CORRECTED DIAGNOSIS: A RESOLVER EXISTS, IT'S JUST NOT WIRED

**A prior check this session (`listings_digest_zip_resolution_missing`, now closed) claimed no
city→ZIP resolver exists anywhere in the codebase. That was wrong** — found by grepping the
wrong layer (`lib/geo/`) and stopping there instead of checking the address-pick API itself.

`/api/address-retrieve` already resolves a real ZIP for whatever the user picked, city or
street address alike:

- `lib/geo/search-box.ts` `parseRetrieve(json)` reads Mapbox's `context.postcode.name` off the
  retrieve response and returns `{ name: string; zip: string | null }` (lines 58-79).
- `app/api/address-retrieve/route.ts` calls it, resolves `in_scope` off the same zip via
  `resolveZip`, and its own comment says outright: *"the ZIP is what the email lab's prebuild
  needs."*
- The URL-param plumbing to CARRY a zip into the lab already exists and is used elsewhere:
  `openZipLab`, `recipeDestination` (already accepts `carry.zip`), and `anonymousLabArrival`
  (`lib/lab-entry/destination.ts`) all thread a `?zip=` param through today — this is how the
  homepage map / ZIP-report click already works.

**So this is a wiring gap, not a missing feature.** Three concrete points, in order:

1. **`components/go/OneClickHero.tsx`'s `pick()` function reads only `json.name` from the
   retrieve response and discards `json.zip`.** Fix: capture it into state alongside the typed
   query text.
2. **`heroDestination` (`lib/campaigns.ts:124-153`) has no `zip` parameter at all** — even a
   captured zip has nowhere to go. It builds the URL from `recipe` + `input`/`filled` only. Fix:
   add an optional `zip` to `opts`, and when present, `params.set("zip", zip)` — mirroring
   exactly what `recipeDestination` already does one file over.
3. **`EmailLabGridClient.tsx:464-470` only builds `scope: {kind:"zip", ...}` when
   `plan.doc.kind === "zip"`** — a THIRD gate, computed by `planArrival` from the arrival
   classification, not simply "is a zip prop present." **NOT YET VERIFIED**: whether an
   area-keyed recipe arrival (`recipeInputKind === "area"`) from `/go` would actually produce
   `plan.doc.kind === "zip"` once points 1-2 are fixed, or whether `planArrival`
   (`lib/lab-entry/arrival.ts`) needs its own adjustment for this case. Read that function's
   `doc.kind` derivation before assuming points 1-2 alone are sufficient — this is the one part
   of the chain this session did not trace to the end.

## 3 — SEPARATE, GENUINE UNCERTAINTY: DOES A CITY EVEN HAVE ONE ZIP?

Mapbox's `postcode` context for a `place`/`locality`-type result (a bare city, not a street
address) may be null, or may return only ONE zip for a city that structurally spans many —
Fort Myers alone covers roughly a dozen. **Not verified this session** whether Mapbox's
city-level postcode is reliably present/correct, or degrades silently to null for a bare city
query (which would make points 1-2 above necessary but not sufficient).

**Operator's fallback if that turns out to be the case, verbatim:** *"We can just add a Zip Code
Listing Digest below if we can't do Zips from mapbox."* — i.e., a second, explicit menu entry
(or a plain ZIP input field) that takes a real 5-digit ZIP directly from the user, sidestepping
city-level ambiguity entirely rather than trying to guess a single ZIP for a multi-ZIP city.
Cheap, honest, and avoids inventing a "the" ZIP for a place that doesn't have exactly one.

## 4 — NEXT SESSION, IN ORDER

1. Verify Mapbox's `postcode` context for 2-3 real city-only queries (Fort Myers, Cape Coral,
   Naples) — log actual responses, don't assume either way (§3).
2. If it's reliably present: wire points 1-2 in §2 (capture + carry the zip), then verify §2
   point 3 (`planArrival`'s `doc.kind` classification) actually cooperates — trace
   `lib/lab-entry/arrival.ts` for the `"area"` input-kind case specifically.
3. If city-level ZIP is unreliable: build the operator's fallback instead — a ZIP-direct
   Listings Digest entry point, no city geocoding involved.
4. Either way, drive it live in a browser before calling it done (`feedback_render-and-look`) —
   this session proved twice that a code-reading conclusion and a live network capture disagreed
   on this exact recipe.
5. Close `listings_digest_zip_wiring_gap` with real evidence, not a static-analysis claim.

## 5 — WHAT NOT TO RE-DERIVE

- Showcase capture: done, don't rebuild it (`8f70f58f`).
- `render-listings-digest.mts`: real, committed, working acceptance script — use it to verify
  any fix without needing a live `/go` walkthrough every time.
- The recipe builder itself (`buildListingsDigest`) is NOT broken — every live test this session
  that supplied a real zip directly (bypassing the UI) produced a correct, fully-populated email.
  The defect is entirely upstream of the builder, in how (or whether) a zip reaches it.
