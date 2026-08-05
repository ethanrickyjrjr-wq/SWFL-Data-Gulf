# HANDOFF — PICK UP AT NEW LISTING. Everything the last session learned, and the order it goes in.

**Written 08/05/2026 by Opus 5 under operator decree, verbatim:** *"then we start fresh with a New
Listing email. we code it exactly to the rules and figure out where data comes from for the recipe,
then we make it reproducible by builder and move on to the next one."*

---

## 0. THE STANDING ORDER — this is the working loop for all 17 emails, not just this one

1. **Code it exactly to the rules.** `docs/standards/email-build-playbook.md` — PART 0 (the map),
   PART 1 (universal, read once), then ONLY that email's PART 2 section.
2. **Figure out where every ingredient's data comes from.** Name the root for each cell, and the
   fallback when the first source misses.
3. **Make it REPRODUCIBLE BY BUILDER.** This is the acceptance test — not "it rendered once."
4. **Move to the next email.**

**And the rule that outranks all of it (operator, 08/05, after this was re-litigated seven times):**
*"We all start at the fucking same spot."* One entry point, ONE recipe per fact, everywhere. **Do
not re-open that design. Do not propose an alternative to it. Do not ask which of two ways to do
it.** It is decided. Build.

---

## 1. WHAT LANDED THIS SESSION — 3 commits, LOCAL, NOT PUSHED

Operator approval for a push is **per push, never carried**. These are committed and waiting.

- `fe88c090` — the fact corrections (below).
- `c9388d7f` — `lib/listings/paid-record-lane.ts` + its test suite, wired into `resolveSubject`.
- `c4c8d545` — the mind map merged into the playbook as PART 0.

Earlier in the session, `1f6ec27e..83f60f94` (6 commits, the playbook + the 08/04 handoff) WAS
pushed with explicit approval.

---

## 2. THREE FACTS THE PREVIOUS SESSION PUSHED TO MAIN WERE WRONG. Know them before you read anything.

All three came from reading a previous surface instead of counting the source — inside the very
document written to stop that. Corrections are in
`docs/superpowers/handoffs/2026-08-05-EMAIL-HOMEWORK-COUNTED.md`; the 08/04 handoff carries a
superseding banner.

1. **`lee_comp_sales_v` was never broken.** Plain `?select=*&limit=1` → **200 in 1.7s** with a real
   row. The reported HTTP 500 was the probe's own `Prefer: count=exact` header forcing a full-view
   `COUNT(*)` past the 8s statement timeout. **Bounded reads are healthy** — that is the only shape
   the email path issues. Check `lee_comp_sales_v_postgrest_500` CLOSED;
   `lee_comp_sales_v_exact_count_times_out` opened for the narrow real defect.
2. **Schools are `<NA>`.** The bulk actor we run returns `nearby_schools` as the literal string
   `<NA>` on all 20 resolved rows — same for `tax_history`, `builder_name`, `builder_id`,
   `list_price_min/max`. **The agent / office / broker contact half of that same claim IS true.**
   The DETAIL actor is a different actor, has never written a row here, and stays unprobed —
   do not claim schools in EITHER direction.
3. **HOA is 12, not 19.** Non-null on 19 of 26 rows, but only **12 are greater than zero**. A `0` is
   indistinguishable from an unfilled field. Serve `> 0`; a `0` is an OPEN SLOT.

**⚠ THE HEADER TRAP, twice in one day.** `Prefer: count=exact` faked the 500. `Prefer: count=planned`
returns the PLANNER'S ESTIMATE, not a count — it reported the paid-record table at 20 when the exact
count is 26, and non-floored DOM rows at 34,903 when the exact count is 31,825. **Only
`count=exact` is a count.**

---

## 3. THE SHAPE — one pipe, three dials. Full version is PART 0 of the playbook.

Five stops, every email: the email's own file picks blocks and data → a flat list with **no
positions ever** → AI fills open slots (prose only, never a figure) → the seam assigns every
position and stamps provenance → brand overlays blanks only → one door renders the HTML.

