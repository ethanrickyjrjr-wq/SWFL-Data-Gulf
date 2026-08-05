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
root. **COVERAGE IS GOOD AND THIS CELL IS SAFE TO BUILD ON. Counted live 08/04/2026:** 34,904
listings, **31,825 real (91.2%)**, only **3,079 floored (8.8%)** — Lee 22,458 of 24,548 real
(91.5%), Collier 8,202 of 9,142 real (89.7%), list date present on 31,309.
**⚠ CORRECTION, and read this before you quote anything:** an earlier draft of this line said
"roughly half the book is a floor" and "Collier ~14% real." **Both were wrong by an order of
magnitude** — quoted from a trap note in `data-roots.md` dated 07/20/2026 instead of counted. The
backfill landed since. **RE-COUNT ANY COVERAGE CLAIM LIVE BEFORE SPEAKING IT, including from our own
docs.** A floored count is still never printed as a fact — but it is now the rare case, not the norm.

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
- **HOA fee — WE DO HAVE IT, already bought.** Counted live 08/05/2026 in
  `data_lake.apify_property_records`: 19 of 26 rows carry a non-null fee, but **only 12 are greater
  than zero**. **Serve `hoa_fee > 0` only.** A `0` is not "this home has no HOA" — it is
  indistinguishable from an unfilled vendor field, so rendering it as "$0/mo" is a fabricated figure
  (§1.14, NEVER a zero). A `0` is an OPEN SLOT. An earlier draft of this line said "no verified
  source" for HOA; that was wrong, and we had been paying for the field and never reading it.
- **Schools — no source, and that is now MEASURED, not assumed.** The bulk actor we actually run
  (`moving_beacon-owner1~realtor-com-property-scraper`) returns `nearby_schools` as the literal
  string `<NA>` on all 20 resolved rows. The *detail* actor (`one-api/realtor-property-scraper`) has
  never written a row here and is **UNPROBED** — do not claim schools in either direction until it
  is. Same for `tax_history`, `builder_name`, `list_price_min/max`: all `<NA>` × 20.
- Flood zone: **no verified source.** Do not claim we have it.
- **The full live census — column fill, all 71 raw keys, the 24 we pay for and never promote — is
  `docs/superpowers/handoffs/2026-08-05-EMAIL-HOMEWORK-COUNTED.md`.** Re-count before quoting it.
- **The fallback ladder is not written in code** — for this email or any other. Which source fills
  each ingredient when the first misses lives in this document and nowhere else yet. That is the
  next build.

---

## 2.2 – 2.17 — TO BE WALKED

Each section gets written when that email is walked with the operator. **Do not pre-fill one from
memory or by copying 2.1** — the whole point of the walk is that each email's ingredients and
sources get decided deliberately, one at a time.
