# The Deliverable Playbook

**Written 07/13/2026, from a night spent finding out why every recipe shipped a grab-bag.**
Everything here was verified against running code and live vendor calls, not memory.

---

## Part 1 — The paths (what actually happens when you click "build")

### The doors

Five entry points. They differ in exactly ONE thing: what `scope` they hand the builder.

| Door | Passes |
|---|---|
| Homepage hero | `{ address }` — it has an address field |
| Email Lab campaign button | **nothing** — the address lives only in the prompt text |
| Showcase "Make this →" | **nothing** — and until 07/13 it never even asked for the address |
| Project lab | the project's `subject_address` |
| ZIP door (map / report) | `{ kind: "zip", value }` |

**This is the whole reason the same recipe produced a photo flyer from one door and
"typical asking rent" from another.** The lane that loads the property was gated on
`scope.address`, and three of the five doors don't set it.

Every door POSTs to `app/api/email-lab/ai/route.ts`.

### The builders

That one route then picks between **three different builders**:

1. `authorDoc` (`lib/email/build-doc.ts`) — when `build === true || mode === "author"`
2. `buildContentDoc` (same file) — otherwise. Its rich-flyer path is gated on a **pasted URL**.
3. the showing-prep assembler — intercepts before either, when the prompt looks like a showing prep.

Inside `authorDoc` there are then **two lanes**:

- **the subject-listing lane** — resolves the real house, builds the fixed flyer grid.
- **the free author** — knows only ZIP aggregates and nearby sold comps. No photo. No property.
  **This is the grab-bag.** It is where every recipe that isn't explicitly a new-listing lands.

### The renderers

One document, **three render engines** (canvas / email HTML / PDF). They disagree. The ZIP
trend chart drew full axes on the canvas and shipped as an axis-less line in the email —
so the preview lied about what the recipient would get.

---

## Part 2 — Four things are called "recipe" and none of them are wired together

| Where | What a "recipe" is |
|---|---|
| `lib/showcase/registry.ts` | a **prompt string** with a `[[blank]]` — what the buttons seed |
| `lib/email/author-recipes.ts` | 11 **advisory prose nudges** appended to the model's system prompt. Its own header says *"The model MAY deviate — nothing here is enforced."* Forbidden from containing digits. |
| `lib/email/doc/default-docs.ts` | **27 positioned skeletons** — real grids: `new-listing`, `just-sold`, `open-house`, `price-reduced`, `listing-feature`… |
| `lib/email/listing-flyer.ts` | a **hard-coded grid** built in TypeScript |

**The disease:** `planArrival` (`lib/lab-entry/arrival.ts`) returns `{ kind: "blank" }` for
**every** recipe arrival. The client loads `skeleton-clean-white` — an empty page. All 27
skeletons are skipped. A model is handed the blank page and improvises.

You pick "New Listing," the code opens a blank page, and a model guesses. The grid you
designed is sitting in the repo, never loaded.

There is also no `new-listing` entry in the 11 author-recipes at all. The flagship campaign
has no recipe.

---

## Part 3 — The playbook

Four rules. Every failure found on 07/13 violated one of them.

### 1. Resolve the subject once, from a real record

A deliverable has a **subject** — a house, a ZIP, a farm area. Resolve it ONCE, from a real
source, before any layout happens. Never let a model infer the subject from prose.

The subject reaches the builder from the field OR from the prompt — read both, and make the
BUILDER the one authority on which. Never gate on how a door happens to pass it.

### 2. A cell renders only if it is sourced. A cell you can't fill does not exist.

Not "render it as a zero." Not "render the label with a blank under it" — that reads as
broken, and it's what shipped a naked "Baths / Lot / Type" row over data we already held.

Absent means **absent**: the cell is not emitted. Rows lay out from the cells that survive.

Corollary, and this is the one that cost the most: **before you decide a field is
unfillable, check whether you're already fetching it and dropping it.** `lotSize` and
`propertyType` were in the vendor row and never mapped. `baths` was on an endpoint we
already call (`/nearby-home-values`) and never read.

### 3. A chart only when the deliverable is ABOUT a number — and it must be about the subject

