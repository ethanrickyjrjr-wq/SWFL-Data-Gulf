# The Deliverable Playbook — and the handoff brief for finishing the other recipes

**Written 07/13/2026.** Everything here was verified against running code and live vendor
calls on that date. Nothing in it is from memory. Where something is unverified, it says so.

**Who this is for:** an agent picking up the deliverable engine cold, who will fan out one
worker per recipe. Read Parts 1–5 before dispatching anything. Part 6 is the per-recipe
assignment. Part 7 is how a worker proves it's done. Part 8 is what will bite you.

---

## Part 0 — The one-paragraph situation

The product shows customers beautiful example emails and then hands them something else.
The examples were never built by the product: `d3292777` **vendored the Latitude 26
lifecycle emails as 729 lines of hand-written HTML** into `public/showcase/`, and
`scripts/capture-showcase.mjs` only opens those files in a browser and screenshots them.
No code path could produce them. Meanwhile every recipe click opened a **blank page** and
asked a model to improvise, ignoring the 27 real skeletons committed in the repo.

On 07/13/2026, **New Listing** was made to actually work, end to end, from the address
alone. It is the reference implementation. Your job is to do the same for the rest, using
its pattern — **but they are not all the same**, and Part 6 says how each differs.

---

## Part 1 — The paths (what happens when a user clicks "build")

### The doors — five, and they differ in ONE thing: what `scope` they hand the builder

| Door | Passes |
|---|---|
| Homepage hero | `{ address }` — it has an address field |
| Email Lab campaign button | **nothing** — the address lives only in the prompt text |
| Showcase "Make this →" | **nothing** |
| Project lab (`/project/[id]/email-lab`) | the project's `subject_address` |
| ZIP door (map / report "email this") | `{ kind: "zip", value }` |

This is why the *same* recipe produced a photo flyer from the homepage and a ZIP grab-bag
("Typical asking rent", no photo, no price) from the Lab. The property lane was gated on
`scope.address`, and three of five doors never set it.

**Fixed 07/13:** `authorDoc` now reads the subject from the field **or** the prompt
(`subjectAddressFromPrompt`, `lib/email/listing-intent.ts`) and is the ONE authority on
which. **Never re-gate a lane on how a door happens to pass something.**

All doors POST to `app/api/email-lab/ai/route.ts`.

### The builders — that one route picks between THREE

1. `authorDoc` (`lib/email/build-doc.ts`) — when `build === true || mode === "author"`.
   **This is the one you want.** Inside it are two lanes:
   - the **subject-listing lane** — resolves the real house, builds the fixed flyer grid;
   - the **free author** — knows only ZIP aggregates + nearby sold comps. No photo, no
     property. **This is the grab-bag**, and it is where 15 of 17 recipes still land.
2. `buildContentDoc` (same file) — the patch path. Its rich-flyer branch is gated on a
   **pasted URL**. If you wire a door here by accident you reintroduce the original bug.
3. the **showing-prep assembler** — intercepts before either when the prompt looks like a
   showing prep (`isShowingPrepPrompt`).

### The renderers — one document, THREE engines

Canvas (`GridCanvas` → `BlockRenderer`), sendable email HTML (`EmailDocRenderer` /
`compile-grid`), and PDF. **They disagree.** The ZIP trend chart drew full axes on the
canvas and shipped as an axis-less line in the email — so the preview lied about what the
recipient would get. Assume nothing renders the same in all three until you check.

---

## Part 2 — Four different things are called a "recipe", and none are wired together

| Where | What a "recipe" is there |
|---|---|
| `lib/showcase/registry.ts` | a **prompt string** with a `[[blank]]` — what the buttons seed |
| `lib/email/author-recipes.ts` | 11 **advisory prose nudges** appended to the model's system prompt. Its own header says *"The model MAY deviate — nothing here is enforced."* Test-enforced to contain **zero digits**. There is **no `new-listing` entry at all.** |
| `lib/email/doc/default-docs.ts` | **27 positioned skeletons** — real grids: `new-listing`, `just-sold`, `open-house`, `price-reduced`, `listing-feature`, `neighborhood-report`, `investment-brief`, `monthly-digest`, `year-in-review`… |
| `lib/email/listing-flyer.ts` | a **hard-coded grid** built in TypeScript |

**THE DISEASE.** `planArrival` (`lib/lab-entry/arrival.ts`) returns `{ kind: "blank" }` for
**every** recipe arrival. The client then loads `skeleton-clean-white` — an empty page. All
27 skeletons are skipped and a model improvises on a blank canvas.

