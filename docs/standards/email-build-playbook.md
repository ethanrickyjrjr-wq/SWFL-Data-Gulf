# THE EMAIL BUILD PLAYBOOK — ONE FILE. START HERE. STOP OPENING SIX DOCUMENTS.

**Operator decree 08/04/2026, verbatim:** *"I want all the fucking rules on the build for the first
part at top. Font size, grid size, block sizes, spacing, all the fucking research for the look of
email that is universal. Any universal rules can go first. We will then list each individual email
one by one so it's easy to jump to the one you are looking for and don't have to read through all
things that don't pertain to the email you are building... stop fucking reading 6 documents and
fucking write it in one that we will add to."*

**How to use this file:** read PART 1 once — it applies to every email ever built here. Then jump
straight to your email's section in PART 2 and read nothing else.

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

# PART 2 — THE EMAILS, ONE BY ONE. JUMP TO YOURS.

Each section is self-contained. Read PART 1 once, then read ONLY your email's section.

**Every section carries: the TAG, the spine, the grid, the ingredients with their sources, the
fallback when a source misses, the chart policy, what the AI writes, the buttons, and the known
gaps.**

| Tag | Email | Section |
|---|---|---|
| `new-listing` | New Listing | 2.1 |
| `coming-soon` | Coming Soon | 2.2 |
| `market-comps` | Market Comps | 2.3 |
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

**Asking price · street · city · state · ZIP** — the free spine. 100%. No fallback needed.

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

**HOA FEE** — the paid row, **greater than zero ONLY.** 19 of 26 rows are non-null and **seven of
those are literally `0`**, so real coverage is 12 of 26. A vendor `0` is indistinguishable from a
field it never filled; rendering "$0/mo" is a fabricated figure. **A `0` is an OPEN SLOT.**

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
| **Asking price** | free spine (100%) | — | — | never misses |
| **City · state** | free spine (100%) | — | — | `Southwest Florida` (a field: `regionLabel`) |
| **Property type** | free spine (100%) | — | — | cell keeps its slot |
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

## 2.4 – 2.17 — TO BE WALKED

Each section gets written when that email is walked with the operator. **Do not pre-fill one from
memory or by copying 2.1, 2.2 or 2.3** — the whole point of the walk is that each email's
ingredients and sources get decided deliberately, one at a time.