- A new-listing email is about a **house**. Its visual is the photo. **No chart.**
- An area index chart on a listing tells the buyer nothing about the listing.
- A comps bar on a listing email turns it into a comps email.
- Two bars (was/now) is a fact wearing a chart costume. Write the fact.

Chart the subject, not the area around it. If the deliverable isn't about a number, ship no
chart — an empty slot is worse than no slot.

### 4. The model writes prose. Nothing else.

Not layout. Not which cells exist. Not numbers.

And prose is only as good as what you hand it. Handed the spec cells and told "use only
these facts," the only sentence it can write is the cells read back — which is exactly what
it wrote, printed under a grid that already said the same thing.

Hand it **sources**, and forbid the rest:

- every number must appear in the facts given;
- **a fact about the home is not only a number** — a view, a waterfront, a pool, a
  renovation, a school, a finish is equally an invention if it wasn't given;
- when using the user's words, keep them true (an "idle to open water" does not become
  "minutes to the river");
- never add a selling claim of its own ("priced to move", "won't last").

### Filling a gap — the four lanes, in order

our data → **the user's own text/upload** → a named web source → a figure the user states.

Never refuse the build. Never invent. For a listing description specifically: **no vendor
sells us MLS remarks** (checked all 18 SteadyAPI real-estate endpoints on 07/13/2026;
realtor.com blocks the page). It is a **lane-2 fact — the agent pastes it**, and it becomes
the source of truth for what the home is.

---

## Part 4 — Applying it to the next recipe

For each recipe, answer these six, then build. The answers are the only thing that differs.

1. **Subject spine** — what gets resolved? (a listing address · a ZIP · an agent · nothing)
2. **Skeleton** — which committed grid? (it already exists — *load it*, don't improvise one)
3. **Cells** — which facts, each with a real source. Anything unsourced does not render.
4. **Chart** — is this deliverable ABOUT a number? If not, none.
5. **Prose source** — what is the model allowed to draw from? Hand it those, forbid the rest.
6. **Framing** — the hat: kicker, hero, CTA. This is what differs between Coming Soon and
   Sold; the *facts* underneath are the same house.

**Reference implementation: New Listing** (`authorDoc`'s subject-listing lane).
Subject = the address (from the field OR the prompt). Skeleton = the coded flyer grid.
Cells = price / beds / baths / sqft / $-per-sqft / lot / type, each dropped if unsourced.
Chart = none. Prose = the agent's pasted description, tightened, nothing added.
Framing = "New Listing" kicker, price + address hero, "View the Full Listing".

The lifecycle siblings are the SAME resolved house wearing a different hat:

- **Coming Soon** — hold the street address back; scarcity framing.
- **Market Comps** — the comps chart belongs *here* (subject bar + nearby sales, land
  filtered out by data: a comp must have beds AND sqft, or it's a vacant lot).
- **Under Contract / Sold** — swap hero + framing; same facts.
- **Price Improved** — the price then-vs-now belongs *here*, where the number is the point.

---

## Part 5 — State as of 07/13/2026

**Fixed (in the working tree, not committed):**

- the builder reads the subject address from the field **or** the prompt — every door reaches
  the property lane (`lib/email/listing-intent.ts` + `build-doc.ts`);
- Showcase asks for the address instead of dropping you on a blank canvas
  (`EmailLabGridClient.tsx` — the popup was hard-gated to logged-out visitors);
- unsourced cells no longer render as naked labels (`listing-flyer.ts`);
- `lotSize` + `propertyType` mapped (they were fetched and discarded);
- `baths` resolved from `/nearby-home-values` (it was never missing — just never read);
- the listing description is a lane-2 paste and is the narrator's source of truth;
- no chart on a new listing.

**Not fixed:**

- **The production key.** The SteadyAPI key does not exist in production under the name the
  code reads (`PHOTOS_API`). Production has one called `new_steady`. Until that is
  reconciled, every New Listing build on the live site resolves to nothing and ships the
  empty $0 flyer — no matter what is fixed in code. **This blocks everything above from
  reaching a single real user.**
- 15 of 17 recipes still land in the free-author grab-bag.
- `planArrival` still opens a blank page for every recipe; the 27 skeletons are still unused.
- three render engines still disagree; the emailed area chart still ships without axes.
- one document, three builders — a recipe still means three different things depending on
  how it was launched.