**The designs are in the repo. The build path never loads them.** This is still true today
and is the single highest-leverage thing left to fix.

---

## Part 3 — The four rules

Every failure found on 07/13 violated one of these.

### 1. Resolve the subject once, from a real record

A deliverable has a **subject** — a house, a ZIP, a farm area, an agent. Resolve it ONCE,
from a real source, before any layout happens. Never let a model infer the subject from
prose. Read it from the field **or** the prompt; the builder decides, not the door.

### 2. A cell renders only if it is sourced — but an unfillable cell becomes an OPEN SLOT, not a lie

Three distinct states, and they are not the same:

- **sourced** → render the value.
- **not sourced, and we could never source it** (a bath count the vendor doesn't carry) →
  on the canvas it is an **open slot the user can fill**; in the **sent email it does not
  exist**. Never a zero. Never a naked label with nothing under it.
- **invented** → forbidden, always. This is the only hard block in the product.

See **Part 4** — this is the contract, and it is currently only half-built.

**Before you decide a field is unfillable, check whether you are already fetching it and
throwing it away.** `lotSize` (0.26 ac) and `propertyType` were in the vendor row and never
mapped. `baths` was on `/nearby-home-values` — **an endpoint we already call** — and never
read. Both rendered as empty labels over data we held.

### 3. A chart only when the deliverable is ABOUT a number — and it must be about the subject

- A **new-listing** email is about a **house**. Its visual is the photo. **No chart.**
- An area index chart on a listing tells a buyer nothing about the listing.
- A comps bar on a listing email turns it into a comps email.
- Two bars (was/now) is a fact wearing a chart costume. Write the fact.

A **Market Comps** email, by contrast, IS about a number — so it gets the chart. Chart the
subject, not the area around it. If the deliverable isn't about a number, ship no chart; an
empty slot is worse than no slot.

### 4. The model writes prose. Nothing else.

Not layout. Not which cells exist. Not numbers.

Prose is only as good as what you hand it. Handed the spec cells and told "use only these
facts", the only sentence it can write is the cells read back — which is exactly what it
wrote, printed under a grid that already said the same thing.

Hand it **sources**, and forbid the rest:

- every number must appear in the facts given;
- **a fact about the home is not only a number** — a view, a waterfront, a pool, a
  renovation, a school, a finish is equally an invention if it wasn't given. (The model
  guessed "waterfront character" and happened to be *right*. Guessing correctly is luck,
  not sourcing.)
- when using the user's own words, **keep them true** — an "idle to open water" does not
  become "minutes to the river";
- **never add a selling claim of its own** — "priced to move", "won't last", "a rare
  opportunity" are the model's words, not facts about the house.

### The four lanes for filling a gap, in order

our data → **the user's own text / upload** → a named web source → a figure the user states.

**Never refuse the build. Never invent.** For a listing description specifically: **no
vendor sells us MLS remarks.** All 18 SteadyAPI real-estate endpoints were checked on
07/13/2026 — `/search` returns `beds`, `sqft`, `lot_sqft` and flags, and nothing else
descriptive; realtor.com blocks the page. So the description is a **lane-2 fact: the agent
pastes it**, and it becomes the narrator's source of truth.

---

## Part 4 — THE OPEN-SLOT CONTRACT (read this before building any recipe)

**Operator ruling, 07/13/2026:** *"For info we don't have, we leave open with instructions
for the user to paste or add. If a photo, a button to open files or a link to add —
whichever is the easiest path."*

This is the rule that keeps "never invent" from becoming "never build". A gap is not a
blocker and it is not a blank — **it is an invitation, addressed to the user, on the
canvas, that never reaches the recipient.**

### The mechanism already exists — generalize it, don't invent it

`lib/email/blocks/BlockRenderer.tsx` takes an `emailRender` flag, documented in the file as:

> *"True on the sendable-HTML paths (EmailDocRenderer, compile-grid) — canvas-only
> affordances (empty-state placeholders) must not reach a recipient."*

**Today only `SocialIconsBlock` honors it** (`if (entries.length === 0 && emailRender) return null`).
`stats`, `image`, and `text` blocks do not. That is the gap.

**What a worker must build (verified as NOT done):**

1. **Empty stat cell** → on canvas, renders as an editable placeholder showing its label and
   an obvious "add" affordance. On `emailRender`, the cell is **omitted** (and if a row has
   no surviving cells, the row is omitted).
