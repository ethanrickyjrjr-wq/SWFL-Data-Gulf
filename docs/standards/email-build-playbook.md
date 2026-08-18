# THE EMAIL BUILD PLAYBOOK — ONE FILE. START HERE. STOP OPENING SIX DOCUMENTS.

**Operator decree 08/04/2026, verbatim:** *"I want all the fucking rules on the build for the first
part at top. Font size, grid size, block sizes, spacing, all the fucking research for the look of
email that is universal. Any universal rules can go first. We will then list each individual email
one by one so it's easy to jump to the one you are looking for and don't have to read through all
things that don't pertain to the email you are building... stop fucking reading 6 documents and
fucking write it in one that we will add to."*

**How to use this file:** read PART 1 once — it applies to every email ever built here. Then jump
straight to your email's section in PART 2 and read nothing else.

**⚠️ THE AUTHORITY FOR *WHY* THIS BUILD IS RUNNING — both were ORPHANED until 08/05/2026, meaning
nothing in the repo pointed at them and no session could find them:**
- [`docs/superpowers/handoffs/2026-08-04-showcase-email-assembly-line-HANDOFF.md`](../superpowers/handoffs/2026-08-04-showcase-email-assembly-line-HANDOFF.md)
  — the base design for the assembly line this playbook implements.
- [`docs/superpowers/handoffs/2026-08-04-showcase-email-GO-ADDENDUM.md`](../superpowers/handoffs/2026-08-04-showcase-email-GO-ADDENDUM.md)
  — **the operator's GO order (08/04/2026) plus an independent second verification pass that records
  what was WRONG in the base handoff.** Read the base first, then this. Being unable to find the
  document that says what the base design got wrong is how a corrected error gets re-shipped.

**Why this file exists and the others failed:** the rules were spread across [`emails.md`](./emails.md) §0, five
GITIGNORED research files it told you to go open, `lib/email/CLAUDE.md`,
`lib/deliverable/CLAUDE.md`, [`deliverable-playbook.md`](./deliverable-playbook.md), and [`data-roots.md`](./data-roots.md). Six places, five of
them invisible to a repo-wide search. That is a scavenger hunt, not a playbook. **Every rule below
is written out HERE, verbatim, with its source named. You do not have to go read the source to
build.** The research keeps the reasoning, the citations, and the ⚠ still-unbuilt flags; this file
keeps the rules.

**Conflict order:** the CODE ROOT wins over this file; this file wins over any other document. If
you find a disagreement, fix it here in the same session.

---

# PART 0 — THE MAP. One pipe, three dials. Read this before PART 1.

**Operator brought a NotebookLM mind map to the desk 08/05/2026: _"use it how you see fit to keep
everything together, edit it and make sure we can all understand."_ This is that map, merged with
what the code actually holds. It replaces the picture, and there is no second one.**

## What the picture got right, and the three things it got wrong

Right: there IS a common foundation, the emails DO fall into families, and AI enrichment IS a real
stage. Wrong, and each one re-creates a real bug if you build to it:

1. **It drew branching STAGES. There is one pipe with three dials.** An email is not a different
   process; it is a different set of values.
2. **It put branding FIRST.** Branding runs LAST, as a blank-filling overlay after authoring.
   Building it first re-creates the 07/19/2026 clobber where the overlay overwrote authored copy.
3. **It put AI at the END, and it has no node for the seam or for the one door to HTML.** The model
   fills open slots BEFORE positions are assigned. Nothing renders except through the one door.

## THE PIPE — five stops, every email, no exceptions

```
(1) THE EMAIL'S OWN FILE          picks WHICH blocks and WHAT data fills them
        |                          lib/deliverable/recipes/<name>.ts
        v
(2) A FLAT LIST                   type, span, props.  NO x. NO y. NO positions. EVER.
        |
        v
(2.5) AI FILLS OPEN SLOTS         prose only. It never writes a figure, never picks a
        |                          cell, never decides layout. BEFORE the seam.
        v
(3) THE SEAM                      sorts into zones, groups into rows, assigns EVERY
        |                          position, stamps provenance a fake cannot forge.
        v                          lib/email/doc/finalize-doc.ts
(4) BRAND OVERLAY                 colors, logo, fonts, footer — fills BLANKS ONLY.
        |                          lib/email/brand/
        v
(5) THE ONE DOOR                  renderEmailDocHtml -> compileGrid -> table HTML -> SEND
                                   Never call the renderer or the compiler directly.
```

## THE PIPE CAN BE WATCHED WHILE IT RUNS — landed 08/18/2026, opt-in, nothing above changes

`POST /api/email-lab/ai` with `stream: true` answers in NDJSON — one event per line, protocol in
`lib/email/lab/stream-events.ts`, shared with the social lane (`/api/email-lab/social/generate`).
**A caller that doesn't ask gets the same JSON body it always got**, so an old client against a new
deploy is not a broken client. Three rules govern it, none of them cosmetic:

1. **Nothing unvalidated reaches the wire.** Every content-bearing event — `skeleton` and `block` — is
   parsed against `EmailDocSchema` before it is written, by applying the props inside a copy of the
   working doc and re-parsing the whole document; there is deliberately no weaker per-block schema.
   Each lane owns its emitter (`lib/email/lab/stream-emitter.ts`, `lib/social/design/stream-emitter.ts`).
2. **The stream PAINTS, it never PERSISTS.** No event writes a row. Saving is still the explicit save.
3. **The human wins, at all three beats.** A block the user edits mid-build is never overwritten by the
   AI — `block` skips a touched id, `skeleton` reseats around touched ids present in both docs, and
   `done` puts the user's copy back over the server's. Enforced in `lib/email/lab/consume-stream.ts`,
   a pure reducer for exactly that reason. Design:
   `docs/superpowers/specs/2026-08-18-live-build-streaming-design.md`.

## THE THREE DIALS — this is the entire difference between one email and another

**DIAL 1 — THE SPINE. What the email is about, resolved once before any layout.**
- **address** (7): New Listing · Coming Soon · Market Comps · Under Contract · Just Sold ·
  Open House · Price Improved. One house, resolved at the ONE inspection point
  (`resolveSubject`), which is why a fact wired there reaches all seven at once.
- **area** (8): Weekly Sphere · Review Reply · Monthly Market Pulse · Back on the Market ·
  Community Info · Listings Showcase · Listings Digest · Market Email (the catch-all).
- **agent** (2): Agent Brand Intro · Agent Launch. About the person, not a property or a place.

**DIAL 2 — THE CHART POLICY, declared per email.** Twelve of seventeen are **none**, and none means
DROP the slot — an empty chart box is worse than no chart. The five that carry one: Market Comps and
Just Sold (comps bar) · Price Improved (price vs. area) · Coming Soon (inventory scarcity) ·
Monthly Market Pulse (month-over-month) · Review Reply (area value trend) · Agent Brand Intro
(ZIP-by-ZIP asking).

