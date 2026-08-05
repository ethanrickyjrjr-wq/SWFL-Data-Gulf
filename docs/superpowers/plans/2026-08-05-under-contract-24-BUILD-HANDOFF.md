# BUILD HANDOFF — UNDER CONTRACT, the 4th email. THE RECIPE IS DECIDED. WRITE THE CODE.

**Date:** 08/05/2026 · **Supersedes:** `2026-08-05-under-contract-24-handoff.md` (that one was the
pre-walk brief; its §2.4 questions are ANSWERED here, and one of its "known defects" was false).
**Research behind every choice:** `_RESEARCH/email-and-social/2026-08-05-under-contract-email-purpose-and-design.md`
(gitignored — open it BY PATH, a repo grep cannot see it).

**The walk happened. Do not re-walk it. Do not re-research it. Build.**

---

## 0 — THE ONE THING THE LAST SESSION GOT WRONG, so you don't repeat it

I designed this email as if WE send it. **We do not. The AGENT does.** They own the listing, they
build the campaign, and **they notify us when it goes under contract — that notification IS the
trigger.** They also choose the recipients. Operator, verbatim: *"So they are sending it to whoever
they fucking want."*

Everything that looked like a data gap dissolved once that was straight. The trigger is lane 4 of
four-lane sourcing (the user writes it in), which RULE 0.7 makes first-class, not a fallback. I had
treated an empty lane 1 as a dead end and written "speed is unmeasurable" into a research file. It is
not. **A build is NEVER blocked because we don't hold the number.**

---

## 1 — OPERATOR DECISIONS (locked 08/05/2026, do not relitigate)

1. **The contract date is NOT a printed cell.** *"Doesn't need the contract."* It still arrives with
   the agent's trigger, and it is what makes the speed number computable — different jobs.
2. **Price ships, and it is the LIST price.** *"Under contract price is whatever is listed."*
   `listing_state.list_price` off the free spine. **We never claim a sold price** — we would not have
   it, and a pending home has not sold.
3. **The audience is the agent's.** Do not hardcode a segment. The email must read correctly whether
   it lands on a farm list, a sphere, or the buyers who inquired on this house.
4. **No chart.** Locked in `recipes.ts` and unchallenged by the research: a lifecycle email about one
   house gets the photo as its visual. *"Two bars (was/now) is a fact wearing a chart costume."*
5. **The listing's own photo or nothing. Never an aerial.**

---

## 2 — THE BYTES-LEVEL INVARIANT (every lifecycle email has exactly one; this is ours)

New Listing's is that the address DOES ship. Coming Soon's is that it does NOT.

**UNDER CONTRACT'S INVARIANT: the email states a PENDING fact and never a SOLD one.**
Assert against the RENDERED BYTES, non-zero exit on violation:

- The rendered HTML **MUST** contain the full street line and ZIP (this is a public, celebrated
  status — nothing is being teased or suppressed).
- The rendered HTML **MUST NOT** contain any of: `sold for`, `sold price`, `closed at`, `final sale`,
  `sale price`. A pending home has not sold and we do not hold a sold price.
- The rendered HTML **MUST NOT** contain a "days on market" phrasing derived from `days_in_state`
  (see §5 trap 1). If the speed line ships, it ships from the computed listed→contract span.
- The price that appears **MUST** equal `listing_state.list_price` for the subject, verbatim-formatted.

---

## 3 — WHY THIS EMAIL EXISTS (the three jobs, one email — from the crawl, not from memory)

Do not pick one. The CTA formula below serves all three at once, which is what resolved the fork.

**Job 1 — social proof, the beat in a narrative.** Oakley Signs, 06/18/2026, about a yard-sign rider
and it is the whole argument for this email: *"A rider clipped beneath the panel (Just Listed, Under
Contract, Sold) tells a story that neighbors follow in real time. They watch a listing come to
market, move through the cycle, and close. That narrative, repeated across multiple properties, is
what builds the perception of an agent who gets results in this neighborhood. **Each status update is
another impression.**"* Same source: the **Rule of 7** — ~7 brand encounters before action. Under
Contract is one of the seven, and it is the one most agents skip. **This email has nothing to sell,
and that is the point.**

**Job 2 — recapture the underbidders.** Known band, known area, known moment of wanting.
**But do NOT build a backup-offer ask:** Redfin cites NAR — *only 6% of home sales fall through*.
That is a 1-in-17 shot. The honest recapture CTA is **"here's what else," never "get in line."**

**Job 3 — speed as proof.** The one number this email owns. See §4 cell 6.