2. **Empty image slot** → on canvas, renders a **dropzone with a file-picker button and a
   "paste a link" input**. `EmailLabGridShell.uploadNewPhoto(file)` already exists — wire the
   empty slot to it rather than writing a second uploader. On `emailRender`, omitted.
3. **Empty text slot** → on canvas, a placeholder whose text is an **instruction**
   ("Paste your listing description — we'll tighten it"). On `emailRender`, omitted.

**The label is the instruction.** This is already the house rule for seed templates
(`lib/email/CLAUDE.md`, "THE SLOT RULE": *a label is an instruction to whoever fills the
slot, not a caption*). Extend it to gaps: the label tells the user what to paste.

### Honest status of the reference implementation

New Listing currently **drops** an unsourced cell at build time (`listing-flyer.ts`). That
satisfies "never ship a naked label" but **not** "leave it open for the user to fill" — the
operator explicitly asked for the latter for Baths. **Reconciling these is the first task
in the fan-out** (Part 6, task R0) and it must land before, or alongside, the other recipes,
because every one of them depends on it.

---

## Part 5 — The reference implementation: New Listing

Read the code before copying it: `authorDoc`'s subject-listing lane in
`lib/email/build-doc.ts`, plus `lib/listings/resolve-subject.ts` and
`lib/email/listing-flyer.ts`.

- **Subject spine** — the listing address, from `scope.address` OR the prompt.
- **Resolve** — `resolveSubjectListing(address)`: geocode (Mapbox) → **Lee (12071) /
  Collier (12021) gate** → SteadyAPI `/search` by address slug → match on canonicalized
  street line. Then `withBaths()` makes ONE extra call to `/nearby-home-values` for the bath
  count (the subject is the nearest property to its own coordinates, so it comes back as its
  own first row).
- **Photo** — the vendor's `photo_url`, **mirrored into our own Supabase storage**
  (`mirrorHeroPhoto`) so a re-send months later doesn't depend on the vendor CDN.
- **Skeleton** — the coded flyer grid (`buildListingFlyer`).
- **Cells** — price · beds · baths · sqft · $/sqft · lot · type. Each renders only if
  sourced. (`$/sqft` is computed from price ÷ sqft — both must parse, or the cell is gone.)
- **Chart** — **none**.
- **Prose** — the agent's pasted description, tightened. No invented qualities, no pitch.
- **Framing** — "New Listing" kicker, price + address hero, "View the Full Listing" CTA.

**Live proof (07/13/2026, 326 Shore Dr, Fort Myers 33905):** resolves to $595,000 · 3 beds ·
3.5 baths · 2,847 sqft · $209/sqft · 0.26 ac · Residential, with the real photo. Vendor also
returns `is_new_construction: true` and `price.reduced_amount: 104975` (the size of the
**cut**, not the old price — old = price + reduction).

---

## Part 6 — The assignments

**There are 17 recipe entries but only 12 DISTINCT recipes** — several slides reuse the
campaign's exact prompt verbatim. **Do not dispatch two workers onto the same prompt.**
Dedupe first; the duplicates are noted below.

Every worker answers the same six questions, then builds. **The answers are the only thing
that differs between recipes.**

1. **Subject spine** — what gets resolved? (a listing address · a ZIP / city · an agent · nothing)
2. **Skeleton** — which committed grid from `default-docs.ts`? **It probably already exists. Load it.**
3. **Cells** — which facts, each with a real source. Unsourced → open slot (Part 4). Never a zero.
4. **Chart** — is this deliverable ABOUT a number? If not, none.
5. **Prose source** — what may the model draw from? Hand it those; forbid everything else.
6. **Framing** — kicker, hero, CTA. This is the hat. The facts underneath are often the same.

### R0 — THE OPEN-SLOT CONTRACT (do this FIRST; everything else depends on it)

Generalize `emailRender` empty-state suppression to `stats`, `image`, and `text` blocks, and
build the canvas affordances: file-picker + paste-a-link for an empty image, editable
placeholder for an empty cell, instruction placeholder for an empty text slot. Reconcile
`listing-flyer.ts` so an unsourced cell becomes an **open slot** rather than being dropped at
build time. See Part 4.

### The listing lifecycle — the SAME resolved house wearing different hats

These five all share the New Listing subject spine and resolver. **Reuse it. Do not write a
second resolver.** They differ only in framing, cells, chart, and prose source.

