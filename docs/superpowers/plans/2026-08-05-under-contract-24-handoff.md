# HANDOFF — §2.4 UNDER CONTRACT, the fourth email walked

**Date:** 08/05/2026 · **For:** Opus, next session · **Tag:** `under-contract`
**Playbook section to write:** `docs/standards/email-build-playbook.md` §2.4 (today: "TO BE WALKED")

---

## What this is, and what it is NOT

`under-contract` is the 4th key in `RECIPE_KEYS` (`lib/deliverable/recipes.ts`) and the 4th of 17
emails. Three are built: §2.1 New Listing, §2.2 Coming Soon, §2.3 Market Comps.

**It shares the listing lifecycle spine.** Same ONE house, same `resolveSubject` inspection point,
same resolver. `recipes.ts` states it directly: these "differ only in framing, cells, chart, and
prose source. NEVER write a second resolver."

**DO NOT PRE-FILL §2.4 BY COPYING §2.1–2.3.** The playbook says this explicitly at line 1584 and it
is the whole point: each email's ingredients and sources get decided deliberately, one at a time,
walked WITH the operator. A copied section is a section nobody decided.

---

## START HERE — the file that IS the build

`scripts/email/render-coming-soon.mts` is the pattern to copy into
`scripts/email/render-under-contract.mts`. It is not a preview script; it is the acceptance run,
and it does four things a test cannot:

1. **Renders the real email from real data** and writes it to `~/Downloads` so a human LOOKS at it.
2. **Prints a per-cell provenance table** — every cell, its value, and the source that filled it.
   This is what makes "where did this number come from" answerable without a scavenger hunt.
3. **Asserts its own contract against the RENDERED BYTES**, with a non-zero exit on violation.
   Coming Soon greps the final HTML for the house number, street core, full street line and ZIP,
   because its reason to exist is that the address does not ship.
4. **Counts brand fields across the account→project boundary.**

Run both existing ones first — they work, verified 08/05/2026:

```
bun --env-file=.env.local scripts/email/render-new-listing.mts
bun --env-file=.env.local scripts/email/render-coming-soon.mts
```

**What is UNDER CONTRACT's equivalent of the suppression contract?** That is the first question to
walk. Every lifecycle email has one bytes-level invariant that defines it. New Listing's is that the
address DOES ship; Coming Soon's is that it does NOT. Under Contract's is undecided — candidates
worth putting to the operator: does a price ship once a property is pending, does the contract date
ship, and does it say "under contract" or "pending" (they are not synonyms in Florida practice, and
which one is correct is a RULE 0.4 question — research it, do not assume).

---

## THE NEW RULES — what changed under §2.4's feet, 08/05/2026

### 1. Brand fields now reach a project. The old workaround is obsolete.

`applyUserBrandToProject` copied **14** of 38 brand columns; 24 structurally could not cross from an
account to a project. That was the root of the 08/05 "the bottom was bare" defect. **It now derives
from `PROJECT_CARRY_KEYS` (`lib/brand/profile-ledger.ts`) and carries 32.** Verified live on the
Coming Soon render: *30 filled and carried, 1 filled and DROPPED* — and the one is
`button_destinations`, jsonb with its own root, correctly excluded.

**So: do not build §2.4 around a brand workaround.** Fonts, all nine socials, the unsubscribe URL,
surface colors and the CAN-SPAM address now travel. If a brand field is missing from a rendered
Under Contract email, that is a NEW defect, not the known one.

### 2. The registry is the one authority for brand fields. Never hand-write a key list.

`lib/brand/profile-ledger.ts` is the single derivable root. There were **19 hand-written key lists
across 5 production files** against it; the count was itself wrong twice before being re-derived
file by file. Three are now gone.

**A hand-written brand key list in §2.4 is a defect on arrival.** Derive: `SCORED_KEYS` (what the
Brand panel counts), `PROJECT_CARRY_KEYS` (what reaches a project), `MUST_KEYS` (CAN-SPAM three).

Live proof of why: the Coming Soon render script itself held a **20th** hardcoded 14-key list, and
kept printing "copied to a project: 0" against a defect that was already fixed hours earlier. **A
stale alarm is worse than no alarm** — the next session reads it and re-opens closed work. Fixed the
same day by deriving it.

### 3. `owner` gates SCORING, not just rendering.

A field another lane owns (`company_name`, `owner: "prospect-enrichment"`) is registered and carries
to a project, but is never scored, prefilled, popped, or rendered as an input. If §2.4 needs a field
the brand editor does not own, register it with the right `owner` — do not smuggle it in as a
brand-editor field to make it appear.

### 4. Sending identity and provenance CANNOT reach an email. This is now a type error.