---

## 4 — THE RECIPE. THE FULL LADDER. EVERY CELL, EVERY SOURCE, EVERY FALLBACK.

Written complete per the §2.2.2 precedent — *"You have written down the entire recipe? We know where
everything has come from and has fallbacks!?"* **Do not write "rides New Listing unchanged."**

**Subject** — 30–40 chars for an open (`emails.md` §0). Leads with the status, not the celebration.
· Rung 1: `Under contract: <street>` (street only, keeps it short).
· Rung 2: `Under contract in <N> days` when the speed number resolved and N is genuinely short.
· Rung 3: `Under contract: <city>` if the street line is unusable.
There is no rung 4 — a subject always resolves.

**Cell 1 — Address (street, city, state, ZIP).** SHIPS in full.
· Rung 1: free spine `street_address` + `city` + `zip_code`.
· Rung 2: the address the agent typed when they created the project (lane 4 — they own this listing).
· Rung 3: OPEN SLOT is NOT allowed here; the invariant requires it. If both rungs miss, the build
  fails loudly rather than shipping a headless email.

**Cell 2 — Price.** SHIPS. Operator decision 1.2.
· Rung 1: `listing_state.list_price`. · Rung 2: the agent's figure at trigger. · Rung 3: OPEN SLOT.
· NEVER a paid call for this — the free spine has it.

**Cell 3 — The spec strip (beds · baths · sq ft · $/sq ft · type).** Same strip the other three
lifecycle emails wear; reuse `lib/email/listing-flyer.ts` `spec()`/`pricePerSqft()`/`shortType()`.
· beds/sqft: free spine → paid row → OPEN SLOT.
· baths: free spine → Lee records → nearby-values → paid row → OPEN SLOT (the existing five-lane
  ladder; do not invent a sixth).
· `$/sq ft` is DERIVED — it carries the derived footnote, same as New Listing.
· **Include the LOT here** (unlike Coming Soon, which drops it to avoid narrowing a parcel search —
  that reason is gone once the address ships).

**Cell 4 — Hero photo.** The listing's own or NOTHING. Never an aerial.
· Rung 1: free spine `photo_url` (mirrored into our storage). · Rung 2: the paid row's gallery
  first image, only if a paid row already exists — **never buy one for this email**.
· Rung 3: no photo, and the layout degrades to a text masthead. An absent photo is fine; a wrong
  photo is not.

**Cell 5 — Status line ("Under contract").** Literal, from the agent's trigger. Not detected.
· **Wording is UNVERIFIED** — "under contract" vs "pending" in Florida practice was researched and
  three sources failed. Default to **"under contract"** (it is the recipe key and the operator's
  word throughout this walk) and put the wording question to him before the section is finalized.

**Cell 6 — SPEED. The headline number, and the moat.**
Shape, verbatim from Coffee & Contracts: *"Most homes in [City Name] sell in X days, this one sold in
X — here's why."* Two numbers side by side.
· **This home's number** = the agent's contract date MINUS the listed date.
  listed date: rung 1 free spine `listing_state.listed_date` (populated on 5,661 of 7,209 pending
  sale rows, 08/05/2026) → rung 2 the agent's own figure at trigger (they own the listing, they know
  it) → rung 3 the speed line is DROPPED ENTIRELY. Never estimated.
· **The market median** = `listing_dom` off our own daily spine, scoped to the subject's city or ZIP
  → rung 2 county scope → rung 3 the comparison is dropped and only this home's number ships.
· **NEVER from `days_in_state`.** See §5 trap 1.
· **This is where the four-lane moat shows up inside a lifecycle email.** We hold the median; nobody
  else emailing an agent's database does.

**Cell 7 — The CTA. ONE. The formula is decided.**
Coffee & Contracts, answering exactly "how do I make this attract SELLERS": lead with the speed fact,
close with the soft value ask. Their example — instead of *"Congrats to my amazing buyers!"* write
*"Sold in 9 days with 4 offers — here's what made this listing stand out,"* then
*"Thinking about what your home could sell for? Let's talk."* Their reason: *"That shifts the post
from a celebration into a soft pitch that speaks directly to anyone quietly wondering about their own
home's value."*
· **So: speed is the BODY, social proof is the CTA.** They are not competing designs.
· CTA destination follows `lib/email/button-destinations.ts` — the label must match where it goes
  (Gmail: *"recipients should know what to expect when they click a link"*; a homepage standing in
  for a specific promise is a deliverability violation, not a taste call).