- **R1 · New Listing** — ✅ **DONE.** The reference. Don't re-do it.
  *(The campaign seed and the "New Listing" slide are the SAME prompt — one recipe.)*
  Note: the seed prompt still asks for "a chart of the ZIP's home-value trend". The operator
  killed that chart. **Update the registry prompt to stop promising it.**

- **R2 · Coming Soon** — *"hold the street address back, use real county inventory counts to
  show how scarce homes like it are, one CTA to join a private preview list."*
  Subject: the same house, but the **address is suppressed** (that's the whole point — do not
  leak it into the hero, the photo alt text, or the subject line). Cells: scarcity counts from
  live county inventory, not the spec grid. Chart: possibly a scarcity count — it IS about a
  number. Framing: teaser, private-preview CTA.

- **R3 · Market Comps** — *"six live comparable listings nearby with each price and price per
  square foot, a price bar chart, and a straight case for my asking price."*
  **This is the recipe the comps chart belongs to.** `compsForAddress` (`lib/assistant/comp-helper.ts`)
  is the source. **HARD RULE, learned the hard way: a comp must have `beds` AND `sqft`, or it is
  a vacant lot.** The nearby set mixes bare land in with homes (315 Shore Dr: `beds:null,
  baths:null, sqft:null, lotSqft:16640`, sold $127.5k) and charting land against a 2,847 sqft
  house makes the ask look like a bargain for a fake reason — the narrator then wrote a sentence
  on that misreading. Filter by data, not by guessing at the name. Include the subject as its own
  bar (we have its list price; the chat comp lane deliberately omits a subject bar because *its*
  subject has no price — that reasoning does not apply here).

- **R4 · Under Contract** — *"lead with how fast it went pending compared to the ZIP's typical
  days on market, and invite backup offers."*
  Subject: the same house. The headline is a **comparison number** (its DOM vs the ZIP's typical
  DOM) — so this one IS about a number and earns a chart or a stat. **Check the vendor actually
  returns `daysOnMarket`: on the row we inspected it was `null`.** If it's null, that's an open
  slot with an instruction, not a made-up number.

