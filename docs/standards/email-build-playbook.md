# THE EMAIL BUILD PLAYBOOK — ONE FILE. START HERE. STOP OPENING SIX DOCUMENTS.

**Operator decree 08/04/2026, verbatim:** *"I want all the fucking rules on the build for the first
part at top. Font size, grid size, block sizes, spacing, all the fucking research for the look of
email that is universal. Any universal rules can go first. We will then list each individual email
one by one so it's easy to jump to the one you are looking for and don't have to read through all
things that don't pertain to the email you are building... stop fucking reading 6 documents and
fucking write it in one that we will add to."*

**How to use this file:** read PART 1 once — it applies to every email ever built here. Then jump
straight to your email's section in PART 2 and read nothing else.

**Why this file exists and the others failed:** the rules were spread across `emails.md` §0, five
GITIGNORED research files it told you to go open, `lib/email/CLAUDE.md`,
`lib/deliverable/CLAUDE.md`, `deliverable-playbook.md`, and `data-roots.md`. Six places, five of
them invisible to a repo-wide search. That is a scavenger hunt, not a playbook. **Every rule below
is written out HERE, verbatim, with its source named. You do not have to go read the source to
build.** The research keeps the reasoning, the citations, and the ⚠ still-unbuilt flags; this file
keeps the rules.

**Conflict order:** the CODE ROOT wins over this file; this file wins over any other document. If
you find a disagreement, fix it here in the same session.

---

# PART 1 — UNIVERSAL. TRUE FOR EVERY EMAIL.

## 1.1 The pipe — five stops, no exceptions

Every email walks these in this order. If you think you found a second way to build an email, you
found a bug or a dead limb.

1. **The email's own file** picks WHICH blocks and WHAT data fills them.
2. **It hands over a flat list** — type, span, props. **NO x. NO y. NO positions. Ever.**
3. **The layout root** sorts into zones, groups into rows, assigns EVERY position, and stamps the
   doc with a provenance mark.
4. **Brand paints over it** — colors, logo, fonts, footer. Branding runs AFTER authoring as a
   blank-filling overlay, never at the start.
5. **One door renders the HTML.** There is exactly one.

The AI fills open slots BEFORE the seam, never after. A picture that puts branding first or AI last
is wrong and re-creates a real 07/19/2026 bug.

## 1.2 Canvas and grid

- **Canvas width: 600px max, centered, white background.** Code root: `lib/email/compile-grid.ts`.
- **Grid: 12 columns.** Row height 30. Code root: `lib/email/grid-schema.ts`.
- **Blessed row widths — every row sums to 12, and only these shapes are legal:**
  - 1 block in a row → `12`
  - 2 blocks → `6+6`, `8+4`, or `7+5`
  - 3 blocks → `4+4+4`
  - A row outside these gets snapped to the nearest legal shape. Orientation is preserved: whichever
    side was bigger stays bigger. Code root: `lib/email/doc/block-contract.ts`.
- **Max 20 blocks per email.** Over the cap, blocks are trimmed — and the footer ALWAYS survives the
  trim, because the footer carries the legal requirements.
- **Header, footer and divider always own their own row.** They can never be a column beside
  something else.
- **Max 2 accent bands per email.** Emphasis is budgeted, not banned.
- **Photo aspect ratios — closed set:** `3:2` (default), `4:3`, `4:5`, `1:1`, `16:9`.

## 1.3 Type scale — seven sizes, and that is all there are

Source: our own `app/_design/05-color-and-type.md`, executable as `lib/email/blocks/scale.ts`.

- **hero 64px** — hero headline
- **h1 44px** — page H1
- **metric 36px** — the big number (always tabular figures)
- **h2 28px** — section header
- **body 16px** — body copy
- **caption 14px** — body small, caption, card/metric label
- **mono 12px** — freshness line and source URL, monospace