· A bare "congrats" with no ask is the documented failure mode.

**Cell 8 — Body prose.** 50–125 words, and **the floor bites harder than the ceiling** — this email
has less to say than New Listing and the temptation is to run empty. 1–3 questions. 3rd-grade level.
Never neutral sentiment. Source: `authorListingNarrative` / `fillNarrative` in `recipes/shared.ts`,
same as the other three. Numbers come from the cells above, never from the model.

**Cell 9 — The bottom (identity, contact, socials, CAN-SPAM).** Untouched — it now carries 32 brand
fields across the account→project boundary via `PROJECT_CARRY_KEYS`. **Derive the key list from
`lib/brand/profile-ledger.ts`. A hand-written brand key list is a defect on arrival.**

**Timing (not a cell, but a build rule):** send within **24–48 hours** of the agent's trigger —
*"waiting weeks dilutes both your enthusiasm and the storytelling impact."* Build on notify, never
batch.

---

## 5 — TRAPS. Each one is a real, measured landmine.

**Trap 1 — `days_in_state` is NOT time under contract.** It ages only while `state` is unchanged and
resets only on a `state` CHANGE (`ingest/pipelines/listing_lifecycle/transitions.py:66,80`), and
`flag_pending` is not part of `state`. A live Lee row reads flag_pending true, state active,
days_in_state 34, listed 09/13/2024 — that 34 is days in ACTIVE. Printing "under contract in 34 days"
off it is a fabricated number built from a real column.

**Trap 2 — do NOT build a pending detector.** The agent tells us. Recorded only so nobody rebuilds
it: there is no under-contract state (`state` is only active 30,708 / sold 789 / withdrawn 223),
pending is a flag on an otherwise-active row (7,209 sale rows; Lee 4,824, Collier 2,221),
`listing_transitions.to_state` is only active 49,996 / sold 820 / withdrawn 234, and the flag is
**stale on 462 sold rows**. All measured live 08/05/2026.

**Trap 3 — the provenance table used to lie.** It clipped values with a bare `.slice()`, printed a
headshot URL as `…/showcase/launch`, and that got written into a handoff as a live defect. It was
never a defect. `render-new-listing.mts` now clips through a `clip()` helper that appends `…`.
**Copy the helper into `render-under-contract.mts`. Never re-introduce a silent slice.**

**Trap 4 — two numbers are UNRESOLVED, print neither.** NAR's 6% of sales fall through (crawled) vs a
16.3% December-2025 cancellation figure (search summary, no primary source reached). Different
definitions. Not for an email until one is read at its own source.

---

## 6 — THE BUILD, in order

1. `lib/deliverable/recipes/under-contract.ts` — copy the STRUCTURE of `coming-soon.ts`. **ONE
   resolver, never a second** (`recipes.ts`: these "differ only in framing, cells, chart, and prose
   source. NEVER write a second resolver."). Register in `recipes/index.ts`.
2. TDD is mandatory (RULE 3.5). Name each test for the failure mode it targets — at minimum:
   sold-language never renders; price equals list price; speed line drops rather than estimates when
   either date is missing; `days_in_state` is never read; address always ships.
3. `scripts/email/render-under-contract.mts` — copy `render-coming-soon.mts`: real render to
   `~/Downloads`, per-cell provenance table (with `clip()`), contract assertion against the rendered
   bytes with a non-zero exit, brand-field count derived from the registry.
4. **RENDER IT AND LOOK.** 2,407 green tests are not the gate; the artifact in `~/Downloads` is.
   Five defects were found by looking in §2.2 that no test caught.
5. Then write the playbook section with this ladder in full.

**Run these first — both worked 08/05/2026:**
```
bun --env-file=.env.local scripts/email/render-new-listing.mts
bun --env-file=.env.local scripts/email/render-coming-soon.mts
```

---

## 7 — STATE, honestly

**DONE:** the walk, all operator decisions, the research (2 rounds, 5 of 13 URLs, filed + indexed),
the recipe above, the provenance-clip fix, three checks opened and one closed.
**NOT DONE — this is the whole of §6:** the recipe file, its tests, the render script, the rendered
artifact, the playbook section. **Zero code exists for this email.** No test has been written and
nothing has been rendered. Do not report §2.4 as started.

**Open, unrelated to this email but found while measuring it:**
`pending_homes_counted_as_active_inventory` (5,118 under-contract homes sit inside the active
inventory counts the Coming Soon email ships — operator's call, do not change a served number) and
`flag_pending_stale_on_sold_rows`.
