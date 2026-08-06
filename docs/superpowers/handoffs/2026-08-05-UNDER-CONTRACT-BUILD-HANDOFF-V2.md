# UNDER CONTRACT — HANDOFF. FACTS ONLY. NO CODE IN THIS FILE, BY OPERATOR DECREE.

**Date:** 08/05/2026 · **Status: 0 of 5 built.** Nothing landed. Nothing was committed, pushed,
deleted, or migrated.

**Operator, 08/05/2026, on the first draft of this file — which contained a full pasted recipe:**
*"Why the fuck would you give them the fucking code we didn't write and we just fucking went over."*
He is right. A handoff carrying unreviewed code is the exact trap that produced the July file: a
future session reads a committed document as authority and builds on something nobody vetted.
**This file carries decisions and measurements only. The code gets written in-session, under the
playbook gate, and reviewed before it lands.**

**Read alongside:** `docs/superpowers/plans/2026-08-05-under-contract-24-BUILD-HANDOFF.md`. Its
RECIPE (the full cell-by-cell ladder) is still the source of truth. Two things in it are wrong and
corrected below: §7's "zero code exists" and §6 step 1's "copy the structure of coming-soon.ts".

---

## 0 — THE FIVE THINGS ESTABLISHED 08/05/2026. Do not re-derive them.

**1. OPERATOR DECREE, LOCKED, verbatim:** *"The fucking under contract date is the date the email
is fucking made, user can change it if they want."*

The contract date is **not** a gap, **not** a wait on the agent, **not** detected. It **defaults to
the build date** and is an **editable field**. This is the decision that unblocks the whole email:
days-to-contract stops being "held by no source" and becomes `contractDate − listedDate`.

**2. The July file is not this email.** Operator: *"There can't be code for this if it is not from
today. We are building everything new so we build it fucking right."*
`lib/deliverable/recipes/under-contract.ts` (07/17/2026, 1,098 lines) predates the assembly line.
Not a diff target. Write new.

**3. THE SPEED NUMBER IS OURS AND IT IS FREE.** Operator: *"We have DOM from fucking SteadyAPI
in-house."* Correct, with one precision: the vendor sells no per-listing DOM
(`listing_state.days_on_market` = **298 of 35,472** rows). What we hold we **built** 07/16/2026 off
`/property-tax-history` probes already being paid for — zero new calls.

Measured live 08/05/2026:
- `data_lake.listing_dom` — **35,174 rows**; carries `dom_days`, `cdom_days`, `listed_date`,
  `dom_is_floor`, `days_in_state`, `spell_anchor`, `cdom_anchor`.
- `listing_state.listed_date` — **31,343 of 35,472** (88.4%).
- Pending book: **7,209** rows · list_price **7,209/7,209** · photo_url **7,195/7,209** ·
  listed_date **5,661/7,209** (Lee 3,824/4,824 · Collier 1,691/2,221 · Hendry 146/164).

**4. THE COMPARAND IS USABLE — the "aggregate is censored" caveat is STALE.** Live 08/05/2026 over
`listing_dom`: **3,035 floored of 35,174 = 8.6%**. The catalog's T1 note still says ~63%, written
07/18–07/20 before the de-flooring backfill ran — **do not quote T1 as current**. Median `dom_days`
excluding floors: **96**. So the speed line can carry both cells.
**Scope it list-side.** `docs/standards/data-roots.md:69-71` — list-side `listing_dom`, sold-side
`redfin_swfl.median_dom`, "never interchange." The July build compared against the sold-side median.
That is a second, separate error from the date error.

**5. New Listing does NOT pay for DOM — claim retracted.** `new-listing.ts:121` reads
`facts.daysOnMarket ?? daysSinceListed(...)`, and `facts.daysOnMarket` **is** our own `listing_dom`
value, carried onto ListingFacts by commit `51e610d8` (07/19/2026): *"carry listing_dom
daysOnMarket onto ListingFacts (floors never printed as exact). new-listing prefers it and skips the
2-call vendor list-date chain."* The vendor chain is a fallback that fires only on a build with no
lake row behind it. No spend defect. A check opened on that premise was closed as false.

**Residual, small:** that fallback helper lives in the old July file and `new-listing.ts:44` imports
it, so the old file can't be deleted until the helper moves or the fallback is dropped.

---

## 1 — WHY NOTHING LANDED, so you don't hit the same wall