**Weight: 600 for hero, 500 for section headers, 400 for body, 500 for emphasis, 500 for mono.**
Nothing else. (Measured 07/14/2026 before this was enforced: 30 weight declarations in the codebase,
ZERO of them compliant.)

**Leading (line height): 1.1 for display type at 28px and up, 1.55 for body, 1.4 for caption.**
Unitless ratios — email's own unit. Never an absolute px line-height.

**THE ONE RULE THAT KILLS THE BUG BY CONSTRUCTION:** you get size, leading and weight TOGETHER from
`text(role)`. There is no way to pick a size and forget the leading. A raw `fontSize`, `fontWeight`
or `lineHeight` typed into a block FAILS a red test (`lib/email/blocks/type-conformance.test.ts`,
shipped 08/04/2026 — it caught 11 live violations, two of them already reaching real inboxes).

**Why it matters, measured:** ~30 text nodes once set no line height and silently inherited an
injected absolute 24px box. A 32px number rendered inside a 24px box — that is the clipping. A 9px
label rendered at ratio 2.67. **That, not the grid, is the mechanical cause of "the email looks
uneven."**

**Known and accepted:** our steps crowd at the small end (12→14 is 1.167×, 14→16 is 1.143×) where
captions, labels and source lines live. Material Design says avoid small differences between steps.
Our design doc outranks a vendor ratio. Recorded so nobody re-derives it as a discovery.

## 1.4 Spacing — the 8px grid

Source: cieden spacing best practices + Material Design 3, crawled 07/01/2026.

- **Every spacing value — padding, margin, gaps — is a multiple of 8.** 8, 16, 24, 32, 40, 48, 56.
- **4px is allowed for line-height and fine typography ONLY.** Nowhere else.
- **INTERNAL ≤ EXTERNAL** — the space around an element should be equal to or greater than the space
  within it. This is the rule that makes a reader see two blocks as ONE group or as TWO.
  **⚠ NOT IMPLEMENTED, and not implementable as written today:** the compiler emits no
  between-block margin, so the external term is zero on every email and all rhythm comes from each
  block's own internal padding. Every pair of sections therefore reads identically spaced whether or
  not they belong together. **DO NOT "fix" this by inventing a margin.** It is a grammar decision
  that belongs to the per-email walk in PART 2.
- Bigger sections get MORE external space, never less.
- Consistent horizontal spacing between repeating cards, even when their heights differ — that is
  what makes a card row read as a rhythm instead of a pile.

## 1.5 Color and contrast

- **Text: 4.5:1 minimum.** Large text (28px+): 3:1. Non-text — icons, chart strokes, borders,
  button edges: 3:1. (WCAG 1.4.3 and 1.4.11.)
- **Grayscale self-test:** desaturate the email. If two things are no longer distinguishable, color
  was carrying meaning alone. Fix it.
- Colour, block order, and what a template LOOKS like are deliberately NOT unified. Operator ruling
  07/14/2026: keep every design as a choice. We unify RHYTHM, not appearance.

## 1.6 Header — what sits at the top

- **The agent identity block sits at the TOP. Non-negotiable.** Confirmed independently at Zillow,
  Compass and BoldTrail — every major platform puts the agent's photo, name and contact at the top,
  and none put it at the bottom.
- Logo or branding leads, or a greeting does. The greeting merges the recipient's first name.
- The header block owns its own row and keeps its block id across a rebuild, so a re-run never
  duplicates or drops it.

## 1.7 Footer — the legal floor

**CAN-SPAM is four real requirements, all four mandatory in every commercial email:**

1. A working opt-out.
2. Accurate header information (from, reply-to, routing).
3. A subject line that is not misleading.
4. **A valid physical postal address** — business address, PO box, or mailbox service.

The footer's address field is populated from the brand profile's business address. The lab nudges
when it's empty; it does not block. The footer is locked on the canvas so a drag cannot move the
unsubscribe, and it is forced absolute-last in both the HTML and the PDF. It survives the 20-block
trim.

Sign-off block carries name, phone, and team or brokerage.