**DIAL 3 — SELL-SIDE or STORY-SIDE.** Nine sell-side (pitching a property or the agent's own brand),
eight story-side (recurring relationship content). This governs the copy framing and nothing else.

## RECONCILING THE PICTURE WITH REALITY — counted from the registry 08/05/2026

The registry holds **19 keys: 17 emails, all 17 with a working builder, plus 2 social** (a genuinely
different renderer — never give them email chrome).

The mind map drew **24 boxes. Eight are real emails. Sixteen do not exist.**

- **Real, and on his map (8):** New Listing Hero → New Listing · Open House Invite → Open House ·
  Price Reduced → Price Improved · Just Sold Grid → Just Sold · Back on the Market ·
  Weekly Pulse → Weekly Sphere · Monthly Digest → Monthly Market Pulse · Agent Launch (Day One).
- **Not built, and not to be treated as a backlog (16):** Market Spotlight · Rate Watch ·
  Year in Review · Luxury Market Report · Neighborhood Report · Investment Brief · Editorial &
  Market Letters · Welcome Onboard · Agent Spotlight · Stay in Touch · Corridor Positioning Scatter ·
  Flood Exposure · Freight Nowcast · Storm-Year Timeline · Seasonal Exposure Index ·
  "The Auto Email Plan (Listing to Close)" — that last one is a SEQUENCE of the listing emails, not
  an email.
- **Real, and MISSING from his map (9):** Coming Soon · Market Comps · Under Contract ·
  Agent Brand Intro · Review Reply · Community Info · Listings Showcase · Listings Digest ·
  Market Email (the catch-all every keyless ask lands on).

**"Deep Report Series" and "Visual & Data Reports" are not email families at all.** Flood exposure,
freight, storm-year and corridor work are report-page and chart surfaces. Putting them on the email
map is how a session ends up building a second email system.

## THE FOUR LANES THAT DO NOT YET RUN THE PIPE — declared, not hidden

Agent Launch and Monthly Market Pulse hand-position their own blocks. Back on the Market refuses to
build when its area lane misses instead of landing the grid with open slots. The catch-all Market
Email patches a committed seed grid and never gets re-stamped. Each is declared with a reason and an
open check in `lib/deliverable/recipes/registry-seam.test.ts`, and the assertion is INVERTED for
them — fix one and the suite goes red telling you to delete its exemption line.

## HOW A BUILD IS TRACKED — landed 08/05/2026, and the rules for reading it

**Operator decree, verbatim:** *"MAKE SURE WE ARE TRACKING WHERE AND HOW EVERYTHING GETS BUILT SO WE
CAN REPRODUCE EXACTLY."* Before this, 92 built deliverables all recorded their template as
`block-canvas` and **nothing recorded which of the 17 emails produced any of them** — "every email
runs one pipe" was true in the code and uncheckable in the product.

**`deliverables.recipe_key`** now records it. Four things about the value, all load-bearing:

1. **It is the recipe whose BUILDER PRODUCED THE DOC — never the key the door asked for.** They
   match on every healthy build. When a keyed builder misses and the terminal lane picks it up, the
   row records `default-grid`, because default-grid is what built it. Stamping the requested key
   there would launder a fallback as a success and hide the exact failure the column exists to
   surface. So: **a `default-grid` row on a keyed ask is a builder that fell through — go look.**
2. **A client-supplied key is validated against the registry or dropped to NULL.** Two write paths
   take the key from the browser (the project save and the anonymous send-to-self funnel). An
   unverifiable string sitting in a provenance column is worse than an honest gap.
3. **NULL means "no recipe produced this," and it is a real answer** — a hand-edited seed saved
   without ever building, the legacy listing lane, showing-prep, and the non-email report templates.
   It is never a guess and never inferred from the doc.
4. **The 92 pre-existing rows stay NULL forever.** Their key was never recorded; deriving one from
   `doc` or `instruction` would put an inferred value in the field added to end inference.

Provenance **carries down the version chain**: a data refresh or a scheduled re-render forks a new
row and copies the key, because a refresh makes a new version of the same email, not a new build.
Without that the key would blank on first use, and the column would read as untracked for exactly
the rows we touch most.

**REPRODUCIBLE BY BUILDER — the acceptance test, and it is green for all 17.**
`registry-seam.test.ts` runs every email key's builder **twice over two independent contexts** and
asserts the same document comes back. **17 of 17 pass** (08/05/2026). Two inputs are declared
non-deterministic and normalised out — **block ids** (addresses inside one document, not content)
and **the LLM sentence** (stable here only because the model call is stubbed; against the live model
it is not, and that is the boundary). The clock is deliberately NOT normalised: no builder reads it
on this path, and if one starts to, that test goes red — which is the signal, not a nuisance.

**What is still NOT tracked, named so nobody reports this as finished:** the per-cell source ladder,
the requested-vs-built key when they differ, and the model/prompt version behind the one authored
paragraph. Those are the build manifest (`deliverable_build_manifest`), a separate build.

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

**⚠ OPEN OPERATOR DECISION — body 16px vs 18px.** Outside research brought to the desk 08/05/2026
argues **18px** body for a senior demographic ("prevents eye strain, allows 200% resizing without
clipping"). That audience claim is unusually on-point here: SWFL is literally a retiree market, so
this is the one outside recommendation aimed squarely at our actual reader. **The code root wins
until the operator rules** — `scale.ts` says 16 because `app/_design/05-color-and-type.md` says
1rem. Two facts for the decision: at 18px the full-width measure becomes **~61 characters, still
inside the 45–75 band** (§1.16), so line length does NOT argue against the change; what it costs is
every frozen golden and possible reflow in tight blocks. **Do not change `TYPE.body` without the
ruling.** Tracked in `checks`.

## 1.4 Spacing — the 8px grid

Source: cieden spacing best practices + Material Design 3, crawled 07/01/2026.

**THE TOKENS ARE 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96, plus 0.** Code root: the `Space` union
in `lib/email/blocks/scale.ts`, lifted from `app/_design/05-color-and-type.md` §"Spacing".

**CORRECTED 08/05/2026 — this section used to say "every spacing value is a multiple of 8" and
"4px is allowed for line-height ONLY". Both were wrong against the code root**, which has always
carried 4 and 12 as real spacing steps (and 40 and 56, which that line listed, are NOT tokens at
all). Conflict order at the top of this file: the code root wins. Measured in the rendered Coming
Soon email 08/05/2026 — six distinct paddings, `4px 8px` · `24px 24px` · `0` · `12px 16px` ·
`8px 24px` · `16px 32px`, every one a token.

**✅ THE GRID IS NOW GUARDED, BOTH WAYS INTO A BLOCK.** The `Space` union made an off-grid number a
COMPILE error wherever a `Space` was expected — and that was never the whole picture, in the exact
way the fontFamily gap was not. `padding` on a CSSProperties object is `string | number`, so a block
could bypass the union entirely by typing the value itself, and **fourteen places did** (OpenSlot ×8,
ListingGridBlock ×2, Footer/MultiColumn/Sources ×1 each, plus one built by string arithmetic).
**Every one of those values was already on the grid** — so this found no bad pixel; it found that
nothing would have stopped one. `padding: "13px"` compiled fine in any of them. All fourteen now
route through `pad()`/`space()`/`sectionPadX()`, and four new tests in
`lib/email/blocks/type-conformance.test.ts` fail a raw string, a bare number, and a template literal.
`margin: "0 auto"` (centering, a keyword) and `margin: 0` (absence of space) are the two legal raws.

- **INTERNAL ≤ EXTERNAL** — the space around an element should be equal to or greater than the space
  within it. This is the rule that makes a reader see two blocks as ONE group or as TWO.
  **⚠ STILL NOT IMPLEMENTED, AND STILL NOT IMPLEMENTABLE — one of its two terms does not exist.**
  `compile-grid.ts` lines 130–131 say it outright: the 8px `GRID_MARGIN` gutter "is not reproduced
  in the email." The compiler emits no between-block margin at all, so the EXTERNAL term is
  structurally **zero** on every email ever sent from here, and all rhythm comes from each block's
  own `sectionPad`. A guard comparing internal against a constant zero would fail every block in the
  codebase and tell you nothing about grouping.
  **A nesting-walk over the rendered HTML with an allowlist of today's failures was designed and
  REJECTED 08/05/2026:** it would have reported a decorative pass while the actual question — do two
  adjacent blocks read as one group — stayed unexpressible, and shipping that as "implemented" is
  RULE 0.8's partial-reported-as-whole. **DO NOT "fix" this by inventing a margin in a block.**
  Fixing it for real means giving the COMPILER a between-block spacing term, which changes the
  layout grammar of all 17 emails at once — a per-email walk in PART 2, not a lint.
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

### 1.5b Dark mode — ⚠ PRESCRIBED BY OUR OWN RESEARCH, NOT BUILT

Source: `_RESEARCH/email-and-social/2026-08-03-strongest-real-estate-email-concepts-structure.md`
Part D (Litmus, Campaign Monitor, live caniemail tables). **Written 08/03/2026, still unbuilt as of
08/05/2026 — verified against `lib/email/blocks/email-head.ts`, which emits webfont `<link>`s and
nothing else.** Recorded here so it stops being rediscovered.

**Three behaviors, not one — and two clients have NO workaround at all:**
- **No change (opt-in only):** Apple Mail.
- **Partial invert (light backgrounds detected):** Gmail mobile app, Outlook Web App, Outlook mobile.
- **Full invert, no coding workaround:** Outlook desktop (Windows), Gmail desktop webmail.

**What the fix requires — all of it together, or none of it:**
1. `<meta name="color-scheme" content="light dark">` **and**
   `<meta name="supported-color-schemes" content="light dark">`. Both, or neither works.
2. A `@media (prefers-color-scheme: dark)` block.
3. `[data-ogsc]` (foreground) / `[data-ogsb]` (background) selectors for Gmail-mobile and
   Outlook-web/mobile. **The attribute must be repeated on EVERY comma-separated selector** —
   `[data-ogsc] p, [data-ogsc] p a`, never `[data-ogsc] p, p a`.
4. **Never pure `#FFFFFF` / `#000000`** — multiple clients force-invert these even with
   `!important`. Use near-white / near-black (`#FEFEFE` / `#0E0E0E`).
5. Logos and icons need a midtone color, stroke, or background shape to survive the uncontrolled
   full inversion where there is no workaround.
6. **Never CSS `filter`** for dark-mode image handling — ~45% ecosystem support (caniemail), ~15%
   in Litmus's own Gmail-heavy audience.

**WHY THE METAS CANNOT SHIP ALONE — the trap, measured 08/05/2026.** `#ffffff` appears **34 times**
in the render path, including both canvas containers (`compile-grid.ts` and
`blocks/EmailDocRenderer.tsx`) and `CARD_BG` (`blocks/styles.ts`). Declaring `color-scheme:
light dark` **opts us into** client dark handling — including in Apple Mail, which today does
nothing. Shipping rule (4) at the same time is not optional polish; without it the metas hand our
pure-white surfaces to the exact force-invert path the research names. **Ship both halves or ship
neither.** (`legibleInk("#ffffff", bg, …)` calls are foreground-on-accent contrast math, a different
concern — leave them alone.)

### 1.5c What IS already compliant — verified 08/05/2026, do not "fix" these

Counted so the next accessibility pass doesn't burn a session re-deriving it:
- **`lang="en"` is set on both render paths** (`compile-grid.ts`, `blocks/EmailDocRenderer.tsx`).
- **Every `<img>` carries an `alt` attribute**, asserted by a red test
  (`blocks/ListBlock.test.tsx`). Recipes set meaningful alt text on every meaningful image, and
  `chartImageBlock` (`lib/email/inject-chart.ts`) takes `alt` as a **required** field. The `?? ""`
  defaults inside the block components are unreached fallbacks, not the live behavior — and an
  empty alt on a genuinely decorative image is CORRECT accessibility. Do not flip those defaults
  blind; it makes screen readers announce spacers.
- **Layout tables carry `role="presentation"`** (`compile-grid.ts`).

**Still open:** no `<h1>`–`<h3>` anywhere in the eighteen block components — every headline is a
styled `div`/`Text`, so a screen reader gets no document outline to navigate. Real gap, real fix,
but it changes emitted HTML for every email and moves the frozen goldens. It is a scoped build with
a brainstorm, not a quick win. Tracked in `checks`, not here.

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
- **Label is 1–5 words, actionable.** More context goes in a headline ABOVE the button, never inside
  it.
- **Whitespace around the button matters** — bunched links produce mis-taps, worst on mobile.
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
- **DISTANCES SPEAK LIKE A PERSON — quarters and halves, never decimals.** Operator decree
  08/10/2026, off "a grocery store 0.57 miles away" in a live render: *"NEED TO MAKE SURE THESE ARE
  1/2 MILE OR QUARTER MILE OR HALF MILE. WE AREN'T BEING EXACT HERE."* A distance in email prose is
  "about a quarter mile", "about half a mile", "about three-quarters of a mile", "about a mile" —
  never "0.57 miles". **THE ONE ROOT: `humanDistance()` in `lib/listings/neighborhood-amenities.ts`**
  — it formats the distance INSIDE the amenity fact line every address-spine narrator reads
  (§1.14b's lesson: hand the writer the string exactly as it should appear, never a raw value plus a
  restraint), and the AREA instruction in `recipes/shared.ts` orders the model to repeat it as
  written. Any new surface that renders a distance calls `humanDistance` — never formats miles
  inline. (Same lesson as the 08/06/2026 open-house correction — *"No one says a fucking golf course
  .57 miles away"* — which had only been applied to the invitation branch, not the fact line.)
- **AT MOST TWO DISTANCES PER EMAIL — and NONE for what the community already has.** Operator decree
  08/10/2026, off a live paragraph that strung three mileage clauses in a row: *"WE DON'T FUCKING
  NEED DISTANCE FOR EVERY FUCKING THING… JUST FUCKING MENTION ONE OR TWO AND TALK ABOUT THE OTHER
  GREAT THINGS TO DO."* And: *"IF THEY LIVE IN A GOLF COMMUNITY, GOLF IS RIGHT FUCKING THERE"* —
  never state a distance to a thing the in-gate/community lane says the community itself has.
  **BOTH ROOTS ARE STRUCTURAL, not prompt wording** (prompt-side "one or two" had already failed):
  `MAX_SPOKEN_DISTANCES = 2` in `neighborhoodAmenitiesSourceLine()` caps how many distances the
  narrator is ever handed, and its `communityHasGolf` option (wired from `insideTheGate.golf` /
  `community.hasGolf` in `recipes/shared.ts`) drops nearby `golf`/`countryclubs` rows entirely.
  Every other category is mentioned as a good thing nearby with no measurement. Test-enforced in
  `neighborhood-amenities.test.ts`. This was strike 3 of the distance-speak shape — see
  `_ASSISTANT/STRIKES.md`.

### 1.9a Zip codes — never "ZIP". Never "X of Y" for what we don't hold.

**Operator decree 08/06/2026, verbatim, looking at a real render:** *"STOP CAPITALIZING THE WORD
ZIP!!! We say zip codes. what the fuck is ZIP. change it everywhere."* Followed immediately by:
*"why say 8 of 9 zip codes? just talk about the 8 fucking zip codes we fucking have."*

Two separate rules, both universal — every email, not just the ones with a chart:

1. **NEVER write "ZIP" (all-caps) in customer-facing copy.** Always "zip code" (singular) or "zip
   codes" (plural), spelled out, lowercase. This applies to sentences, chart titles/captions, and
   stat-cell labels — even labels the CSS renders `text-transform:uppercase` (the CSS transform
   changes the pixels, not the correctness of the underlying word; a screen reader and any future
   restyle both read the source text).
   - **EXCEPTION — source citations.** A vendor's own descriptor (e.g. Zillow's "ZIP-level
     all-homes") is quoted, not authored — rewording a citation for our style guide is a
     source-faithfulness violation (`feedback_derivable-is-not-source-faithful`), and
     `refinery/validate/zip-level-framing-lint.mts` already protects this exact class of phrase on
     purpose. Do not "fix" a citation's casing.
   - **NOT the same rule as `feedback_no-zip-level-intelligence-framing`.** That one is about
     PRODUCT-POSITIONING framing ("ZIP-level intelligence" as a moat claim) and is already enforced
     structurally by the same lint. This rule is about customer-facing WORD CHOICE in the copy
     itself. Different concern, same file's lint deliberately does not overlap the two.
2. **NEVER frame a real gap as "X of Y" when Y is a count we hold ZERO data for.** Comparing our
   count against a number we don't have anything for reads as an apology, not a fact — "8 of 9 zip
   codes carry a published home value" implies something is missing/wrong. Just state the count we
   HAVE: "8 zip codes." This does not weaken the no-invention gate — stating a plain count is not a
   completeness claim ("every zip code"/"all of them" still is, and stays banned).
   - **THIS DOES NOT APPLY TO TRUNCATION.** A genuinely different case: when we hold MORE real rows
     than a chart or list can draw (e.g. a 12-zip-code place, an 8-bar chart frame), "top 8 of 12" is
     confident framing — "our top picks" — not an apology, because we really do hold the other 4 and
     are choosing what to show. Keep "top N of M" there. Collapsing the two cases into one rule was
     considered and rejected — see `lib/deliverable/recipes/market-pulse.ts`'s `chartTitleFor` and
     `settledPulseFacts` for the reference split (coverage sentence has no "of Y"; truncation
     sentence keeps it).

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

## 1.14b Pre-checked commentary — the gate moved BEFORE the build (bake side landed 08/06/2026)

Operator: *"Has to be a fucking way we can get commentary that is checked before it hits builder
and builder can just add a CTA and a little extra commentary."* §1.14 is that gate running DURING
the build, once per request. This runs it ONCE, ahead of time, and hands the builder a row that has
already passed.

**What can and cannot be pre-checked — this is decided by the recipe's subject spine, not its name.**

- **AREA-spined recipes** (market pulse, the REVIEW reply, weekly sphere, community info, listings
  showcase/digest) have a bounded subject set — 52 core ZIPs we already enumerate. The area read is
  baked on a cadence and validated before it is readable. **These are precomputable.**
- **ADDRESS-spined recipes** (new listing, coming soon, comps, under contract, just sold, open
  house, price improved) are about a house the user typed in a second ago. There is no key set to
  enumerate. **These keep generating live, and that is correct, not a gap.**

That split is the operator's sentence implemented: the checked AREA read is precomputed, and the
builder adds the CTA and the one house-specific line.

**THE MEASURED LESSON — why the facts handed to a writer must already be display-ready.**

The bake ran red for 17 days. Diagnosed 08/06/2026 by replaying every failing key: of 11 failures,
only 3 were notation. **Five were the model ROUNDING** (93.7% → 93, $399,900 → $400,000, 1.04 → 1.0)
and **two were ARITHMETIC across two given figures** ($400,000 − $325,000 = $75,000).

The cause is not a bad model. **The prompt handed raw values and then forbade rounding.** A writer
told to produce plain English for a local reader *will* round — that is what readable prose does.
The instruction and the material were in conflict, so it broke every single run.

**The rule this buys us, and it applies to every prompt in this system:** do not hand a writer a raw
value and ask for restraint. Hand it the string exactly as it should appear, so "restate this
verbatim" is trivially satisfiable instead of a rule the material fights.

Applied: the area-email adapter selects the top six facts **that are copy-ready**, not the top six
outright. Measured across all 52 live surfaces, **25 had ranked a bare ratio** (`Pending Ratio=0.16`,
`Average household size=1.63`) into their top six — exactly the shape that caused the rounding. Those
are passed over. They are **never rescaled or relabelled**: whether a "pending ratio" may be shown as
a percent is a semantic claim the adapter has no standing to make, and the pool holds 28–30 signals,
so skipping two costs nothing.

**Status — do not read this as finished.** The bake side is built, tested and dry-run proven (52
surfaces, 6 facts each, 0 unready). **No recipe reads the baked row yet**, and no real bake has run.
Until that lands, every area email still authors its own commentary exactly as before. Checks:
`area_email_readthrough_phase2`, `bake_rounding_computed_prompt_fix`. Plan:
`docs/superpowers/plans/2026-08-06-precomputed-commentary-plan.md`.

## 1.15 Charts

- **A chart ships ONLY when the deliverable is ABOUT a number, and about the SUBJECT.**
- **An empty chart slot is worse than no slot.** Policy "none" means DROP the slot, never ship an
  empty box.
- Chart type follows the data's shape, not taste.
- Two bars showing was-versus-now is a fact wearing a chart costume. Write the fact.
- The chart's magnitude must cohere with the headline — same unit, headline within ~3× of the
  plotted range.

## 1.16 Measure — how WIDE a line of prose may be

Added 08/05/2026. Source: outside typography research (Smashing/Baymard lineage) brought to the
desk, **checked against our own grid before being written down.** The band is the one number every
typography source agrees on; the span math below is ours, counted from `grid-schema.ts`.

- **Running prose reads best at 45–75 characters per line.** Too long and the eye loses the start of
  the next line; too short and it ping-pongs, which is worse. This is a real constraint we had
  written down nowhere.
- **Our canvas satisfies it at full width, by construction.** Span 12 = 600px, minus `CARD_PAD` 24
  each side = 552px of text. At `body` 16px that is **~69 characters — inside the band.**
- **The span ladder, counted:** span 12 ≈ 69 chars · span 8 ≈ 44 chars (right at the floor) ·
  span 6 ≈ 31 chars · span 4 ≈ 19 chars.
- **THE RULE: a paragraph of running prose is span 12. Never span 6 or span 4.** A block narrower
  than span 8 may carry a label, a figure, a caption, or a one-line strapline — never a paragraph.
- **Verified 08/05/2026 — we are compliant, and it is not an accident.** The `push()` helper in
  every recipe hardcodes `span: GRID_COLS`, so every prose block in all 17 emails is full width.
  The single exception is the paired hero cards in Weekly Sphere (`sphere-weekly.ts`, `pairCell`
  at span 6, a blessed `{6,6}` row) whose `prose` field runs ~31 chars per line. That is correct
  **only** because it holds a short strapline under a big number. **If that field ever grows into a
  paragraph, the row is wrong, not the rule.**
- No lint enforces this yet — the rule is the doc, the compliance is a property of `push()`.
  Tracked in `checks`.

---

# PART 1.5 — READING AN OUTSIDE DOCUMENT ABOUT OUR OWN SYSTEM

**Added 08/05/2026, after the third occurrence.** Outside write-ups about this project — NotebookLM
mind maps, AI-generated "master synthesis" briefs, consultant decks — arrive looking authoritative
and describing a system that does not exist. **They are hypotheses. This file and the code roots are
the authority.** The pattern, three times now:

1. **08/04/2026 — the NotebookLM mind map.** Named real roots, but had no node for the seam or the
   one door, put branding at the START and AI at the END. Built to, it re-creates the 07/19
   `HERO_LABEL` clobber. Corrected into PART 0.
2. **08/05/2026 — the "SWFL Master Synthesis" brief.** Asserted **"27+ real estate layouts."** The
   registry holds **19 keys: 17 emails + 2 social**, counted from `lib/deliverable/recipes/index.ts`.
   It also named "Veza Digital-aligned automation" and "WAIO (Webflow AI Optimization)" as if they
   were standards. They are vendor marketing, not specifications.
3. Same brief carried **uncited conversion percentages** — "228% DVI outperformance", "10–25%
   conversion lift", and a UGC lift given as **43% in one document and 82% in another for the same
   claim, neither sourced.**

**THE HARD RULE, and it is just §1.14 pointed at prose:** an uncited percentage from an outside
document does not enter this playbook, a recipe, an email, or an answer. Not as a target, not as a
justification, not as a footnote. **Every figure names a real source.** A number that disagrees ~2×
with itself across two documents is not evidence of anything except that nobody checked.

**What outside documents ARE good for:** naming a constraint we never wrote down. §1.16 exists
because one of them raised line length — the *band* was the useful part; the *span math* had to be
counted here before it could be a rule. Take the question, verify the answer against our own code,
then write it down.

---

## 1.17 THE ACCEPTANCE SCRIPT IS SHARED. THE ROWS AND THE ASSERTIONS ARE NOT.

**Locked 08/06/2026.** Operator: *"Why would we build multiple of anything and not use the same?"*

Every email's acceptance run (`scripts/email/render-<email>.mts`) imports `scripts/email/_harness.mts`.
**Do not copy its functions into a new script — import them.** The harness owns: the account-brand
load, the provenance table printer, `clip`, the bottom-of-email table, the brand-carry diff, render +
save, and the assertion reporter. A new email's script is roughly 60 lines, not 350.

**What stays hand-written per email, always:** its `rows[]` provenance list, its assertions, and
**its own default house** (passed to `subjectAddress(...)`, never a shared constant). Those are the
per-email thinking. Consolidating them is a bug, not a cleanup — see the postmortem below.

**Why the rule exists — copying a fix leaves it unapplied.** Four scripts had been written one at a
time, each copying the last: 1,330 lines doing the same seven things. Two consequences, both real:
`clip()` was written for New Listing after a truncated URL got filed as a live defect that was not
one — and Coming Soon and Market Comps were still running a bare `.slice()` with no ellipsis, the
same alarm generator, still armed. And Coming Soon carried its own hardcoded 14-key copy of the
brand carry list; when the real list widened to 32 it kept printing a stale count against a closed
defect. Live-probed 08/06/2026: **32 carry keys, 30 filled on the demo account row.**

**A CONSOLIDATION IS PROVED BY A PAIRED RUN, NOT BY A GREEN TEST.** Run the pre-change script and
the post-change script **back to back on the same live data**, and byte-compare the rendered HTML.
Never compare against a snapshot taken earlier: `resolveSubject` reads a live vendor feed, so the
subject price, the hero photo hash and the comp set all move between runs, and a stale baseline
reports a false difference. Measured 08/06/2026 — Coming Soon and Market Comps came back
byte-identical; New Listing differs **by design**, because it was the only script still branding
from a hardcoded fixture instead of the real account row.

**THE POSTMORTEM, from building this harness.** The first cut gave all four scripts one shared
default address. Each had its own on purpose — Coming Soon needs a house whose suppression contract
can actually leak, Market Comps needs one with a real comp set — so two scripts silently began
testing a different house. That is the same "one root for things that only look alike" error the
harness exists to prevent, committed inside the fix for it, and **only the paired run caught it.**
The general form: consolidate what is genuinely one thing; a parameter is not duplication.

---

## 1.18 BUILDING A NEW EMAIL — THE ORDER OF OPERATIONS. DO NOT IMPROVISE THIS.

**Every walk that produced a defect produced it by skipping a step here.**

**1. READ, IN THIS ORDER, BEFORE WRITING A LINE OF CODE.**
   a. **This file** — PART 1 in full, then your email's section in PART 2, then §2.1–2.4 of the four
      already walked. A hook blocks email edits when the playbook was never opened in the session;
      that hook is the record of three defects that were written down *before* the build that
      re-shipped them.
   b. The gitignored rules, **by path** — `Grep` cannot see them and a search returning nothing is
      NOT evidence of absence:
      `_RESEARCH/deliverable-and-design/2026-07-01-ai-deliverable-design-quality-research.md` ·
      `_RESEARCH/email-and-social/2026-08-03-strongest-real-estate-email-concepts-structure.md` ·
      `_RESEARCH/email-and-social/2026-08-03-email-length-and-per-type-benchmarks.md`
   c. `lib/deliverable/CLAUDE.md` and `lib/email/CLAUDE.md`.
   d. **The recipe file that already exists for your email.** All 17 keys already have a builder.
      You are almost never writing from zero — you are deciding what the walk changes. Read what is
      there before proposing to replace it.

**2. STATE THE BUILT COUNT FIRST, COUNTED FROM CODE.** How many emails have a builder (count
`lib/deliverable/recipes/index.ts`) and how many have been WALKED (count `scripts/email/render-*.mts`).
Those are different numbers and conflating them is how a status report lies. **08/06/2026: 17
builders, 6 walked** (New Listing, Coming Soon, Market Comps, Under Contract, Just Sold, Monthly
Market Pulse).

**3. BRAINSTORM → NAME THE BREAK → TDD.** `superpowers:brainstorming` is mandatory. No design is
approved without a failure-modes section: every way it can break, each paired with the guard that
stops it. Then `superpowers:test-driven-development` — the failing test is named after the failure
mode it targets. **A green suite is not a guard against an environment hazard, a data-existence
failure, or an invented claim**; those need a validation/gate/lint named separately.

**4. REGISTER THE BUILD.** `node scripts/new-build.mjs <slug> "<label>"` — spec stub plus the
`<slug>_live_verify` check in one step. Without it there is no check to close and the build is
invisible to the session loop.

**5. RENDER IT AND LOOK AT IT.** Under Contract found **four defects by rendering and looking that
no test could see**, plus one assertion that was a latent false alarm which would have fired on any
condo. Coming Soon found its doubled-name broken-logo bug the same way.

**6. REPORT n OF N.** Never report a multi-part task without the fraction and the names of the parts
NOT done. Partial is fine. Partial reported as whole is the defect.

**7. CLOSE THE CHECK WITH PASTED EVIDENCE** — the command and its real output, the assertion lines,
the rendered file path. Not "tests pass"; the test line.

---

## 1.19 THE TRAPS. EVERY ONE MEASURED, NONE THEORETICAL.

**T1. DO NOT WRITE A SECOND RESOLVER.** `resolveSubject` (`recipes/shared.ts`) is the ONE inspection
point for all seven address-spine emails — a fact wired there reaches all seven at once. If your
recipe needs a fact it does not return, check first whether we are already fetching it and throwing
it away: `lotSize`, `propertyType` and `baths` all were.

**T2. DO NOT COPY A HELPER. IMPORT IT.** `withCommas` had **eight** copies; `clip` had three variants
and the two scripts missing it still carried the bug it was written to fix. Roots that exist and must
be imported, never re-typed: `lib/format-number.ts` (`withCommas`) · `scripts/email/_harness.mts`
(the whole acceptance scaffold) · `lib/email/social/platforms.ts` · `lib/email/listing-flyer.ts`
(`spec`, `pricePerSqft`) · `lib/listings/listing-url.ts` · `lib/brand/profile-ledger.ts`
(`PROJECT_CARRY_KEYS`).

**T3. BUT A PARAMETER IS NOT DUPLICATION.** The counterweight, and it bit the same day: each
acceptance script's **default house is its own**, chosen for what that email exercises. Collapsing
them into one shared constant silently re-pointed two scripts at a different property. Consolidate
what is genuinely one thing.

**T4. BRAND OFF THE REAL ACCOUNT ROW, NEVER A HARDCODED FIXTURE.** A fixture proves the renderer and
proves nothing about whether an agent who fills in their brand actually gets it. One hid a 17-field
account→project drop for an entire session. Use `loadAccountBrand()`.

**T5. A STALE ALARM IS WORSE THAN NO ALARM.** Any diagnostic that hardcodes a list living elsewhere
goes stale and then reports a defect that is already closed — and the next session re-opens fixed
work. Derive from the root. Coming Soon's 14-key copy of a 32-key list is the worked example.

**T6. AN EMPTY CHART BOX IS WORSE THAN NO CHART.** Twelve of seventeen declare chart policy `none`,
and none means DROP the slot — `dropEmptyChartSlot` also closes the hole, because filtering a
positioned block leaves a void.

**T7. THE OPEN-SLOT CONTRACT.** An unsourceable fact is an OPEN SLOT — never a zero, never a
placeholder, never "TBD", never invented. The label is the instruction to whoever fills it, and it
ships to the recipient once filled.

**T8. THE CLAIM GATE FAILS CLOSED AND SILENTLY.** A dropped narrator paragraph is a `console.error`
nobody reads, and its symptom — a slightly thin email — looks like nothing being wrong. Wire
`captureNarratorDrops()` and print the line on every acceptance run.

**T9. ASSERT AGAINST THE RENDERED BYTES, NOT THE SOURCE DOC.** And watch substring false alarms: a
`!lower.includes("dom")` check fires on **"condominium"** — 6,489 condos in the lake — on the first
condo it ever sees. Case-sensitive word boundaries for token labels.

**T10. PROVE A REFACTOR WITH A PAIRED RUN** (§1.17). Old script and new script back to back on the
same live data, byte-compare the HTML. Never against an earlier snapshot: `resolveSubject` reads a
live vendor feed, so the subject price, hero photo hash and comp set all move between runs and a
stale baseline reports a false difference.

**T11. NEVER FETCH A LISTING PORTAL, AND NO AERIAL VIEWS.** The listing's own photo or nothing.

**T12. STATE THE METERED CALLS BEFORE RUNNING.** Each acceptance house is chosen for ZERO new vendor
spend; the only metered call is the one narrator paragraph. Running without `ANTHROPIC_API_KEY` skips
even that — which is also how the deterministic paired run in T10 is done.

**T13. AN ACCEPTANCE RUN MEASURES TRUTH. NOTHING IN IT MEASURES WORTH.** Eight green assertions
proved the Just Sold email's sourcing was airtight and told us nothing about whether anyone would
read it. Operator's verdict on that same artifact: *"this is the worst just sold email I have ever
seen."* **Before you call an email done, read it as the RECIPIENT** — see §1.20.

---

## 1.20 HOW AN AGENT EMAIL SPEAKS. THE VOICE CARD.

**Every line here comes from a crawled source, not from taste.** Full pass with quotes and URLs:
`_RESEARCH/email-and-social/2026-08-06-just-sold-craft-and-agent-email-voice.md` (gitignored — open
it by path, a Grep cannot see it).

**THE ONE RULE: THE READER IS THE HERO. NOT THE AGENT, NOT THE HOUSE.** The Close's Use-This/Not-This
table is the whole card: *"Profit from your home!"* beats *"We know how to sell your home!"* —
because it *"make[s] the seller the hero of the story."* *"Get your free home valuation today!"*
beats *"We can tell you how much your home is worth!"* — it *"conveys what the homeowner will
receive rather than what you can do."* An email about a property that never mentions the reader is
the failure this rule names, and it is the one we shipped.

- **Be direct, never vague.** *"Call or text me"* beats *"let us know if you're interested"* —
  passive asks get ignored.
- **Answer "why should I care?" above the fold.** *"Here's what your home might be worth now,"* not
  *"Hope you're well."*
- **Concrete value, never motivation.** Market data, pricing insight, a real number — *"not fluffy
  motivation quotes."*
- **Sell the REPLY or the CLICK, not the house.** The email's job is the next step, not the sale.
- **ONE CTA.** *"When we've tried to cram multiple CTAs into one message, performance drops across
  the board."* Already enforced by the chrome — keep it that way.
- **Short. Under 30 seconds to absorb.** *"Most agents over-write these emails."* Consistent with the
  50–125-word band in §1.9.
- **Clear, not clever.** The subject must promise a benefit the body actually delivers.
- **No pressure.** *"No pressure — just good information to have"* is the closing line of the
  best-sourced template we crawled.
- **Never ship a bracketed placeholder.** An open slot ships EMPTY with its label as the instruction.

**ONE UNRESOLVED CONFLICT, and do not resolve it by assertion.** LeadSites: *"Plain-text or minimally
designed emails often outperform heavily branded templates in real estate … feels less like marketing
and more like a note from a trusted advisor."* That cuts against our whole designed chrome. The
honest read is that our differentiator is sourced local data, which needs structure to be legible —
but that is a hypothesis, not evidence. **A/B testable, not knowable from here.** Flagged, not fixed.

**SUBJECT LINES: 30–40 characters.** Three independent sources now converge (LeadSites says under 50,
Luxury Presence says 40 or fewer, our own 08/03 pass says 30–40 for an open). Lead with the STREET,
then pivot to the reader.

**AND STOP QUOTING OPEN RATES.** Apple Mail Privacy Protection pre-loads tracking pixels, so open
rate is directional at best — that is now the third independent source saying it. Usable targets:
CTR **2–5%** is strong, unsubscribe over **0.5%** on one send means something is wrong, bounce under
**2%**.

---

# PART 2 — THE EMAILS, ONE BY ONE. JUMP TO YOURS.

Each section is self-contained. Read PART 1 once, then read ONLY your email's section.

**Every section carries: the TAG, the spine, the grid, the ingredients with their sources, the
fallback when a source misses, the chart policy, what the AI writes, the buttons, and the known
gaps.**

| Tag | Email | Section |
|---|---|---|
| `new-listing` | New Listing | 2.1 — WALKED 08/05/2026 |
| `coming-soon` | Coming Soon | 2.2 — WALKED |
| `market-comps` | Market Comps | 2.3 — WALKED |
| `under-contract` | Under Contract | 2.4 — WALKED |
| `just-sold` | Just Sold | 2.5 — WALKED 08/06/2026 |
| `open-house` | Open House | 2.6 — **WALKED 08/06/2026** (5 rounds live-render correction w/ operator, `SESSION_LOG.md:1940-1962`); playbook Part 2 write-up OWED |
| `price-reduced` | Price Improved | 2.7 — WALKED 08/09/2026 (first sentence bank; bank words pending operator reword) |
| `agent-brand-intro` | Agent Brand Intro | 2.8 — WALKED 08/06/2026 |
| `agent-launch` | Agent Launch — The Letter | 2.9 — **WALKED** (shipped live 07/05, prod-verified click-through `SESSION_LOG.md:16306`); playbook Part 2 write-up OWED |
| `sphere-weekly` | Weekly Sphere Update | 2.10 — TO BE WALKED (no operator-walk evidence found in SESSION_LOG as of 08/12 — genuinely unverified, not confirmed either way) |
| `review-reply` | The REVIEW Reply | 2.11 — TO BE WALKED (no operator-walk evidence found in SESSION_LOG as of 08/12 — genuinely unverified, not confirmed either way) |
| `market-pulse` | Monthly Market Pulse | 2.12 — WALKED 08/06/2026 |
| `back-on-market` | Back on the Market | 2.13 — WALKED 08/06/2026 |
| `community-info` | Community Info | 2.14 — **WALKED** (operator decree + review, `SESSION_LOG.md:6606-6912`); playbook Part 2 write-up OWED |
| `listings-showcase` | Listings Showcase | 2.15 — **WALKED** (operator review round + 2 real live sends, `SESSION_LOG.md:6472-6602`); playbook Part 2 write-up OWED |
| `listings-digest` | Listings Digest | 2.16 — TO BE WALKED (08/12 session fixed a real arrival bug and live-verified the builder, but that was a bugfix, not an operator design walk) |
| `default-grid` | Market Email (the catch-all) | 2.17 — terminal fallback, not a walked recipe by design |

**CORRECTED 08/12/2026 — the table above was wrong, not just stale.** It conflated "has a written
Part 2 prose section in this doc" with "was walked with the operator," and reported four recipes
(Open House, Agent Launch, Community Info, Listings Showcase) as unwalked when SESSION_LOG shows
real operator-driven builds, corrections, and live sends for each. **A prior "9 walked, 7 to be
walked" count was reported to the operator on this false basis — he had walked Open House himself
and caught it immediately.** Do not trust this table's WALKED/TO-BE-WALKED column without checking
SESSION_LOG when the stakes matter — the acceptance scripts under `scripts/email/render-*.mts`
prove BUILT; only SESSION_LOG proves WALKED. This table proves WRITTEN (has a Part 2 section) and
that is a third, different thing again. Genuinely unwalked (no evidence either way): Weekly Sphere
Update, The REVIEW Reply. Bugfixed-but-not-walked: Listings Digest.

`social-pack` and `social-cut` are NOT emails. Different renderer, different contract. They are not
in this playbook and must never be "fixed" onto email chrome.

---

## 2.1 NEW LISTING — tag `new-listing`

**Walked with the operator 08/05/2026 and BUILT in the same session.** Every count below was
produced by a query run that day, not quoted from a document. Re-count before quoting any of it.

**Spine:** ONE house. The address resolves exactly once, before any layout happens. It comes from
the address field OR from the words the user typed — **the builder decides which, never the door
they clicked.** (Gating on the field alone is what once sent every in-lab campaign build to the
generic author and produced a photo-less ZIP grab-bag.)

**Grammar:** the listing grammar. Ribbon, photo, hero with address over price, spec strip, the
seller's own description, a second spec row, the authored paragraph, agent card + one button.

**Chart: NONE.** Operator ruling 07/13/2026 — this email is about a HOUSE and its visual IS the
photo. An area index says nothing about the house. A comps bar turns it into a comps email.

**Subject line:** wants an OPEN → 30–40 characters. `newListingSubject`, deterministic, never
model-authored: `Just listed: 12554 Kellysands Way`.

**Code:** `lib/deliverable/recipes/new-listing.ts` → `buildListingFlyer`
(`lib/email/listing-flyer.ts`) → `buildLifecycleEmail` (`lib/email/lifecycle-chrome.ts`).
The house is resolved by `resolveSubject` (`lib/deliverable/recipes/shared.ts`) — **the ONE
inspection point all seven address-spine emails share, so a fact wired there reaches all seven.**

---

### 2.1.0 REPRODUCE IT — one command, and it prints its own provenance

```
bun --env-file=.env.local scripts/email/render-new-listing.mts "<address>"
```

It drives the real pipe end to end, prints a per-cell table of what filled each cell and from
which lane, and writes the HTML to `~/Downloads/new-listing-email.html`. **The default address is
`12554 Kellysands Way, Fort Myers, FL 33908`** — chosen off a live join because it is the one house
that exercises every lane with ZERO new spend.

**Acceptance run, 08/05/2026 — 15 of 17 cells sourced, 2 open slots, 17KB:**
$350,000 · 2 beds · 2 baths · 1,515 sq ft · 0.22 ac · **$231/sq ft** · **DOM 11 (real, not a
floor)** · built 1988 · **HOA $1,326/mo** · a 43-photo gallery · the seller's 549-character
description verbatim · one authored paragraph · and the button pointed at the real
realtor.com listing page. The two open slots are the subdivision and the in-gate community
profile — honest misses, printed as such.

**The only metered call in the whole build is the one authored paragraph.** Run without
`ANTHROPIC_API_KEY` and even that becomes an open slot; everything else still renders.

---

### 2.1.1 THE FOUR SUPPLIERS — what each one actually gives this email

**THE LAKE — `data_lake.listing_state`, our own daily sweep. FREE, and it is lane 1 for everything
it holds.** 35,202 rows · 34,904 `for_sale` · Lee 24,548 · Collier 9,142 · Hendry 1,512. Carrying
the new-listing flag right now: **2,684** (Lee 1,909 · Collier 559 · Hendry 216).

Fill, counted live over all 35,202 rows: asking price 100% · property type 100% · hero photo
98.5% · coordinates 98.2% · list date 88.9% · lot acres 78.0% · beds 73.7% · square feet 70.6% ·
**baths 15.3%** · subdivision 0.8% · brokerage 0.8%.

On the 2,684 flagged NEW listings specifically — the actual population this email serves: Lee has a
photo on 1,895 of 1,909, beds on 1,560, sq ft on 1,519, **baths on only 537**; Collier has a photo
on 558 of 559, beds on 513, sq ft on 510, **baths on only 217.**

**THE COLUMN CEILING, read from `information_schema` rather than remembered — all 42 columns.**
The free spine does NOT have: `year_built`, any description or remarks, any photo gallery, any HOA
fee, stories, garage, pool — **and no URL column of any kind.** Do not plan a free fallback for a
field that is not on this list. It DOES carry `property_id` (99.2%), `mls_name`, `subdivision` and
`brokerage` (both 0.8%, effectively empty), and the seven `flag_*` booleans including
`flag_new_listing`.

**Type mix, and why "single family" framing is wrong:** single_family 16,410 · **land 9,046** ·
condo 6,489 · other 1,742 · multi_family 616 · townhouse 601. **A quarter of the book is LAND** —
beds/baths/sq ft are legitimately absent there, not missing.

**OUR OWN LISTING CLOCK — `data_lake.listing_dom`.** 34,904 rows, **31,825 real (91.2%)**, 3,079
first-seen floors (8.8%). Days are computed at read time so they cannot go stale. **This cell is
safe to build on.** A floored count is never printed as a fact.

**STEADYAPI — the vendor behind the daily sweep.** It documents **18 real-estate endpoints, all
v1, and we call 8.** Never called: `/autocomplete`, `/nearby-rentals`, `/property-urgency`,
`/property-estimates`, `/environment-risk`, `/geo-details`, `/similar-homes`,
`/gallery-similar-homes`, `/new-construction`, `/mortgage-rate`. Two of those document fields this
email currently has no source for (`/environment-risk` documents flood/wind/heat/wildfire;
`/property-estimates` documents an estimated value) — **but none of the ten has ever been called
here, and every candidate returns NEARBY or SIMILAR homes, so subject-level resolution is
UNPROVEN.** Do not write a ladder rung on them until someone probes them (check
`steadyapi_unused_endpoints_probe`). What we DO use it for live in this email: the bath fallback via
`/nearby-home-values` (a property is the nearest property to its own coordinates, so the subject
returns as its own first row — verified live 07/13/2026) and the list date via
`/property-tax-history`.

**APIFY — the paid realtor.com record. `data_lake.apify_property_records`, 26 rows today.**
**Reading it costs NOTHING — the rows are bought and on disk.** Fill across all 26:
**`property_url` 26 (the best-filled column on the table)** · description 20 · gallery 20 ·
`baths_total` 20 · `year_built` 20 · `style` 20 · `mls` 20 · `days_on_mls` 20 · permalink 20 ·
estimated value 19 · last sold price 19 · garage 13 · **HOA greater than zero 12** · stories 12 ·
**`tax` 0.** Each record carries 69 fields and the whole untouched record is kept in `raw`, so a
field we have not promoted yet is already on disk.

**BRAINS — they feed this email NOTHING, and that is deliberate, not a gap.** The chart policy is
NONE (07/13/2026) and the narrator is given NO comps by rule, because handing it a comp set is what
once turned this paragraph into a market analysis. A brain speaks about an AREA; this email is
about a HOUSE. **Do not wire one in.** The place area data legitimately belongs is Market Comps
(§2.3) and Monthly Market Pulse (§2.12).

---

### 2.1.2 EVERY INGREDIENT, ITS SOURCE, AND WHAT FILLS IT WHEN THAT MISSES

**Stop at the first hit. An exhausted ladder is an OPEN SLOT — never a zero, never a guess.**
**Free first, and note that rungs 1 AND 2 are both zero-cost: reading a row we already bought
spends nothing. No rung below issues a new vendor call.**

**IDENTITY — the agent.** Name, brokerage, phone, headshot, business postal address, all from the
user's brand profile. No data source involved. The postal address is a CAN-SPAM requirement, not a
design choice. **The headshot is the field agents most often skip — it must survive being missing.**
The identity block sits at the TOP (confirmed independently at Zillow, Compass and BoldTrail).

**Asking price** — the free spine → **the paid row we already own, gated**: only when the row was
fetched within 14 days AND the vendor still marks it for-sale (`PRICE_MAX_AGE_DAYS`,
`paid-record-lane.ts`) → the live pull (lane 3b) → OPEN. **"The free spine, 100%, no fallback
needed" was this line until 08/18/2026, and it was a coverage claim wearing a guarantee's clothes:**
the acceptance house itself had NO spine row at all (probed live), so the email rendered its HOA fee
from the bought row while refusing the $689,000 ask in the same row — no price, no $/sq ft.
Operator: *"where the fuck is price per square foot."* The stale-ask objection that justified the
old ban ("a price from three weeks ago is a wrong number") sets the gate's ceiling: the window is
half of three weeks, and off-market rows never serve.

**Street · city · state · ZIP** — the free spine, seeded from the typed text on a miss.

**Property type** — the free spine. 100%. Mapped to a display label at the render edge only
(`shortType`); the lake's `single_family` reached a real inbox once as `single_family`.

**Hero photo** — the free spine's `photo_url` (98.5%), **mirrored into our own storage** so a
rotted vendor link never blanks the email months later. → the paid row's `primary_photo`. → an
open dropzone on the canvas.

**The gallery** — **the paid row only** (`alt_photos`, 20 of 26, 9 to 55 photos). The free lane
carries exactly ONE photo. **No free fallback exists.** Appended BEHIND the mirrored hero, deduped
by exact URL — the vendor's own list starts with the same primary photo, so without the dedupe the
hero appears twice on every build.

**Beds** — free spine (73.7%) → paid row → OPEN. Legitimately open on land.

**Square feet** — free spine (70.6%) → paid row → OPEN.

**Lot size** — free spine `lot_acres` (78.0%) → paid row `lot_sqft`, **converted at exactly 43,560**
(`acresFromLotSqft`). Pouring one into the other unconverted printed "8712 ac" on a fifth-acre lot;
there is a test named after that.

**BATHS — the weak one, and it has five lanes.** free spine (15.3% — Lee 13.1%, Collier 17.5%) →
**our own Lee county records**, exact-address match only, filling only when exactly one parcel
matches (two folios sharing a key is an ambiguity, and an ambiguous bath count is a guess) →
**SteadyAPI `/nearby-home-values` on the subject's own coordinates** — one call, works REGION-WIDE
including Collier → the paid row's `baths_total` → OPEN. **The vendor's `/search` row sets
`bathrooms: null` unconditionally, so the search feed is never a bath source.**

**DOLLARS PER SQUARE FOOT** — computed, price ÷ square feet. If either will not parse the cell
stays OPEN. Never a wrong number from a partial input. **No footnote** (operator, 07/20/2026) —
both operands sit two cells away in the same strip and explaining the division read as a
spreadsheet export.

**TIME ON MARKET** — our own listing clock, 91.2% real. → `today − the vendor's list date` via two
hour-cached vendor calls → the Type cell simply keeps its slot. **A floored count is never printed
as a fact.** A fresh listing reads ONE, not zero.

**YEAR BUILT** — **the paid row and nothing else.** The free spine has no such column at all. 20 of
26 rows. → OPEN.

**HOA FEE — ⛔ NEVER A RENDERED CELL. Operator decree 08/18/2026:** *"why the fuck do we want HOA
costs on there? We don't want to detour any potential buyers before arriving. The agent's job is to
answer those questions."* A naked recurring cost with no amenity story — "$225/mo" with nothing
saying whether that buys golf, a pool, or a gate — is a detour, not a disclosure. The fee still
RESOLVES into `ListingFacts` (the model may see it; the narrator's cost prohibitions already ban it
from prose), but no buyer-facing email prints a cost cell — no HOA, no taxes, no carrying costs.
The one email allowed to print a cost is the one whose story IS the cost (price-reduced's cut,
just-sold's sale price). Under-contract had already implemented this ("costs are the realtor's");
the rendered cell on new-listing/back-on-market was the last surface the ruling hadn't been walked
to. Source mechanics unchanged for the model-visible value: paid row, greater than zero only — a
vendor `0` is indistinguishable from an unfilled field.

**THE CODE ROOT (08/18/2026, same day, after the operator called the per-recipe walking pattern a
lie): `lib/deliverable/cell-policy.ts`.** The cost-cell ban no longer lives in recipes at all — it
is ONE registry (label matchers + the decree verbatim), enforced twice: `buildLifecycleEmail`
strips banned cells from every stats block it assembles (a banned cell physically cannot render on
any lifecycle email, including recipes written later), and Gate 18 in the pre-push hook runs the
fleet test (`lib/deliverable/cell-policy.test.ts`) on every push touching a recipe or the chrome.
**A new content ruling = one entry in that registry — never a per-recipe edit, never a playbook
paragraph alone.**

**THE DESCRIPTION — the biggest quality lever in this email.** The agent's own pasted words (lane
2, and the best source) → the paid row's `description` (20 of 26, measured 368 to 2,983 characters)
→ OPEN. It ships **VERBATIM in its own block**, it does **NOT** count against the 50–125-word
budget (§1.9 carve-out), and the model never rewrites it into a claim. Cut at 900 characters on a
**sentence** boundary, never mid-word and never with an ellipsis — an "…" on someone else's
marketing copy reads as though we edited it.

**THE LISTING LINK — where the one button goes.** The agent's pasted listing link → **the paid
row's `property_url`** (26 of 26 — the single best-filled column we hold) → **NO BUTTON.** Never a
homepage, never our own site, never a search page. Root: `lib/listings/listing-url.ts`.

**THE COMMUNITY — THREE layers that must never impersonate each other:**

1. **INSIDE THE GATE** — `data_lake.community_profiles`, **81 rows.** Golf (with a hole count),
   pool, tennis, pickleball, fitness, clubhouse, on-site dining, marina, gated. What a RESIDENT can
   use. Root: `lib/listings/community-inside-the-gate.ts`. **Every flag is TRUE-ONLY: a `false` and
   a `null` are both "we do not know" and both stay SILENT.** 81 profiles against 20,400
   subdivisions means a miss is the NORMAL case, and a miss keeps the narrator's golf/pool/gate
   prohibition switched ON. Never write that a community lacks something.
2. **NEARBY** — `steadyapi_neighborhoods` (429) + `steadyapi_neighborhood_amenities` (29,118),
   resolved from the listing's own coordinates. **These are BUSINESSES within about five miles, NOT
   amenities inside the community, and the copy must say so.**
3. **THE SUBDIVISION** — `data_lake.neighborhood_stats`, **20,400 subdivisions**, home count and
   median **ASSESSED** value from our own tax roll. Universal — every home in Lee and Collier,
   unlike (1) and (2). **It is an assessed value, never a sale or list price**; "median home price"
   or "homes here sell for" is a different claim and is forbidden.

   **Grain trap:** a home count of 29,225 (Lehigh Acres) is a CITY, not a community.

**COMMENTARY — the ONLY thing the AI writes.** One paragraph, two to four sentences, from the
description and the sourced facts. **It gets NO comps.** It writes prose and never a figure. It may
name golf/pool/gate ONLY when an in-gate line was actually present. Every paragraph is run through
the claim gate and **DROPPED to an open slot** if it asserts anything it was not given — a missing
paragraph is honest, a confident false one is not.

**THE BUTTON — exactly one.** "View the Full Listing", pointed at the real listing page. One CTA
per email, 42–72px, never an image-based button, label 1–5 words.

---

### 2.1.3 WHERE A NEW LISTING CAN BE STARTED ON THE SITE — every door, all routing to one builder

Every one of these carries the tag `new-listing`, and the tag is what routes the build. The seed
prompt text is DISPLAY and SEED only; a build is never routed on it.

- **The homepage hero bar** — `components/landing/HeroBar.tsx` via `HERO_CAMPAIGNS`
  (`lib/campaigns.ts`). The first chip.
- **The address router** — `lib/geo/address-route.ts`. An address typed anywhere on the landing
  surface resolves to the New Listing campaign.
- **The showcase** — `lib/showcase/registry.ts`, "Listing → Close: The Auto Email Plan", campaign
  button "New Listing Campaign".
- **A project's materials hub** — `components/project/TemplateRail.tsx` (mounted in
  `MaterialsHub.tsx`), first template in the rail.
- **The Email Lab, inside a project** — `app/project/[id]/email-lab/`, via `ArcStrip.tsx`
  ("It's live →") and `ListingCampaignHero.tsx`.
- **The recipe registry itself** — `lib/deliverable/recipes.ts`, the seed prompt a keyless ask can
  land on, plus `suggest-recipe.ts` chips (navigation-only, never routing).
- **The layout API** — `app/api/email-lab/layout/route.ts` (`?recipe=new-listing`), which stores
  and clears a per-recipe custom layout.
- **The social side-door** — `?campaign=new-listing-socials` on `app/project/[id]/social/`
  auto-generates the listing-launch week. **Different renderer — never give it email chrome.**
- **Dev preview only** — `app/dev-emails/page.tsx`. Not a customer surface.

---

### 2.1.4 TWO LIVE DEFECTS FOUND AND FIXED WHILE WALKING THIS — both hit ALL SEVEN address emails

Neither was theoretical; both were starving this email of data we had already paid for.

1. **The button pointed at our homepage.** `resolve-subject.ts toFacts` hardcodes
   `sourceUrl: "https://www.swfldatagulf.com"` (correct — that is the CITATION field), and the
   flyer used that same value for the CTA and the hero photo link. So every address-resolved
   listing email shipped "View the Full Listing" → our home page, which is exactly what §1.8
   forbids. `listingUrl` is now a separate field and a missing one means no destination, never a
   fallback.
2. **The paid row almost never joined.** Two bugs in one lookup. `fillFromPaidRecord` passed
   `facts.address` — the FULL printable address, commas and ZIP and all — where a STREET LINE was
   expected, so the key it built could never equal a stored one. And even correct, the two feeds
   spell the same street differently: **the daily sweep writes "12554 Kellysands Way" where the
   paid record writes "12554 Kelly Sands Way."** Measured across all 26 paid rows: **8 joined on
   the exact key; 5 more join once spacing is ignored** (McGregor Woods, Kelly Sands, Marco Island,
   Creekside View, Bristol Bnd). A despaced secondary key is now tried after the exact one.
   **Safety, measured before adopting it:** across 30,655 active listings despacing produces 25
   collisions and **every one is the same place spelled two ways** ("cape coral"/"capecoral"),
   never two different houses — and the house number and city both stay in the key.

**The description had never shipped at all.** The chrome passed the raw remarks in as the
`narrative` value, and the recipe then cleared that very slot and wrote the model's paragraph over
it. The remarks survived only as the narrator's source. There is now a separate reserved block
marked `descriptionSlot`, which both narrative passes already knew to skip.

**Year built and the HOA fee were resolved and then rendered nowhere** — the six-cell strip is full
and DOM already takes Type's slot. They now ride a second `4+4+4` row, emitted only when at least
one of the three is sourced.

---

### 2.1.5 KNOWN GAPS — named, not hidden

- **Baths on a Collier listing with no stated count**: the free spine holds 17.5%, there is no
  county-records lane for Collier, and the region-wide `/nearby-home-values` lane is one paid call.
  Otherwise OPEN.
- **Pool: Lee only. Collier has no pool source at all.** A pool permit is an EVENT, not proof of a
  pool — never use it as one.
- **Annual taxes**: parsed for roughly 16,500 properties and **BLOCKED from customer-facing use**
  until one is validated against a real county bill. The paid row's own `tax` column is **0 of 26**.
- **Schools: a MEASURED absence.** The bulk actor we run returns `nearby_schools` as the literal
  string `<NA>` on all 20 resolved rows — same for `tax_history`, `builder_name`,
  `list_price_min/max`. The *detail* actor is a different actor, has never written a row here, and
  is UNPROBED. **Do not claim schools in either direction.**
- **Flood zone: no verified source today.** `/environment-risk` documents one and has never been
  called.
- **The agent's own book** — `public.user_listings` is **0 rows, 0 users.** Anything depending on
  an agent having imported their listings does not work today; the pasted description in the build
  box is the real lane-2 source.
- **A NEW paid call is not wired into this email.** The by-address Apify lookup (~$0.01, one call,
  one record, and it fills description + gallery + baths + year built + HOA + the listing URL all
  at once) exists and is proven — `fetchApifyBathsForHomes` — but is wired into Listings Digest
  ONLY, not into `resolveSubject`. Account headroom read live 08/05/2026: **$50 cap, $35.99 used,
  cycle 07/28→08/27 — roughly $14, about 1,400 address lookups.** Wiring it in puts spend in the
  build path for **all seven** address-spine emails at once, so it needs to be injectable, gated on
  an explicit miss, and never fired on every build.
- **We do not fetch listing portals.** Operator, 08/05/2026: *"we aren't fucking scrapping."* A
  listing URL is a value we already hold or it is nothing. The permalink IS derivable from the free
  spine's `property_id` (the paid row's `6551280400` is exactly its permalink's `M65512-80400`) but
  it rebuilds byte-exact on only **13 of 20** held permalinks and **fails on every unit/condo
  address**, and the only way to verify one is the thing we just agreed never to do. **Not adopted.**

---


### 2.1.6 THE FINISH PASS — seven defects the DATA was never going to catch

Operator, 08/05/2026, on a screenshot of the rendered email: *"did you start in the fucking right
place??? how can we have different fonts if we have rules? put a nice agent photo at the bottom and
name, contact info, social links. the whole look. it's really pretty good, just a few tweeks."*

**The indictment first, because it outranks the seven items.** I proved the data with a per-cell
provenance table and 3,241 passing tests and reported this email done **without opening it.** Every
defect below was visible in one second and invisible to every test we own. **Reading PART 1 is not
starting in the right place — RENDERING AND LOOKING is.** A test suite proves logic does what it was
told for known inputs; it says nothing about palette, rhythm, evenness or whether a row reads
top-heavy. For a rendered artifact the render IS the evidence class. Second time this has bitten —
see the `{8,4}` CTA note in `lifecycle-chrome.ts`: *"this was settled by RENDERING it, not by taste."*

1. **The email came out in a serif editorial palette — zero of our teal.** `EDITORIAL_STYLE` in
   `lifecycle-chrome.ts` spread a serif pair and a gold accent over `globalStyle`. It is **deleted**;
   the only surviving mention is a comment in the test that now forbids it.
2. **"How can we have different fonts if we have rules" — because THE RULES COVERED SIZE, WEIGHT AND
   LEADING, AND NOTHING COVERED FONT FAMILY.** `blocks/type-conformance.test.ts` (shipped 08/04,
   caught 11 live violations) fails a raw `fontSize`/`fontWeight`/`lineHeight` and said nothing about
   `fontFamily`, so a serif swap passed every guard. **A rule that is only a document is not a rule.**
   The test now also denies a bare `serif`/`sans-serif`/`Georgia`/`Times`/`Playfair`/`Inter` assigned
   to `fontFamily` or `displayFontFamily`. **Standing rule: when you write a rule into this playbook,
   name its guard in the same pass, or mark it ⚠ NOT BUILT with the reason** (§1.5b does this).
3. **The paragraph restated the description, and that was a second-order defect of MY OWN change from
   the same session.** The narrator's prompt says the description *"IS THE SOURCE OF TRUTH and your
   job is to TIGHTEN it"* — correct while the description never shipped. Giving it its own verbatim
   block without changing the narrator's job handed the reader the same sentences twice. **Adding a
   block is never free; it changes what every downstream writer should be doing.**
4. **The spec strip did not read even.** `$231` rendered 28px against 16px everywhere else.
5. **Same defect one level down on the second row** — Built and HOA rendered large, Type rendered
   muted-small. **Never mark ONE cell in a three-cell row `muted`.** All three carry the same weight
   or the row reads broken.
6. **The bottom was bare — and it was never missing a block.** It rendered against an EMPTY brand, so
   the agent card had no photo and no phone and the footer had no social URLs to draw. `AgentCardProps`
   has carried `photoUrl` and `phone` all along. **The first cut added a `social-icons` row to the
   spine and that was wrong** — `FooterBlock` already renders company, address, phone, email,
   unsubscribe AND the registry-mapped socials off `lib/email/social/platforms.ts`, the ONE platform
   root. A block would have duplicated the links on every listing email and split the root in two.
   **The fix for a bare bottom is filling the brand, never adding a second root.**
7. **Rendered and looked at, 08/05/2026** — Dani Vero · Cast & Coast Realty · Cape Coral, the real
   `dani-vero.jpg` headshot, phone, CAN-SPAM address, email, website, Instagram, Facebook, LinkedIn;
   button → the real realtor.com page; **21KB, 15 of 17 cells sourced.**

**ONE DEFECT THE RENDER ITSELF FOUND, and it is why this section exists.** Run 1 printed
`[narrative] DROPPED — the narrator made 1 claim(s) it was not given: sequence("before the showing")`
and the email shipped with **no authored paragraph at all**. Run 2 was clean. So the AI commentary
silently vanishes on some builds: showing-prep language leaking into a new-listing framing, the
no-invention guard doing exactly its job, **the framing at fault, not the guard.** Open as
`new_listing_narrative_silently_dropped`. A dropped paragraph does not fail anything — it just ships
a thinner email, which is the worst failure shape we have.

---


## 2.2 COMING SOON — tag `coming-soon`

**Walked and BUILT 08/05/2026.** Every count below came from a query run that day. Re-count before
quoting any of it.

**Spine:** ONE house — the SAME `resolveSubject` inspection point New Listing uses. Nothing about
the resolution differs; what differs is that almost none of it is allowed to be printed.

**Grammar:** the listing grammar, one substitution. Ribbon "Coming Soon", photo, hero with **the
CITY over the price** where New Listing puts the address, spec strip **minus the lot**, the scarcity
strip, the funnel chart, the authored paragraph, agent card + one button.

**Chart: YES — and it is the one lifecycle email that has one.** A three-tier inventory funnel (all
active county homes → in this price band → beds and size match too). New Listing's chart policy is
NONE because that email is about a house; this email is about **a number** — how few homes like this
one exist — so the chart carries the argument.

**Subject line:** deterministic, written from the city, never model-authored, so it cannot smuggle
the street: `Coming soon in Fort Myers — before it hits the market`.

**Code:** `lib/deliverable/recipes/coming-soon.ts` → `buildLifecycleEmail`. Registry key
`coming-soon` (`lib/deliverable/recipes.ts`).

---

### 2.2.0 REPRODUCE IT — one command, and it asserts its own contract

```
bun --env-file=.env.local scripts/email/render-coming-soon.mts "<address>"
```

**Default house: `16209 Asheboro Ct, Fort Myers, FL 33908`.** Writes
`~/Downloads/coming-soon-email.html`, prints a per-cell provenance table, and **exits non-zero if
the address leaks.**

**This script does three things `render-new-listing.mts` does not**, and each is a lesson from 2.1:

1. **The brand is READ OFF A REAL ACCOUNT, not hardcoded.** New Listing's script hand-writes a
   `DEMO_BRAND` literal — that proves the renderer and proves nothing about whether an agent who
   fills in their brand actually gets it. This one loads `user_brand_profiles`, so a field that does
   not travel shows up as an open slot instead of hiding behind a literal. **That is how §2.2.4's
   headline defect was found.**
2. **It greps the RENDERED HTML** for the street line, the house number, the street core and the
   ZIP. Reading the code and trusting its comments is not verification.
3. **It counts what the project path drops** (§2.2.4).

**Acceptance run, re-run 08/05/2026 — 14 of 18 cells sourced, 23KB** (this line said "14 of 17"
until the script was re-run; a count quoted from a doc instead of from the tool is exactly what
RULE 0.8 forbids): $219,900 · 2 bd · 2 ba · 1,481 sq ft
· **$148/sq ft** · Single Family · Lee County · **14,643 active homes → 834 in band → 518 matching**
· funnel chart rendered · the agent's 1,779-character description as narrator fuel · one authored
paragraph · full agent card and CAN-SPAM footer off the account. Suppression: **4 of 4 probes
ABSENT.** Tests: **180 pass, 0 fail**; `bunx tsc --noEmit` clean.

---

### 2.2.1 THE SUPPLIERS — same four as §2.1, plus ONE new data shape

**Do not re-derive §2.1.1.** The free spine, our listing clock, SteadyAPI and the 26 paid Apify rows
are the same suppliers with the same fill rates, and this email reads them through the same
`resolveSubject`. What is NEW is the scarcity funnel.

**THE FUNNEL — `data_lake.listing_state`, live, FREE, aggregated at source.** Three `count: "exact",
head: true` queries (zero rows hauled). **The land filter is load-bearing:** `beds` and `sqft` both
non-null is what separates a home from a vacant lot, filtered BY DATA and never by guessing at
`property_type`. Lee's active book is **20,560 rows of which 6,567 are bare land** — counting those
as "homes" would inflate the denominator and make the scarcity claim a lie. **Lee's real active-home
count, 08/05/2026: 14,643.**

**THE FUNNEL'S USEFULNESS VARIES ENORMOUSLY BY SUBJECT — measured, not assumed.** Same county, same
query, eight candidate houses:

- `13630 Brynwood Ln` — 14,643 → **321 → 20**
- `5121 Muddy Ln` — 14,643 → **799 → 87**
- `16209 Asheboro Ct` — 14,643 → **834 → 518**
- `12078 Terraverde Ct` — 14,643 → **2,310 → 2,235**
- `12554 Kellysands Way` (**New Listing's own default house**) — 14,643 → **2,747 → 2,575**

**A funnel that goes 2,747 → 2,575 is not scarcity, it is filler.** The subject a teaser is built on
is a real editorial choice, and the house that makes the best New Listing makes a limp Coming Soon.

---

### 2.2.2 THE INGREDIENT LADDER — EVERY CELL, ITS SOURCE, AND WHAT FILLS IT WHEN THAT MISSES

**Rewritten in full 08/05/2026.** This section used to open *"Only the deltas are listed. Every other
cell rides §2.1.2 unchanged"* — which was true and useless. Operator: *"You have written down the
entire recipe? We know where everything has come from and has fallbacks!?"* A reader of a
delta-list has to hold two documents open and diff them in their head to answer "where did this
number come from", which is the scavenger hunt this whole file exists to end. **Every cell is
written out here.** Where a rung is genuinely identical to §2.1.2 it says so AND states the rung.

**Stop at the first hit. An exhausted ladder is an OPEN SLOT — never a zero, never a guess.**
**Nothing below issues a new paid vendor call: rungs on the free spine, our own lake, and the 26
already-purchased Apify rows all spend zero.**

#### The identity block — the agent

**Name · title · brokerage · phone · email · headshot · business postal address · socials** — the
user's brand profile, no data source involved. The postal address is CAN-SPAM, not decoration. →
OPEN. **⚠ 17 of these fields do not survive `applyUserBrandToProject` today — see §2.2.4 defect 1.
That is a live defect, not a ladder rung.**

#### The house — identical rungs to §2.1.2, restated so you do not have to go look

| Cell | Rung 1 | Rung 2 | Rung 3 | Exhausted |
|---|---|---|---|---|
| **Asking price** | free spine | paid row ≤14d + still for-sale (08/18/2026 — "100%, never misses" was disproven by the §2.1 acceptance house itself) | live pull | OPEN |
| **City · state** | free spine (100%) | — | — | `Southwest Florida` (a field: `regionLabel`) |
| **Property type** | free spine | paid row `raw.property_type` (08/18/2026) | — | cell keeps its slot |
| **Hero photo** | free spine `photo_url` (98.5%), mirrored to our storage | paid row `primary_photo` | — | OPEN dropzone, alt = the CITY |
| **Beds** | free spine (73.7%) | paid row | — | OPEN |
| **Square feet** | free spine (70.6%) | paid row | — | OPEN |
| **Baths** | free spine (15.3%) | our own Lee county records, exact-address, one-parcel-only | SteadyAPI `/nearby-home-values` on the subject's coordinates | paid row `baths_total` → OPEN |
| **$/sq ft** | computed, price ÷ sq ft | — | — | OPEN if either operand will not parse. **No footnote** — both operands sit two cells away |
| **The description** (narrator fuel only, never printed here) | the agent's own paste | paid row `description` | — | OPEN → **the paragraph is dropped** |

#### The cells this email REFUSES that §2.1 prints — and why

**STREET ADDRESS — SUPPRESSED, structurally, at four layers.** Never read into a rendered field →
stripped from the model's fact sheet (`teaserFacts`) → redacted out of the model's output
(`redactStreetLine`) → **a paragraph that still carries it is DROPPED entirely** (`leaksStreet`).
The photo's alt text is the CITY, because alt text is read aloud and is what Outlook shows with
images off. There is no rung 2. **A suppression is not a gap and never falls through to a fallback.**

**LOT SIZE — DELIBERATELY OMITTED from the grid, and the omission now extends to the writer.** A lot
size plus a city narrows a parcel search further than a teaser should. §2.2.4 defect 4.

**DAYS ON MARKET — WITHHELD FROM THE NARRATOR.** This email announces a home that is *not yet for
sale*, so the number is nonsense in frame even when it is true. §2.2.4 defect 4.

**THE LISTING LINK — there is none.** §2.1's button points at the real listing page; a Coming Soon
has no listing page to point at, and pointing at a search result would locate the house. The one
button goes to the agent's own site (`brandWebsiteUrl`) → the citation root.

#### The scarcity funnel — THE LADDER, four rungs (built 08/05/2026)

Until 08/05 these three counts — the numbers this entire email is *about* — had **exactly one rung**:
a ZIP the frozen Census fixture happened to know, or nothing. Every other ingredient in the campaign
had a real chain and the headline number had a coin flip. It now walks:

1. **County from the committed Census crosswalk** (`countyForZip`). Free, offline, no I/O.
2. **County from `data_lake.listing_state` itself**, by the subject's `zip_code`. Free, daily-fresh,
   one row read. Covers exactly what rung 1 cannot: a ZIP that is new, re-mapped, or was never in
   the fixture.
3. **THE WHOLE COVERED MARKET — no county filter at all.** Every count still real, every other
   filter byte-identical; only the SCOPE widens.
4. **OPEN SLOTS** — three cells whose labels are the instruction. Never a zero, never a refusal.

**THE RULE THAT MAKES RUNG 3 SHIPPABLE RATHER THAN A LIE.** Widening the scope CHANGES THE DISCLOSED
CRITERION, and this email's whole claim to authority is that a reader who re-runs the stated
criterion reproduces the printed number. So the scope is not a private detail of the query: it rides
in **`Scarcity.scopeLabel`**, and **all three consumers print that one field** — the stat cells, the
chart title, and the sources note. A market-wide count under a "Lee County" label would be a
checkable claim that fails its own check, which is worse than an open slot because it invites the
check. Pinned by a test that asserts no consumer emits a county name the scope did not authorise.
A wider scope also makes a WEAKER scarcity claim; that is correct — a weaker true claim beats a
stronger unverifiable one.

**THE LAND FILTER IS LOAD-BEARING at every rung.** `beds` and `sqft` both non-null is what separates
a home from a vacant lot — filtered BY DATA, never by guessing at `property_type`.

**THE BAND IS ROUNDED BEFORE IT IS QUERIED, never after.** The email prints "$198K–$242K" and the
count behind it is computed over exactly that.

#### Geography that DOES ship, all written by CODE

The **community** by name in the prose (a buyer cannot knock on a subdivision, and "coming soon in
Bay Colony" is the entire appeal) — `data_lake.community_profiles`, 81 rows against 20,400
subdivisions, so **a miss is the normal case** → OPEN. The **city** in the hero. The **scope label**
in the scarcity block. The model writes none of them.

#### The narrator — the ONLY thing the AI writes

Runs **ONLY on lane-2 material.** No vendor sells us MLS remarks (all 18 SteadyAPI endpoints,
07/13/2026), so without a pasted description there is nothing honest to say that the grid does not
already say, and the paragraph is an **OPEN SLOT, not an improvisation.** Every paragraph is run
through the claim gate and dropped if it asserts anything it was not given.

#### EVERYTHING ELSE IS A FIELD — `COMING_SOON_FIELDS`, one frozen object

The seven values that used to be literals buried across 600 lines: the **ribbon word**, the **button
label**, the **subject template** (both the with-city and no-city forms), the **photo alt template**,
the **region label**, the **band constants** (±10%, the 80% size floor, the 1,000 and 50 rounding
units) and the **citation root**. Consumers take it as a DEFAULTED PARAMETER.

**They are FIELDS, not SETTINGS — frozen, never read from env or a DB.** `registry-seam.test.ts`
runs every one of the 17 builders twice over two independent contexts and asserts the same document
comes back; a value that varies by environment breaks that silently. The `SITE` constant already
carries that scar — reading `NEXT_PUBLIC_SITE_URL` shipped `http://localhost:3000` as the citation
URL of every locally-built doc. **`SITE` is NOT the same concept as `shared.ts`'s env-derived
`BASE_URL`:** that one is where a READER is sent, this one is who the DATA is attributed to. Do not
consolidate them.

---

### 2.2.3 WHERE A COMING SOON CAN BE STARTED — inherited, not re-derived

Every door in §2.1.3 routes on the TAG, so `coming-soon` reaches the same builder through the same
surfaces. The one that is specifically this email: the lifecycle campaign puts Coming Soon FIRST in
the arc, before New Listing.

---

### 2.2.4 FIVE DEFECTS FOUND BY RENDERING AND LOOKING — none catchable by a test

**§2.1.6's lesson held on the very next email.** 180 tests passed and the provenance table was green
while all five of these were on screen.

1. **THE BRAND CANNOT REACH A PROJECT — 17 of the account's filled fields are dropped on the floor.**
   `applyUserBrandToProject` (`lib/project/apply-brand.ts`) copies **14** columns onto a new
   project's branding. Filled on the account and copied: **zero** of `company_name`, all **nine**
   socials, `unsubscribe_url`, `font_display`, `font_body`, `text_color`, `background_color`,
   `surface_color`, `surface_dark_color`, `button_destinations`. **This is the actual root of
   08/05's "the bottom was bare."** §2.1.6 item 6 concluded "the fix for a bare bottom is filling
   the brand" — correct, and incomplete: **the brand cannot fill, because most of it never
   travels.** An agent who saves their fonts and socials at account level gets emails with neither,
   plus **no CAN-SPAM unsubscribe URL.** Hardcoding a fixture in the render script is exactly what
   hid this for a whole session. Open as `brand_fields_lost_account_to_project`.
2. **5 of 8 social platforms are dead ends on every lifecycle email.** `footerPropKey` in
   `lib/email/social/platforms.ts` is TYPED to three values — `instagramUrl | facebookUrl |
   linkedinUrl` — and `FooterBlock` renders `PLATFORMS.filter(m => m.footerPropKey)`. X, TikTok,
   YouTube, Pinterest and Threads have brand tokens and a Branding-panel field, and render
   **nowhere**. Verified live: 8 of 8 saved, 3 of 8 rendered. Open as
   `footer_renders_only_three_socials`.
3. **The funnel chart shipped TEAL inside a TERRACOTTA email.** The recipe tints the PNG with
   `buildLifecycleEmail(currentDoc, …).globalStyle.accentColor` — the accent of the canvas it was
   HANDED. Hand it an unbranded `defaultDoc()` and the picture is a different brand from the email
   around it, which is the precise drift the recipe's own comment says it asks the chrome in order
   to avoid. Guard: the acceptance script seeds a branded canvas, mirroring the live app.
4. **The narrator defeated a suppression the grid was enforcing, and contradicted the email's
   premise — in one paragraph.** `teaserFacts` stripped address/city/state/ZIP and nothing else, so
   the model still held the lot size and the days-on-market and wrote: *"…on the market for just
   over two weeks… The 0.2-acre lot is owner-land — not leased."* Both facts were TRUE, so the
   claim gate passed them. **Suppressing a cell from the GRID while feeding it to the WRITER
   suppresses nothing**, and DOM on a not-yet-listed home is nonsense. Guard: `lotSize` and
   `daysOnMarket` are now `undefined` on the teaser fact sheet.
5. **The agent card printed an unbounded bio.** The field's placeholder has always read "Short
   bio…" and nothing enforced it; a seven-sentence agent history rendered as a ~25-line grey column
   with the CTA stranded in white space. **A rule that lives only in a placeholder is not a rule**
   — the same lesson as §2.1.6's `fontFamily` gap. Guard: `cardBio()` in `AgentCardBlock.tsx`, cut
   at 260 chars on a **sentence** boundary, no ellipsis, with the live inspector exempt so the
   agent still edits the whole thing.

**A SIXTH, in the acceptance script itself:** its provenance table reported the authored paragraph
as an OPEN SLOT on a run where the paragraph had shipped and was visible on screen — it guessed a
prop name. **A provenance table that under-reports is worse than none.** It now walks every string
in the built blocks.

**AND THE FRAMING BUG BEHIND §2.1's `new_listing_narrative_silently_dropped`.** First run under the
account brand printed `[narrative] DROPPED — the narrator made 2 claim(s) it was not given:
motive("serious"), sequence("before the home is listed")`. The cause was not the guard: the framing
**instructed** the model to write "two or three sentences OF ANTICIPATION and CLOSE ON THE FACT THAT
IT WILL BE SHOWN PRIVATELY FIRST" — a motive claim and a sequence claim, ordered and then discarded.
**We were telling it to invent, then punishing it for obeying.** The private-preview promise belongs
where it is true by construction: the ribbon and the CTA button, both written by code. Prose never
had to carry it.

---

### 2.2.5 KNOWN GAPS — named, not hidden

- **NOTHING IN THE PIPE CAN TELL AN AERIAL FROM A FRONT ELEVATION, and the operator rule is locked
  (the listing's own photo or nothing, never a drone view).** Looked at directly: **two of the three
  strongest-funnel candidates have drone shots as their primary photo** — the vendor feed is full of
  them. The default house is the compromise: a real elevation and a weaker funnel (834 → 518)
  instead of Muddy Ln's 799 → 87 with an aerial hero. **The best scarcity claim and the usable photo
  are not the same house, and today only a human eye knows.** Open as `hero_photo_aerial_detection`.
- **No floor below which the funnel refuses to render.** 20 comparable homes is a strong claim;
  2,575 is filler; **1 would be an embarrassment** and would still print. The chart drops only when
  the counts fail to load, never when they are degenerate. **STILL OPEN after the 08/05 ladder pass**
  — the ladder fixed where the counts COME FROM; it did not add a floor for when they are useless.
  Deliberately left, so the ladder shipped as one change. Open as
  `coming_soon_degenerate_funnel_floor`.
- **The community is an OPEN SLOT on the default house** — 81 community profiles against 20,400
  subdivisions means a miss is the NORMAL case (§2.1.2). The one geography this email most wants to
  name is the one it most often cannot.
- **The narrator is silent without a pasted description.** By design, but it means the email's only
  prose depends on a lane the agent has to fill.
- **The demo agent is FICTIONAL and disclosed:** Marisa Delgado / Coral Ledge Realty, an
  `.example` domain (RFC 2606 reserved) and a 555-01xx phone (reserved fictional block), with a
  generated portrait of a person who does not exist. **Gemini image generation was NOT the source —
  that API returned "prepayment credits are depleted" 08/05/2026.**

---

### 2.2.6 THE FINISH PASS — the font, the sizes, and three answers that were "no"

**Everything below was found by RENDERING AND LOOKING, or by the operator asking a question the
code could not answer. None of it was catchable by the 180 tests that were green throughout.**

**1. THE EMAIL SHIPPED IN A SERIF THE PLAYBOOK HAD DELETED HOURS EARLIER.** Restoring the account's
brand profile from a backup restored `PLAYFAIR_SERIF`/`LATO` — the exact pair §2.1.6 defect 1
removed, with a guard that denies Playfair BY NAME. **The guard was on the BLOCK, and the value came
from the ACCOUNT ROW.** Fixed to `MONTSERRAT_SANS`/`LATO_SANS`; verified in the rendered bytes —
**zero occurrences** of Playfair, Georgia or Times; 4 Montserrat, 32 Lato.

**2. TWO STAT ROWS MIXED THREE TYPE SIZES IN ONE HORIZONTAL LINE.** Operator: *"Why the fuck would
you have so many different sizes."* Both the spec strip and the scarcity strip marked one cell
`primary` and another `muted` — **playbook defects 4 and 5, verbatim**, re-committed on the very
next email. Now one weight across each row. **Rendered count: five distinct sizes in the whole
email — 44 · 28 · 16 · 14 · 12 — every one on the seven-role scale.** The two tests that asserted
the defect now forbid it.

*A note on what the research actually says about this, because the instinct was to cut steps:*
Material Design 3's guidance is the OPPOSITE — "avoid small differences between sizes." The
documented failure is near-identical sizes with no contrast, not too many steps. The fix was never
fewer rungs on the ladder; it was not mixing three weights inside one row.

**3. "EVERYTHING IS A FIELD?" — it was not.** Seven literals lifted into `COMING_SOON_FIELDS`. §2.2.2.

**4. "WE KNOW WHERE EVERYTHING HAS COME FROM AND HAS FALLBACKS?" — the headline numbers did not.**
The scarcity ladder, four rungs. §2.2.2.

**5. "SPACING HAS NO GUARD" — half true, and the half that was fixable is fixed.** The 8px grid had
a fourteen-place bypass and now has three tests; **internal ≤ external remains ⚠ open because one of
its two terms does not exist in a compiled email.** Full accounting in §1.4 — including that §1.4
itself was WRONG about the tokens (4 and 12 are real steps; 40 and 56 never were).

**AND THE MECHANISM, because a promise is not a mechanism (RULE 0.8).** Operator, after three
already-written rules were skipped in one build: *"Fix why you don't fucking listen."*
`.claude/hooks/check-playbook-read-before-email-edit.mjs` now BLOCKS an Edit/Write to
`lib/email/**` or `lib/deliverable/**` code unless the session transcript shows a real `Read` of
this file. Grep does not count. Docs and tests pass through, every error path fails open, and
`ALLOW_EMAIL_EDIT_WITHOUT_PLAYBOOK=1` is the escape hatch. Six cases tested.

---

## 2.3 MARKET COMPS — tag `market-comps`

**Walked 08/05/2026, and three defects were fixed in the same session.** Every number below came
from a run that day. Re-count before quoting any of it.

**Spine:** the SAME `resolveSubject` inspection point New Listing and Coming Soon use. What is
different is what the subject IS here: not a house to admire, but **an asking price on trial.** No
price → no claim → the grid still ships and the case becomes an open slot.

**Grammar:** the listing grammar, with the middle swapped. Ribbon "Market Comps", photo, hero with
**the address over the price** (the claim), spec strip, the footnote, **the evidence table**, the
prose, sources, agent card + one button.

**Chart: NONE — and this one has been argued three times, so read before you add one.**
Operator 08/03/2026: *"COMPARABLES ARE JUST THAT, COMPARABLE, SO IT'S A TERRIBLE CHART TO PUT IN
THE EMAIL. PRICE IS GOING TO BE SIMILAR."* 08/04/2026: *"Do not use that stupid fucking chart for
comps!!!!!!! How many times do I have to say it!!!!!"* The first "fix" swapped total-price bars for
$/sq ft bars and kept the chart, which answered nothing — a size-banded set clusters BY
CONSTRUCTION, so the bars are near-equal either way, and seven full addresses do not fit 600px
(they rendered cut mid-word). The comparison is already on the face of the email twice: `$333
$/SQ FT` beside `$210 MEDIAN` in the strip, and every comp's own $/sq ft on its row. `compsPpsfSpec`
stays exported and tested for the social/PDF surfaces. **The acceptance script now ASSERTS the
absence** (§2.3.0) — a comment was the only thing guarding it, and a comment is not a guard.

**Subject line:** wants an OPEN, and the thing worth opening is the question, not the price.
`marketCompsSubject`, deterministic, never model-authored: `8348 Southwindbay Cir — is the price
right?`

**Code:** `lib/deliverable/recipes/market-comps.ts` → `buildLifecycleEmail`. Registry key
`market-comps`.

---

### 2.3.0 REPRODUCE IT — one command, and it asserts the EVIDENCE contract

```
bun --env-file=.env.local scripts/email/render-market-comps.mts "<address>"
```

**Default house: `8348 Southwindbay Cir, Fort Myers, FL 33908`.** Writes
`~/Downloads/market-comps-email.html`, prints a per-cell provenance table, prints the evidence
table row by row, and **exits non-zero if the evidence contract fails.**

Coming Soon's contract is a SUPPRESSION contract. This email prints the address on purpose, so its
contract is about the evidence instead — **five assertions, every one read off the built doc or the
rendered bytes, never off the source:**

1. **NO CHART, AND THE PHOTO IS STILL THERE.** Exactly one `image` block when we hold a subject
   photo — that photo. More means a chart came back; fewer means the photo vanished (a ceiling with
   no floor would pass a chart that REPLACED the photo). **Proven red 08/05/2026** by pushing a
   chart-shaped block into `compsMiddle` and confirming exit 1 — an assertion that has never gone
   red is a comment with a `process.exit(1)` attached.
2. **EVERY COMP ROW CARRIES BEDS AND SQ FT** — the land filter, read back off the render.
3. **NO RECORDED SALE OLDER THAN 365 DAYS** — parsed from each row's own sale line.
4. **THE SUBJECT IS NOT ITS OWN COMP.**
5. **THE DESTINATIONS** — reported, not fatal, because no listing page is a legitimate state and an
   unnoticed one is not. It is reporting a real defect today (§2.3.5).

**And the one thing nothing surfaced before: DID THE CLAIM GATE FIRE?** `authorCompsCase` drops the
narrator's paragraph on any violation and logs a single `console.error`. A dropped context ships the
code-authored verdict ALONE, which reads like a thin email rather than a guard doing its job. The
script captures that line into the provenance table. **Observed once in five runs on the same
house** — a tell that the gate fires, NOT a rate: five non-independent runs against one subject is
nowhere near a frequency, and quoting it as "1 in 5" would be a number nobody measured. That is the
gate working, not a bug — but you have to be able to see it.

**Acceptance run, 08/05/2026 — 18 of 19 cells sourced, 29KB:** $659,000 · 3 bd · 2 ba · 1,978 sq ft
· **$333/sq ft against a $210 comp median** · DOM 18 · 5 comparable homes, all recorded sales, **5
of 5 photographed and 5 of 5 linked** · $182–$266 spread · code-authored verdict · sources (2) ·
full agent card and CAN-SPAM footer off the account. Contract: **5 of 5 assertions pass**, 2
destination warnings. Tests: **75 pass, 0 fail** in the recipe suite; **2,878 across
`lib/deliverable` + `lib/email` with 1 network-timeout flake** (`campaign-coherence.test.ts` on the
5s default; 10/0 green at `--timeout 60000`).

---

### 2.3.1 THE SUPPLIERS — the same four, plus THE ONE THAT COSTS REAL MONEY

**Do not re-derive §2.1.1.** The free spine, our listing clock, SteadyAPI and the paid Apify rows
are the same four suppliers reading through the same `resolveSubject`. What is new here is the comp
set, and **this is the first email in the walk whose build is not free.**

**THE COMP SET — `compsForAddress` (`lib/assistant/comp-helper.ts`).** Geocode → Lee/Collier gate →
the lake lane first, then the vendor's nearby-values lane. **The subject's own dimensions travel
with the address** (`subjectDims`) — without them `compsForAddress` never engages the size-band
ranker and falls through to a raw nearest-first slice, which is how a $385,000 home once shipped
with $850,000 and $721,000 "comparables". Then four filters, in order: the land filter
(`isComparableHome` — beds AND sqft, by DATA never by name), not-the-subject, the 365-day
freshness ceiling, and photographed-only.

**THE PHOTO FLOOR IS THE VARIABLE THAT DECIDES WHETHER THIS EMAIL WORKS.** Operator decree
08/04/2026: *"Get rid of the no photo comps."* Comps are dropped from the SET, not merely the
table, so the median, the range and the whole price case recompute on exactly the rows the reader
can see — **photo coverage therefore moves the claim**, which this file argued against for its whole
life and the operator overruled knowingly. The one floor: below `MIN_PHOTOGRAPHED_COMPS` (2) the
FULL ranked set ships and the fallback logs LOUDLY, so a vendor outage can never masquerade as a
thin market. On the acceptance house the floor was never approached — 5 of 5.

**THE MONEY, MEASURED RATHER THAN PROMISED.** `resolveCompEnrichment` reads
`data_lake.apify_property_records` first — free, and the reason we stop re-buying houses. On a miss
it buys **the ZIP narrowed to the months the comps actually sold in, up to 200 records PER SALE
MONTH.** Not one call per comp. The recipe's own comment claimed "at most one verified call per
remaining comp (~$0.01)" and that was the wrong order of magnitude in the one place a builder looks
before spending; it has been corrected in the file.

**⚠ THE PAID LANE IS NOW OFF BY DEFAULT — `lib/listings/apify-spend-guard.ts`.** Set
`OPERATOR_APPROVED_PAID_RUN=1` for a run that is allowed to spend; without it every vendor call is
refused, loudly and by name, and the build ships with whatever our own lake holds. The guard sits
inside `runApifyActor`, below the `deps.runActor` seam every test injects, so no caller can route
around it. A 300-result (~$3) per-process budget stops a runaway loop inside an armed run.

**🔴 CORRECTION 08/05/2026 — THE TWO BULLETS THAT USED TO SIT HERE WERE WRONG, AND ONE WAS A
MEASURING-INSTRUMENT FAILURE, NOT A TYPO.** They read "First build … ~$3.95" and "**Second build on
the same house: 0 records bought**". The second is false. The acceptance script's receipt counted
rows ADDED to `data_lake.apify_property_records` — and re-buying the SAME 200 houses upserts to
**zero new rows**, so it printed "0 bought" while the vendor charged $2.00.

**What the vendor's own billing API (`/v2/actor-runs`, actor T5QRnLKtyvzxjWVRH) says about that
afternoon:** **$14.08 across 21 runs on the walk; $14.37 / 51 runs on the actor that day.** Charge
shape: `$2.0000 x1 · $1.9501 x6 · $0.0501 x6 · $0.0100 x37 · $0.0001 x1`. **Every render bought a
fresh ~195–200-record ZIP month (~$1.95) plus a 5-record subject query (~$0.05). Seven renders,
seven purchases. THE CACHE PREVENTED NOTHING.**

- **The unit is not the problem, the VOLUME is:** $0.01/result (the charges divide exactly by it),
  and we buy ~200 records to enrich 3 comps.
- **The cache does not amortise the way this file claimed.** `resolveCompEnrichment` returns early
  only when `missing.length === 0`, so ONE comp the ZIP pull never returns re-buys every sale month
  on every build, forever. Open check: `apify_purchased_window_memo`.
- **The `$0.0501 x6` line is deleted, not amortised.** That was the "Find Out More" button paying to
  find the subject's own listing — impossible by construction (§2.3.1 above: a street address is an
  AREA CENTRE whose own record is never returned), so it bought a guaranteed null six times. It now
  reads `property_url` off the row we already own (26 of 26 rows carry it).
- **A receipt must read what we were CHARGED, never what our cache happened to keep.** The script
  now prints results committed in the billed unit, plus a refusal count, and labels the row delta as
  a cache statistic.

**WHY THE VENDOR CANNOT SIMPLY BE ASKED ABOUT ONE HOUSE** — because it has no lookup. A street
address is accepted and silently treated as an AREA CENTRE whose own record is not returned, and
`radius` is ignored (`lib/listings/apify-identity.ts`, run to ground 08/04/2026). That single fact
explains both the dated-ZIP design above and the live defect in §2.3.5.

---

### 2.3.2 THE INGREDIENT LADDER — EVERY CELL, ITS SOURCE, AND WHAT FILLS IT WHEN THAT MISSES

**Stop at the first hit. An exhausted ladder is an OPEN SLOT — never a zero, never a guess.**
Every cell is written out, per the §2.2.2 lesson: a delta-list makes the reader hold two documents
open and diff them in their head, which is the scavenger hunt this file exists to end.

#### The identity block — the agent

**Name · title · brokerage · phone · email · headshot · business postal address · socials** — the
user's brand profile, no data source involved. The postal address is CAN-SPAM, not decoration.
→ OPEN. **⚠ The same 17-field project-path drop §2.2.4 found applies here unchanged** — check
`brand_fields_lost_account_to_project`.

#### The hero — the claim on trial

- **Asking price** → free spine (daily sweep) → the agent's pasted listing page → OPEN. **No price
  is not a degraded email, it is a different one:** `buildPriceCase` returns null, the prose slot
  stays open, and the grid still ships.
- **Address line** → `facts.address`, printed in full. Verbatim from the vendor's own
  `formattedAddress` — including its non-US-convention comma before the ZIP (§2.3.5).
- **Subject photo** → the listing's own photo, mirrored to our storage → NOTHING. Never an aerial,
  never a map tile, never a placeholder (locked operator rule).

#### The spec strip — THE TERMS OF THE COMPARISON, not a wall of stats

Six cells, one weight across the row. The labels are `listingSpecs`' own, deliberately — this
recipe invented three of its own once ("This home", "Comp median", "Days listed") and they wrapped,
broke the shared label baseline and rendered at three different emphases in one horizontal line.

- **Beds · Baths · Sq Ft** → free spine → Lee records → nearby-values → the paid row → OPEN.
- **$/Sq Ft** (`primary`, the accent — it IS the claim) → computed, price ÷ listed sq ft. Either
  input missing → OPEN. Never estimated.
- **Median** → computed over the comp set's own $/sq ft. No priced comp → OPEN, never a made-up
  median.
- **DOM** → our own `listing_dom` root, and NEVER a first-seen floor → OPEN. It took the cell the
  comp COUNT used to hold, because that count is already stated in the footnote, on the table's
  title and in the verdict — three surfaces — while how long this house had been listed appeared
  nowhere.

#### The footnote — the derivation, THE MIX, and the spread

→ `compsFootnote`. Three candidates longest-that-fits under the schema's 120-char cap, never
truncated mid-number: derivation + mix + style note → mix + style note → mix → derivation → OPEN.
The **style note fires only when the subject AND at least one comp both carry a real vendor style
string and they disagree** — silent when either side is unknown, never a guess.

#### The description — the seller's own words

→ `facts.remarks` (free, already fetched) → the paid subject record's `text` → **the slot is
removed entirely.** Verbatim or not at all: the model never sees this text and never rewrites it.
Reserved at the HEAD of the middle so it lands under the spec strip; a block spliced in afterwards
carries no layout and sinks below the CTA, which is where it printed on 08/04.

#### The evidence table — one row per comparable home

- **Price · $/sq ft** (the lead) → computed from the comp's own price and size.
- **Address · beds · baths · sq ft** → the comp record. **Baths came off a 69-field paid record we
  had already bought and were dropping on the floor** until 08/04. Our lake's count wins where it
  has one (a recorded county figure); the vendor fills the hole only.
- **What the price IS** → `Sold <date>` / `Estimated value <date>` / `Last listed`. **A valuation is
  never dressed as a sale.** A recorded sale with a known spell adds `· sold in N days`.
- **THE DATE'S PRECISION IS PART OF THE FACT** → a vendor row is day grain and prints `Sold
  08/29/2025`; **our own lake row is MONTH grain and prints `Sold May 2026`.** See §2.3.4 defect 1.
- **Photo** → our own lake → the already-bought paid record → **the row ships with no picture and
  keeps its link.** Per-row, never all-or-nothing.
- **Link** → the comp's captured `sourceUrl` → the paid record's `property_url` → unlinked.

#### The prose — a verdict authored in CODE, and colour authored by a model that may not compare

**This is the recipe claims.ts exists for.** It shipped, to a rendered artifact, a comparison that
was INVERTED — "sits just below … the two recorded sales" when $209 was 7% and 21% OVER them. A
stronger prompt is not the fix; the old prompt already said not to hide it and the model hid it by
asserting the opposite.

- **The verdict** → `buildPriceCase`, deterministic. Every relation computed, composed into settled
  English sentences. No price / no sq ft / no priced comp → **the paragraph does not ship at all.**
- **The narrator's context** → one Sonnet call handed ONLY the settled sentences.
  `buildNarratorPrompt` **does not take the comp array** — there is no `RenderComp` in its
  signature, so there is no set for it to draw a third claim between. Violation → context DROPPED,
  verdict alone ships. Fail-closed: the guard can cost prose, never truth.

#### The tail

- **Sources** → `compSources`, domain-level, never a vendor name, never an MLS id. Empty comp set →
  no block.
- **CTA "Find Out More"** → the subject's real listing page → `facts.sourceUrl` → **which is our own
  homepage, and that is the live defect in §2.3.5.**

---

### 2.3.3 WHERE A MARKET COMPS CAN BE STARTED — inherited, not re-derived

Every door in §2.1.3 reaches this recipe unchanged: the registry key `market-comps` dispatches from
the lab, from a project, from a template pick and from a campaign step. **The builder decides from
the address and the words typed, never from the door clicked.** Nothing about the doors is special
here, and re-listing them would be the delta-list mistake pointing the other way.

---

### 2.3.4 TWO DEFECTS FOUND BY RENDERING AND LOOKING — AND FIXED, RED-FIRST

**Neither was catchable by the 73 tests that were green throughout.** Both were found by running the
real pipe on a real house and reading the output.

**1. FIVE RECORDED SALES, EVERY ONE DATED THE FIRST OF THE MONTH.** The send printed `Sold
05/01/2026`, `Sold 04/01/2026`, `Sold 03/01/2026`. Not a coincidence: our own lake comp lane reads
`sale_month` and tags every row `dateGrain: "month"` (`comp-source-lake.ts:167`) **precisely
because "every row is day-of-month 1 by construction."** `RenderComp` has carried that tag since
the lane was built; the chat lane honours it and says "in May 2026"; the ranker honours it. **This
row renderer did not** — it called `mdy()` unconditionally and minted a day the county record does
not hold. **A precise date nobody recorded is an invented fact wearing a real number's clothes**,
and it shipped on the face of the one email whose whole job is defending a price with records.

Fixed by reusing `saleDateLabel` — the ONE root that already knew — rather than teaching a second
formatter the rule. **The allow-set had the same hole and got the same fix:** `sourcedDates` and
`sourcedDigits` were minting `05/01/2026` as a PERMITTED numeral, which would have licensed the
narrator to write the exact day the row renderer had just stopped printing. Two tests: month grain
renders `Sold May 2026` and the day appears nowhere in the doc; day grain still renders
`Sold 08/29/2025`.

**2. THE VERDICT SAID ONE FACT THREE TIMES.** Verbatim from the send:

> "…sits $123 above every comparable home in the set — not just the $210 median, the entire range.
> That is above all 5 recorded sales in the set ($182, $210, $210, $220 and $266 per square foot).
> The asking price per square foot is above every comparable in the set (which run from $182 to
> $266)."

Sentence 3 is `compareToSet`'s and it is a verbatim restatement of sentence 1 **whenever the extreme
tier fired** — "outside the full range" and "above every comparable in the set" are the same claim
with the same range. (Sentence 2 stays: it names the actual sale figures, which neither other
sentence does.) The code was written for a MIXED set and nobody had rendered an all-recorded-sales
one. A price-defence paragraph that says the same thing three times reads as padding, and padding
is what a reader discounts.

Fixed by gating the position sentence on `!isExtreme`. **The gate is `isExtreme` and nothing else,
so it is direction-symmetric by construction** — it drops the duplicate identically whether the ask
sits above or below the set, which is the standing rule for this recipe (a tier that only sharpens
language in the flattering direction is spin). When the tier does not fire, the subject is somewhere
inside the band and that sentence is the only thing that says WHERE, so it stays. **No fact is ever
dropped here; only a second copy of one printed in the sentence immediately before it.** Verdict
went 800 → 397 characters on the acceptance house.

**3. A COMMENT UNDERSTATED THE BUILD COST BY TWO ORDERS OF MAGNITUDE.** Not a code defect, but it is
in the one place a builder reads before spending, so it counts. §2.3.1 has the corrected numbers.

---

### 2.3.5 KNOWN GAPS — named, not hidden

**1. THE BUTTON AND THE HERO PHOTO POINT AT OUR HOMEPAGE.** Live on the acceptance run: CTA url =
`https://www.swfldatagulf.com`, and the photo links there too. **This is exactly what §1.8 forbids
and what `lib/listings/listing-url.ts` was built on 08/05 to end** — and this recipe does not use
it. It hand-rolls its own check and pays for `fetchApifyComps({location: <the subject's own
address>})`, which **by vendor design can never return the subject's own record** (§2.3.1) — our own
record store is the receipt: that query left `306 Chattanooga Dr` in the cache and there is no
`southwindbay` row in it at all. So the lane spends up to 5 records every build to join zero, and
takes the description slot and the style note down with it. **The fix is named — route `destination`
through `listingButtonUrl(facts)` and honour its `null` by DROPPING the button — and was
deliberately NOT made mid-walk**, because "no link → no button" interacts with the lifecycle
chrome's `ctaUrl` and `applyBrand`'s rewrite, and that is a button-contract decision for the
operator. Check `market_comps_cta_points_at_homepage`.

**2. THE ADDRESS CARRIES A COMMA US CONVENTION DOES NOT.** The hero prints `8348 Southwindbay Cir,
Fort Myers, FL, 33908`. It is the vendor's own `formattedAddress`, passed through verbatim by
`resolve-subject.ts toFacts`. **MEASURED ON TWO OF THE SEVEN, 08/05/2026** — Market Comps above,
and New Listing's own acceptance run prints `12554 Kellysands Way, Fort Myers, FL, 33908`. The other
five share the same spine and the same `addressLineOf`, so they are IMPLICATED BUT UNCOUNTED; do not
quote a "all seven" until someone runs them. Not fixed: normalising a verbatim vendor string is a
one-root change with a seven-email blast radius, and it belongs in a pass that walks all seven.

**3. NO COMMUNITY FACTS, ON PURPOSE.** This recipe's location ban is absolute, not fact-gated — the
narrator may not name a road, not even the subject's own, because the shipped lie called two comps
"on the same street". Whether the SUBJECT's community should be exempt from that is an open design
question, already tracked: `market_comps_community_deliberately_unwired`. Left alone.

**4. THE CLAIM GATE'S DROP RATE IS MEASURED BUT NOT TUNED.** 1 in 5 runs on the same house lost the
narrator's context to a banned token. That is the design working, but nobody has looked at WHICH
token, and the banned list includes bare `"than"` and every road suffix — a wide net by choice.
A drop is now visible in the acceptance table, which is the precondition for ever tuning it.

---

### 2.3.6 THE FINISH PASS — what the walk changed, and what it refused to

- **The chart's absence is now a GUARD, not a comment.** Three operator killings were protected by
  a block comment. The acceptance script fails the run on a second image block.
- **The spend is now a RECEIPT printed on every run**, not a claim in a header — and the header that
  made the claim was wrong.
- **A dropped narrator paragraph is now VISIBLE.** It was a `console.error` nobody read, and its
  symptom (a short email) looks like nothing being wrong.
- **REFUSED: adding the chart back.** Read the block comment in `compsMiddle` first; it has the
  three dates and the two verbatim quotes.
- **REFUSED: fixing the CTA mid-walk.** Named, checked, and handed up — see §2.3.5 item 1.

---

## 2.4 UNDER CONTRACT — tag `under-contract`

**Walked 08/05/2026 and BUILT NEW 08/06/2026.** Every number below came from a run on those
days. Re-count before quoting any of it.

**The July file is not this email.** `under-contract.ts` dated 07/17/2026 (1,098 lines) predated
the assembly line. Operator decree 08/05/2026: *"There can't be code for this if it is not from
today. We are building everything new so we build it fucking right."* It was replaced outright, not
diffed. The one thing worth keeping — the SteadyAPI list-date chain that **New Listing** imports as
its DOM fallback — moved to `lib/listings/list-date.ts`, where a vendor fetch chain belongs. That
was the only edit to another email's code, and New Listing's acceptance render was re-run to prove
it (21KB, real realtor.com button, unchanged).

**Spine:** the SAME `resolveSubject` inspection point the other six address emails use. What differs
is that this house is off the market and the email is not selling it.

**Grammar:** the listing grammar. Ribbon "Under Contract", photo, hero with **the address over the
LIST price**, the six-cell spec strip **with the lot**, the seller's description verbatim, the speed
pair, the authored paragraph, sources, agent card + one button.

**Chart: NONE.** Locked in `recipes.ts` and unchallenged by the research: a lifecycle email about one
house gets the photo as its visual, and two bars reading was-versus-now is a fact wearing a chart
costume. Policy "none" means DROP the slot — no image block is ever pushed.

**Subject:** wants an OPEN → `Under contract: 12554 Kellysands Way`. Deterministic, never
model-authored, leads with the STATUS rather than the celebration.

**Code:** `lib/deliverable/recipes/under-contract.ts` → `buildLifecycleEmail`. Registry key
`under-contract`.

---

### 2.4.0 THE DECREE THAT UNBLOCKED THIS EMAIL — read this before anything else

**Operator, 08/05/2026, verbatim:** *"The fucking under contract date is the date the email is
fucking made, user can change it if they want."*

That one sentence dissolved the gap the July build fabricated its way around. The contract date is
**not** detected, **not** a wait on a vendor, and **not** held by any source — it **defaults to the
build date**, and the doc is editable afterwards, which is what the Lab is. So days-to-contract stops
being an interval nobody holds and becomes `contractDate − listedDate` — and with the contract date
pinned to today, that is exactly what our own listing clock already computes at read time.

**THE CONTRACT DATE IS NEVER PARSED OUT OF THE PROMPT, and that was a live temptation.** §1.13 is
explicit that the seed prompt text is DISPLAY and SEED only and a build is never routed on it. A
regex turning "we went pending 7/28" into a headline number is identity-from-prose, and the claim it
produced would be **TRUE and therefore invisible to the claim gate** — the exact shape of §2.2.4
defect 4. Rejected at design time rather than after it shipped.

---

### 2.4.1 REPRODUCE IT — one command, and it asserts the PENDING contract

```
bun --env-file=.env.local scripts/email/render-under-contract.mts "<address>"
```

**UPDATED 08/06/2026 — this script now rides the SHARED acceptance harness** (`scripts/email/_harness.mts`,
PART 1.12). It went 407 lines to 292; the brand load, provenance printer, `clip`, bottom table,
brand-carry diff, render/save and assertion reporter all moved there. **What did NOT move: this
email's `rows[]`, its six assertions, and its own default house** — those are per-email by rule. The
recipe itself (`lib/deliverable/recipes/under-contract.ts`, written NEW 08/06/2026 — the July file's
`daysSinceListed`/`resolveSubjectListDate` moved to `lib/listings/list-date.ts` rather than being
imported from a dead recipe) is UNCHANGED by that consolidation, and the run was proved
byte-identical against its pre-change output before the change landed. `withCommas` here is now
imported from `lib/format-number.ts` — do not re-declare it.

**Default house: `12554 Kellysands Way, Fort Myers, FL 33908`** — New Listing's own acceptance
subject, chosen because it carries **both** inputs this email needs: a real non-floored listing clock
**and** a 549-character seller description. Writes `~/Downloads/under-contract-email.html`.

**Acceptance run, 08/06/2026 — 13–14 of 15 cells sourced, 23KB, 6 of 6 assertions pass.**
**The range is not sloppiness: the authored paragraph is NON-DETERMINISTIC** and was observed both
shipping and declining across runs on the same house (see §2.4.5). Everything else reproduced
identically. Re-run before quoting a single number.
$350,000 · 2 bd · 2 ba · 1,515 sq ft · **$231/sq ft** · 0.22 ac · Single Family ·
**12 days to contract against a ZIP-33908 median of 127 days listed (1,095 listings)** · the
seller's 549-character description verbatim · sources (1) · full agent card and CAN-SPAM footer off
the account. The two open cells are the authored paragraph (see §2.4.5) and the chart (policy none).

**THE PENDING CONTRACT — this email's bytes-level invariant.** New Listing's is that the address DOES
ship; Coming Soon's is that it does NOT. **Ours is that the email states a PENDING fact and never a
SOLD one.** Six assertions, non-zero exit:

1. The street line is PRESENT · 2. the ZIP is PRESENT — this is a public, celebrated status, so a
missing address is a defect here exactly as a present one is on Coming Soon.
3. **NO SOLD LANGUAGE** — `sold for`, `sold price`, `closed at`, `final sale`, `sale price`.
4. The price on the page IS the list price, verbatim.
5. **NO "days on market" phrasing** (trap 1 — see §2.4.3).
6. NO chart.

**Assertions 1–5 were PROVEN RED before they were trusted** (mutating the rendered HTML — redact the
street, zero the ZIP, splice in "sold for", change the price, splice in "days on market" — and
confirming each flips to FAIL). **Assertion 6 is NOT proven that way and is weaker for it:** it
counts image blocks on the built doc, so an HTML mutation cannot exercise it. Named, not hidden.

**The banned phrase list is ONE exported root** (`SOLD_LANGUAGE`), imported by both the recipe's own
guard and the script. A hand-typed second copy in the script is how a guard silently stops guarding.

**SPEND: ZERO new vendor spend.** The free spine, our own `listing_dom` clock and the
`zip_active_dom_median` RPC are all free reads. **This recipe issues no paid call at all** — unlike
Market Comps, it never buys a comp set. The only metered call is the one narrator paragraph.

---

### 2.4.2 THE INGREDIENT LADDER — EVERY CELL, ITS SOURCE, AND WHAT FILLS IT WHEN THAT MISSES

**Stop at the first hit. An exhausted ladder is an OPEN SLOT — never a zero, never a guess.**
Written out in full per the §2.2.2 lesson: a delta-list makes the reader hold two documents open and
diff them in their head.

#### The identity block — the agent

**Name · title · brokerage · phone · email · headshot · business postal address · socials** — the
user's brand profile, no data source. The postal address is CAN-SPAM, not decoration. → OPEN.
Measured on the acceptance run: **30 of 31 filled account fields carried across
`applyUserBrandToProject`; the one dropped is `button_destinations`.**

#### The house

| Cell | Rung 1 | Rung 2 | Rung 3 | Exhausted |
|---|---|---|---|---|
| **Address (street·city·state·ZIP)** | free spine (100%) | — | — | **the build RETURNS NULL** — see below |
| **LIST price** | free spine `list_price` | — | — | OPEN. **Never a sold price** |
| **Beds** | free spine (73.7%) | paid row | — | OPEN |
| **Square feet** | free spine (70.6%) | paid row | — | OPEN |
| **Baths** | free spine (15.3%) | our own Lee county records, exact-address, one-parcel-only | SteadyAPI `/nearby-home-values` on the subject's coords | paid row → OPEN |
| **$/sq ft** | computed, price ÷ sq ft | — | — | OPEN if either operand will not parse. **No footnote** — both operands sit two cells away |
| **Lot** | free spine `lot_acres` | — | — | OPEN. **SHIPS here** — Coming Soon drops it to avoid narrowing a parcel search, and that reason is gone the moment the address ships |
| **Hero photo** | free spine `photo_url`, mirrored to our storage | paid row `primary_photo` | — | no photo — the layout degrades to a text masthead. **Never an aerial** |
| **Description** | the agent's own paste | paid row `description` | — | the slot is not emitted at all |

**THE ADDRESS IS THE INVARIANT, AND ITS EXHAUSTED RUNG IS NOT AN OPEN SLOT.** No street and no city
→ `buildUnderContract` returns null, which hands the build to the terminal author and stamps
`recipe_key = default-grid`. PART 0 reads that as *"a builder fell through — go look."* **That IS the
loud failure — recorded in provenance, not swallowed.**

**AND THE GATE IS STREET-OR-CITY, NOT "`addressLineOf` IS NON-EMPTY".** Caught by its own test
08/06/2026: `addressLineOf` falls back to `[city, state].join(", ")`, so a subject carrying nothing
but `state: "FL"` produced the truthy string `"FL"` and built an email whose hero read **"FL"** over
the price. *Non-empty is not the same predicate as identifying.*

#### THE SPEED PAIR — the headline, and the moat

**This home's number** — `contractDate − listedDate`, and with the contract date pinned to the build
date that is exactly `facts.daysOnMarket` off `data_lake.listing_dom`. → **rung 2 is DROPPED
ENTIRELY. Never estimated.**

**THE FLOOR GUARD IS INHERITED, NOT RE-IMPLEMENTED.** `resolve-subject.ts:362` attaches
`daysOnMarket` **only** when `domIsFloor !== true`, so an absent value already means "we do not
honestly hold this." **A `listedDate` field was considered for `ListingFacts` and deliberately NOT
added:** when the DOM is floored, a listed date is a floored first-seen date — precisely what the
handoff says to refuse — so the symmetric-looking field would have been a lane routing around our own
guard. Symmetry is not a reason to add a shared-type field across seven emails.

**The comparand** — `data_lake.zip_active_dom_median(p_zip)` via `fetchZipBenchmark`
(`lib/buyer-leverage/zip-benchmark.ts`). Active for-sale, first-seen floors excluded.
**LIST-SIDE, and that is load-bearing:** `data-roots.md:69-71` assigns list-side to `listing_dom` and
sold-side to `redfin_swfl.median_dom` and says *never interchange*. **The July build compared against
the sold-side median — a second, separate error from the date error.** A red test asserts this recipe
never reads the sold-side table.

**THE COUNTY RUNG IS DELIBERATELY NOT BUILT.** The handoff's ladder reads "ZIP → county → dropped."
There is no county-scoped median root today, and writing a fresh county aggregate here would mint a
SECOND root for a concept `data-roots.md` already assigns to one (RULE 0.55). A ZIP miss drops
straight to "this home's number ships alone" — a weaker true claim beats a stronger unverifiable one.
Same posture as §2.3.6's refusal to fix the comps CTA mid-walk: named, handed up, not bodged.

**THE SAMPLE FLOOR — `minMedianSample: 10`, a FIELD not a magic number.** A median over three
listings is not a market fact, and shipping one beside this home's real number lends it authority it
has not earned. Below the floor the comparison is DROPPED and this home's number ships alone.
**This is the open `coming_soon_degenerate_funnel_floor` failure shape caught BEFORE it ships rather
than after** — that email's funnel will still happily print "2,575 comparable homes" as scarcity.

**THE SCOPE LABEL IS THE ONE STRING EVERY CONSUMER PRINTS** (`Speed.scopeLabel`) — the stat cell AND
the sources note read it, never a ZIP of their own. Same rule as Coming Soon's, same reason: a count
under a label the query did not use is a checkable claim that fails its own check.

#### The narrator — the ONLY thing the AI writes

Runs **ONLY on lane-2 material** (a pasted or already-bought description). No description → OPEN
SLOT, not an improvisation.

**IT IS HANDED NO DAYS COUNT AND NO FIGURES IT DID NOT NEED.** `daysOnMarket`, `lotSize`,
`yearBuilt`, `hoaFee`, the nearby-business sweep and the tax-roll stats are all stripped from its
fact sheet. See §2.4.4 defect 3 for what happens when they are not.

#### The CTA — ONE, and it is NOT a backup-offer ask

**"See What Else Is Available"**, pointed at the agent's own site. Redfin cites NAR: **only 6% of
home sales fall through.** That is a 1-in-17 ask, and the registry prompt used to request it in as
many words (*"and invite backup offers"*) — **corrected in the same pass**, because the prompt is what
a keyless ask seeds from and leaving it would ship the killed CTA through the back door.

**This is NOT the §2.3.5 homepage defect.** That one is a button *labelled* "View the Full Listing"
landing on our home page — a promise the destination does not keep. This button promises "what else
is available" and lands where the agent's other listings live. `listingButtonUrl(facts)` is
deliberately NOT used: this home is under contract, so its own listing page is the one destination
that would waste the click.

---

### 2.4.3 THE TWO TRAPS — both measured, both live landmines

**TRAP 1 — `days_in_state` is NOT time under contract.** It ages only while `state` is unchanged and
resets only on a `state` CHANGE (`ingest/pipelines/listing_lifecycle/transitions.py:66,80`), and
**`flag_pending` is not part of `state`**. A live Lee row reads flag_pending true, state active,
days_in_state 34, listed 09/13/2024 — that 34 is days in ACTIVE. Printing "under contract in 34 days"
off it is **a fabricated number built from a real column**, and it is what got the July recipe
refuted. Guarded three ways: the recipe never names the column (red test over comment-stripped
source), no DOM cell is ever emitted (`listing-flyer.ts` says it outright — *"this cell is for ACTIVE
listings ONLY. Never pass it on under-contract or just-sold"*), and the rendered bytes are grepped
for "days on market".

**TRAP 2 — do NOT build a pending detector.** The agent tells us; that notification IS the trigger.
Measured live 08/05/2026: there is no under-contract state (`state` is only active 30,708 / sold 789
/ withdrawn 223), pending is a flag on an otherwise-active row (7,209 sale rows), and **the flag is
stale on 462 sold rows.** A red test asserts the recipe never reads `flag_pending`,
`listing_transitions` or `to_state`.

---

### 2.4.4 FOUR DEFECTS FOUND BY RENDERING AND LOOKING — none catchable by a test

**§2.1.6's lesson held for the third consecutive email.** 3,202 tests were green and all four of
these were on screen.

**1. THE LOT CELL PRINTED `0.19 ac ac`.** `resolve-subject.ts:283` formats the lake's `lot_acres` as
`"0.19 ac"` before it ever reaches a recipe, and the shared `listingSpecs` passes `facts.lotSize`
straight through for exactly that reason. This recipe appended a second unit. **Same class as the
43,560 conversion bug** — a recipe assuming a raw number where the spine hands it a formatted string.

**2. THE PROVENANCE TABLE MANUFACTURED A GREEN CELL.** It reported *"Authored paragraph — 574 chars"*
on a run where the narrator had **correctly not fired** (no remarks). The 574 characters were **the
agent's bio** off the agent card. A length heuristic over every string in the doc cannot tell an
authored paragraph from any other long sentence the brand supplies. **This is §2.2.4's sixth defect
pointing the other way: an OVER-reporting table hides a missing paragraph instead of a present one.
Both are the same sin.** Fixed by excluding the block types the recipe does not author.

**3. THE PARAGRAPH WAS A WALL OF FIGURES, ONE OF THEM A VERBATIM RESTATEMENT OF A CELL.** Handed the
full fact sheet, the narrator ignored the description entirely and wrote: *"Built in 1988 and set on
a 0.22-acre lot, this home carries a monthly HOA of $1,326 … Grocery stores and restaurants each open
within a mile, with the nearest of each category sitting at 0.71 and 0.63 miles respectively."* Five
figures in three sentences, the lot **repeating a spec cell two rows above it**, and not one word
from the seller's copy. Every fact was TRUE so the claim gate passed it. This is §2.1.6 defect 3
meeting §1.14's standing rule that **the model writes prose and never a figure.** Fixed by removing
the material, not by a sterner prompt.

**4. THE FRAMING ORDERED A CLAIM THE GATE THEN KILLED — on the FIRST acceptance run.** It printed
`[narrative] DROPPED — the narrator made 1 claim(s) it was not given: sequence("before weighing the
list price")`. The cause was one sentence in the framing: *"The price shown is the LIST price."* **The
model does not need the price to describe a house, and naming it invited exactly the reasoning that
produced a sequence claim.** §2.2.4's closing lesson arriving on the very next email: **a fact you
hand the writer is a fact it will try to use.** Removed. And the drop is now VISIBLE in the
provenance table (§2.3.0's lesson: a `console.error` nobody reads looks identical to nothing being
wrong).

---

### 2.4.5 KNOWN GAPS — named, not hidden

- **⚠ THE STATUS WORD IS UNRATIFIED.** "Under contract" vs "pending" in Florida practice was
  researched 08/05/2026 and **three sources failed to settle it.** The default is "under contract"
  because it is the recipe key and the operator's own word throughout the walk — **but he has not
  ruled, and this section must not be read as settling it.**
- **THE AUTHORED PARAGRAPH DECLINES ON A DESCRIPTION-RICH HOUSE, and that is a design fork, not a
  bug.** Because the description ships VERBATIM, a paragraph that summarises it hands the reader the
  same sentences twice (§2.1.6 defect 3). The framing now forbids restating it and tells the model to
  say nothing if it has nothing honest to add — **and on the acceptance house it says nothing.** So
  the agent's own word count is ZERO against §1.9's 50–125 floor, with the description carrying the
  body. Conservative is the right direction under the no-invention gate, but **the operator should
  decide whether this email wants an authored paragraph at all.** Open as
  `under_contract_narrator_has_no_job`.
- **THE AGENT CARD SHIPS A SECOND CTA.** The rendered email carries "Get in touch" inside the agent
  card **and** the recipe's own button — two asks, against §1.8's *"ONE call to action per email,
  never three."* `agent-launch.ts:402` already names this exact shape as a defect. It is shared
  chrome (`default-docs.ts:129`) and hits **all seven** lifecycle emails, so it was NOT fixed
  mid-walk. Open as `lifecycle_agent_card_second_cta`.
- **The address prints a comma US convention does not** — `12554 Kellysands Way, Fort Myers, FL,
  33908`. This is §2.3.5 gap 2, pre-existing and shared: the vendor's own `formattedAddress` passed
  through verbatim by `resolve-subject.ts toFacts`. **Now measured on THREE of the seven** (New
  Listing, Market Comps, Under Contract). Still not fixed — a one-root change with a seven-email
  blast radius belongs in a pass that walks all seven.
- **Nothing in the pipe can tell an aerial from a front elevation** (`hero_photo_aerial_detection`,
  open). The locked operator rule is the listing's own photo or nothing, and only a human eye
  enforces it.
- **No county rung on the comparand** — see §2.4.2. A ZIP the RPC has no median for drops the
  comparison entirely.
- **THE TWO SPEED NUMBERS ARE NOT THE SAME QUANTITY, and the difference flatters us.** `12 Days to
  contract` is a COMPLETED interval; `127 Median days listed` is the current AGE of homes that have
  **not** sold. Fast sales leave that pool, so the active median is length-biased UPWARD and the
  juxtaposition implies a larger speed advantage than the data supports. The honest comparand is a
  completed sold-side interval — which the handoff explicitly ruled out (`data-roots.md:69-71`,
  list-side vs sold-side, never interchange), so this is a consequence of a ruling, not a bug to fix
  here. **What keeps it shippable is that the cell label and the sources note both state exactly what
  was counted** ("how long homes currently for sale in ZIP 33908 have been on the market"), so a
  reader who re-runs the stated criterion reproduces the number. Recorded so nobody quotes the pair
  as a like-for-like speed multiple. Open as `under_contract_comparand_length_bias`.
- **This builder READS THE CLOCK — the first one that does**, and `registry-seam.test.ts`'s comment
  claiming no builder does was corrected in the same pass. See `loadSpeed`'s own note and
  `deps.asOf`. It is not currently reachable in that test (no DB creds → no median → no sources
  note), but that is an environment property, not a guarantee.

---

## 2.5 JUST SOLD — tag `just-sold` — **WALKED AND BUILT 08/06/2026. FIFTH OF SEVENTEEN.**

Acceptance run: `bun --env-file=.env.local scripts/email/render-just-sold.mts [address]`.
**Two houses, not one** — one address cannot exercise both rungs of the close ladder:

- `1275 Carlene Ave, Fort Myers, FL 33901` (the default, decree 08/10/2026) — a REAL, FRESH
  recorded sale ($1,350,000 on 07/10/2026, DOM 95) AND its listing photo held on our own retained
  sold row. Exercises rung 1 (sold-date kicker, `$/Sq Ft` off the close, comps chart) plus the
  PHOTO ladder and the badge flag. **STANDING RULE for the showcase house (operator decree
  08/10/2026: "MAKE THE FUCKING HOUSE JUST SOLD 750,000 OR MORE. PICK A NEW HOUSE"): the recorded
  close is $750,000+, RECENT (inside `closeFrom`'s 180-day gate), AND the photo is held on our
  own rung.** The stale-transfer trap this surfaced: 7146 Congdon Rd's only sold event was its
  own 2024 purchase ($1,125,000, "Sold 11/04/2024") and the email rendered "Just Sold" over it
  with a 4,008-day DOM — which is why `closeFrom` now refuses sold events older than 180 days or
  undated (they fall to the PREFILL rung instead). The original default, `330 Shore Dr, Fort
  Myers, FL 33905` ($300,000 on 08/29/2025), sold BEFORE the lake's photo capture began
  06/30/2026 — no free rung holds its photo, so the showcase capture shipped with no house and
  no flag (operator, 08/10/2026: "where is the fucking picture of the house with the sold
  flag"). 330 Shore Dr stays as the manual no-photo / no-list-date open-slot variant.
- `12554 Kellysands Way, Fort Myers, FL 33908` — an active listing. Exercises rung 3, the PREFILL,
  which under the decree below is the COMMON case.

**8 of 8 assertions pass on both**, 08/06/2026. Both renders were sent to `hello@swfldatagulf.com`
the same session (Resend ids `2ab14232-…` prefill, `1c1c65c7-…` recorded).

### 2.5.-1 WHAT THIS EMAIL IS. READ THIS BEFORE ANY OF THE MECHANICS BELOW.

**A JUST SOLD EMAIL IS NOT AN ANNOUNCEMENT ABOUT A HOUSE. IT IS A MESSAGE TO THE NEIGHBOURS
ABOUT THEIR HOUSE.** Everything in §2.5.0 onward is plumbing for that sentence. The first version
of this email got every number right and was still worthless, because it talked about the property
to people who are not buying it. Operator: *"this is the worst just sold email I have ever seen"*
and *"get the fucking house description out of there. no one cares."*

**THE SHAPE, top to bottom, as built 08/06/2026:**

1. **The campaign ribbon — IDENTICAL to the other six.** Not bigger, not a different face. A
   version of this email shipped with a louder ribbon and it was reverted the same day: the ribbon
   is the one element whose entire job is being the same across the lifecycle. **The variation goes
   in the email's OWN elements. Never in the shared chrome.**
2. **The photo, WITH THE FLAG BURNED INTO IT** — a flat, full-width "JUST SOLD" band across the
   BOTTOM of the picture, in the COMPLEMENT of the agent's accent with a slim accent keyline
   (operator decree 08/09/2026 — the diagonal corner ribbon and its black scrim are DEAD, see
   §2.5.4), composited server-side (`lib/media/photo-badge.ts`).
3. **The hero** — address over the close.
4. **The spec strip** — beds / baths / sq ft, plus the derived cells on the recorded rung only:
   `$/Sq Ft`, `Days on Market` (§2.5.5 G2, BUILT 08/09/2026 — the recorded closed-spell
   `soldInDays`, never `days_in_state`), and `List-to-Sale`. The muted `List Price` cell gave DOM
   its seat the same day.
5. **ONE PARAGRAPH, BANK-OPENED, CODE-CLOSED, ZERO MODEL CALLS.** Decree 08/09/2026: *"TALK LIKE A
   REAL ESTATE AGENT WHO DID A GOOD JOB … USE THE SCRIPTS."* The sentence bank
   (`just-sold.language.ts`, registry `language-banks.ts`) opens in the agent-pride voice; its two
   bragging sentences (sold quicker than nearby / stronger $/sq ft) fill ONLY when
   `soldStoryValues` proves the comparison TRUE of the RECORDED close and the SIZE-BANDED comp set
   (±25% living area, two-value floor on every median) — a prefill fills no figure slot, ever. The
   code-authored `readerLine` closes reader-first with the one question.
6. **The sold comps nearby**, when we hold real recorded sales.
7. **ONE CTA: "What's My Home Worth?"** — every crawled source names the valuation as the correct
   ask for this email.

### 2.5.0 THE CLOSE PRICE — OPERATOR DECREE 08/06/2026

**Verbatim: *"SOLD PRICE IS ENTERED AS LAST LISTED PRICE WE HAVE. USER CAN CHANGE IT IF THEY WANT."***

That is the design. The close cell is **PREFILLED from the last list price we hold** for that
property (`listing_state.list_price` — live-probed 08/06/2026: **35,599 rows carry one**), and it is
**EDITABLE**. The agent who just closed the house is looking at that cell and puts the real number
in. Our data is the starting value; theirs is the final one.

**THE PREFILL LADDER — reach for the REAL sold price FIRST.** Our own truth handoff
(`docs/superpowers/handoffs/2026-08-04-EMAIL-DATA-TRUTH-HANDOFF.md` §2b) already recorded a repair
path this section originally missed: **a date-ranged Apify sold pull returns the real sold price for
any window at $0.01 per home, verified reaching 14 months back** with explicit `date_from`/`date_to`.
It also recorded why it is needed — a listing stamped sold with `price = 0` is TERMINAL, and 11 of
19 captured sold transitions were price-0. **Live 08/06/2026: 821 sold transitions in
`listing_transitions`, 383 rows already in `apify_property_records`.**

So the cell fills in this order:
1. **A real recorded sale of the subject itself** — its own row in its own nearby-SOLD set, carrying
   `priceKind: "sold"` (a `/property-tax-history` Sold event). Free; the call is already made.
2. ~~**A date-ranged paid pull**~~ — **SUSPENDED, SAME DAY, BY A SECOND DECREE.** Verbatim:
   *"APIFY IS FALL BACK FOR SOLD PRICE. WE WILL NOT USE IT UNTIL WE SEE THERE IS AN ACTUAL
   DIFFERENCE. I WILL DECIDE. NOT STUPID CLAUDE."* It is **not wired**, deliberately, and
   `just-sold.test.ts` fails if such an import ever appears in the recipe. Turning it on is an
   operator decision made against a measured difference — never a build-time judgement call.
   Suspended, not deleted: the repair path (~$0.01/home, verified 14 months back) stays on record.
3. **The last list price we hold** (`listing_state.list_price` → `facts.price`, via
   `lib/listings/select.ts:264`) — the decree's prefill, and the NORMAL case, because recording
   lags weeks. Measured on the acceptance houses: rung 3 filled Kellysands Way at $350,000.
4. **The agent's own number**, typed over whatever was prefilled. Always available, always wins.

Whichever rung fills it, the cell is EDITABLE and the provenance row says which rung it came from
(`heroPrice()` returns the rung, not just a string, for exactly this reason).

**AND THE PREFILL NEVER LEAVES THE HERO.** This is the other half of the decree and it is where the
build actually lives. A prefill is a starting value in an EDITABLE cell; it stops being that the
moment it reaches a cell the agent cannot correct. So `soldSpecs`, `soldFootnote`, `chartAnchor` and
`soldNarrativeLine` all take the RECORDED close and nothing else, and four things stay closed on a
prefilled run — each named after what it would have asserted:

- **`List-to-Sale`** — from a prefill it computes **100.0%** off the same figure twice, and renders
  in the accent as the strip's PRIMARY cell. A fabricated market outcome wearing the most
  authoritative styling on the page. The worst defect available in this email.
- **`List Price`** — the hero's own number again, at a second scale (the bug the recipe header
  already records: *"the HTML greps clean; only the screenshot showed it"*).
- **`$/Sq Ft`** — list-price-per-sqft under a label that says sale.
- **The comps bar** — a baked PNG carries no label, no provenance row and no editability, so it is
  the one number on the page the agent cannot reach. Same mechanism as the forbidden old transfer
  below, with the correction path removed. **A PREFILL IS NEVER A BAR.**
- **The paragraph** — prose is baked at author time. A number the agent fixes in the cell would
  survive, uncorrected, inside the sentence.

**This is not an invented number and it never was.** It is lane 1 (our own record, named source) with
lane 4 (the figure the user writes in) on top — exactly the four-lane order. A prefilled editable
field is not a claim the system asserts.

**An earlier draft of this section called the list price "an ASK" and declared it FORBIDDEN in a sold
hero, leaving the cell empty instead. That was wrong and is struck.** It confused a prefill with an
assertion, and it would have shipped an email whose single most important cell was blank in the
common case — because county recording lags weeks, so we will rarely hold a recorded sale by send
time. An empty cell is not more honest than a sourced, editable one; it is just less useful.

**THE ONE THING THAT IS STILL FORBIDDEN, and it is a different mechanism.** Do NOT fill this cell
from `fetchSoldEvent` / the property's LAST RECORDED TRANSFER. Probed live 07/13/2026: a house
ACTIVE at $595,000 returns a 2023 land/teardown transfer of **$160,000**. That is not a stale
starting value the agent will notice and correct — it is a plausible-looking wrong number from a
different decade, and it reads as authoritative. **A real source is not the same as a source-faithful
answer.** Prefill from the last list price we hold; never from an old recorded transfer, and never
from an AVM estimate.

**Residual risk, named so the guard is deliberate:** an agent who edits nothing ships a list price
under a "Just Sold" headline. The cell is visible and labelled, which is the mitigation the decree
relies on. If a stronger guard is ever wanted, it belongs at SEND (confirm the close before the
send completes), never at BUILD — blocking the build would re-create the empty-cell failure above.

### 2.5.1 THE REST, ALREADY SETTLED IN CODE

- **A comp must have beds AND sqft or it is bare land.** Confirmed in this subject's own sold set:
  315 Shore Dr — beds null, sqft null, $127,500. Charting bare land beside a 2,847 sq ft house makes
  the close look like a steal for a fake reason. Filter BY DATA, never by guessing at a type name.
- **The pairing rule.** A price cell that is not the close may only appear ALONGSIDE the close,
  never instead of it.
- **Date grain — AND THE ONE EXCEPTION, confirmed at build time 08/06/2026.** Sale dates that come
  off OUR LAKE are MONTH grain and lag ~7 weeks: render "May 2026", never "05/01/2026", because an
  exact day asserts precision the source does not have. **The hero kicker is not one of those.** It
  is the date carried by the vendor's own `/property-tax-history` Sold EVENT for this specific
  property — a recorded transfer date, exact by construction — so it renders MM/DD/YYYY ("Sold
  08/29/2025", measured on 330 Shore Dr). Same word, two different sources, two different grains;
  do not collapse them. A prefill gets NO kicker at all: a date line is not editable, so it would
  ship a claim the agent cannot correct.
- **Chart.** Comps-bar — the subject's own bar IS the point. **CORRECTED AT BUILD TIME, 08/06/2026:
  this section previously said the prefill fills the subject bar too ("the chart always has its
  anchor"). It does not, and that line is struck.** A bar is baked into a PNG: no label, no
  provenance row, no editability. Plotting a list price bar-for-bar against RECORDED sales is the
  same mechanism §2.5.0 forbids for an old transfer, minus the ability to fix it. `chartAnchor()`
  takes the recorded close only; no recorded close → no chart at all, and the sold-comps LIST still
  carries the context. If the comp set is empty, drop the chart and close the hole.
- **$/Sq Ft footnote is DEAD here too (operator decree 08/10/2026 — "WHY THE FUCK DOES IT SAY
  THIS").** This bullet previously carved out an exception keeping "$/Sq Ft is the sale price ÷
  listed square footage" on the sold email — a loophole written against §1's own rule ("never
  restate arithmetic"). The decree is TOTAL: no ÷-sentence, no arithmetic narration, on ANY email.
  The only footnote this email may carry is the Days on Market provenance note (which spell it
  measures — uncheckable from the page).

### 2.5.2 THE ACCEPTANCE SCRIPT YOU WILL WRITE — ~60 lines

Import everything from `scripts/email/_harness.mts` (§1.17). Write only your `rows[]`, your
assertions, and your own default house.

```
const ADDRESS = subjectAddress("<your own default house>");
const { brand, profile } = await loadAccountBrand();
const narratorLog = captureNarratorDrops();
const { facts } = await resolveSubject(ADDRESS, "");
const built = await buildJustSold({ facts, currentDoc: applyBrand(defaultDoc(), brand), prompt: "", scope: {} });
const doc = applyBrand(built, brand);
const rows: ProvenanceRow[] = [ /* YOUR cells, each naming the lane that filled it */ ];
printProvenance(rows);
if (narratorLog.length) console.log(`  NARRATOR DROPPED: ${narratorLog.join(" | ")}`);
printBottom(doc);
const { html } = await renderAndSave(doc, "just-sold-email.html");
printBrandCarry(profile);
reportAssertions("THE SOLD CONTRACT", [ /* YOUR assertions, read off `html` */ ]);
```

**Pick the default house deliberately** — for Just Sold it must be one with a REAL recorded sale in
its own comp set, or every run tests the prefill path and the recorded rung is never exercised once.
**And run a SECOND address that has NOT sold**, or the prefill path — the common case — is never
exercised either. Written and run: `scripts/email/render-just-sold.mts`, 8 assertions, both houses.

### 2.5.4 THE BADGE ON THE PHOTO, AND THE TWO WRONG ANSWERS BEFORE IT

Operator asked twice: *"make JUST SOLD stand out more somewhere on the photo or something!!!!!!"*
then, after the first attempt, *"don't change the just sold bar so it's different from every other
email. just put a graphic somewhere on the picture."*

**WRONG ANSWER 1 — a louder ribbon.** Reverted, mechanism and all. It broke campaign identity to
solve a per-email problem.

**WRONG ANSWER 2 — `ImageProps.overlayTitle`.** It exists, it puts text on the picture, and it is
still wrong: it renders the photo as a CSS `background-image`, and **Outlook desktop drops
background images entirely** — those recipients get a coloured panel where the house should be.
Absolute positioning is not available in email either. **Losing the photo to gain a word is a bad
trade on the one email whose photo is the win.**

**RIGHT ANSWER — bake it into the JPEG.** `lib/media/photo-badge.ts` fetches the vendor photo,
cover-crops it 3:2 with sharp, composites the flag with resvg, re-encodes to JPEG and uploads
through `hostEmailMedia`.

**WRONG ANSWER 3 — the diagonal corner ribbon (the first baked design). DEAD 08/09/2026.**
Operator, looking at the render: *"I CAN SEE A BLACK LINE AND THE ANGLE IS TERRIBLE. JUST MAKE IT A
DIFFERENT COLORED COMPLEMENTARY COLOR FLAG AT THE BOTTOM OF THE PICTURE."* The black line was the
corner scrim (a black gradient laid under the ribbon for bright skies); the angle was the −45°
rotate. The shipped design is a flat, full-width band on the photo's bottom edge in
`complementOf(accent)` (hue rotated 180°, derived from the brand — never invented) with a 6px
accent keyline; a solid band manufactures its own contrast, so no scrim. `photo-badge.test.ts`
pins all four clauses of the decree. The storage key is now the sha1 of the RENDERED bytes — an
input-stamped key would have served the old ribbon forever off the immutable edge cache (the
chart-key lesson, same week). Every client renders it, because it IS the
image. **It invented no machinery:** `lib/social/listing-card-render.ts` already ran this exact
pipeline for social cards and both libraries were already production dependencies — we import its
`fetchPhoto`, the one canvas-font root, and the one email-media uploader.

**Best-effort by construction.** Any failure — dead URL, undecodable vendor image, storage hiccup —
returns null and the ORIGINAL photo ships. A badge is never worth a missing house.

### 2.5.5 WHAT WE BUILD TOWARD. THE EMAIL AS IT SHOULD BE.

**Operator, 08/06/2026:** *"make the email how it should be and we build towards it. we will figure
it out. just update the playbook with what we need to get there."*

**So the rule for this section is: design the TARGET, not the achievable.** Each gap below says what
it needs and which lane feeds it. None of them are wired. Do not trim the design to what we hold.

**G1 — THE EQUITY LINE, WITH A REAL NUMBER.** Today's paragraph offers a valuation. What it should
say is what the reader's own home is worth *now* — The Close's *"your equity has changed"* is the
strongest line in the whole crawled corpus. **What it needs:** a ZIP-grain median sold price, which
we ALREADY HOLD — `market_details_swfl_latest.median_sold_price` is the ratified root for
sold/recorded value (`docs/standards/data-roots.md`). This is the nearest real build on the list,
and the thing that stops it is not data: it is that a per-reader equity claim is a COMPARATIVE
claim, so it must be code-computed and code-worded, never narrated. **Never let a model near it.**

**G2 — DAYS TO SELL, ON THE RECORDED RUNG. ✅ BUILT 08/09/2026.** LeadSites' data block is
`Sold price | Days on market`, and speed is the one number this email owns. Built exactly as
designed: the `Days on Market` strip cell and the bank's speed-brag sentence both read the vendor's
recorded closed-spell (`RenderComp.soldInDays` — sold date − vendor list date, same response), gated
where every derived cell unlocks (recorded close only, never a prefill, never `days_in_state`).
Caveat measured on the acceptance house: the vendor row for 330 Shore Dr carries no list date, so
`soldInDays` is null there and the cell stays an OPEN SLOT — the gates are proven by unit test, and
the cell fills wherever the vendor holds both ends.

**G3 — THE OFFER COUNT.** HousingWire: *"we had [number] offers, which means there are still
qualified buyers eager to make an offer!"* — the strongest social-proof number in the corpus.
**What it needs:** a lane-4 field. We will never hold it from a feed. One open slot on the canvas,
absent from the send when empty.

**G4 — THE SELLER'S OWN WORDS.** The Close's postcard #4 pairs a client win with a client quote.
**What it needs:** lane 4, and a hard rule — **a testimonial is the one thing on this page that
would be outright fabrication if generated.** Type it or omit it.

**G5 — WHAT SOLD NEARBY, FOR EVERY SUBJECT.** The comps list is the email's proof and it is empty
on most runs (0 recorded sales came back on the acceptance house). **What it needs:** the Lee comp
root rather than the vendor's nearby feed — `lee_comp_sales_v` is the ratified per-subject sold-comp
root and the vendor feed carries **no sale date at all**. Collier has no equivalent.

**G6 — A PHOTO FOR A SOLD HOUSE. REWRITTEN TWICE THE SAME DAY. THE FIX IS FREE AND IT IS OURS.**

This said a sold house has no photo. Then it said the photo lives in the paid row and we need a
trigger to go buy it. **Both were wrong, and the operator caught each one.**

*"If a house sold, we have the fucking house in the lake 99 percent of the time."* **Measured live
08/06/2026 — he is right to the decimal: of the 851 distinct sold addresses we have watched close,
848 carry a photo in our OWN free spine. 99.6%.**

**SO WHY DID 330 SHORE DR RENDER WITH AN EMPTY PHOTO SLOT? OUR OWN RESOLVER REFUSES TO LOOK AT IT.**
`lib/listings/select.ts:383` filters `.eq("state", "active")`. The row is sitting there with its
photo; the one subject resolver excludes it for being sold — **on the one email that only ever runs
on sold houses.** That is the whole gap: a free, lane-1 fix in our own code. No actor, no spend, no
trigger. Check `just_sold_sold_subject_resolver`.

**What the paid rung is for, per §3.3.0:** the remaining ~0.4%, and a specific missing FIELD on a
property we otherwise hold. **Never a build step.** My "go buy it for a penny on every build"
proposal reached for lane 3 before checking lane 1 and would have required flipping the operator's
own kill switch on every send. *"we don't go paid on every fucking email. did you now read the
ladder?"*

**G7 — THE PHOTO-RIGHTS GATE.** An agent sending a Just Sold for a house they did not list may not
use the listing agent's photos (HousingWire). Both sources say to send those anyway, so it is the
common case. **What it needs:** scoping first — we may not even know who the listing agent was.

### 2.5.3 WHAT THE WALK ACTUALLY FOUND — five defects, three of them invisible to any test

1. **THE FRAMING INDUCED ITS OWN CLAIM-GATE DROP, and the email lost every word of body copy.**
   The recorded close and its date rode in `framing`, which is SHOWN to the model but not SETTLED,
   so the gate killed the whole paragraph: `unanchored-number("08"), ("29"), ("2025")`. The email
   whose entire job is one number was forbidden to mention it. Fixed at the ONE root:
   `authorListingNarrative` now takes `anchors?: string[]` — code-computed facts `ListingFacts` has
   no field for, handed to the model AND registered with the gate, exactly like the `$/sq ft` line
   already there. **The general rule: a fact you want the narrator to state goes in `anchors`, not
   in `framing`.** T8 in action — the drop is a `console.error` nobody reads and its symptom looks
   like nothing being wrong.
2. **An instruction and a guard were fighting.** "End with ONE plain clause offering a private
   valuation" made the model write *"if you want to know…"* → `motive("want to")` → paragraph
   dropped. The BUTTON already says "What's My Home Worth?". The narrator is now told to write NO
   call to action at all. Asking prose to duplicate a chrome element is how this happens.
3. **`days_on_market` is poison on a sold email.** The model wrote *"after 12 days on the market"*
   (`sequence`) and derived a list date *"07/22"* (`unanchored-number`). That clock is
   days-in-ACTIVE — the same trap Under Contract documents — and on a closed house it is both
   meaningless and an invitation to narrate a timeline we never handed over. Now explicitly banned
   in the framing.
4. **THE SELLER'S FOR-SALE DESCRIPTION MUST NOT SHIP — found by wiring it up and LOOKING.** Every
   sibling on this chrome ships `listingDescription(facts.remarks)`; this recipe never did, and the
   provenance table's "549 chars held" made that look like a plain bug. Added in one line, what
   appeared under the gold JUST SOLD ribbon was the ACTIVE LISTING'S PITCH, verbatim: *"Best-priced
   single-family home in the community — don't miss this opportunity…"* A for-sale pitch is STALE
   THE MOMENT THE HOUSE CLOSES, and the block is verbatim by contract so it cannot be edited into
   coherence. Reverted, and the omission is now asserted in BOTH the unit test and the acceptance
   script — because it looks like a bug to the next person who reads the provenance row. Under
   Contract keeps its description: PENDING is not SOLD.
5. **No subject line at all.** The acceptance run printed `Subject line: "(none)"` — four sibling
   recipes set theirs from `subject-lines.ts` and this one never did, so a send would have fallen
   back to whatever `deriveEmailDocSubject` scraped off the doc. Added `justSoldSubject()` to the
   one root. **The street, never the price** — a subject is baked into the send, so it is the one
   place a prefilled number could never be corrected.

**One assertion of mine also went red on healthy output and had to be narrowed** (T5, the stale-alarm
class, caught inside the same session): "the narrator names no price" fired on a monthly HOA fee of
$1,326 — sourced, and labelled as what it is. It now checks the only thing that is actually wrong:
that the prose never restates the PREFILL.

**Known, accepted, not fixed here:** on a genuinely sold house the for-sale spine holds no photo and
no description, so the recorded-close render is thin (photo slot open, no description block, and on
330 Shore Dr the narrator legitimately dropped for inventing `spatial("same street")` and
`unsourced-feature("waterfront")` — the gate working, not failing). The paid row on disk is where a
sold house's photo would come from; that lane is untouched by this build.

---

## 2.6 OPEN HOUSE — tag `open-house` — BUILT IN CODE, SECTION OWED

LIVE in code with its acceptance script (`render-open-house.mts`, rebuilt 08/09/2026: date/time
signal card, invitation logic, shared narrative adapted for open-house context). **What is owed is
the WRITTEN WALK — this section.** Do not pre-fill it from memory or by copying an earlier section.
Note for that walk: open-house date/time is ALWAYS lane-4 (human-typed) — zero open-house columns
anywhere in the lake, the vendor's own doc examples show its `open_houses` field only `[]`/`null`,
and `render-open-house.mts` takes date/time as typed arguments (all three lanes checked live
08/09/2026). Its sentence bank (rollout step 2 of the sentence-banks spec) is where the ESSENTIAL
slot machinery (`essentialGaps`, built and tested in `lib/deliverable/language.ts`) gets its first
send-gate wiring.

---

## 2.7 PRICE IMPROVED — tag `price-reduced` — **WALKED 08/09/2026, bank sentences pending operator reword.**

**Spine:** address (lifecycle 7, `resolveSubject`). **Positioning:** sell-side. **Chart policy:**
one slot, reserved only when a sourced cut exists — the new price's $/sqft as a reference line
across real nearby comps' bars (bklit composed via `priceVsAreaDotSpec`; size-banded same-type
comps, email type scale, self-naming reference line — the three 08/09/2026 defects, all fixed in
`654c6fe7` before this section was written). No cut → no slot; no usable comps → slot dropped.

**The three numbers, and the arithmetic that must hold on screen:** the kicker carries the vendor's
own `reduced_amount` ("Price cut $65,000"), the hero carries the current ask ($800,000), and the
strip's muted "Previous" cell carries the ONE derivation — current + cut ($865,000) — footnoted, so
a reader can check previous − cut = current in their head. `reduced_amount` is the SIZE OF THE CUT,
never the old price (probed live 07/13/2026; the enforced ledger rides the recipe file). Type cell
dropped by design — a seventh cell fails `EmailDocSchema` and falls through to the generic author.

**THE SENTENCE BANK (spec `2026-08-10-sentence-banks-design.md` — this email is the FIRST bank).**
The Voice Card (§1.20) extension for this email, verbatim from
`lib/deliverable/recipes/price-reduced.language.ts` — **starting set, reword in walk review with
the operator; reworded sentences replace them in that FILE, same session:**

- "The price on {{street}} just came down." — street: address slot, fills only when the vendor
  flags a reduction. THE ONE legal mention of the move; the model is forbidden to restate it in
  any words.
- "The home sits inside {{community}}." — community slot, fills from the parcel-resolved
  subdivision (`communityStats.subdivisionName`); drops WHOLE on a miss, never "inside .".

Mechanics: code fills the templates (`fillSentences`) and PREPENDS them; the model never sees bank
text as rewritable — it only ADDS digit-free connective behind the same claim gate as always, told
what already opens the paragraph. A sentence with an unfilled slot drops whole (never a literal
blank — the Mailchimp/HubSpot failure, per the 08/09/2026 vendor-doc pass). Body under 50 words
logs LOUDLY (`bodyWordCount` — the floor was previously enforced nowhere), never padded, never
blocked. Research cited in the bank file header (strongest-concepts, sell-side copywriting,
merge-tag fallback passes).

**What the AI writes:** connective only, additive-only, behind the recipe's prohibition framing
(no reason for the cut, no seller/market claims, no urgency, no spec recital, no CTA — the framing
block in `price-reduced.ts` is the authority). Previous price is anchored so its single legal
mention survives the gate. Two attempts max; both dropped → the bank sentences still ship.

**Buttons:** "Schedule a Showing" → `listingButtonUrl` ladder; no real listing page → NO
destination, never our homepage (§1.8).

**Acceptance evidence (08/09/2026, `render-price-reduced.mts` on 3113 SW 18th Ave, Cape Coral):**
**10 of 10 assertions PASS** off the rendered bytes — street line, kicker, on-screen arithmetic,
no Type cell, no invented reason, CTA rule, body-never-silently-empty, **bank sentence verbatim,
move stated at most once, no `{{` residue**. Metered calls: 2 (both narrator attempts
gate-dropped — invented "waterfront"/"view" on a no-remarks house) — and the body STILL shipped
the bank's 10 words where the pre-bank build shipped zero. That run is the sentence-bank design
proving itself: the gate can kill the model's prose without killing the paragraph.

**Known gaps:** on no-remarks houses the connective is frequently gate-dropped, so the body runs
well under the 50-word floor (logged, honest, thin) — the fix lane is a bigger walked bank, not a
lower gate. The community sentence has never rendered live (the acceptance house resolves no
subdivision) and MAY double-state the community with the narrator's settled neighborhood line —
suspected, untested; check on the first community-resolving walk run. The two SERVED captures
(`public/new-emails/price-reduced-email.html`, `public/showcase/listing-to-close/live/07-*.html`)
predate the bank — and the new-emails one carries a live narrator meta-narration leak ("Nothing. It
may be shorter than you want…") — operator call on when to re-capture (the fresh bank-era capture
is honest but thin at 10 words). Bank register: the §1.20 conflict (plain-note vs designed chrome)
stands unresolved here too — flagged, not fixed.

---

## 2.8 AGENT BRAND INTRO — tag `agent-brand-intro` — **WALKED AND BUILT 08/06/2026.**

**Spine:** TWO at once — the agent's farm area (a ZIP-by-ZIP live-asking-price chart) and their
newest listing as the anchor. The recipe's own file header (`agent-brand-intro.ts`) is the design
doc for this one; see it for the full farm-area/anchor-split regex machinery and the 07/13/2026
wrong-city bug it exists to prevent. This section is the WALK — proving the already-built recipe
against a real, fully-profiled account and a real send.

**The account was already fully profiled going in.** `ethanrickyjrjr@gmail.com`
(`user_id 37cc6c49-4759-4e07-9686-0a8dcce1f8ff`) carried the Marisa Delgado persona from the
08/05/2026 Coming Soon walk — real bio, license, brokerage, business address, all 8 socials, and a
real headshot (a trimmed-transparent PNG uploaded via `scripts/email/_use-operator-photo.mts` to
`email-media/showcase-agents/marisa-delgado.png`). Nothing needed filling; this walk proves the
recipe CARRIES what the account already holds.

**Code:** `lib/deliverable/recipes/agent-brand-intro.ts` → `buildAgentBrandIntro`. Registry key
`agent-brand-intro` (`lib/deliverable/recipes.ts`).

### 2.8.0 REPRODUCE IT

```
bun --env-file=.env.local scripts/email/render-agent-brand-intro.mts ["<farm area>"]
```

Default farm area: **Fort Myers** — one of the two cities Marisa's own bio already claims
("between Fort Myers and Estero"; `resolveFarmArea`'s declared-span reader stops at "and", so a
two-city cue is not a shape this recipe resolves — one city is the honest input). Writes
`~/Downloads/agent-brand-intro-email.html`, prints a per-cell provenance table, and asserts 6
things against the rendered bytes:

1. the account's real `agent_bio` ships, never the shared-file house placeholder
   ("A short bio that builds trust with your readers.")
2. the real headshot URL ships
3. the real agent name ships
4. the hero/chart/CTA agree with the declared farm area (checked on those three blocks only —
   NOT the whole HTML, because the agent's own bio can legitimately name a second city she also
   serves; that is not the wrong-city bug this recipe's header describes)
5. no empty `<img src="">` reaches the sent HTML
6. under Gmail's ~102KB clip point

**One real defect the walk found, fixed in the harness script, not the recipe:** the acceptance
script's canvas (`applyBrand(defaultDoc(), BRAND)`) carried no `agent-card` block, because
the underlying seed ships none and `applyBrand` only ever
(CORRECTED 08/10/2026: this line used to say `skeleton-clean-white` is "what `defaultDoc()`
returns" — FALSE. `defaultDoc()` = `SEED_DOCS[0]` = `market-spotlight`, house style;
`skeleton-clean-white` is the separate blank canvas recipe ARRIVALS land on. That conflation
hid the serif the skeleton carried — see §2.1.6 defect 1's third recurrence, 08/10/2026.)
overlays an EXISTING block's props — it never creates one. `brandHeadshot`/`brandAgentName`
(agent-brand-intro.ts) read the account's photo/name off `currentDoc` DURING the build, so without
seeding an agent-card first, the up-front headshot and the "Meet your agent — `<Name>`" hero both
rendered as open slots even though the account was fully profiled. A real Email Lab canvas never
hits this because the UI's own "apply brand" action stamps an agent-card before any recipe build
runs — this was an acceptance-script gap, not a product bug. Fixed by seeding
`createBlock("agent-card")` onto the canvas before `applyBrand` runs, mirroring what the live
canvas already carries.

**No anchor listing was named, on purpose.** Substituting a real house as "Marisa's newest
listing" would put a stranger's home under a fictional agent's name (we hold no agent↔listing
link — `listing_state.brokerage` is 100% null) — worse than the open slot. The anchor block
correctly drops out of the sent HTML entirely rather than shipping empty.

**RESEARCH (RULE 0.4):** not in `_RESEARCH/` — crawled live, filed at
`_RESEARCH/email-and-social/2026-08-06-agent-intro-email-content-research.md`. Confirms the
recipe's own genre split against an independent source (agentadvice.com): a farm-area/authority
intro (this recipe) is a named, distinct use case from a cold 1:1 referred-lead letter
(`agent-launch`), not a design gap. The one cosmetic difference from the generic template (no
explicit "thank you for reading" line) is non-blocking.

**Sent for review:** `hello@swfldatagulf.com`, Resend id `dfb4c497-7f38-4933-808a-e946ba9d85e0`,
08/06/2026 — subject "Meet Marisa Delgado, Fort Myers", 15275 bytes.

### 2.8.1 THE BODY WAS THIN — operator caught it on the FIRST send, same day

Verbatim: *"first fix your shit email. crawl4ai what an meet agent email actually writes. have
builder write a fucking intro!!!!!!!!!!!!!!!!!!!!! make sure we stop only using bar charts. we
have tons of charts. i like the top of the email, but this really sucks at the body and really
needs some research with crawl4ai."* 6/6 acceptance assertions passing was never evidence the
BODY was good — it only proved the account's fields carried through.

**Two fixes, both crawl4ai'd first (RULE 0.4), landed in the recipe itself, not the render
script:**

1. **`authorAgentIntro`** — the always-blank personal-intro slot now writes FROM the account's
   own `agent_bio` (lane 1, not an invention: the old "we know nothing about the agent" stance
   predates the account having a real bio on file). Fail-safe: no bio → the same open slot;
   any number in the draft not traceable to the bio → falls back to the bio verbatim, never
   invented, never blank when a bio exists. **First draft failed on sight** — told to
   "reorder, shorten, warm up" a bio that was already short and warm, the model kept nearly
   the full ~90 words, lightly reworded, so it duplicated the compact agent-card bio sitting
   right below it. Fixed by an explicit instruction: pick ONE detail, do not walk the career
   history in order (that's the card's job), 30-50 words, 2-3 sentences.
2. **The chart is a DOT PLOT**, not `bar-table` — each ZIP's asking price against the farm
   area's own median as a shared reference dot (registry: "ranked-categories", the shape this
   data already is). A row of same-length dollar bars was the platform's reach-for-it-by-habit
   default and it threw away a real, honestly-computed comparison (how far each ZIP sits from
   the center) that the bars could not show at a glance.

**A caching trap almost passed for a bug.** The first re-render's screenshot still showed bars
— the hosted PNG's storage key is `zip-asking-<slug>-<asOf>-<tint>.png`, unchanged run to run
on the same day, so Chrome served its cached copy of the OLD bar image for the SAME URL. A
direct cache-busted fetch of the file confirmed the actually-hosted PNG was already a correct
dot plot. **Screenshot evidence needs a cache-buster whenever a chart's storage key can repeat
same-day** — logged so the next chart walk doesn't re-diagnose this as a real defect.

Research: `_RESEARCH/email-and-social/2026-08-06-agent-intro-email-content-research.md`
(theclose.com bio-example pairs — the pattern behind the "pick ONE detail" instruction).
Tests: 2 new `buildZipAskingSpec` cases (dot-plot shape, the 8-row cap) + 3 new
`authorAgentIntro` cases (no bio → null, clean draft ships, unsourced number falls back to
verbatim) — 57/57 green in this file, 620/620 across `lib/deliverable/recipes/`. Re-sent to
`hello@swfldatagulf.com`, Resend id `cc9c11c9-16a0-48a2-8d30-5619e7828f2c`.

---

## 2.9 – 2.11 — TO BE WALKED

Each section gets written when that email is walked with the operator. **Do not pre-fill one from
memory or by copying an earlier section** — the whole point of the walk is that each email's
ingredients and sources get decided deliberately, one at a time.

---

## 2.12 MONTHLY MARKET PULSE — tag `market-pulse` — **WALKED 08/06/2026.**

**Spine:** ONE PLACE, resolved ONCE, before any layout. `ctx.facts` is NULL — there is no house.
`resolveArea` reads `ctx.zip` first (a door that handed us a ZIP wins), else the place named in the
prompt via the sourced crosswalk (`zipFromPromptPlace`). A city is its ZIP SET — Cape Coral is six
ZIPs, not one.

**Grammar:** the `trend-snapshot` seed — chart leads, no hero: header, one trend chart, a 3-cell
stat row, a prose slot, agent card, footer. **This is one of the FOUR declared lanes that hand-
position their own blocks and do not call `finalizeDoc`** (PART 0; `email_seam_bypass_market_pulse`,
inverted-assertion in `registry-seam.test.ts` — a file another session owns this session, left
untouched on purpose. See Known Gaps below.)

**Chart: `zip-mom-move`.** One ranked bar per ZIP (home value), each carrying its OWN
month-over-month chip — projected off the SAME table `buildChartForQuestion` would reach for, minus
the YoY column, because the shared binder would otherwise bind year-over-year under a
month-over-month headline (see the recipe's own header for why).

**Subject:** `marketPulseSubject(place)` — deterministic, never model-authored.

**Code:** `lib/deliverable/recipes/market-pulse.ts` → `buildMarketPulse`. Registry key `market-pulse`.

### 2.12.0 WHY THIS WALK HAPPENED, AND THE QUESTION IT ANSWERED FIRST

Operator ask, mid-session: *"More AI commentary here since it will be more of a weekly to monthly
email."* Before touching the recipe, he asked the harder question straight: **"if we code in chips
on the only numbers builder can mention, will it still make shit up?"**

That "chip" instinct is not new here — it is exactly how this recipe already worked, and the reason
it is the one recipe proven immune to the platform's one documented hallucination incident
(07/13/2026: handed six real ZIP rows and told not to count them, Sonnet wrote "five of those six
ZIPs" — the true answer was four). `pulseUserMessage` takes `SettledClaim[]`, never a row or a set;
the model's own sentence is audited against **zero digits, not wrong digits** — any digit at all
gets the sentence dropped, fail-closed, spine-ships-alone. 53 tests cover this, including one that
replays the exact historical defect and proves the gate now catches it.

**The widen, decided against that constraint — never touch the model's INPUT, only its OUTPUT
VOLUME and CODE's own settled facts:**
1. The model's closing commentary widened from 1 sentence to 2-3 — same zero-digit gate, same
   fail-closed drop, just more room.
2. A NEW code-settled sentence — the YEAR-over-year range, off `value_yoy_pct` (held on every row,
   previously read only to be stripped OUT of the chart, never stated anywhere). Real, new context;
   still computed in code, still verbatim-exempt.
3. A CTA button — the `trend-snapshot` seed carried **none at all**, checked against
   `default-docs.ts` before assuming. `_RESEARCH/email-and-social/2026-08-03-strongest-real-estate-
   email-concepts-structure.md` Part C names "close pushing to conversation, never end on a number"
   as a cross-platform market-report pattern; this email had no close of any kind. Role `community`,
   mirroring `community-info.ts`'s own convention exactly (T2).

### 2.12.1 REPRODUCE IT — one command, chosen for a coverage GAP, not a clean number

```
bun --env-file=.env.local scripts/email/render-market-pulse.mts "<place>"
```

**Default place: Fort Myers.** Live-probed the SAME session against the real brain (not assumed):
Fort Myers spans 9 ZIPs and `home-values-swfl` (ZHVI) holds 8 of them — a real, current coverage
gap, so the run exercises `settledPulseFacts`' "8 of 9 ZIPs ... carry a published home value"
sentence. Cape Coral (6 of 6) would never exercise that sentence; Naples (13 of 13, but only 8
drawn) exercises TRUNCATION instead — pass it as argv[1] to check that path on demand.

**Acceptance run, 08/06/2026 — 9 of 9 cells sourced, 16KB, 6 of 6 assertions pass.**
Fort Myers · 8 of 9 ZIPs held · biggest mover ZIP 33907 at −0.87% · highest value ZIP 33913 at
$441,150 · **YoY range −10.75% to −5.07% (new)** · chart rendered · closing read shipped (603
chars, model's sentence accepted on this run — see §2.12.3 for the run where it was rejected and
the spine shipped alone, both proven live) · CTA "Ask about Fort Myers" (new).

**SPEND:** zero new vendor spend — the chart is a free, already-fetched Tier-2 brain read. The only
metered call is the 2-3-sentence closing read; run without `ANTHROPIC_API_KEY` and it becomes an
open slot (spine ships alone).

### 2.12.2 THE INGREDIENT LADDER

| Cell | Source | Exhausted |
|---|---|---|
| **Place** | sourced ZIP crosswalk (`zipFromPromptPlace`) or a door's `ctx.zip` | no place named → `buildMarketPulse` returns null, falls to the terminal author |
| **ZIPs covered / spans** | `home-values-swfl` row count vs. crosswalk span | a place with zero held rows → same null fallthrough |
| **Biggest mover · highest value** | SELECTED out of held rows, never computed | — |
| **Month-over-month chart** | `bindRankedDeltaSpec`, YoY column projected out | no rows → no chart (a bonus, never a blocker) |
| **YoY range (NEW)** | `value_yoy_pct`, held but previously unused | fewer than 2 real values, or all equal → no sentence, never a fake range |
| **Closing commentary (WIDENED)** | code-settled spine (always, when ≥1 ZIP held) + 0-3 model sentences | model's contribution can be dropped twice and the spine still ships; the WHOLE read fails only if the assembled paragraph itself fails the gate — then OPEN SLOT |
| **CTA button (NEW)** | role `community`, `brandWebsiteUrl(doc)` authored, resolved further by the account's own saved per-role destination | no footer at all → doc unchanged (defensive; never hit in practice, every seed carries one) |

### 2.12.3 WHAT THE WALK ACTUALLY FOUND

**Two real defects, both in the NEW acceptance script, neither in the recipe — found by rendering,
not by the 53 unit tests (which stayed green throughout).**

1. **THE PROVENANCE TABLE MANUFACTURED A FALSE POSITIVE ON THE CHART'S OWN URL.** The first run
   reported *"Closing commentary — 136 chars: https://…"* — the chart's Supabase-hosted PNG url,
   picked up because the "walk every string, exclude chrome block types" technique (§2.2.4/§2.4)
   excluded `agent-card`/`footer`/`header`/`sources`/`button`/`stats` but not `image` — a block type
   none of the four already-walked address emails carry a FORCED chart on, so nobody had hit this
   before. Same sin, new block type. Fixed: excluded `image` too, plus a `!/^https?:\/\//` guard as
   a second line of defense.
2. **AN ASSERTION CHECKED THE WRONG INVARIANT.** "The closing read carries no digit" was written
   against the WHOLE rendered paragraph — but the whole paragraph is spine-plus-sentence, and the
   spine is SUPPOSED to carry digits (it's the settled facts). It failed on the recipe's own "8 of
   9" and "−0.87%," which is correct behavior, not a defect. The invariant that DOES hold — the
   MODEL's own added sentence carries zero digits — is already proven exhaustively by
   `market-pulse.test.ts`'s `auditConnective` tests against the exact prompt this run sends, and
   cannot be re-isolated from rendered HTML once the two are concatenated. Replaced with what an
   acceptance run actually CAN prove: the read did not silently collapse to an open slot (T8).

**One finding in the recipe's own header comment, unrelated to the widen — a stale row count.**
The 07/13/2026 comment claimed **"109 SWFL ZIP rows."** Re-queried live 08/06/2026: **53 today.**
Cross-checked against `fixtures/swfl-zip-county.json` the same session — zero leakage, every one of
the 53 resolves to Lee (34) or Collier (19). Most likely Zillow's own ZHVI coverage narrowing (they
do not publish a value for every ZIP), not a defect on our side — but unconfirmed, so a check is
open (`zhvi_zip_coverage_dropped_109_to_53`) rather than asserted either way. Comment corrected in
the same commit; do not trust a row count in it without re-querying `fetchBrain`.

**One run of the widened commentary was rejected twice** (`word-count:"every tracked ZIP"`) and
shipped the spine alone — proven LIVE, on a real API call, not simulated. This is the fail-closed
design working exactly as built (§2.12.0), not a defect: the reader got a slightly shorter but
completely honest email instead of a risky one. Worth watching, not fixing — a persistently high
rejection rate on the widened prompt would be worth a follow-up walk; one observed rejection across
two live runs is not that signal yet.

### 2.12.4 KNOWN GAPS — named, not hidden

- **⚠ THIS RECIPE HAND-POSITIONS ITS OWN BLOCKS AND DOES NOT CALL `finalizeDoc`** — declared
  exemption #`email_seam_bypass_market_pulse`, inverted assertion in `registry-seam.test.ts`. That
  file is owned by another session as of this walk; **left untouched on purpose.** Folding this
  email into the shared seam is real future work, not a defect this walk introduces or fixes.
- **The CTA's destination is NOT `brandWebsiteUrl` in practice, and that is correct, not a bug.**
  `withCta` authors `url: brandWebsiteUrl(doc)` as a fallback, but role `community`'s SAVED per-role
  destination (`button_destinations.community` on the account row) outranks it once `applyBrand`
  resolves the button — observed live: the rendered button pointed at `/z/33990`, a real,
  more-specific, already-saved destination, not the generic homepage. Same behavior
  `community-info.ts`'s identical CTA gets; do not "fix" this into always using the homepage link.
- **Dark mode** — repo-wide known gap (§1.5b), not new to this email, not addressed by this walk.
- **The rejection rate on the widened 2-3 sentence prompt is unmeasured beyond two live runs.**
  Named above; revisit if it becomes a pattern.

---

## 2.13 BACK ON THE MARKET — tag `back-on-market` — **WALKED 08/06/2026.**

Reproduce: `bun --env-file=.env.local scripts/email/render-back-on-market.mts` (six assertions,
non-zero exit on failure). One metered call — the house narrator.

### 2.13.1 THE RULING THAT SHAPED IT — the status budget

Operator, on two consecutive real renders: *"WHERE THE FUCK IS THE HOUSE INFORMATION? PRICE, SQ FT.
IT'S JUST LIKE A NEW FUCKING LISTING… ADD THE EXTRA STUFF, BUT FOR CHRIST'S SAKE, GET THE DETAILS
FIRST"* — then *"no one cares about how many days it was off market … lead like a new listing …
get rid of the stupid talk. it's basically a new listing."*

**THE STANDING RULE, and it generalises past this email: on a single-address lifecycle email the
RIBBON and the SUBJECT LINE are the entire status budget. Prose that re-explains the status is
prose the reader did not ask for.** A relisted house is a house for sale; the reader wants what any
listing email gives them. What the email is *about* goes in the chrome, not in a paragraph.

### 2.13.2 THE SHAPE — it does not resemble §2.1, it IS §2.1

`buildBackOnMarket` PROPERTY mode calls **`buildListingFlyer`** and turns exactly two dials —
`ribbon: "Back on the Market"` and `ctaLabel: "Schedule a Showing"` — plus `secondSpecRow(facts,
false)` for year built · HOA. Everything else is inherited: the six-cell strip, the `$/Sq Ft`
emphasis ruling, the seller's own description block, the `listingButtonUrl` ladder.

**This is the pattern for the remaining listing-lifecycle emails.** Handing `buildLifecycleEmail`
the same field set by hand is a SECOND COPY of every one of those decisions, and the 08/05 `$/Sq Ft`
emphasis fix would have had to be made twice. If two emails are "basically the same", make it so
they *cannot* drift. A recipe that needs a genuinely different strip is not a flyer — call
`buildLifecycleEmail` directly, as price-reduced and just-sold do.

**No `daysOnMarket` is passed, deliberately.** A relisted home's vendor `list_date` may belong to
the ORIGINAL listing run, so printing it as DOM would state a number that quietly means something
else. Type keeps the sixth slot.

**AREA mode (a bare zip/city ask) is untouched** and keeps the fallthrough/relist rates. That is
where those numbers were always right — there is no house to describe. It has never been rendered
and looked at; check `back_on_market_area_mode_never_rendered`.

### 2.13.3 THREE DEFECTS THIS WALK FOUND, none catchable by the recipe's own tests

1. **The CTA and the photo link pointed at our homepage.** `facts.sourceUrl` is the CITATION field
   and `resolve-subject.ts` hardcodes it to swfldatagulf.com. This recipe never inherited §1.8's
   08/05 fix. Now on `listingButtonUrl` — no real link means NO BUTTON.
2. **`addressLineOf` shipped the vendor's stray comma** ("…, FL, 33928") on five of seven lifecycle
   emails, while price-reduced and back-on-market each carried a private fix and a comment saying
   the root *"is not mine to edit."* Lifted into `addressLineOf`; all seven read one authority.
3. **The narrator leak guard was written for the inverse bug and made it worse.** It took the LAST
   segment after a `---` rule, assuming self-narration always leads. The next live render put the
   real description first and an apology last — so it kept the apology, binned the description, and
   the email shipped with NO PROSE AT ALL. Position is not the signal; shape is. And a bracketed
   placeholder now costs its SENTENCE, not the whole paragraph (§1.20 already bans shipping one).
   **Ordering is load-bearing: strip brackets BEFORE testing for narration** — `[year not provided]`
   contains the literal phrase "not provided".

### 2.13.4 KNOWN GAPS — named, not hidden

- **No relist address we hold carries a description TODAY — and that is a SPEND DECISION, not a
  data gap.** Counted live 08/06/2026: **102 relist events (`holding → active`,
  `days_off_market >= 7`) in `data_lake.listing_transitions`, ZERO of their addresses carry a row
  in `data_lake.apify_property_records`** (383 rows held, none a relist). Per `data-roots.md`
  §"Comp PHOTOS + the listing DESCRIPTION", **the vendor populates the `text` field for
  for_sale/pending listings** and a relist is ACTIVE — so the description exists on the vendor
  side for all 102. Filling it is RULE 0.7a rung 3: a paid call for ONE specific missing field,
  behind the spend switch. The block is wired; it lights up the moment a row lands.
  Check: `back_on_market_no_paid_row_for_any_relist`.
- **A fact-poor house can ship with NO agent-authored prose**, so §1.9's 50-word body floor is not
  guaranteed. On the acceptance house the claim gate correctly dropped the paragraph run after run
  (invented "office", "2400", "under 2 [miles]"). `NARRATOR_ATTEMPTS = 2` halves the empty rate and
  then stops — **we do not lower the gate to fill a slot.**
  Check: `back_on_market_wordless_on_fact_poor_house`.
- The leak guard is a LOCAL BACKSTOP; every lifecycle recipe calls the same narrator.
  Check: `shared_narrator_leaks_reasoning_preamble`.

## 2.14 – 2.17 — TO BE WALKED

Each section gets written when that email is walked with the operator. **Do not pre-fill one from
memory or by copying an earlier section** — the whole point of the walk is that each email's
ingredients and sources get decided deliberately, one at a time.

---

# PART 3 — POTENTIAL BUILDS & IMPROVEMENTS. THE BACKLOG, WITH ITS EVIDENCE ATTACHED.

**Opened 08/06/2026 by operator instruction:** *"bring in all information from any site you visit
that will make any email better and generate new email ideas. anything that will help builder speak
and write, as well. all needs to be in playbook potential builds/improvements."*

**This is a BACKLOG, not a plan.** Nothing here is approved, scheduled, or half-built. Every entry
names the evidence behind it and the lane its data would come from, so the next session can argue
with it instead of re-deriving it. Sources for this round:
`_RESEARCH/email-and-social/2026-08-06-just-sold-craft-and-agent-email-voice.md` (LeadSites,
Propphy, HousingWire, The Close, Luxury Presence — all crawled live 08/06/2026).

**When you pick one up: brainstorm → name the break → TDD → register (§1.18). Do not skip to code
because the idea is already written down here.**

## 3.1 IMPROVEMENTS TO EMAILS THAT ALREADY EXIST

**B1 — MAKE JUST SOLD ABOUT THE READER. The single biggest gap, and it applies to every
announcement email.** Every source leads with the neighbour's own equity: *"Sold on [Street] — and
what it could mean for your home"* (LeadSites), *"your neighborhood is hot! Your neighbors at
[address] just sold"* (HousingWire), and The Close names *"your equity has changed"* as the line
that stops a homeowner cold — *"(hello, money!)"*. Ours is a photo, a price, three specs and a
paragraph about the house, and the recipient is never in it. **Data lane:** none needed for the
copy; the framing changes. A real equity CLAIM would need a computed comparison and would have to
survive the claim gate. **Start with the framing, not the number.**

**B2 — A "DAYS ON MARKET" CELL ON THE RECORDED RUNG ONLY.** LeadSites' data block is `Sold price: $X
| Days on market: X`, and the speed number is the one figure this email owns. We ban it today,
correctly: `days_in_state` is days-in-ACTIVE, not a completed interval. **But when we hold a RECORDED
sale we hold both ends** — our listed date and the recorded sale date — so the honest completed
interval exists exactly on the rung where the chart and the derived cells already unlock. Gate it
the same way. **Do not compute it from `days_in_state`, ever.**

**B3 — THE LIST-PRICE PAIR IS ALREADY RIGHT. Leave it.** HousingWire states both prices in its
letter (*"sold for [sale price]. It was listed at $[list price]"*), which is what our pairing rule
already does on the recorded rung. Recorded here so nobody "improves" it into showing an ask alone.

**B4 — NUMBER OF OFFERS.** HousingWire: *"If there were multiple offers, you may also want to
include how many were received … which means there are still qualified buyers eager to make an
offer!"* **We will never hold this from a feed. It is lane 4 — the agent types it.** A one-field
open slot on the Just Sold canvas, absent from the send when empty. Cheap, and it is the strongest
social-proof number in the crawled corpus.

**B5 — A CLIENT-WIN PANEL / TESTIMONIAL.** The Close's postcard #4 highlights *"Sold Seller Saved
$14,000"* in a bright panel next to a client quote, and calls social proof a design element rather
than copy. Lane 4 again (the agent's own figure and their own client's words). **Never generate a
testimonial — that is the one thing on this whole page that would be fabrication.**

**B6 — A PHOTO-RIGHTS GATE.** HousingWire, and it is a legal exposure we have no guard for: an agent
who did not list the property *"must get explicit permission to use their photos"* — the recommended
alternative is *"take your own photo of the property from the street."* Both LeadSites and
HousingWire say to send Just Sold emails for houses you did not represent, so this is the common
case, not the edge. Our hero photo comes straight from the listing feed. **Candidate guard: a
build-time acknowledgement on the Just Sold canvas when the sending agent is not the listing agent —
which we may not even know. Needs scoping before it needs code.**

**B7 — RE-TEST THE DESIGN ITSELF.** LeadSites claims plain, lightly-designed emails outperform
heavily branded ones in real estate. That is a direct challenge to our chrome and we have no
evidence either way. **A/B testable, not knowable from here.** See §1.20.

## 3.2 NEW EMAILS THIS ROUND SURFACED

Ranked by "do we already hold the data".

**N1 — THE NEIGHBOUR-FARMING JUST SOLD.** Same event, different list, reader-first copy. LeadSites
and HousingWire BOTH ship it as a separate template from the sphere version, which is the tell: it
is a different email, not a different subject line. **We hold everything it needs.**

**N2 — "YOUR FUTURE COMPETITION JUST WENT LIVE."** Propphy's strongest idea: a NEW LISTING near a
known future seller, framed as competitive intel for them — *"buyers will compare your home directly
to this one"* — closing with an offer to re-run their pricing. We hold new listings and can define
"near". **Highest-value new email on the page, and it needs no new data.**

**N3 — NEIGHBOURHOOD LISTING ALERTS ("before Zillow").** Propphy's standing-subscription framing:
*"Every time a new listing hits the market in [Neighborhood] that's similar to your home… you'll
know how fast homes are selling and for how much."* That is close to a description of our lake.

**N4 — HOME-IVERSARY / CLOSING ANNIVERSARY.** Pure date trigger on a past client. Trivial data,
and the crawled sources rate past-client nurture as the highest-response segment they have.

**N5 — REVIEW / TESTIMONIAL REQUEST**, 7–14 days after closing. Feeds B5.

**N6 — DEAL OF THE WEEK.** *"[CITY] Deal of the Week – Best value under [PRICE]"* with a "why it's a
deal" line. ⚠️ **The "why" is a comparative claim** — exactly the class the claim gate blocks unless
code computes it. Buildable only off a computed comp set, never off narrator prose.

**N7 — THE SEVEN PROSPECTING-LETTER TYPES WE HAVE NO EMAIL FOR:** renter conversion, expired
listing, FSBO, off-market "golden letter", investor solicitation, neighbourhood-agent introduction,
open-house preview (HousingWire 3–10, each with full copy). Several need lists we do not hold.

**N8 — SMS AS A PAIRED CHANNEL: NOT A BUILD, A COMPLIANCE WALL.** LeadSites pairs every email with a
text 30–60 minutes later and hands over templates for both. **TCPA requires explicit WRITTEN consent
— an existing relationship is not enough — plus 10DLC registration, quiet hours, and STOP handling.**
Recorded here so nobody proposes it casually as "just add SMS."

---

## 3.3 THE ACTORS. WHAT EACH ONE GETS, WHERE IT LANDS, AND WHEN IT IS ALLOWED TO RUN.

**Written 08/06/2026 on operator instruction:** *"list all of our actors and what they can get in
the playbook and where all that information is saved."* Read from code and the catalog, not memory.

### 3.3.0 THE LAW, BEFORE THE LIST

**Operator, 08/06/2026, correcting me:** *"we don't go paid on every fucking email. did you now read
the ladder?"* and *"we are only using actors for specific needs unless we don't have a lot on the
property"* and *"if a house sold, we have the fucking house in the lake 99 percent of the time."*

**HE IS RIGHT TO THE DECIMAL. MEASURED LIVE 08/06/2026:** of the **851 distinct sold addresses we
have watched close**, **848 carry a photo in our OWN free spine — 99.6%.** Not 99% as a figure of
speech. 99.6%, counted.

**So the order is, and there is no exception:**
1. **OUR LAKE.** A house that sold was on the market, so we watched it and we hold it. Photo,
   beds, baths, sq ft, list price, listed date — all free, all ours, already on disk.
2. **THE PAID ROW WE ALREADY BOUGHT** (`apify_property_records`) — a READ, not a call. Costs nothing.
3. **AN ACTOR CALL — only for a SPECIFIC missing need**, and only when we do not already hold most
   of the property. **Never as a routine step in an email build.**

**AN ACTOR IS NEVER A BUILD STEP.** I proposed exactly that — "this subject isn't in the paid store,
go get it for a penny" — and it was wrong twice over: it reached for lane 3 before checking lane 1,
and it would have required flipping the operator's own kill switch on every send.

**AND WHAT COMES BACK MUST BE LINKED, NOT PARALLELED.** A paid row pulled to fill one or two missing
fields JOINS the property we already hold. It never becomes a second record of the same house. The
hazard is documented and real: the two feeds spell the same street differently (`12554 Kellysands
Way` vs `12554 Kelly Sands Way`), which is why the read root carries a loose secondary key.

### 3.3.1 WIRED — AND THERE IS EXACTLY ONE

**`moving_beacon-owner1~realtor-com-property-scraper`** — `lib/listings/apify-comps.ts:278`, the
ONLY actor id in the codebase. **$0.01 per result.** Saved in the account as task
`sold-dated-area-pull` (08/10/2026) carrying the exact `buildActorInput` shape — 175 lifetime runs,
every one SUCCEEDED.

**WHAT IT CAN GET** (verified live 08/03/2026): sold price and last-sold date · beds · full baths
and half baths as SEPARATE fields · sq ft · lot sq ft · year built · stories · style · garage ·
HOA fee · the full MLS description · primary photo AND the whole alt-photo gallery (50 photos on
one home) · the realtor.com listing URL and permalink · status, MLS name and number, list date,
days on MLS, pending date · tax, assessed value, estimated value · agent and broker contacts.

**WHAT IT CANNOT DO — R1, and it is the expensive lesson:** *"`location` IS A SEARCH AREA. THERE IS
NO ADDRESS LOOKUP."* A street address is accepted, silently treated as an area centre, and **its own
record is not returned**; `radius` is ignored. `fetchApifyRecordForAddress` existed, billed one call
per comp for a guaranteed null, and was deleted. **Never build it again.**

**HOW IT IS DRIVEN:** an AREA plus an explicit `date_from`/`date_to` window — verified reaching
**14 months back**. That date-ranged sold pull is the recorded repair path for the price-zero
problem below.

**THE TWO LANES THAT CALL IT** (`apify-baths.ts`, `apify-identity.ts`) — the baths lane and the
identity lane. Both are gap-fillers on a specific missing field. Neither is an email build step.

### 3.3.2 RESEARCHED, NOT WIRED

**`one-api/realtor-property-scraper`** — ~$0.007/result, a TRUE per-property lookup. **CORRECTED
08/10/2026: `property_inputs` takes a PLAIN STREET ADDRESS — no detail URL needed.** Proven live:
run `MdWKQA4bKzH8uufrO` bought the Coming Soon demo house's 2,263-char MLS description, HOA and
photos off nothing but `"2287 Somerset Pl, Naples, FL 34120"`, and the row landed in
`apify_property_records` via `toRow`/`saveApifyRecords`. So the by-address lookup R1 says the wired
actor CANNOT do exists one rung over, cheaper. Still not wired as a code lane (comment-only in
`apify-identity.ts`); the proven input is saved as account task `property-by-address`. Its
`Raw.details.text` is the full ~3,000-character MLS description **on an already-sold home**.

**`swfl-market-pulse`** — an actor WE built and pushed (08/03/2026). It is an OUTBOUND distribution
experiment wrapping our own API. **It is not a data source and never fetches anything for us.**

**Tested and rejected:** 2 of 5 store actors probed were junk — one failed both runs, one returned
zero items. The fragile-source class. Do not re-shop them.

### 3.3.2b THE ACCOUNT IS THE RECORD — WHAT IS BUILT AND SAVED ON APIFY (counted live 08/10/2026)

Operator, 08/10/2026: *"are we not building and saving our actors in apify… make sure all actors
are built and the playbook reflects it."* Counted against the live Apify API, not memory:

- **Actors WE built: exactly ONE.** `rectangular_horn/swfl-market-pulse` (build 0.0.1 SUCCEEDED
  08/03/2026, ran once, SUCCEEDED) — the outbound experiment above. Every other actor is a store
  actor rented per result; there is nothing else of ours to "build."
- **Saved tasks: 3 — and they were ZERO until 08/10/2026.** Every prior call re-typed its input
  from code or an interactive MCP chat, which is why the account looked empty. Each task carries a
  PROVEN input copied verbatim from a successful billed run:
  · `sold-dated-area-pull` → the wired workhorse's dated-area sold pull (§3.3.1)
  · `property-by-address` → one-api single-address record buy (above)
  · `reddit-swfl-harvest` → 4 SWFL subreddits, top/month — the improvement-harvest lane
- **Run history: 247 runs across 27 distinct actors, lifetime.** The workhorse owns 175 (all
  SUCCEEDED). The rest are probe sessions with `origin=MCP` that left NO repo trace: the 08/03
  realtor shop, 08/04 + 08/10 Reddit, an 08/09 sweep of TEN email-finder/LinkedIn actors with no
  committed lane and no SESSION_LOG entry, and an early Facebook-Ads/Google-Ads-transparency/
  Maps-reviews research cluster. The account's own run log is the only record those happened.

**A saved task is a saved INPUT, not a wired lane.** Spend still exits ONLY through `runApifyActor`
under the guard (§3.3.4); the tasks exist so a proven shape is never re-invented and the account
shows what we actually use. **Instagram: shopped and RUN 08/10/2026** — the flagship
`apify/instagram-scraper` hashtag-SEARCH lane returned junk 5/5, `apify/instagram-hashtag-scraper`
worked first try; saved as task 4, `instagram-improvement-harvest` (7 tags × 30 posts ≈
$0.48/run, $0.0023/result). Findings + lane law:
`_RESEARCH/agent-behavior/2026-08-10-instagram-improvement-harvest.md`.

### 3.3.3 WHERE EVERYTHING LANDS — ONE TABLE

**`data_lake.apify_property_records`** — the ONE root for a full realtor.com record, keyed
`address_key` (normalised street + city). **44 columns. 383 rows live 08/06/2026** — 369 SOLD, 10
for sale, 3 pending, 1 null; primary_photo on 362, description on 358, sold_price on 380.

- **Write root:** `lib/listings/apify-record-store.ts` `saveApifyRecords`, called from INSIDE the one
  fetch root, so every lane persists without opting in.
- **Read roots:** `fetchCachedRecords(keys, maxAgeDays)` and `fetchCachedRecordLoose(street, city,
  days)` — the loose one exists because of the address-key drift above.
- **Consumer:** `fillFromPaidRecord` (`lib/listings/paid-record-lane.ts`), reached through the ONE
  subject resolver, so every listing email already reads it. It fills description, photos, baths,
  HOA, beds, sq ft, lot, year built and the listing URL — and **may never fill list price, status or
  days on market**, deliberately.

### 3.3.4 THE GUARDS — ALREADY UP, AND THEY ARE THE REASON A BUILD CANNOT QUIETLY SPEND

- **The paid lane is OFF BY DEFAULT.** `OPERATOR_APPROVED_PAID_RUN=1` or it does not spend.
- **A 300-result (~$3) per-process budget**, charged on the REQUESTED cap *before* the call — an
  uncapped request is priced as expensive, never as zero.
- **One choke point:** `runApifyActor`, below the seam every test injects, so no caller can route
  around it. Guard root: `lib/listings/apify-spend-guard.ts`.
- **A refusal is loud and NAMED, never a silent empty list** — this lane has two scars where a
  refusal was byte-identical to "this market has no houses."
- **A spend receipt reads what the VENDOR charged, never our own row delta.** Counting rows added
  reports $0.00 while $2.00 was billed, because re-buying the same houses adds nothing.

**Why the guards exist, in one number: $14.08 across 21 runs in one afternoon.** Seven acceptance
renders of ONE email, each buying a fresh area-month.

### 3.3.5 COMMENTARY OBEYS THE SAME LADDER — AND EMAILS ARE THE ONES BREAKING IT

**Operator, 08/06/2026:** *"AND WE HAVE A LOT IN /R/, AS WELL FOR COMMENTARY."* Now RULE 0.7b.

**The report pages serve baked, validated, cached prose.** `lib/narratives/store.ts` → `loadNarrative`
→ `NarrativeSections`, read by the corridor, housing, zip-report and `[slug]` pages. **Live count
08/06/2026: 121 baked narratives on hand — 53 zip, 41 brain, 27 corridor — freshest baked that same
day.**

**The email recipes read exactly ONE of them** (`lib/email/zip-seed.ts`). Every other recipe calls
the model LIVE on every build and rewrites from scratch. **Two consequences, both real:** the reports
read better than the emails, because baked prose cleared a validator and live prose gets whatever
that call produced; and every email build pays for text we had already written and already checked.

**It is the same defect as buying a photo we already own** — the paid rung reached for while the free
rung sat there. **A baked narrative covering your surface is lane 1. A live call is the FALLBACK.**
Before you add an LLM call to a recipe, look in `narratives` for that surface.

**AND A BAKE HAS AN AGE — CHECK IT, DO NOT ASSUME IT.** Measured 08/06/2026: of the 121 baked
narratives, **83 were baked that same day, but the rest trail back to 07/13/2026** — and all 121 came
from one model generation (`claude-sonnet-4-6`). So "baked" is not a synonym for "current." A surface
whose bake predates the data it describes is a STALE FALLBACK, not lane 1, and serving it silently is
the same class of error as a stale alarm. The bridge must compare the bake against the inputs it was
made from (`inputs_hash` and `baked_at` are both on the row for exactly this) and fall through to a
live call when it does not match — that fall-through IS the fallback this rule demands.

⚠️ **THE BRIDGE IS BEING BUILT RIGHT NOW BY A PARALLEL SESSION** —
`lib/narratives/area-email-inputs.ts`, with its research, design and plan already filed
(`docs/superpowers/plans/2026-08-06-precomputed-commentary-plan.md`). **Do not build a second one,
and do not edit those files from an email session.** This section is the law; that work is the wiring.

**Where Just Sold sits today:** its body copy is DETERMINISTIC (`readerLine`) and issues no model
call at all — so it is already compliant, by a different route. The recipes that still call live on
every build are the ones this applies to.
