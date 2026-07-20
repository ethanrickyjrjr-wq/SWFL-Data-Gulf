# Lane 20 — EmailDoc schema strip-mode silent-drop audit

Question: does `lib/email/doc/schema.ts` strip-mode silently drop the fields a
"New Listing" build needs (photoUrl, price, beds/baths/sqft, subject address),
so the AI writes correct data that never renders? (= tonight's symptom)

## What I read
- `lib/email/doc/schema.ts` (all 562 lines) — the three schemas.
- `lib/email/doc/types.ts` `ListingProps` (198-208).
- `lib/email/doc/block-contract.ts` — BLOCK_CONTRACT / authorable flags.
- `lib/email/author-doc.ts` — AUTHOR_TOOL + assembleAuthoredDoc/buildEntry/applyContent.
- `lib/email/doc/default-docs.ts` — listing default props (79-87), `new-listing` seed (563-632).
- `app/api/email-lab/ai/route.ts` — routing (build:true → authorDoc).
- `lib/email/build-doc.ts` — HELD_FIGURE_KEYS (368-380), listing-flyer branch.

## The three schemas — where listing data fields live

1. FINAL doc schema `ListingPropsSchema` (schema.ts:140-151):
   HAS all fields — photoUrl, price, beds, baths, sqft, address, badge, linkUrl.
   Parity with `ListingProps` interface confirmed (types.ts:198-208). NOT a drop point.
   The final EmailDoc can hold a fully-populated listing.

2. AI content-patch schema `BlockContentPatchSchema` (schema.ts:401-414):
   Does NOT include photoUrl/price/beds/baths/sqft/address. z.object strip-mode →
   any such key the AI writes is DROPPED. **BY DESIGN.**

3. AI author schema `AuthoredBlockSchema` (schema.ts:489-541) + `AUTHOR_TOOL.input_schema`
   (author-doc.ts:182-345, `additionalProperties:false`):
   Also exposes NONE of the listing data fields. The author literally cannot emit them.
   **BY DESIGN.**

## Is the strip-mode a BUG? No — it is the moat, working as intended.

`build-doc.ts:368-380` `HELD_FIGURE_KEYS` names `price, beds, baths, sqft, address,
badge` verbatim, with the comment: "Held, number-bearing fields the AI may READ but
never WRITE... deliberately outside `BlockContentPatchSchema`, so a patch touching
them is stripped." photoUrl is an engine-owned URL, excluded from AI everywhere.

So price/beds/baths/sqft/address/photo are meant to be filled by a DATA-SEED step
(loadListingContext / listing-flyer / previewFill), NOT by the AI. The strip-mode
is the enforcement of that rule. The AI is NOT "writing correct data that gets
stripped" — the design forbids the AI from writing it at all; a data-seed must.

previewFill DOES data-seed listing blocks (preview-fill.ts:985-988 `case "listing"`
fills address/price). authorDoc has a dedicated listing-flyer branch
(build-doc.ts:726 `isListingIntent`) that scrapes a pasted URL → real photo/price/beds.

## Why tonight looked like a strip-drop (but isn't)

Routing: AI-build "Build the email" sends `build:true` → route.ts:165 `isAuthor` →
`authorDoc()` (the generic market AUTHOR path). If the typed request
("New listing announcement for 14189 Mindello Dr... real photo, real price/specs")
does NOT trip `isListingIntent` (which looks for a pasted listing URL, not a bare
address), it never enters the listing-flyer branch. The generic author then gets a
MARKET figure menu (no listing figures, no photo slot) and — correctly, per the
moat — cannot type the listing's price/beds/sqft/photo. Result: a market email.
The schema faithfully prevented invention; the LISTING RESOLUTION never happened.
=> Root cause is UPSTREAM (routing / subject-listing resolution), a sibling lane
(07-unrelated-zip-chart, 10-recipe-agent-launch). Schema = victim, not villain.

## REAL secondary defect this lane DID find (a latent strip trap)

`listing` is `authorable: true` (block-contract.ts:51-56) → it is in `AUTHORABLE_TYPES`
and offered to the author model as a legal block type. BUT:
  - `AuthoredBlockSchema` / `AUTHOR_TOOL.input_schema` expose ZERO listing fields, and
  - `buildEntry` (author-doc.ts:564-710) has NO `listing` case, and
  - `applyContent` (author-doc.ts:434-485) has NO `listing` case.
So an authored `listing` block falls to the `else` (author-doc.ts:685):
`props = defaultPropsFor("listing")` = all empty strings (default-docs.ts:79-87),
then `applyContent` does nothing for it → ships a HOLLOW listing card (no photo,
no price/beds/baths/sqft/address). This is a genuine "offered but un-fillable" trap.
It is NOT tonight's exact symptom (the generic author built market blocks, not a
listing block) but it WOULD reproduce it the moment the author selects `listing`.

Fix options (for the later fix pass, not now):
  (a) Make `listing` `authorable: false` in block-contract.ts (like `metric-card`) —
      it is data-seeded, not authorable; buildEntry already drops metric-card
      (author-doc.ts:582). Cheapest, removes the trap.
  (b) OR wire a real listing write-path (menu-select fields + a `case "listing"` in
      buildEntry) if authored listings are actually wanted.
Recommend (a): matches the moat (listing data is held/seeded), one-line change,
mirrors the metric-card precedent already in the file.

## Verdict
rootCauseFound (for THIS lane's hypothesis "schema strips correct AI listing data"):
FALSE. The strip-mode is correct/by-design; listing data is data-seeded, never AI-written.
Separate real defect found: `listing` authorable:true with no author write-path (latent
hollow-card trap). Tonight's primary cause is upstream listing-resolution/routing.