## 1.8 Buttons and links

Source: `_RESEARCH/email-and-social/2026-08-03-button-link-mechanics.md`.

- **Height 42–72px.** Tap target, not decoration.
- **NEVER an image-based button.** Images-off is a normal reading mode; an image button becomes
  invisible.
- **ONE call to action per email. Never three.** The single most-repeated craft rule in the research.
- **Buttons wire by ROLE, not by button.** A community button and a booking button hold different
  saved URLs and both survive a relabel. Code root: `lib/email/button-destinations.ts`.
- **A listing button and a community button may NEVER fall back to the homepage.** Gmail's sender
  guidelines require the recipient know what to expect on click. No real link means NO BUTTON.
- The close pushes to a conversation, never ends on a number.

## 1.9 Copy — how much, shaped how

Source: `_RESEARCH/email-and-social/2026-08-03-email-length-and-per-type-benchmarks.md` (Boomerang,
measured on real sent mail).

- **BODY: 50–125 words of the AGENT'S OWN copy.** Every length in that band returned a response rate
  above 50%.
- **TWO CARVE-OUTS (operator decree 08/03/2026):** the property description does NOT count toward
  the word budget, and the community block does NOT count. Neither is a pressure valve — you may not
  push the agent's own argument past 125 words by relabeling it.
- **The FLOOR bites harder than the ceiling.** 125 → 500 words only drops response ~50% to ~44% and
  stays flat out to ~2000. But a **25-word email performs about as badly as a 2000-word one**, and a
  subject-only email gets a response 11% of the time. Do not "tighten" below 50 words.
- **ASK 1–3 QUESTIONS.** 50% more likely to get a response than asking none. Zero is the failure
  case; four or more gives the gain back.
- **3rd-grade reading level** — 36% lift over college-level prose, 17% over high-school. A hard
  constraint on the fill model's register, not a style preference.
- **NEVER NEUTRAL.** Slightly positive or slightly negative both drew 10–15% more responses than
  fully neutral. A flat recitation of figures is the worst-performing register available — which is
  exactly what an unguided data email defaults to.
- **≤3 images and ≤20 lines of text.** Highest CTR across a 2M+ email sample. Mobile paragraphs run
  3–6 lines.
- **Close on an open-ended question**, not a figure.

## 1.10 Subject lines — two rules, pick by what you want back

- **Want a REPLY** (follow-up, check-in, a question to one person) → **3–4 words.** Measured on
  response rate, so Apple's pixel pre-loading can't distort it. No subject line at all drops
  response to 14%.
- **Want an OPEN** (market update, listing announcement, digest, anything broadcast) → **30–40
  characters, clarity over cleverness.** "May Market Update" beats cute. Three independent sources
  agree.
- **The literal word "Newsletter" correlates with WORSE opens.** "Special", "Update", "Bulletin"
  outperform it.
- **Never promise or target an open rate.** Two reputable providers disagree ~2× on this same
  industry in both directions. Relative comparisons inside one source survive; absolute levels do
  not.

## 1.11 The five-part skeleton

Every platform converges on this regardless of visual style:

1. Header / branding or greeting
2. Context or value block
3. (optional) Property or market data block
4. One explicit call to action
5. Agent sign-off — name, phone, team or brokerage

## 1.12 Render constraints — what actually breaks in an inbox

Source: `_RESEARCH/email-and-social/2026-08-03-strongest-real-estate-email-concepts-structure.md`
Part D, including live client-support tables.

- **Outlook on Windows desktop has ZERO flexbox and ZERO grid support.** The base skeleton must be
  single-column tables. Flex or grid may be layered on top as progressive enhancement only.
- **Gmail clips the message at ~102KB.** Everything after the clip point is behind a "view entire
  message" link, including the unsubscribe.
- **SVG icons render as text in Outlook.** Use the established fallback; never ship raw SVG.
- Dark mode inverts backgrounds unpredictably — never rely on a background color to carry meaning.

