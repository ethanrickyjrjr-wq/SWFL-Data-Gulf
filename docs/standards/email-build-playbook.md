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


## 2.2 – 2.17 — TO BE WALKED

Each section gets written when that email is walked with the operator. **Do not pre-fill one from
memory or by copying 2.1** — the whole point of the walk is that each email's ingredients and
sources get decided deliberately, one at a time.