`.claude/hooks/check-playbook-read-before-email-edit.mjs` **blocks any write under `lib/email` or
`lib/deliverable/recipes` in a session that has not opened `docs/standards/email-build-playbook.md`.**
The gate is correct and fired correctly. Before writing a line:

1. Read `docs/standards/email-build-playbook.md` — PART 1 (universal) **and** §2.1/§2.2/§2.3 as the
   template for what §2.4 must contain.
2. Open these BY PATH (gitignored — Grep cannot see them):
   - `_RESEARCH/deliverable-and-design/2026-07-01-ai-deliverable-design-quality-research.md`
   - `_RESEARCH/email-and-social/2026-08-03-strongest-real-estate-email-concepts-structure.md`
3. Then write.

---

## 2 — CONTRACTS ALREADY READ LIVE THIS SESSION (so the next session doesn't re-read them)

- `RecipeBuildContext` — `lib/deliverable/recipes/index.ts:59` · `RecipeBuilder` — `:81` ·
  `RECIPE_BUILDERS` — `:89`
- `LifecycleChrome` — `lib/email/lifecycle-chrome.ts:97` (ribbon, photo, heroValue, heroLabel,
  heroKicker, specs, specFootnote, and a separate `descriptionSlot` that the narrator must never
  overwrite)
- `buildComingSoon` entry shape — `coming-soon.ts:664`
- Shared authorities to reuse, never re-implement: `lib/email/listing-flyer.ts`
  (`addressLineOf`, `listingSpecs`, `spec`, `specFootnote`), `recipes/shared.ts`
  (`authorListingNarrative`, `clearNarrativeSlots`, `fillNarrative`), `lib/listings/dom.ts`
  (`formatDom` — the wording root), `lib/brand/profile-ledger.ts` (derive brand keys, never hand-list)

**NOT verified, check before relying on either:** the field name for the listed date on
`ListingFacts`, and the exact signature of `authorListingNarrative` / `fillNarrative`.

---

## 3 — THE BUILD, in order. 5 parts, 0 done.

1. **The recipe** — `lib/deliverable/recipes/under-contract.ts`, written new, ONE resolver. Register
   in `recipes/index.ts`. Update the registry prompt at `recipes.ts:223`: it currently says *"invite
   backup offers"*, which decision 3 kills (only 6% of sales fall through per NAR via Redfin — a
   1-in-17 ask). The CTA is "here's what else," never "get in line."
2. **Tests, TDD, each named for the failure mode it targets** (RULE 3.5): sold-language never renders ·
   price equals the list price · the speed line DROPS rather than estimates when either date is
   missing · a floored listed date is refused · `days_in_state` is never read · the address always
   ships · the comparand is never the sold-side median.
3. **`scripts/email/render-under-contract.mts`** — copy `render-coming-soon.mts`: real render to
   `~/Downloads`, per-cell provenance table using the `clip()` helper (never a bare `.slice()`), the
   bytes assertion below with a non-zero exit, brand-field count derived from the ledger.
4. **RENDER IT AND LOOK.** The artifact is the gate, not the test count. Five defects were found by
   looking at Coming Soon that no test caught.
5. **Write §2.4 of the playbook** with the ladder in full — the six-part shape §2.1–§2.3 use.

**THE BYTES-LEVEL INVARIANT — the email states a PENDING fact and never a SOLD one.** Assert against
the rendered HTML, non-zero exit: the full street line and ZIP MUST appear · the strings "sold for",
"sold price", "closed at", "final sale", "sale price" MUST NOT appear · the price shown MUST be the
list price, verbatim-formatted · no phrasing derived from `days_in_state` (it ages only while `state`
is unchanged and `flag_pending` is not part of `state` — it is days-in-ACTIVE).

**Do not build a pending detector.** The agent tells us. Measured 08/05/2026: there is no
under-contract state, pending is a flag on an otherwise-active row, and the flag is stale on 462
sold rows.

**These both worked 08/05/2026:**
```
bun --env-file=.env.local scripts/email/render-new-listing.mts
bun --env-file=.env.local scripts/email/render-coming-soon.mts
```

---

## 4 — WHAT THIS SESSION CHANGED IN THE REPO: this file, and nothing else.

No code landed. No commit, no push, no migration, no delete. Every database call was a `select`.
All 8 objects probed are present; `active_listings_residential` holds 42,120 rows, up from the
~40,398 counted 07/18/2026. The scratchpad was restored to its committed state and the one check
opened on a false premise was closed. The decree in §0.1 is the only thing from this session worth
keeping, and it is here.
