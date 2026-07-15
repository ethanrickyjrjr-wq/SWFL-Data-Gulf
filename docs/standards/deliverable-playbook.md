# The Deliverable Playbook

**Rewritten 07/13/2026**, after all twelve recipes were built for real and adversarially
verified. Everything here was checked against running code, a live database, and rendered
artifacts on that date. **Where the previous version was wrong, it says so** — it was wrong
in ways that *caused* bugs, and that is worth knowing.

---

## Part 0 — Read this first

The product used to show customers beautiful example emails and hand them something else.
The examples **were never built by the product**: 18 hand-written HTML files were vendored
into `public/showcase/`, and `capture-showcase.mjs` only screenshots them.

**All twelve recipes are now built, registered, and dispatch from one key.** But the
samples still promise things the data cannot give (Part 8), and that is now the biggest
lie left in the product.

---

## Part 1 — The one thing to understand

> **INVENTION IS CLAIM-SHAPED, NOT NUMBER-SHAPED.**

On 07/13, seven workers built seven deliverables. **Four shipped a falsehood**, and every
author had "verified it by eye". Here is what shipped:

- *"$209/sq ft sits just **below** the $213 median — and below the two recorded sales,
  which closed at $173 and $195."* — **$209 is ABOVE both.** The central argument of a
  price-defense email, inverted.
- *"went under contract after **75 days** on market"* — no source holds a days-to-contract
  interval. The vendor's DOM is **null**.
- *"the seller had reduced the price **before** a contract was reached"* — we hold a cut
  AMOUNT. No cut date. No contract date. **No ordering.**
- *"the gap is **widening**"* — given ONE national LEVEL and no trend. **A level is not a
  direction.**
- *"**five** of those six ZIPs"* — the true count was **four**.
- *"on **Shore Dr**"* — we hold no street relationship. Only "nearby". (It had been banned
  from the word "street".)

**NOT ONE OF THOSE CONTAINS AN INVENTED NUMBER.** Every figure was correctly sourced. What
was invented was **the claim drawn between correctly-sourced numbers** — a comparison, a
trajectory, a count, a sequence, a location. A digit lint cannot see any of them.

And one more, which is worse than all of them:

- *"I farm **North Fort Myers**"* → the builder resolved **Fort Myers** and shipped a
  confident, beautifully-cited email **about the wrong city**. Every number in it real,
  correctly sourced, and about the wrong place. **A gap is honest. A confidently wrong
  subject is a lie that looks exactly like the truth.**

---

## Part 2 — The claim gate (`lib/deliverable/claims.ts`)

**Structural, not lexical.** A banned-word list was tried and lost.

1. **CODE computes** the relation, the count, the ordering — `compareToSet`, `settledCount`.
2. The narrator receives the **result** as a settled English sentence.
3. The narrator receives **NO raw pair, NO raw set, NO row list.** *It cannot compare two
   numbers it was never given two of.* **This is the defense.**
4. `auditClaims` is a **FAIL-CLOSED BACKSTOP** — on any hit, the paragraph is **dropped to
   an open slot**. Never shipped, never "best-effort".
5. Print `CLAIM_PROHIBITION` into the narrator's system prompt, so the model is told the
   exact rule the lint enforces.

**Your done-condition is greppable: the narrator receives no raw set.** Not "a verifier
didn't complain" — that recursion never terminates.

**The lint has been beaten TWICE, so do not trust it alone:**

- *Round 1:* it matched only **spelled** counts, so `"All 6 comparable homes are recorded
  sales"` shipped cleanly — **false**, and the digits were already in the allow-set because
  the settled sentences supplied them. **An absent control, not a beatable one.**
- *Round 2:* it was silent on **layout self-reference**. The narrator has **zero layout
  knowledge** — it never sees the document — and the layout *moves* underneath it (an empty
  row is omitted, a chart is dropped). *"The chart below"* becomes a visible lie.