Three dials are the *entire* difference between emails: **SPINE** (address 7 · area 8 · agent 2),
**CHART POLICY** (12 of 17 are `none`, and `none` means DROP the slot), **sell-side or story-side**.

**Registry executed live 08/05/2026: 19 keys · 17 emails · 17 of 17 have a working builder · 2
social** (different renderer — never give them email chrome).

---

## 4. NEW LISTING — EVERY INGREDIENT, WITH ITS SOURCE. This is the work.

**Tag `new-listing` · spine: address · chart: NONE · subject line wants an OPEN (30–40 chars) ·
sell-side.** File: `lib/deliverable/recipes/new-listing.ts`, builder `buildNewListing`.

**Chart is NONE by operator ruling 07/13/2026** — this email is about a HOUSE and its visual IS the
photo. An area index says nothing about the house; a comps bar turns it into a comps email. `none`
means **drop the slot**, never ship an empty box.

### The identity block — from the user's brand profile, no data source involved
Agent name · brokerage · phone · headshot · business postal address. **The postal address is a legal
requirement, not a design choice** (CAN-SPAM). **The headshot is the field agents most often skip —
it must survive being missing.** The agent identity block sits at the TOP, confirmed independently
at Zillow, Compass and BoldTrail.

### The house — resolved ONCE, at the ONE inspection point
`resolveSubject` in `lib/deliverable/recipes/shared.ts`. **The builder decides whether the address
comes from the address field or from the words the user typed — never the door they clicked.**
Gating on the field alone is what once sent every in-lab campaign build to the generic author.

- **Asking price · street · city · state · ZIP** — the live for-sale record.
- **Hero photo** — from the listing's own gallery, **mirrored into our own storage** so a rotted
  vendor link never blanks the email months later.
- **Beds · square feet · lot size · year built · property type** — the live record.
- **THE GALLERY** — 9 to 55 photos, from the paid row (`alt_photos`), appended BEHIND the mirrored
  hero. The free lane carries ONE photo. Counted live: 20 of 26 rows carry a gallery.
- **BATHS — the weak one.** Primary: the for-sale record. Then our own Lee County records,
  exact-address match only. Then the paid row's `baths_total`. **For a Collier listing with no
  stated bath count the paid row is the ONLY source** — otherwise the cell stays OPEN.
- **DOLLARS PER SQUARE FOOT** — price ÷ square feet. If either won't parse the cell stays OPEN.
  Never a wrong number from a partial input.
- **TIME ON MARKET** — from our own per-listing days-on-market root. **Coverage is GOOD and this
  cell is safe to build on:** counted 08/04/2026, 34,904 listings, **31,825 real (91.2%)**, only
  3,079 floored (8.8%) — Lee 91.5%, Collier 89.7%. A floored count is still never printed as a fact.
- **HOA FEE** — the paid row, **`> 0` only**. Real coverage 12 of 26 rows.
- **THE DESCRIPTION** — the property's own marketing description verbatim, or what the seller/agent
  pasted in. **The biggest quality lever in this email**, 368 to 2,983 characters measured, and it
  does **NOT** count against the word budget. The model never rewrites it into a claim.

### The community — THREE different things that must never impersonate each other
1. **Inside the gate** — golf, pool, gated, clubhouse. 81 communities held, thinly.
2. **Nearby** — the vendor's named neighborhood plus businesses in its search radius. **These are
   businesses within about five miles, NOT amenities inside the community, and the copy must say
   so.**
3. **The subdivision** — home count and median assessed value from our own tax-roll parcel data.
   Universal: every home in Lee and Collier, unlike (1) and (2).

### The commentary — the ONLY thing the AI writes
One paragraph, from the description and the sourced facts. **It gets NO comps** — handing the
narrator a comp set is what once turned this paragraph into a market analysis. Prose, never a figure.

### The button — exactly one
"View the Full Listing", pointed at the real listing link saved for that role. **No real link means
NO BUTTON. Never a homepage.**

### Named gaps — do not paper over these
- **Pool: Lee only. Collier has no pool source at all.** A pool permit is an EVENT, not proof of a
  pool — never use it as one.