## 1.13 Tags and fields — ours to define

Four different merge-tag conventions were observed across the platforms we crawled. **There is no
industry standard.** Our tag and field names are ours to define — closed, in code, documented once.
Nobody's muscle memory is broken by picking one.

**The tag is the identity.** Every entry button anywhere — showcase page, homepage, campaign card,
lab pick — carries the tag for what it is. The tag routes the build. The seed prompt text is
DISPLAY and SEED only; it is never the identity and a build is never routed on it.

## 1.14 The no-invention gate — the only hard block in the system

- **Every figure names a real source.** Sources are tried in this order: our own data → the user's
  own upload or pasted text → a named web source, cited → a figure the user typed in.
- **A gap is filled from the next lane. A build is NEVER refused for a missing number.**
- **When every lane misses, the cell becomes an OPEN SLOT** — visible on the canvas for the user to
  fill, absent from the sent email. **An open slot always beats an invented number and always beats
  a bad link. It is the designed state, not a failure.**
- **NEVER a zero.** A missing value rendered as `$0` or `0` is a fabricated figure.
- **The model writes prose. It never writes a figure**, never decides which cells exist, and never
  decides layout.
- A derived cell earns a footnote ONLY when the reader can't check it. Never restate arithmetic
  whose operands sit two cells away — that reads as a spreadsheet export, not as an agent.

## 1.15 Charts

- **A chart ships ONLY when the deliverable is ABOUT a number, and about the SUBJECT.**
- **An empty chart slot is worse than no slot.** Policy "none" means DROP the slot, never ship an
  empty box.
- Chart type follows the data's shape, not taste.
- Two bars showing was-versus-now is a fact wearing a chart costume. Write the fact.
- The chart's magnitude must cohere with the headline — same unit, headline within ~3× of the
  plotted range.

---

# PART 2 — THE EMAILS, ONE BY ONE. JUMP TO YOURS.

Each section is self-contained. Read PART 1 once, then read ONLY your email's section.

**Every section carries: the TAG, the spine, the grid, the ingredients with their sources, the
fallback when a source misses, the chart policy, what the AI writes, the buttons, and the known
gaps.**

| Tag | Email | Section |
|---|---|---|
| `new-listing` | New Listing | 2.1 |
| `coming-soon` | Coming Soon | 2.2 — TO BE WALKED |
| `market-comps` | Market Comps | 2.3 — TO BE WALKED |
| `under-contract` | Under Contract | 2.4 — TO BE WALKED |
| `just-sold` | Just Sold | 2.5 — TO BE WALKED |
| `open-house` | Open House | 2.6 — TO BE WALKED |
| `price-reduced` | Price Improved | 2.7 — TO BE WALKED |
| `agent-brand-intro` | Agent Brand Intro | 2.8 — TO BE WALKED |
| `agent-launch` | Agent Launch — The Letter | 2.9 — TO BE WALKED |
| `sphere-weekly` | Weekly Sphere Update | 2.10 — TO BE WALKED |
| `review-reply` | The REVIEW Reply | 2.11 — TO BE WALKED |
| `market-pulse` | Monthly Market Pulse | 2.12 — TO BE WALKED |
| `back-on-market` | Back on the Market | 2.13 — TO BE WALKED |
| `community-info` | Community Info | 2.14 — TO BE WALKED |
| `listings-showcase` | Listings Showcase | 2.15 — TO BE WALKED |
| `listings-digest` | Listings Digest | 2.16 — TO BE WALKED |
| `default-grid` | Market Email (the catch-all) | 2.17 — TO BE WALKED |

`social-pack` and `social-cut` are NOT emails. Different renderer, different contract. They are not
in this playbook and must never be "fixed" onto email chrome.

---

## 2.1 NEW LISTING — tag `new-listing`

**Spine:** ONE house. The address resolves exactly once, before any layout happens. It comes from
the address field OR from the words the user typed — **the builder decides which, never the door
they clicked.** (Gating on the field alone is what once sent every in-lab campaign build to the
generic author and produced a photo-less ZIP grab-bag.)