Both are closed. Assume there is a third. Upgrade to entailment
(check `claims_gate_entailment_upgrade`).

---

## Part 3 — The four rules

### 1. Resolve the subject ONCE, from a real record

The dispatcher does it (`resolveSubject`, `lib/deliverable/recipes/shared.ts`). **NEVER
WRITE A SECOND RESOLVER.** The address reaches the builder from the field **or** the
prompt; the *builder* decides, never the door.

**A subject we cannot resolve must cost an OPEN SLOT — never a neighbouring one.**

### 2. A cell renders only if it is sourced — an unfillable cell is an OPEN SLOT, not a lie

- **sourced** → render it.
- **not sourced** → on the canvas, an open slot the user can fill; in the **sent email it
  does not exist**. Never a zero. Never a naked label.
- **invented** → forbidden, always. The only hard block in the product.

**Before deciding a field is unfillable, check whether we already fetch it and throw it
away.** `lotSize` and `propertyType` were in the vendor row and never mapped; `baths` was on
an endpoint we already call.

### 3. A chart only when the deliverable is ABOUT a number — and about the SUBJECT

A new-listing email is about a **house**; its visual is the photo. **No chart.** An area
index on a listing tells a buyer nothing. A comps bar turns it into a comps email. **Two
bars (was/now) is a fact wearing a chart costume — write the fact.**

An **empty chart box is worse than no chart.** Policy `none` → `dropEmptyChartSlot`.

### 4. The model writes prose. Nothing else.

Not layout. Not which cells exist. Not numbers. Not comparisons, counts, trajectories,
sequences, locations, motives — **see Part 2.**

**A fact about a home is not only a number.** A view, a pool, a renovation, a floor plan, a
finish is equally an invention if it wasn't given. (A model once guessed "waterfront
character" and happened to be **right**. Guessing correctly is luck, not sourcing.)

**No vendor sells us MLS remarks** — all 18 SteadyAPI endpoints checked 07/13/2026;
realtor.com blocks the page. So a listing description is a **lane-2 fact: the agent pastes
it.** With no paste, the narrator has **no source for a paragraph at all** — so it writes
none, and the slot stays open. That is correct behaviour, not a failure.

### The four lanes, in order

our data → **the user's own text/upload** → a named web source → a figure the user states.
**Never refuse the build. Never invent.**

---

## Part 4 — The open-slot contract

**Operator ruling:** *"For info we don't have, we leave open with instructions for the user
to paste or add."*

`emailRender` is the mechanism. **`stats`, `image` and `text` honor it** (an empty cell is a
"+ Add" affordance on canvas and **absent** from the sent email; a row with no surviving
cell is omitted; an empty image is a dropzone with a file-picker and a paste-a-link).

⚠️ **`hero` and `signal` still do NOT honor it.** An empty hero would ship a naked label.
*(This corrects the previous playbook, which claimed only `SocialIconsBlock` honored it —
that was true when written and is no longer.)*

**NEVER default an instruction into a brand block.** The AI deliberately skips brand blocks,
so whatever is defaulted there **ships verbatim**. The agent-card bio defaulted to *"A short
bio that builds trust with your readers"* and was verified rendering into a **sent** email
under an agent's own name. Two seed cards likewise emailed coaching notes to real
recipients.

---

## Part 5 — The reference implementation

`lib/deliverable/recipes/new-listing.ts`. Read it before writing yours. Copy the **shape**,
not the framing.

**Live fixture:** `326 Shore Dr, Fort Myers, FL 33905` → $595,000 · 3 bd · 3.5 ba · 2,847
sqft · $209/sqft · 0.26 ac · Residential, with a real photo.

⚠️ **`465 Gordonia Road` (the Latitude 26 showcase house) IS FICTIONAL and does not
resolve.** Do **not** use the hand-written showcase HTML as an acceptance target.

---

## Part 6 — The twelve recipes