- **Annual taxes**: parsed for ~16,500 properties but **BLOCKED from customer-facing use** until one
  is validated against a real county bill.
- **Schools, flood zone: no verified source.** See §2 above — schools is now a MEASURED absence.

---

## 5. WHAT IS ALREADY WIRED — do not rebuild it

`lib/listings/paid-record-lane.ts` (commit `c9388d7f`) reads the paid record we already own and
gap-fills **description, gallery, baths, and HOA (`> 0`)** — wired into `resolveSubject` and
**nowhere else**, so all seven address-spine emails inherit it with no per-email variant.

It is **gap-fill only** and runs **last**, so neither the live record nor the agent's own pasted
words can be overwritten. It may **never** fill a moving fact — price, status, days on market stay
with the live record, because a three-week-old ask presented as today's is a wrong number, not a
stale one. It spends nothing: the only vendor call site in the whole tree is
`lib/listings/apify-comps.ts:295`, and it awaits its save on every non-injected run.

Tests are one per failure mode, named after the failure. **11/0 on that suite · 1010/0 across
`lib/deliverable/recipes` + `lib/listings` · `bunx next build` green.**

---

## 6. START HERE — the first four moves, in order

1. **Read PART 0 + PART 1 + §2.1 of the playbook.** Nothing else. That is the whole point of it.
2. **Walk `lib/deliverable/recipes/new-listing.ts` against §2.1 ingredient by ingredient** and write
   down, per cell: which root fills it, what fills it when that misses, and what an OPEN SLOT looks
   like there. **The fallback ladder is not in code for this email or any other** — §2.1 says so
   itself. That ladder is the "one recipe per fact" the operator has now asked for seven times.
3. **Prove it reproducible by builder.** Not a screenshot — the same inputs producing the same doc,
   run twice, asserted. `scripts/email/campaign-sim.mts` drives LIVE data through one real listing;
   `registry-seam.test.ts` drives every key offline. Neither is the reproducibility proof yet.
4. **Write §2.1's fallback ladder INTO the playbook as you go**, and only then move to the next
   email. `docs/standards/email-build-playbook.md` §2.2–2.17 are all still TO BE WALKED — **do not
   pre-fill one from memory or by copying 2.1.**

---

## 7. OPEN CHECKS FROM THIS WORK

- `lee_comp_sales_v_exact_count_times_out` — defect, narrow: exact-count consumers 500.
- `apify_detail_actor_schools_unprobed` — task, blocked on the cap check below.
- `apify_cache_read_not_wired_to_all_lanes` — defect, PARTIALLY closed by the paid lane; still
  unverified whether the standalone baths and description helpers consult the cache on their own.
- `apify_monthly_cap_state_unknown` — verify. **The account hit a 403 `Monthly usage hard limit
  exceeded` on 08/04/2026 and its current state was never re-checked. Any plan whose first step is a
  paid call is blocked until it is.**
- **Not yet opened, and it is the biggest one:** 92 built deliverables all record their template as
  `block-canvas` and **there is no column recording which email built them** (`deliverables.recipe_key`
  does not exist — live query 08/05/2026). "Every email runs one pipe" is true in the code and
  **unverifiable in the product.** Additive, zero-risk, and it is step 1 of the assembly-line walk
  order. Open it and land it.

---

## 8. THE FIVE TRAPS THAT COST THIS SESSION TIME

1. **A probe header that changes the query is not a test of the thing you meant to test.**
   `count=exact` invented a blocker; `count=planned` invented three wrong counts.
2. **A summary sitting next to the facts it summarizes will always drift.** Count, never quote —
   including from our own docs, including from a doc whose first line says to re-count.
3. **Never re-open a settled decision.** Asking the operator to choose between two ways of doing an
   already-decreed thing costs him the same minute over again. A concern gets one sentence, then
   execute.
4. **A repolith claim from an ended session looks exactly like a live rival.** Timeline-check the
   commits, then release it.
5. **`0` is not a value.** Not for HOA, not for an assessment split, not for a price.