**Grammar:** the listing grammar. Ribbon, photo, hero with address over price, spec strip, the
email's own middle, narrative.

**Chart: NONE.** Operator ruling 07/13/2026 — this email is about a HOUSE and its visual IS the
photo. An area index says nothing about the house. A comps bar turns it into a comps email.

**Subject line:** wants an OPEN → 30–40 characters.

### Ingredients — every one, with where it comes from

**IDENTITY (from the user's brand profile, no data source involved)**
- Agent name, brokerage, phone, headshot, business postal address.
- The postal address is a legal requirement, not a design choice.
- The headshot is the field agents most often skip — it must survive being missing.

**THE HOUSE (from the live for-sale record, resolved once)**
- Asking price · street address · city · state · ZIP
- Hero photo — from the listing's own gallery, **mirrored into our own storage** so a rotted vendor
  link never blanks the email months later.
- Beds · square feet · lot size · year built · property type

**BATHS — the weak one.** Primary: the for-sale record. Fallback: our own Lee County property
records, exact-address match only. **Collier has no equivalent** — a Collier listing with no stated
bath count leaves the cell OPEN.

**DOLLARS PER SQUARE FOOT** — computed from price ÷ square feet. If either won't parse, the cell
stays OPEN. Never a wrong number from a partial input.

**TIME ON MARKET** — today minus the vendor's list date, from our own per-listing days-on-market
root. **⚠ THE TRAP:** roughly half the active book carries a FLOOR, not a true count — we know how
long we've been watching, not how long it's been listed — and it is badly uneven by county
(Lee ~59% real, Collier ~14% real, measured 07/20/2026). **This cell prints ONLY when the count is
genuinely real. A floor is never printed as a fact.**

**THE DESCRIPTION** — the property's own marketing description verbatim, or the one the seller or
agent pasted in. **The biggest quality lever in this email**, and it does NOT count against the word
budget. The model never rewrites it into a claim; it stays the source's words.

**THE COMMUNITY — three different things that must never impersonate each other:**
1. **Inside the gate** — golf, pool, gated, clubhouse. Held for 69 communities today, thinly: 42
   with golf, 12 with an HOA range, 11 with gated status.
2. **Nearby** — the vendor's named neighborhood plus businesses in its search radius, matched by the
   vendor's own property pairing first, then by dropping the listing's coordinates into stored
   boundary shapes. **These are businesses within about five miles, NOT amenities inside the
   community, and the copy must say so.**
3. **The subdivision** — home count and median assessed value from our own tax-roll parcel data.
   Universal: every home in Lee and Collier, unlike (1) and (2).

**COMMENTARY (what the AI writes — and the ONLY thing it writes)**
- One paragraph, from the description and the sourced facts.
- **It gets NO comps.** Handing the narrator a comp set is what once turned this paragraph into a
  market analysis.
- It writes prose and never a figure.

**THE BUTTON** — one, "View the Full Listing", pointed at the real listing link saved for that role.
**No real link means no button.** Never a homepage.

### Known gaps — named, not hidden
- Baths in Collier: no free fallback.
- Pool: Lee only. **Collier has no pool source at all.** A pool permit is an EVENT, not proof of a
  pool — never use it as one.
- Annual taxes: parsed and sitting there for ~16,500 properties, but **BLOCKED from customer-facing
  use** until one is validated against a real county bill.
- HOA fee, schools, flood zone: **no verified source.** Do not claim we have them.
- **The fallback ladder is not written in code** — for this email or any other. Which source fills
  each ingredient when the first misses lives in this document and nowhere else yet. That is the
  next build.

---

## 2.2 – 2.17 — TO BE WALKED

Each section gets written when that email is walked with the operator. **Do not pre-fill one from
memory or by copying 2.1** — the whole point of the walk is that each email's ingredients and
sources get decided deliberately, one at a time.