- **R5 · Sold** — *"set the close among the week's real sales nearby, and end with a private
  home-valuation offer for my readers."*
  Subject: the same house, now sold. Cells: the close price. Uses the comps set as *context*
  (the week's real sales), so R3's land filter applies here too. Framing: sold hero,
  valuation-offer CTA.

### The area / agent recipes — a different spine entirely

These have **no listing subject**. Do not force the flyer on them. Their subject is a ZIP or
a city, and the free-author lane is *legitimate* for them — but it must load a real skeleton
instead of a blank page.

- **R6 · Agent Brand Intro** (`launch-blitz`) — *"a ZIP-by-ZIP asking-price chart from live
  listings, my name and headshot up front, and my newest listing as the anchor."*
  Two spines at once: a **farm area** (ZIP/city) AND the agent's **newest listing** as anchor.
  Needs the agent's **headshot** — a photo we don't have → open slot with a file-picker (Part 4).

- **R7 · Agent Launch / "The Letter"** (`agent-launch`) — *personal letter, one real market
  insight, a numbered what-happens-next, one reply CTA, photo beside the letter not above it.*
  *(The campaign seed and the "The Letter" slide are the SAME prompt — one recipe.)*
  Mostly the agent's own voice + ONE cited market number. Headshot → open slot.

- **R8 · Weekly Sphere Update / "Headlines vs Here"** — *"one national or Florida headline
  number set beside my own area's number, one honest read of the gap, invite readers to reply
  with their address and the word REVIEW."*
  *(The agent-launch follow-up and the "Headlines vs Here" slide are the SAME prompt — one recipe.)*
  The headline number is a **lane-3 fact (a named web source)** — it is not in our lake. Cite it
  or leave it an open slot. Never invent it.

- **R9 · The REVIEW Reply** — *"the current home-value level and trend, days on market, and
  active inventory, each cited, with one honest read."*
  A one-area snapshot. Pure lake data. This one is genuinely about numbers → chart is right.

- **R10 · Monthly Market Pulse** (`market-pulse`) — *"every ZIP's month-over-month home-value
  move, one snapshot chart, and one honest read of the trend."*
  ⚠️ **The campaign seed, "The Ask", AND "The Pulse Email" are all the SAME prompt — three
  entries, ONE recipe.** Build once.

### Social surfaces — a different renderer, confirm before building

- **R11 · Social Pack — 4 Formats** (`launch-blitz`) and **R12 · The Social Cut** (`market-pulse`).
  These are **social**, not email. There are two unwired social systems in this repo. **Confirm
  which one is live before writing anything** — do not assume the email path applies.

---

## Part 7 — How a worker proves it's done

**Do not claim a recipe works because the code looks right.** Every claim on 07/13 that
wasn't backed by a rendered artifact turned out to be wrong at least once.

The loop that works:

1. **Build it through the real path.** Call `authorDoc` with a prompt and NO scope — that is
   the Lab door, the one that was broken. If it only works with `scope.address` handed in, it
   is not fixed.
2. **Render it with the real renderer** — `renderEmailDocHtml(doc)`, the same one a send uses.
3. **Look at it.** Screenshot the HTML (Playwright via the pinned crawl4ai venv at
   `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe`) and actually open the image. Grepping the
   HTML is not looking at it — a chart PNG that ships with no axis labels greps fine.
4. **Trace every field to a source.** Photo, each cell, each number in the prose. If you can't
   name where a value came from, it is invented and the build is wrong.
5. **Verify against a REAL subject.** `326 Shore Dr, Fort Myers, FL 33905` resolves and is the
   known-good fixture. ⚠️ **`465 Gordonia Road` (the Latitude 26 showcase house) does NOT
   resolve — it is fictional.** Do not use the hand-written showcase HTML as an acceptance
   target; the builder cannot reproduce it from real data, and trying will waste hours.

**Definition of done for a recipe:** built from the prompt alone through `authorDoc`; every
rendered value traced to a real source; no naked labels and no zeros; every gap is an open slot
with an instruction; the chart is present only if the deliverable is about a number; tests pass;
`bunx eslint --max-warnings=0` and `bunx next build` clean; and a screenshot of the rendered
email is attached to the report.

---
PRODUCTION KEY IS IN VERCEL PHOTO_API

## Part 8 — Landmines (each of these cost real time on 07/13)

  
- **ESLint runs at `--max-warnings=0` in the pre-commit hook.** An unused function fails the
  commit. If you orphan code, delete it — **never `--no-verify`** (forbidden by CLAUDE.md).
- **`fillNarrative` skips a text block that already has content.** `buildListingFlyer` prefills
  the commentary slot with raw remarks, so if you leave it, 2,000 characters of raw MLS copy ship
  instead of authored prose. Clear the slot, then author.
- **The canvas lies about the email.** Three renderers; the preview drew chart axes the emailed
  PNG didn't have. Verify the *sent* artifact.
- **The vendor's `reduced_amount` is the size of the CUT, not the old price.** Old = price + cut.
- **`lotSize` is ACRES by convention** in our `Listing` type; SteadyAPI's `description.lot_sqft`
  is square feet. The normalizer converts. Don't double-convert.  SHOW THE REDUCED AMOUNT IN A DIFFERENT COLOR ABOVE PRICE in smaller font- Price cut- 
- **Prettier reformats touched files** on commit — diff with `git diff -w` to see real changes.
- **The git index is shared with parallel sessions.** Stage explicit paths; never `git add -A`.

---

## Part 9 — State as of 07/13/2026 (commit `e36f1b8e`)

**Working:**
- the subject address reaches the property lane from **every** door;
- Showcase/buttons/ homepage asks for the address instead of dropping the user on a blank canvas;
- `lotSize` + `propertyType` mapped (were fetched and discarded); `baths` resolved from
  `/nearby-home-values` (was never missing — just never read);
- an unsourced cell no longer renders as a naked label; give directions to paste needed information or Photo uploads
- the pasted listing description is the narrator's source of truth;
- no chart on a new listing;
- New Listing builds correctly from the prompt alone. 55 tests pass.

**Not working / not built:**
- **the production key** (above) — blocks every user;
- **the open-slot contract** (Part 4) — only `SocialIconsBlock` honors `emailRender`; an
  unsourced cell is dropped at build time rather than offered to the user;
- `planArrival` still opens a blank page for every recipe — **all 27 skeletons unused**;
- **15 of 17 recipes still land in the free-author grab-bag**;
- three render engines still disagree; the emailed area chart still ships without axes;
- one document, three builders — a recipe still means different things depending on the door;  build each one through one 
  door correctly at the root, then make small adjustments at different doors.  make sure all doors are accounted for!!
- the New Listing registry prompt still promises a ZIP-trend chart that no longer ships.  FIX IT!!!