Per-recipe landmines now live at `lib/deliverable/recipes/<name>.ledger.md` — one file per recipe,
gated (Gate 9, `check-prepush-gate.mjs`) so an "Enforced" claim can never silently orphan from the
test that backs it. This section used to hold that table directly; see
`docs/superpowers/specs/2026-07-15-per-unit-coverage-ledgers-design.md` for why it moved.

**All twelve are still registered in `lib/deliverable/recipes.ts`** — that registry stays the
authority on skeleton · prose · subject spine · chart policy; the ledgers document what's PROVEN
about each, not what each IS.

**Skeletons:** *"it probably already exists, load it"* is **NOT universally true** — and believing
it is harmful. Every listing seed is **address-forward** (hero label literally "Price and
address"), so `coming-soon` loading one leaves an open slot **inviting the user to paste back the
address the recipe exists to suppress.** A coded grid in your own file is legitimate
(`buildListingFlyer` is one).

**Social** (`social-pack`, `social-cut`) is **NOT `RecipeBuilder`-shaped** and is deliberately
unregistered — no ledger for these two; they're out of this pilot's scope (spec §2). Two live
systems; neither touches the dispatch table; and **the social path has NO no-invention gate at
all** (check `social_path_has_no_no_invention_gate`).

---

## Part 7 — How you prove it

**Do NOT claim it works because the code looks right.** Every unproven claim on 07/13 turned
out wrong at least once — and in the round after that, **every re-fix was refuted again.**

1. Build through the **real path**: `authorDoc({ prompt, rawDoc, recipeKey })` with **NO
   scope** — that is the Lab door, the one that was broken.
2. Render with `renderEmailDocHtml` — the same renderer a send uses.
3. **LOOK AT IT.** Screenshot and open the image. Grepping the HTML is not looking at it.
4. **RE-DERIVE EVERY COMPARISON WITH ARITHMETIC.** Do not read it — **compute** it. *"$209
   is below $195"* reads fine and is false. **A reversed inequality looks exactly like a
   correct one.**
5. **Run the real row grouper and `compileGrid`.** Assert every row's widths sum ≤ 12, no
   ghost tables, no `width="1800"`. **A picture that looks right in Chromium is not proof for
   an email** — a 3-column 1800px Outlook table passed a browser screenshot.
6. Trace **every rendered value and every clause of prose** to a source.

`authorDoc` now **logs loudly** when a builder's doc fails schema and falls back to the
generic author. If you see that, **what rendered was not your recipe.**

---

## Part 8 — What is still a lie

**The showcase samples promise numbers that do not exist.** They were drawn without checking.

- `465 Gordonia Road` **is fictional.**
- **Under Contract** — *"pending in 90 days while rival estates sit at 238 and 279"*,
  *"85 pendings, 31 at $2M+"*. **None of it is sourceable.**
- **Market Comps** — *"six live comparable listings"*. The real set is 2 sales + 4
  valuations.

**A spec that asks for a number no lane holds is an instruction to lie, and the model will
obey it.** That is not a model failure. It is a spec failure.

Full list, with what to fix and what to research:
`_AUDIT_AND_ROADMAP/2026-07-13-deliverable-followups.md`.

---

## Part 8.5 — A CORRECTION TO THIS PLAYBOOK (07/13/2026)

**This document told you `old price = price + cut`. That is WRONG, and a recipe obeyed it and
shipped a falsehood.**

The vendor's live price history for the acceptance fixture (326 Shore Dr):

```
2026-04-29  Listed          $765,000   ← the ORIGINAL ask
2026-06-09  Price Changed   $699,975
2026-07-01  Price Changed   $595,000   ← current
```

`reduced_amount` = **104,975** = 699,975 − 595,000. It is **the MOST RECENT CUT.**

- `price + cut` = **$699,975** — the **PREVIOUS** price. ✅ true, and safe to label that way.
- The cut **from the original ask** = 765,000 − 595,000 = **$170,000**. ❌ **not** `reduced_amount`.

Under Contract wrote *"came down by $104,975 **from the original ask**"* — understating the
real cut by **$65,025**, and implying an original ask of $699,975, a price the home held only
as a mid-cycle step. **A real number wearing the name of a quantity we do not hold is still an
invented figure.** It is the same disease as *"went under contract after 75 days"* — and it was
worse, because **CODE** wrote it, not the model.

**AND THE UPSIDE:** `/property-tax-history` **carries the full price history.** The original
ask and the true total cut are **real, sourceable numbers we simply were not reading.** Read
them. (Check: `listing_price_history_original_ask`.)

**The general rule this proves:** *derivable ≠ source-faithful.* Before you name a quantity,
ask what the vendor actually measured — not what arithmetic you can do to its fields.

---

## Part 9 — Landmines

- **`fillNarrative` SKIPS a text block that already has content.** A skeleton that prefills
  the commentary slot ships raw MLS copy instead of authored prose. **Clear, then author.**
- **`lotSize` is ACRES** in our type; the vendor's `lot_sqft` is square feet. The normalizer
  converts. **Do not double-convert.**
- **The canvas lies about the email.** Three render engines disagree.
- **ESLint runs at `--max-warnings=0`** in the pre-commit hook. An unused function fails the
  commit. **Never `--no-verify`.**
- **`mock.module` replaces the WHOLE module** for every importer in the test process. Spread
  the real module, or you will silently strip exports and break innocent files.
- **The git index is shared with parallel sessions.** Stage explicit paths; never `git add -A`.

## Part 10 — Positioning: sell-side vs story-side

Every recipe declares `positioning: "sell-side" | "story-side"` on its `Recipe` record
(`lib/deliverable/recipes.ts`):

- **Sell-side (9):** `new-listing`, `coming-soon`, `market-comps`, `under-contract`, `just-sold`,
  `open-house`, `price-reduced`, `agent-brand-intro`, `agent-launch`.
- **Story-side (5):** `sphere-weekly`, `market-pulse`, `review-reply`, `social-pack`, `social-cut`
  (the last two ship `"story-side"` as an inert default — neither reads any prompt this design touches).

`FAVORABLE_FRAMING_POLICY` (`lib/deliverable/recipes/shared.ts`) is pasted verbatim into exactly THREE
prompts, not all nine sell-side recipes' prompts: `authorListingNarrative` (shared.ts — covers new-listing,
coming-soon, price-reduced, just-sold, open-house), `authorUnderContractNote` (under-contract.ts, its own
bespoke prompt, NOT routed through the shared narrator), and `buildNarratorPrompt` (market-comps.ts). It is
deliberately absent from `authorAreaRead` (agent-brand-intro.ts) and `LETTER_SYSTEM` (agent-launch.ts) —
both carry an absolute no-numbers/no-facts constraint the block would contradict.

The block's priority sentence, stated first inside it: cited facts — including unfavorable ones — are
never dropped, softened, or omitted. This governs emphasis and ordering of true facts, never which facts
appear.

**The magnitude permission is direction-symmetric.** When settled facts show a large gap, state its size
plainly rather than hedging it — identically whichever way the number points. `market-comps.ts`'s
`buildPriceCase` is the reference implementation: its `isExtreme` check fires on the gap's relative size,
never on which direction is "the favorable one."

**Charts carry the argument too.** `price-reduced` gained a new chart (`priceVsAreaDotSpec`) plotting the
new price's $/sq ft against a sourced comp median, using the already-registered `dot-plot` frame — no new
chart-rendering code, reusing `compsForAddress` (the same data root `market-comps.ts` calls).

Research: `_ASSISTANT/research/2026-07-15-sell-side-copywriting-research.md`,
`_ASSISTANT/research/2026-07-15-ai-steering-anti-drift-research.md`,
`_ASSISTANT/research/2026-07-15-authority-reasoning-not-hype-research.md`. Design doc:
`docs/superpowers/specs/2026-07-15-sell-side-favorable-framing-design.md`.