`ProfileFieldSpec` is a discriminated union: `owner: "sending-identity" | "derived"` can only carry
`carriesToProject: false`. `source`, `sender_domain_verified`, `sender_address`, `sender_name` never
land in a branding blob. Do not try to route around it.

### 5. Every literal becomes a field; every count gets a ladder.

From §2.2 and §2.3, both landed 08/05/2026. A number printed in an email needs a declared source and
a declared fallback when that source misses — the **ingredient ladder**, every cell, written out in
full. §2.2.2 was explicitly rewritten from a delta-list to a complete one after the operator asked
*"You have written down the entire recipe? We know where everything has come from and has
fallbacks!?"* Write §2.4's ladder complete. Do not write "rides §2.1 unchanged."

### 6. RENDER IT AND LOOK. A green suite is not evidence.

§2.2.4 is titled *"FIVE DEFECTS FOUND BY RENDERING AND LOOKING — none catchable by a test."* 180
tests were green while all five were on screen. 2407 tests are green today. That is not the gate.
The gate is the rendered artifact in `~/Downloads`, opened and looked at.

### 7. Read the gitignored rules BEFORE coding anything.

`lib/email/CLAUDE.md` step zero: the foundational rules live in `_RESEARCH/` and are **gitignored**,
so a repo-wide grep returns nothing and that is NOT absence. Open by path:
`_RESEARCH/deliverable-and-design/2026-07-01-ai-deliverable-design-quality-research.md`,
`_RESEARCH/email-and-social/2026-08-03-email-length-and-per-type-benchmarks.md`,
`_RESEARCH/email-and-social/2026-08-03-strongest-real-estate-email-concepts-structure.md`,
`_RESEARCH/email-and-social/2026-08-03-button-link-mechanics.md`.
Then `docs/standards/emails.md` §0 — body 50–125 words (the floor bites harder), 1–3 questions,
3rd-grade level, subject 3–4 words for a reply / 30–40 chars for an open, 5-part skeleton, one CTA,
8px grid, 600px canvas, Outlook has no flex/grid, Gmail clips at ~102KB.

### 8. Chart policy — a lifecycle email about a HOUSE gets no chart.

`recipes.ts`: the visual is the photo. "Two bars (was/now) is a fact wearing a chart costume — write
the fact instead." An empty chart slot is worse than no slot. Under Contract is about a house, so the
default is **no chart** — and if the walk decides otherwise, `assertHeroChartCoherence` applies.

### 9. Photos: the listing's own photo or nothing. Never an aerial.

Locked operator rule. Nothing in the pipe can tell a drone shot from a front elevation, and the
vendor feed is full of them — §2.2 had to trade a much stronger scarcity funnel (799→87) for a
usable elevation (834→518). Budget for that trade when picking §2.4's default house.

---

## Known state, so nothing gets re-discovered

- **2407 tests pass, 0 fail** across `lib/deliverable/recipes/` + `lib/email/` (08/05/2026).
- **Both built emails render clean.** New Listing 21KB, Coming Soon 23KB, both inside Gmail's clip.
  Coming Soon's four suppression checks all ABSENT.
- **One defect found and NOT fixed:** the New Listing render shows the agent headshot as
  `https://www.swfldatagulf.com/showcase/launch` — a page URL where an image URL belongs. It renders
  as a broken image. Likely the demo persona's `photo_url` row rather than code, but it was not run
  to ground. Check it before it ships in a fourth email.
- **`recipe_key` coverage is still zero** — 92 deliverables, none keyed (open check
  `recipe_key_zero_coverage_since_landing`). Diagnosed, not fixed.
- **The brand-field registry build is 5 of 12 tests done, 3 of 19 hand-lists replaced.** The
  schema-parity guard — the one that catches a migration adding an unclassified column — is NOT
  built. Spec: `docs/superpowers/specs/2026-08-05-brand-field-registry-authority-design.md`.
- **Blast radius of the carry-set change was never checked.** Every new project's branding blob now
  carries 18 more keys. Existing projects are NOT backfilled and keep their 14-key blobs; 9 of 11
  live projects hold branding that deliberately diverges from the account profile, so a backfill
  needs the operator's call, not a default.

---

## The order to work in

1. Read the gitignored research + `docs/standards/emails.md` §0. Then `lib/email/CLAUDE.md`.
2. Read §2.1, §2.2, §2.3 in the playbook — for the SHAPE of a walked section, not to copy content.
3. Walk §2.4 with the operator: what ships, what must not, which cells, which sources, which
   fallbacks. Decide the bytes-level invariant first.
4. Write `scripts/email/render-under-contract.mts` — provenance table + contract assertion + exit
   code. Copy `render-coming-soon.mts`'s structure.
5. TDD the deterministic logic (RULE 3.5, mandatory). Name each test for the failure mode it targets.
6. Render it. Look at it. Then write §2.4 into the playbook with the full ladder.
