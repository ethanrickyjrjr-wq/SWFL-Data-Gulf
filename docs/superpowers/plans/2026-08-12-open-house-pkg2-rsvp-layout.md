# PLAN — Package 2: RSVP beside the date/time card; bottom button → realtor.com listing

> **Recommended model:** ⚡ Sonnet — keywords: schema, breaking









**Written 08/12/2026.** Scope: §"Package 2" of
`docs/handoff/2026-08-12-open-house-build-plan-parallel-sonnet-assignments.md`, governed by
`docs/handoff/2026-08-12-open-house-and-build-ai-grounding-handoff.md` §1d/§1e (cited, not
re-derived where they hold — see below for where they don't). This is a PLAN ONLY. No source
edits, no builds, no commits were made while writing it.

**Tool note (RULE 0.8, honest gap):** the hosted graphify MCP tools
(`gx_callers`/`gx_impact`/`gx_find`/`gx_tests_for`/`gx_rank_files`) were not resolvable via
`ToolSearch` in this session — three query variants all returned "No matching deferred tools
found." Every structural claim below (callers, callees, blast radius) is Grep/Read-verified
instead, per RULE 0.5's fallback clause, and is called out inline as Grep-sourced, not
graph-sourced.

---

## ⛔ BLOCKED ON THE OPERATOR — DO NOT START EDITING UNTIL "Open questions #1" IS ANSWERED

This is not a stylistic caveat at the bottom of the doc. The literal package ask ("RSVP beside the
card" + "a separate bottom button to realtor.com") requires shipping a second button on an email
that:

1. **Its own recipe's header contract forbids this exact shape.** `open-house.ts:60-62`:
   *"FRAMING — the 'Open House' ribbon, the address over the price, **one RSVP CTA**. The CTA asks
   for the NEXT ACTION (tell me you're coming), **never points at what they are already
   reading**."* `lifecycle-chrome.ts:144-145` (the shared chrome's own doc comment on `ctaLabel`):
   *"It must ask for the NEXT ACTION — never point at what the reader is already looking at."* A
   "View the Full Listing" button on an email that already shows the photo, price, spec strip, and
   the seller's own verbatim description is exactly what both lines forbid, in the words used to
   forbid it.
2. **A locked, cross-recipe test enforces exactly one CTA** (`campaign-coherence.test.ts:123`),
   and the playbook states the same rule as "already enforced by the chrome — **keep it that
   way**" (`email-build-playbook.md:812-813`).
3. **This session's own fresh research reconfirms the same finding** the same day this package
   was assigned (`_RESEARCH/email-and-social/2026-08-12-open-house-invitation-craft.md` §2a:
   "371% more clicks... with a single, focused CTA").

This plan's recommended design (below) reconciles the literal ask against all three WITHOUT
requiring a code change to the locked test — but it still ships a second button in one real
state, and that is a genuine exception to a rule three independent sources say to keep. **Do not
start implementing until the operator has answered "Open questions #1."** Everything below this
line is written so implementation is a small diff either way he answers.

---

## ⚠ COLLISION RISK — READ BEFORE ANY OTHER SESSION TOUCHES THESE FILES

The handoff scopes Package 2 to **one file**: `lib/deliverable/recipes/open-house.ts`. **That
scope is not achievable for the "beside" half of the task.** Positioning a block beside another
in this codebase is expressed exclusively through `PlanEntry.span`/`newRow`
(`lib/email/doc/finalize-doc.ts:51-65`), and the vocabulary a recipe is handed for its own
`middle` content — `ChromeBlock` (`lib/email/lifecycle-chrome.ts:70-74`) — **does not expose
`span` or `newRow` today.** Every `middle` block is hardcoded full-bleed, forced-new-row
(`lifecycle-chrome.ts:296`: `for (const m of chrome.middle ?? []) entries.push(row(m.block,
m.height ?? 5));`, and `row()` = `cell(block, height, GRID_COLS, true)`). This is deliberate
design ("It does not say WHERE" — `ChromeBlock`'s own doc comment), not an oversight, but it
means **"RSVP beside the date/time card" cannot be built without also editing
`lib/email/lifecycle-chrome.ts`.**

**Files this plan touches outside the stated scope, and why:**

1. **`lib/email/lifecycle-chrome.ts`** — extend `ChromeBlock` with two OPTIONAL fields
   (`span?`, `newRow?`), defaulting to today's exact values (`GRID_COLS`, `true`) when omitted.
   Zero other recipe passes these fields today, so this is additive and backward-compatible —
   pinned by a new test (see TDD below). **Not claimed by any of the other 3 parallel packages**
   (Package 1: `AddressPopup.tsx`/`EmailLabGridShell.tsx`; Package 3:
   `app/api/email-lab/ai/route.ts`/`lib/project/digest.ts`; Package 4: `lib/deliverable/
   recipes/shared.ts`/`lib/narratives/validate.ts`/`scripts/email/render-open-house.mts`) — low
   collision risk in practice, but it is a real edit to a file every one of the other six
   listing-lifecycle recipes also depends on. **If another session is mid-edit on this file,
   stop and worktree-isolate (RULE 1.5) before continuing.**
2. **`lib/deliverable/recipes/open-house.test.ts`** — the recipe's own unit-test sibling. Not
   claimed by any other package, but not literally named in the handoff's file list either.
3. **`scripts/email/render-open-house.mts`** — explicitly SHARED with Package 4 per the
   assignment brief. This plan claims **assertion numbers 9 and 10**; see "Acceptance" for the
   collision this creates against Package 4's own handoff text (which also says "assertion 9").
4. **`lib/deliverable/campaign-coherence.test.ts`** — REQUIRED, not optional (corrected after
   review — see below). This plan's conditional design means the shared cross-recipe fixture
   never exercises the two-button state, so the existing count assertion (`toBe(1)`, line 123)
   stays green untouched — but "doesn't break under fixture blindness" is not the same claim as
   "the invariant holds." A dedicated new test case, specific to `open-house` with a date/time
   supplied, is added to THIS file (not the shared per-key loop) so the two-CTA exception is
   visible next to the rule it's an exception to, not hidden in a recipe-only test file. See TDD
   and edit list below.

**`lib/deliverable/recipes/open-house.ts` remains the only file with a REQUIRED functional
change under this plan's recommended design** (see "Reconciling the two-CTA question," below,
for why). The lifecycle-chrome.ts edit is required infrastructure to make that possible.

---

## THE CENTRAL FINDING THE HANDOFF DID NOT SURFACE

The handoff's failure-modes list for Package 2 (three items: position literal, `applyBrand`
clobber, two-CTA confusion) is **out of date on one of the three and silent on the one that
actually matters most.**

### 1. The `applyBrand` "clobber" failure mode describes DEAD code, not live risk

Handoff: *"`applyBrand`'s single global `website_url` override clobbers the realtor.com URL."*

Read live at `lib/email/brand/apply-brand.ts:74-109`. The single-global-override behavior is
explicitly gone — the comment at line 75 reads **`// WAS: if (cta && !mailto) props.url = cta`**
and describes it as a defect fixed on 08/03/2026 (SESSION_LOG.md:5703, 6137). The live code
resolves every button's destination **by `role`** via `resolveButtonDestination`
(`lib/email/button-destinations.ts:230-255`), and when a role's `resolveButtonDestination` call
returns `open-slot` (nothing saved, and the role forbids a website/house fallback),
`apply-brand.ts:108` explicitly **leaves whatever the engine set** — it does not blank it, and it
does not overwrite it with the brand website. The real risk is narrower and different: **a new
button that doesn't set `props.role` defaults to `primary-cta`** (`buttonRoleOf(undefined) ===
"primary-cta"`, `button-destinations.ts:185-189`), which **does** allow a website/house fallback
— so an unlabeled new button silently inherits brand-website behavior it was never meant to have.
That is the guard this plan actually needs (see table below), not the one the handoff named.

### 2. The bottom button's role is ALREADY correct — the real gap is the recipe never asks for the realtor.com URL

`lifecycle-chrome.ts:354-377` — the chrome's own bottom CTA cell (shared by all 7 lifecycle
recipes) **already hardcodes `role: "listing"`** (`usesWebsiteDefault: false`, `usesHouseFallback:
false` — `button-destinations.ts:64-69`), specifically so a listing button can never silently
degrade to a homepage. **This part needs no fix.** What Open House does today
(`open-house.ts:189-208`) is pass `ctaLabel: "RSVP for the Open House"` /
`ctaUrl: rsvpUrl(currentDoc, facts)` into that slot — `rsvpUrl` (`open-house.ts:144-148`) resolves
to the agent's own `agent-card.ctaUrl`, or else **`facts.sourceUrl`** — and `sourceUrl` is
documented, in the same file, as **"the citation… legitimately holds our own site"**
(`listing-scrape.ts:73-76`). So today's bottom button is never a realtor.com link at all; it is
RSVP wearing a role built for something else.

**The established, tested, already-shipped fix exists and is reused nowhere in Open House:**
`listingButtonUrl(facts)` (`lib/listings/listing-url.ts:58-73`) is the one root for "where does
this listing live on the public internet" (explicit ladder: agent's pasted link → the paid row's
`property_url`, verbatim, never derived → null; **never** `sourceUrl` when it resolves to our own
site — enforced by the `OUR_SITE` regex at line 50). New Listing already calls it
(`lib/email/listing-flyer.ts:297`, ctaLabel `"View the Full Listing"`). Open House should call the
same function — not build a second implementation, and not rely on `sourceUrl`.

### 3. The real conflict: literal "beside the card, AND a second bottom button" breaks a LOCKED, evidenced, cross-recipe invariant the handoff never checked

`lib/deliverable/campaign-coherence.test.ts:121-123` (a shared test over all 7 lifecycle
recipes, not owned by any single package):

```ts
expect(s.filter((x) => x === "button").length, `${key}: exactly ONE call to action`).toBe(1);
```

This is not incidental — `docs/standards/email-build-playbook.md:812-813` states the same rule in
the universal rules section: *"**ONE CTA.** 'When we've tried to cram multiple CTAs into one
message, performance drops across the board.' **Already enforced by the chrome — keep it that
way.**"* And this session's OWN research file
(`_RESEARCH/email-and-social/2026-08-12-open-house-invitation-craft.md` §2a) independently found
the same thing crawled fresh today: *"emails with ONE CTA saw 371% more clicks and 1617% more
sales than multi-CTA emails."*

Taken literally, "RSVP beside the card" + "a SEPARATE bottom button to realtor.com" is two
buttons — which is exactly the shape three independent sources (a locked test, the playbook, and
this package's own research file) say not to ship. The handoff's failure-modes list gestures at
this ("two buttons read as two CTAs → RSVP stays the single primary") but never checks it against
`campaign-coherence.test.ts`, and its own §2 calls the bottom-button destination "**decided, not
open**" without reconciling it against the "keep it that way" line the SAME research corpus
backs.

**This plan does not resolve that conflict by assertion. It proposes a design that satisfies the
literal decree without breaking the locked invariant AS WRITTEN, and flags the one place it still
deserves an explicit operator sign-off. See "Open questions," below.**

---

## Current state, verified

- **`dateTimeCard()`** — `lib/deliverable/recipes/open-house.ts:124-140`. Signature: `export
  function dateTimeCard(facts: ListingFacts): ChromeBlock | null`. Returns `null` when neither
  `openHouseDate` nor `openHouseTime` is set; otherwise a `signal`-type `ChromeBlock` with
  `height: 3`.
  - **One caller, confirmed by Grep** (graphify unavailable this session — see tool note above):
    `buildOpenHouse()`, same file, line 175 (`const card = dateTimeCard(facts);`). The only other
    reference is a direct unit-test import (`open-house.test.ts:122`), which is a test caller, not
    a production one.
  - **One callee, confirmed by Grep**: `createBlock("signal")` (`lib/email/doc/default-docs.ts`,
    referenced inline at `open-house.ts:130`). The function does nothing else.
  - **This confirms the handoff's §1d claim exactly as stated** for the function itself. It does
    **not** confirm the corollary the handoff implies ("so this layout change is narrow") — the
    narrowness is true of the function's call graph, not of the layout change the package asks
    for, which lives one layer up in `lifecycle-chrome.ts` (see collision-risk section above).

- **`buildOpenHouse()`** — `open-house.ts:167-296`. Builds `middle: card ? [card] : []`
  (line 203), then calls `buildLifecycleEmail` with `ctaLabel: "RSVP for the Open House"`,
  `ctaUrl: rsvpUrl(currentDoc, facts)` (lines 206-207).

- **`rsvpUrl()`** — `open-house.ts:144-148`. `card?.props.ctaUrl?.trim() || facts.sourceUrl ||
  undefined`, reading the agent-card block already on the canvas.

- **The chrome's bottom CTA cell** — `lifecycle-chrome.ts:354-377`. Unconditional: every
  lifecycle recipe gets exactly one `type: "button"` block here, `role: "listing"` hardcoded,
  span `5`, sharing a row with `agent-card` (span `7`), pinned by
  `lifecycle-chrome.test.ts:109-134` ("uses a BLESSED span pair… `{7,5}`, NOT `{8,4}` — settled
  by rendering it… 'RSVP for the Open House' broke over three lines" at `{8,4}`). **This is
  directly reusable evidence for the new beside-button's width — see "Step-by-step edit list."**

- **`ChromeBlock`** — `lifecycle-chrome.ts:70-74`. `{ block: Omit<EmailBlock, "layout">; height?:
  number }`. No `span`, no `newRow`. The `middle` loop (`lifecycle-chrome.ts:296`) always calls
  `row(m.block, m.height ?? 5)` = full-bleed, forced new row, for every entry.

- **`BLOCK_CONTRACT`** (`lib/email/doc/block-contract.ts:39-112`) — `signal` and `button` are
  both zone `"body"` (lines 48, 98). `sortEntriesByZone` (`finalize-doc.ts:139-146`) is a
  **stable** sort, so two same-zone entries keep their push order. Confirmed: pushing
  `[dateTimeCard, rsvpButton]` into `chrome.middle` in that order, and leaving the chrome's
  existing push order otherwise untouched, reproduces exactly "beside the card, ahead of the
  narrative" with no other block reordering.

- **`design-system-reachability.test.ts`** (`lib/email/design-system-reachability.test.ts:194-217`)
  — asserts `lifecycle-chrome.ts` and every listing recipe (including `open-house`) contain no
  `layout:\s*\{` literal. The `ChromeBlock` extension proposed here only threads `span`/`newRow`
  through the EXISTING `cell()` helper (which already writes no `layout:` literal — the literal is
  minted only in `finalize-doc.ts:195`), so this guard is unaffected. Confirmed by reading
  `cell()`'s body (`lifecycle-chrome.ts:168-184`): it returns a `PlanEntry`, never a `layout`
  object.

- **`listingButtonUrl()`** — `lib/listings/listing-url.ts:58-73`. Ladder: `facts.listingUrl` →
  `facts.sourceUrl` (only if it does NOT match `OUR_SITE`, `/^https?:\/\/(www\.)?swfldatagulf\.com\/?$/i`)
  → `null`. Already reused by `listing-flyer.ts:297` for New Listing's "View the Full Listing"
  button and its photo `linkUrl` (line 305) — Open House's photo `linkUrl` currently uses
  `facts.sourceUrl` directly (`open-house.ts:195`), the same "our own site as a listing
  destination" pattern `listing-url.ts`'s own header comment names as the exact bug it was built
  to fix. **This is a real inconsistency, but it is NOT a no-risk one-liner** — corrected after
  review: `open-house.test.ts:233-241`, `test("the photo is the record's own, and links to the
  citation", …)`, asserts `img.props.linkUrl === "https://www.swfldatagulf.com"` against the
  `SHORE_DR` fixture (whose `sourceUrl` IS that URL). Swapping to `listingButtonUrl(facts)` would
  turn that into `undefined` for the same fixture (no `listingUrl`, and `sourceUrl` is rejected by
  `OUR_SITE`) — a named, tested, intentional decision reversed, not merely a gap closed. **Dropped
  from this plan's required edit list; carried as a separate, explicitly-flagged open question**
  (see "Open questions #4") rather than bundled in silently.

- **`open-house.test.ts:351-362`** — `test("ONE CTA, and it is an RSVP", …)` asserts `buttons`
  (filtered `type === "button"`) has length **exactly 1**, using the `SHORE_DR` fixture, which
  carries **no** `openHouseDate`/`openHouseTime`. Under this plan's conditional design (below),
  this exact test **stays green with zero edits**, because the two-button state only exists when
  a date/time is held.

- **`campaign-coherence.test.ts:41-54`** — its shared `FACTS` fixture likewise carries no
  `openHouseDate`/`openHouseTime`. Under this plan's conditional design, open-house's button count
  in that shared test **stays 1**, so **no edit to that file is required.** (Verified by reading
  the fixture directly, not assumed.)

---

## Reconciling the two-CTA question — the design this plan recommends

**Condition the second button on the SAME fact that creates the "moment": the date/time card
itself.**

- **No date/time held** (`dateTimeCard(facts) === null`): behavior is **byte-identical to
  today.** `middle` stays empty. The chrome's one bottom CTA stays `"RSVP for the Open House"` /
  `rsvpUrl(...)`. Exactly one button, exactly as `campaign-coherence.test.ts` and the existing
  `open-house.test.ts` "ONE CTA" test already pin. **The "ONE CTA… keep it that way" rule holds
  in this state without exception.**
- **Date/time held** (`dateTimeCard(facts)` returns a card): the RSVP button moves to sit BESIDE
  that card (`{7,5}`, card left / button right — see edit list), and the vacated bottom slot
  becomes `"View the Full Listing"` → `listingButtonUrl(facts)`. **Two buttons only in this
  state**, and only because there are now genuinely two distinct things worth a click: a specific
  moment to RSVP to, and a property to read more about. This is a deliberate, narrow, named
  exception — not a blanket loosening of the "one CTA" rule for every recipe or every state.

This reconciliation is why the required edit footprint is smaller than a literal reading of the
package title would suggest: `campaign-coherence.test.ts` needs **no behavioral change** (its
fixture never exercises the two-button state), and neither does the existing `open-house.test.ts`
"ONE CTA" test. **New coverage is still needed** to pin the exception itself — see TDD below —
otherwise the two-button state exists in the recipe but is asserted nowhere.

**This is still presented to the operator as an open question, not shipped silently** — see
"Open questions." The reconciliation avoids breaking a locked test, but it is still a real,
if narrowly-scoped, exception to a rule stated in the playbook as "keep it that way," and that
line was written by/for the operator, not by this session.

---

## Failure modes → guards

| # | Failure mode | Source | Guard | Mechanism |
|---|---|---|---|---|
| 1 | Recipe writes a position literal instead of expressing "beside" via span/order | Handoff | `design-system-reachability.test.ts` already fails on any `layout:\s*\{` in `open-house.ts` or `lifecycle-chrome.ts` | Existing test, unaffected by this plan (confirmed above) — no new guard needed, just don't regress it |
| 2 | **A new button omits `props.role` and silently inherits `primary-cta`'s website/house fallback** — the REAL applyBrand risk, not the dead "global override" the handoff named | Found this session, `apply-brand.ts:92-109` + `button-destinations.ts:185-189` | Unit test asserting the beside-button's `props.role === "booking"` on the doc BEFORE `applyBrand` runs, so the omission is caught at the recipe layer, not discovered later at overlay time | New test, `open-house.test.ts` |
| 3 | Two buttons read as two competing CTAs, breaking the "ONE CTA" doctrine and the locked `campaign-coherence.test.ts` count | Handoff (under-specified) + this session's finding | Condition the second button strictly on `dateTimeCard(facts) !== null` (see "Reconciling," above); new test pinning BOTH states (0-extra and 1-extra) | New tests, `open-house.test.ts`; existing tests in `campaign-coherence.test.ts` and `open-house.test.ts`'s "ONE CTA" case stay green unedited |
| 4 | Bottom button silently degrades to our own site (`sourceUrl`) instead of the real listing, or to nothing when it should show an open slot | This session's finding (`rsvpUrl` reused `sourceUrl`, which `listing-url.ts` exists specifically to avoid) | Use `listingButtonUrl(facts)`, the established root, not `sourceUrl` directly; assert its RENDERED href, never the recipe's pre-brand value (handoff's own instruction, still correct) | New acceptance assertion, `render-open-house.mts` #9 |
| 5 | `ChromeBlock`'s new `span`/`newRow` fields change behavior for the other 6 lifecycle recipes that never set them | This session's finding (the collision-risk file) | Default `span ?? GRID_COLS`, `newRow ?? true` in the `middle` loop — byte-identical to today when omitted; regression test asserting this explicitly | New test, `lifecycle-chrome.test.ts` |
| 6 | The photo's `linkUrl` still points at our own citation page (`sourceUrl`) — NOT fixed by this plan; see "Open questions #4." Left in the table so it isn't lost, not as a guard this plan implements | This session's finding, corrected after review (it breaks a named test, `open-house.test.ts:233-241` — not a free alignment) | Deferred to the operator; no code change in this plan | N/A this package — candidate for its own small follow-up once #4 is answered |
| 7 | The beside-button's width/label combination has never been rendered together with a `signal` block at span 7 — the campaign's own history (`lifecycle-chrome.ts:320-325`) shows this EXACT label broke at `{8,4}` | This session's finding | RENDER IT AND LOOK at `{7,5}` before calling this done — see Acceptance | Manual render step, not automatable |
| 8 | **CORRECTED after review — the forcing function is real, just not named what the doc comment claims.** `lib/email/doc/types.ts:421-422` cites `button-roles.test.ts`, which does not exist by that name; but `lib/email/button-destinations-wiring.test.ts:358-401`, `describe("every button EMITTER declares a role", …)`, IS live: it `git grep`s every `type: "button"` emitter under `lib/` (including untracked files) and fails if no `role:\s*"` literal appears within the next 14 source lines. It already asserts `lifecycle-chrome.ts` is a tracked emitter (line 384) | This session's finding, corrected mid-session | The new `rsvpButton()` in `open-house.ts` MUST write `role: "booking"` as a literal string inside the same `props` block as `type: "button"` (not computed, not a variable) or this EXISTING test fails CI on the new code | Existing test, `button-destinations-wiring.test.ts` — no new guard needed, just don't regress it |
| 9 | `role: "booking"` couples the RSVP button to whatever an agent has ALREADY saved under that role for an unrelated email (e.g., a "Book a call" CTA elsewhere) — `usesWebsiteDefault: true` (`button-destinations.ts:70-75`) also means a bare website is enough to silently redirect it, no explicit save required | Found this session, per-review | Not fixed by this plan — named so it's a known, accepted trade-off rather than a silent one. See "Open questions #2" for the alternative (a dedicated `"rsvp"` role) | Documented trade-off, not a code guard |

---

## TDD sequence

All new tests are RED before the corresponding implementation step, GREEN after. Existing tests
named below are asserted to need NO EDIT — that claim is itself tested by running the full
existing suite before and after (see Acceptance).

1. **`lib/email/lifecycle-chrome.test.ts`** — new `describe("middle blocks may share a row")`:
   - `test("a middle ChromeBlock with newRow:false sits beside the preceding one, at the given span")`
     — build a minimal chrome with `middle: [{block: signalBlock, height: 3, span: 7, newRow:
     true}, {block: buttonBlock, height: 2, span: 5, newRow: false}]`; assert both blocks share
     `layout.y`, first is `x: 0, w: 7`, second is `x: 7, w: 5`.
   - `test("a middle ChromeBlock with no span/newRow reproduces today's full-bleed, own-row default")`
     — build with `middle: [{block: X, height: 5}]` (fields omitted); assert `layout.w === 12`
     and that it opens its own row relative to whatever preceded it in `middle`.
   - RED before: `ChromeBlock` has no `span`/`newRow` fields, so passing them is either a type
     error or (if cast) silently ignored by the current `row(m.block, m.height ?? 5)` call —
     either way the first test fails. GREEN after: `middle` loop updated (see edit list).

2. **`lib/deliverable/recipes/open-house.test.ts`** — new tests, existing tests untouched:
   - `test("no date/time held → RSVP stays the sole bottom CTA (regression against the ONE-CTA rule)")`
     — reuses `SHORE_DR` (no date/time); asserts `buttons.length === 1`, label `"RSVP for the Open
     House"`, no `signal` block, no second button anywhere. (This is a NEW explicit pin of a
     behavior the existing "ONE CTA" test already covers implicitly — written so the exception
     below has a paired "off" test in the same file.)
   - `test("date/time held → RSVP ships BESIDE the moment's card, and the bottom CTA becomes the real listing")`
     — facts = `{...SHORE_DR, openHouseDate: "Sat, Jul 19", openHouseTime: "1–4 PM", listingUrl:
     "https://www.realtor.com/realestateandhomes-detail/x"}`; asserts:
     - `buttons.length === 2`
     - the button sharing `layout.y` with the `signal` block has `props.label === "RSVP for the
       Open House"` and `props.role === "booking"`
     - the OTHER button has `props.label === "View the Full Listing"` and `props.url ===
       "https://www.realtor.com/realestateandhomes-detail/x"`
     - the beside button's `layout.x === 7`, `w === 5` (matches the card's `x:0, w:7`)
   - `test("date/time held but no real listing URL → the bottom CTA carries no url (open slot), never our own site")`
     — facts = `{...SHORE_DR, openHouseDate: "Sat, Jul 19", openHouseTime: "1–4 PM"}` (no
     `listingUrl`; `sourceUrl` is `swfldatagulf.com`, which `listingButtonUrl` rejects); asserts
     the bottom button's `props.url === undefined` — never `"https://www.swfldatagulf.com"`.
   - `test("the RSVP button carries an explicit role, so brand overlay never silently reroutes it via primary-cta's website fallback")`
     — asserts `props.role === "booking"` is present on the beside button whenever it renders
     (covers guard #2). This test is a MINIMUM — the real forcing function is
     `button-destinations-wiring.test.ts`'s existing emitter scan (guard #8), which already fails
     CI if the literal is missing; this test exists to make the failure legible at the recipe
     layer instead of a generic cross-repo scan message.
   - RED before each: neither `role` nor the second button exist yet. (The photo-`linkUrl` test
     originally planned here is DROPPED — see "Open questions #4": it would reverse a named,
     tested decision, `open-house.test.ts:233-241`, not extend an untested gap.)

3. **`lib/deliverable/campaign-coherence.test.ts`** — one new, DELIBERATELY NOT part of the
   shared per-key loop, `it()`:
   - `test("open-house: a date/time-held build carries a SECOND button — the named exception to 'exactly ONE call to action'")`
     — build `open-house` directly (not via the shared `LIFECYCLE.forEach` loop, which must stay
     untouched) with `FACTS` extended by `openHouseDate`/`openHouseTime`; assert
     `s.filter(x => x === "button").length === 2`, with a comment quoting the "keep it that way"
     line this test is a named, sign-off-pending exception to. **This test exists specifically so
     the two-CTA state is visible in the same file as the rule it deviates from — not to make the
     rule pass, but to make the deviation impossible to miss on the next read of this file.**
   - RED before: the recipe doesn't emit a second button for any input yet. GREEN after step B6
     (edit list) ships.

4. **`scripts/email/render-open-house.mts`** — see Acceptance for the two new assertions
   (numbers 9–10, additive append only).

---

## Step-by-step edit list

### A. `lib/email/lifecycle-chrome.ts` (infrastructure, required for "beside")

1. Extend `ChromeBlock` (line ~70):
   ```ts
   export interface ChromeBlock {
     block: Omit<EmailBlock, "layout">;
     height?: number;
     /** 1..12, snapped to the nearest blessed multiset by the seam. Omitted → GRID_COLS
      *  (today's full-bleed default — every existing recipe's middle/tail is unaffected). */
     span?: number;
     /** Force a new row before this entry. Omitted → true (today's default: every middle
      *  block gets its own row). false sits it BESIDE the entry pushed immediately before it
      *  in the SAME `middle` array — the recipe still cannot say WHERE, only that it wants to
      *  pair with what it just pushed (finalizeDoc alone writes x/y). */
     newRow?: boolean;
   }
   ```
2. Update the `middle` loop (line ~296):
   ```ts
   for (const m of chrome.middle ?? [])
     entries.push(cell(m.block, m.height ?? 5, m.span ?? GRID_COLS, m.newRow ?? true));
   ```
   (`tail`'s loop is left untouched — Package 2 does not need it, and touching it would widen
   the blast radius with no corresponding requirement.)

### B. `lib/deliverable/recipes/open-house.ts` (the recipe — the one file the handoff names)

3. Add the import: `import { listingButtonUrl } from "@/lib/listings/listing-url";`
4. Give `dateTimeCard()`'s return a span/newRow (line ~128-139): add `span: 7, newRow: true` to
   the returned `ChromeBlock`.
5. Add a new function, `rsvpButton(current: EmailDoc, facts: ListingFacts): ChromeBlock`, mirroring
   the existing `rsvpUrl()` helper for its URL, emitting `type: "button"`, `props: { role:
   "booking", label: "RSVP for the Open House", ...(url ? { url } : {}) }`, `height: 3, span: 5,
   newRow: false`. (`role: "booking"` — the closest existing bucket to "reserve a spot"; chosen
   over adding a new role to `lib/email/button-destinations.ts` to keep this package inside its
   allowed data-model surface. Reusing `"listing"` for both buttons was considered and rejected:
   both would then resolve through the SAME agent-saved override, so a saved "listing"
   destination would wrongly clobber the RSVP link too.)
6. In `buildOpenHouse()`, make `middle` and the bottom CTA conditional on whether `card` exists
   (replacing lines ~203, 206-207):
   ```ts
   const card = dateTimeCard(facts);
   const listingUrl = listingButtonUrl(facts);
   // ...
   middle: card ? [card, rsvpButton(currentDoc, facts)] : [],
   // ...
   ctaLabel: card ? "View the Full Listing" : "RSVP for the Open House",
   ctaUrl: card ? (listingUrl ?? undefined) : rsvpUrl(currentDoc, facts),
   ```
   **Step 7 (photo `linkUrl`) is DELIBERATELY NOT in this list** — see "Open questions #4."

### C. `lib/deliverable/campaign-coherence.test.ts` (REQUIRED — corrected after review, was
### listed as optional)

7. Add the dedicated `open-house` date/time-held test described in TDD step 3, as its own `it()`
   OUTSIDE the shared `for (const key of LIFECYCLE)` loop (that loop's fixture and assertions stay
   completely untouched — this is additive, not a modification of the cross-recipe check).

### D. `scripts/email/render-open-house.mts` (shared with Package 4 — additive only)

8. Two new assertions appended at the END of the existing `checks` array (do not renumber
   existing 1-8). See Acceptance for exact numbers claimed and the Package-4 collision note.

---

## Acceptance

**Commands:**

```
bun test lib/email/lifecycle-chrome.test.ts
bun test lib/deliverable/recipes/open-house.test.ts
bun test lib/deliverable/campaign-coherence.test.ts
bun test lib/email/design-system-reachability.test.ts
bun --env-file=.env.local scripts/email/render-open-house.mts "9340 Vittoria Ct, Fort Myers, FL 33912" "Saturday, Aug 22" "1-4 PM"
```

**What proves it:**

- All four `bun test` files exit 0. `campaign-coherence.test.ts` and the pre-existing "ONE CTA"
  case in `open-house.test.ts` passing WITHOUT modification is itself evidence the conditional
  design didn't need to touch a locked invariant.
- The acceptance script (run WITH a date/time, since that's the only path where the new behavior
  is observable) prints two `<a>`-bearing buttons, and:
  - **Assertion 9 (THIS PLAN'S CLAIM — href, off the rendered bytes):** "9 · bottom CTA href is
    the real listing URL, read off HTML" — locate the `"View the Full Listing"` button's
    rendered `href="…"` in `html` (not `doc.blocks`, per the handoff's own instruction to trust
    the render over the recipe's pre-overlay value) and assert it equals `listingButtonUrl(facts)`
    when held, or that no such `href` attribute exists at all when `listingButtonUrl` returns
    null (open slot, never our own site, never blank-quoted).
  - **Assertion 10 (THIS PLAN'S CLAIM — sole-primary-CTA DOM check):** "10 · RSVP is the one ask
    tied to the moment; the listing link is structurally secondary" — when a date/time is
    supplied, assert exactly 2 button-derived `<a>` tags exist, their hrefs differ, and the RSVP
    label's position in `html` precedes the listing label's position (Placester's own CTA-before-
    content placement claim, cited in `_RESEARCH/email-and-social/2026-08-12-open-house-
    invitation-craft.md` §3). When NO date/time is supplied (the script's no-argv default run),
    assert exactly 1 button-derived `<a>` tag exists — the regression form of the "ONE CTA" rule.
  - **A genuine visual "primary vs. secondary" weight (bgColor/prominence) is NOT asserted** —
    `ButtonProps` (`lib/email/doc/types.ts:406-439`) has no `variant` field today, and adding one
    would be a schema change beyond a layout-only package. The DOM/position check above is the
    honest substitute; a human should still RENDER IT AND LOOK (guard #7) before calling the two
    buttons visually distinguishable enough in practice.

**Assertion-number collision with Package 4 — flagged per instructions:** Package 4's own handoff
text (`docs/handoff/2026-08-12-open-house-build-plan-parallel-sonnet-assignments.md`, §Package 4)
also says **"new assertion 9 (length + ask present)."** Both packages cannot literally claim "9."
This plan claims **9 (href) and 10 (sole-primary-CTA DOM check)**. Whichever session lands first
on `scripts/email/render-open-house.mts` keeps its stated numbers; **the second session to land
MUST NOT hardcode "9" from its own doc** — it should read the live `checks` array length in the
file at merge time and append after it, renumbering its own comment/name to match, then note the
renumber in its own SESSION_LOG entry so the discrepancy against its written plan is visible
rather than silent.

---

## Open questions for the operator

1. **The two-CTA exception itself.** This plan's design ships a second button ONLY when a
   date/time is held, so the locked `"exactly ONE call to action... keep it that way"` rule
   (`campaign-coherence.test.ts:123`, `email-build-playbook.md:812-813`) is never violated in the
   state its own test exercises — but it IS a real, if narrow, exception in the date/time-held
   state, and this session's own fresh research (`_RESEARCH/email-and-social/2026-08-12-open-
   house-invitation-craft.md` §2a) independently reconfirmed the single-CTA evidence the same
   day this package was assigned. Confirm: is "RSVP for the moment + a separate link to read
   more about the property" an acceptable, distinct-purpose pair — or should the realtor.com
   link ship as a non-button affordance instead (e.g., only on the photo/description `linkUrl`,
   with the bottom slot staying RSVP always)? Note this connects to "Open questions #4" below: if
   you want the realtor.com link to ship WITHOUT a second button, the photo-`linkUrl` swap (#4)
   is the mechanism that would do it with zero button-count risk — but that swap is currently
   NOT implemented by this plan either, pending your answer there.
2. **`role: "booking"` for the RSVP button.** Chosen as the closest existing bucket without
   adding a new role to `lib/email/button-destinations.ts` (out of Package 2's stated file scope).
   If you'd rather have a dedicated `"rsvp"` role (clearer semantics, but touches a file this
   package doesn't own and is used by every send route), say so and this becomes a two-file plan
   instead of a `lifecycle-chrome.ts` + `open-house.ts` one.
3. **Span choice `{7,5}` for card+button.** Reused from the campaign's own existing agent-card/CTA
   pairing and its documented rendering history (the SAME label, "RSVP for the Open House," broke
   over three lines at `{8,4}` — `lifecycle-chrome.ts:320-325`). Not yet rendered in combination
   with a `signal` block specifically (different content shape than an agent-card). Recommend
   treating this as provisional until the RENDER IT AND LOOK step in Acceptance actually happens.
4. **The photo's `linkUrl` (dropped from this plan's required work, added after review).**
   `open-house.ts:195` links the hero photo to `facts.sourceUrl` (our own citation page).
   `listing-flyer.ts:305` (New Listing) links its photo to `listingButtonUrl(facts)` (the real
   listing) instead — a genuine inconsistency between the two recipes. Fixing it would flip
   `open-house.test.ts:233-241`'s named assertion (`"the photo is the record's own, and links to
   the citation"`, currently pinning `linkUrl === "https://www.swfldatagulf.com"`) to the opposite
   behavior. That test's own name suggests "links to the citation" was a deliberate choice for
   Open House, not an oversight — possibly because an open-house invitation's photo click is meant
   to return to the reader's trusted source (us) rather than route them off-platform mid-invite,
   which is a different intent than New Listing's "go read the listing" photo click. Confirm
   whether this is intentional divergence (leave as-is, close this question) or drift worth fixing
   (small follow-up, one file, one test edit, not blocking this package either way).
