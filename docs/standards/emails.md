<!-- ══════════════════════════════════════════════════════════════════════ -->
<!-- READ THIS FIRST. This is the ONE map of the email system.                -->
<!-- Written 07/19/2026 from code + SESSION_LOG, the day after "all emails    -->
<!-- broken." Every claim below was verified against the repo that day.       -->
<!-- File:line numbers drift — re-check them; the SHAPE is code-verified.     -->
<!-- ══════════════════════════════════════════════════════════════════════ -->

# EMAILS — the one map

**Who reads this:** anyone (agent or human) about to touch anything email — the lab, a recipe,
a template, a render engine, a send path, a schedule. `lib/email/CLAUDE.md` and
`lib/deliverable/CLAUDE.md` are the in-context convention digests; THIS file is the full picture
they point at.

**Update rule (same as data-roots):** every email postmortem, operator decree, or vendor-behavior
change lands HERE in the same session it happens. A map that lags one incident is how the next
session ships the same bug again.

**Sibling docs — don't duplicate them:**
- `docs/standards/deliverable-playbook.md` — the DOCTRINE (claim gate, recipe table, invention
  is claim-shaped not number-shaped). Deep reference; this map indexes it.
- `docs/standards/email-images.md` — image handling specifics.
- `docs/standards/data-roots.md` — which table feeds any NUMBER an email shows. Its authority
  picks are pending operator sign-off — treat as recommendations, verify before relying.

---

## 00. THE PICTURE — one pipe, five stops. Start here.

**Added 08/03/2026 by operator decree, verbatim: _"IS THERE A FUCKING PLAYBOOK WITH ALL THE RULES
FOR EMAILS AND WHERE TO ACTUALLY GO AT THE BEGINNING? ... DRAW A FUCKING PICTURE, A FUCKING MAP.
ALL EMAILS ARE THE SAME BASICALLY. WE FUCKING CODE THEM! HOW CAN THEY CHANGE?"_**

He is right: they cannot change, and they do not. **There is ONE pipe. Every email — every recipe,
every campaign, the lab, a blast, a digest — walks these five stops in this order.** If you think
you found a second way to build an email, you found a bug or a dead limb. Read this before §0.

```
     (1) RECIPE                  (2) PLAN                (3) THE SEAM
  lib/deliverable/recipes/    a flat list of        lib/email/doc/finalize-doc.ts
  <name>.ts                   entries — type,       finalizeDoc(plan)
  one file per email type     span, props.           - sorts into zones
  picks WHICH blocks and      NO x/y. NO             - groups into rows
  WHAT data fills them        positions. Ever.       - assigns EVERY position
           |                        |                - stamps the provenance mark
           +------------------------+---------------------------+
                                                                |
                                                                v
     (4) EmailDoc  -->  applyBrand()  -->  (5) renderEmailDocHtml()
     blocks[] each with      colors, logo,       lib/email/render-email-doc.ts
     {type, props, layout}   fonts, footer       -- the ONLY door to HTML --
                             lib/email/brand/              |
                                                           v
                                                     compileGrid()
                                                 lib/email/compile-grid.ts
                                                           |
                                                           v
                                                   table HTML  -->  SEND
```

**What each block LOOKS like is not decided anywhere above.** It is decided once, in the block
components (`lib/email/blocks/*.tsx`), and all eighteen of them import ONE type root:

```
  lib/email/blocks/scale.ts   <-  7 sizes | 3 weights | 8px grid | tabular-nums
                                  text(role) returns size+leading+weight TOGETHER
                                  an off-grid number is a COMPILE ERROR
```

**Five rules that make the pipe a pipe. Each is enforced by a red test, not by good intentions:**

1. **A recipe NEVER writes a position.** A `layout: {` literal in a recipe fails
   `design-system-reachability.test.ts`. Only the seam positions.
2. **The seam stamps every doc it returns.** A hand-assembled doc — however perfect it looks —
   fails `wentThroughSeam()`. Shape is trivial to fake; provenance is not.
3. **`renderEmailDocHtml` is the only door to HTML.** Never call `compileGrid` or the renderer pair
   directly. That divergence already shipped once: a blast sent grid docs through the free stacker
   while preview compiled them.
4. **Every block reads `scale.ts`.** Any path that emits HTML as a STRING cannot import it and is
   therefore wrong by construction — see the duplicate named below.
5. **Every number is sourced.** Four-lane, no invention. §0 and the deliverable playbook own this.

### There is ONE renderer, not two. (Corrected 08/03/2026 — the old wording misled a session.)

`renderEmailDocHtml` reads `isGridDoc(doc.blocks) ? compileGrid(doc) : render(EmailDocEmail(...))`,
and the comments around it still describe a "paid grid / free stacked" tier split. **That split no
longer exists in the build path.** `isGridDoc` is `blocks.some(b => b.layout != null)`; the seam
writes a `layout` on EVERY block; therefore every doc a recipe produces is a grid doc and the free
branch is unreachable from (1)→(5). It survives only as backcompat for docs saved before the grid
existed (`lib/email/__tests__/block-canvas-backcompat.test.ts`). Nothing strips layouts to
synthesize a free doc — there is no such call in the tree.

**Do not read the comments in `render-email-doc.ts`, `doc/types.ts`, or `doc/default-docs.ts` as
architecture.** They describe a tier the seam stopped producing. That is exactly how a session
reported "two engines" to the operator as live design on 08/03/2026.

### The ONE real duplicate — and it is not an email

`renderGroundedReport` (`lib/deliverable/grounded-report.ts`) serves the **public share page**
(`app/p/[id]/page.tsx`) and the **PDF print route** (`app/p/[id]/print/route.ts`). It predates the
block system and **emits HTML as a string**, so it can never import `scale.ts` — which is why its
frozen output measures font sizes 13/10/11/12/15/44px and weights 700/800/900 against a scale that
defines seven sizes and three legal weights (measured 08/03/2026 off
`lib/email/__fixtures__/golden/branded.html`).

`reportToEmailHtml` (`lib/email/activation/render.ts`) is its thin wrapper and has **ZERO live
callers** — only its own tests keep it compiling.

A convergence plan for exactly this merge exists and was abandoned half-done:
`docs/superpowers/plans/2026-06-16-deliverable-convergence/`. The spine was extracted and ten
goldens were frozen specifically to prove the collapse is behavior-preserving — then it was declared
green and left. The goldens are still there. **Finish it; do not start a third design.**

### Where to go, by what you're doing

- **Writing or editing a recipe, seed, template, or block** → §0 (the rules card), then §4 (the type
  scale), then the pipe above. Nothing else is required reading.
- **Changing how something LOOKS** → `lib/email/blocks/scale.ts` and the block component. Never a
  recipe.
- **Changing WHAT an email says or shows** → the recipe. Never a block.
- **Adding a send lane** → §6. Sending and building are separate systems; do not merge them.
- **An email is wrong in a real inbox** → §7, the failure catalog: every way this has actually
  broken, with the guard that now stops each.

---

## 0. BEFORE YOU CODE A RECIPE — the rules card

**Read this section before writing or editing any recipe, seed, template, or block.** Written
08/03/2026 by operator decree — verbatim: *"I'M TIRED OF GETTING DIFFERENT TYPES OF EMAILS BUILT.
ALL LOGO, CAN SPAM RULES EVERYTHING IN ONE PLACE THAT BUILDER SEES BEFORE CODING RECIPES."* Every
number below either states its source inline or names the executable root that owns it. **Where this
card and a code root disagree, the CODE ROOT WINS** — this card mirrors, it does not define.

Most of §0.1–§0.3 came out of `_RESEARCH/` (gitignored, invisible to Grep) and governed nothing
until it landed here. That is the same failure §4 documents about `app/_design/`.

### 0.1 Copy — how much, and shaped how

**Every number here is measured and cited. An earlier draft of this card carried a ~200-word target
from the operator; he threw it out himself (08/03/2026: *"don't use my numbers. if it says 95 word
is best, use that"*) and had the real figures crawled. Evidence beats the operator's own estimate —
do not reinstate a house number beside a sourced one.** Full evidence + the conflicts:
`_RESEARCH/email-and-social/2026-08-03-email-length-and-per-type-benchmarks.md`.

- **BODY LENGTH: 50–125 words.** Boomerang, measured on their own users' real sent mail — every
  length in that band returned a **response rate above 50%**. Their eyeball rule: 50 words is two
  short paragraphs; 125 words is two normal paragraphs plus a short one.
- **WHAT COUNTS: the agent's own copy only** — framing, argument, commentary, CTA. **TWO CARVE-OUTS,
  operator decree 08/03/2026, verbatim: *"if a home has a description of it, that does not count
  towards the word count. Also, if we talk about the community, that should not count toward the
  total."*** So:
  - **The property description does NOT count.** A sourced listing description is reference the
    reader chose to read, not persuasion they have to wade through.
  - **The community block does NOT count** (see §0.1c).
  - Everything else obeys the band. Do not use a carve-out as a pressure valve — you may not push
    the agent's own argument past 125 words by relabeling it "description" or "community."
- **The floor matters more than the ceiling, and it is the one people miss.** Going long is
  forgiving — 125 words → 500 words only drops ~50% to ~44%, and it stays flat out to ~2000 words.
  Going short is NOT: a **25-word email performs about as badly as a 2000-word one**, and a
  subject-only email with no body gets a response just **11%** of the time. Do not "tighten" a
  build below 50 words thinking shorter is always safer. It isn't.
- This band is why the 95-word datapoint already on the shelf holds: a 95-word email beat a
  170-word version by **+17% CTR** (Placester citing Marketing Experiments, single A/B test) — 95
  sits inside 50–125 and 170 sits outside it. Consistent, not contradictory.
- **≤3 images and ≤20 lines of text** produced the highest CTR across a 2M+-email sample (Placester
  citing Constant Contact). Mobile paragraphs run 3–6 lines.
- **ASK 1–3 QUESTIONS.** Emails asking one to three questions are **50% more likely to get a
  response** than emails asking none (Boomerang). Zero questions is the failure case; four-plus
  gives the gain back. This is the mechanism behind Real Geeks' "end with an open-ended question."
- **Write at a 3rd-grade reading level** — a **36% lift** in response over college-level prose and
  **17%** over high-school level (Boomerang). Shorter words, shorter sentences. This is a hard
  constraint on the fill model's register, not a stylistic preference.
- **Never write neutral.** Slightly-to-moderately positive OR slightly-to-moderately negative
  copy both drew **10–15% more responses** than fully neutral email (Boomerang). A flat recitation
  of figures is the worst-performing register available — which is exactly what an unguided data
  email defaults to.
- **ONE CTA per email. Never three.** Cross-platform finding, and the single most-repeated craft
  rule in the research.
- **The close pushes to a conversation, never ends on a number** (Rev Real Estate School asks for a
  call; Tom Ferry flips every stat back to the client; KCM closes on "start conversations").
- **Agent identity block sits at the TOP** — non-negotiable, confirmed independently at Zillow,
  Compass, and BoldTrail.
- **Universal 5-part skeleton** every platform converges on regardless of visual style:
  header/branding or greeting → context/value block → optional property/market data block → one
  explicit CTA → agent sign-off (name, phone, team/brokerage).
- **SUBJECT LINES — two different rules for two different jobs. Pick by what the email wants back.**
  An earlier draft gave one rule for both, which was wrong.
  - **Wants a REPLY** (agent-to-person: follow-up, check-in, CMA ask, anything inviting a
    conversation) → **3–4 words.** Measured on response rate, so MPP can't distort it (Boomerang).
    No subject line at all drops response to 14%.
  - **Wants an OPEN** (broadcast: market update, listing digest, newsletter) → **30–40 characters,
    clarity over cleverness** ("May Market Update" beats cute). Three independent sources agree.
  - Either way, the literal word **"Newsletter" correlates with WORSE open rates**; "Special,"
    "Update," "Bulletin" outperform it (Placester citing Adestra).
- **Open rate is directional only** post-2021 Apple Mail Privacy Protection (it pre-loads tracking
  pixels ecosystem-wide) — flagged by 3 independent sources. Weight CTR / reply / booked
  appointment. Never tune an email against open rate alone.

### 0.1b Campaign TYPE and cadence — what actually moves the numbers

GetResponse 2024 benchmarks, **4.4 billion messages sent in 2023** — the largest sample we hold.
Read these as RELATIVE comparisons within one panel (see the warning at the end of this block).

- **Triggered beats broadcast, and welcome beats everything.** Newsletter 40.08% open / 3.84% CTR ·
  triggered-automated 45.38% / 5.02% · **welcome email 83.63% open.** Direct product implication: a
  lifecycle send fired by a real event (just listed, price cut, just sold) should outperform the
  same content on a schedule, and **the first email after a signup is the single highest-value
  message we ever send** — treat it that way.
- **Newsletter cadence: 1 per week is the peak on every engagement axis** — 48.31% open / 5.71% CTR
  / 11.82% CTOR. Two per week: 43.2% / 4.73% / 10.95%. Three: 41.34% / 3.73% / 9.03%. The drop is
  steepest between 1 and 3.
- **Do not read unsubscribe rate as a cadence signal — it moves the WRONG way.** Unsub FALLS as
  frequency rises (0.25% at 1/week → 0.15% at 4/week) purely because intolerant subscribers have
  already left. Set cadence on CTR.
- **Drip/autoresponder cycles: engagement halves after the 2nd message.** CTR by cycle length —
  1 msg 29.39% · 2 msgs 26.69% · **3 msgs 12.98%** · 4 msgs 9.79% · 19+ 3.95%. A short sequence is
  not a lesser version of a long one; it is the better-performing one.
- **Real-estate industry row (2023): 42.71% open · 3.51% CTR · 8.23% CTOR · 4.86% bounce.** Two
  things to act on. The bounce rate is among the highest of any industry (all-industry average
  2.33%) — real-estate lists rot fast, so list hygiene is a real cost, and the same report shows
  the industry has the LOWEST double-opt-in adoption of any measured (3.46%). And the CTOR is
  LOW while the open rate is HIGH: real-estate email gets opened and then fails to earn the click.
  **That is a content problem, and closing it is the entire point of a sourced, locally-grounded
  email.**
- ⚠️ **NEVER promise a client an open or click rate, and never set an internal target from one.**
  Two reputable ESPs disagree ~2× on this same industry in both directions — GetResponse 42.71%
  open / 8.23% CTOR vs Campaign Monitor 21.7% open / 17.2% CTOR. Different panels, years, and
  bucketing. Relative comparisons inside one source survive; absolute levels do not. This is the
  no-invention gate applied to borrowed benchmarks.
- Send-day is a weak lever, not a strong one: best-to-worst open spans ~1.7 points (Monday 22.0%
  best, Sunday 20.3% worst; best CTR Tuesday). Don't build scheduling doctrine on it.

### 0.1c The community block — free of the word count, and a door back to the agent

Operator decree 08/03/2026, verbatim: *"we can also put a little about the community and a Find Out
More about this community button that leads to our page of that community or the actual community
page. A good call to action that shows clicks back to the agent."*

- **A little about the community, not a lot.** It rides outside the 50–125-word band, which is
  permission to include it — NOT permission to write an essay. Keep it to a short paragraph; the
  button is what carries the reader deeper, not the block.
- **Every community claim is sourced like any other fact.** The no-invention gate does not relax
  because the copy is about a place. `community-info.ts` composes its paragraph in CODE from the
  source's own sentences precisely so a model never decorates a neighborhood it has never seen —
  hold the same line anywhere community copy appears. User-facing citation for the vendor
  neighborhood tables is "realtor.com"; the vendor's name never appears in a built doc.
- **THE BUTTON: "Find Out More About This Community."** Link target, in this order — see §0.1d,
  which governs this and every other link:
  1. **The agent's own destination, whatever they saved in brand.** Their community page, their
     IDX/site, the community's own site — their call, not ours.
  2. **Ours only as the fallback** when the agent hasn't set one:
     `/r/communities-swfl/[community]`, or `/r/communities-swfl/n/[neighborhood]` for the
     neighborhood grain (index: `/r/communities-swfl`). These EXIST — 245 named vendor
     neighborhoods behind `lib/deliverable/recipes/community-info.ts`. Do not build a second
     community page.
- **THIS DOES NOT BREAK THE ONE-CTA RULE, and here is why — do not "fix" it either direction.**
  The primary CTA stays exactly ONE (contact/book the agent). The community button is not a
  competing ask; it is a click-tracked door that lands the reader back on the agent's surface.
  A future builder should neither delete this button as a one-CTA violation nor read it as licence
  for a third and fourth button.

### 0.1d LINKS BELONG TO THE AGENT — our site is not the destination

Operator decree 08/03/2026, verbatim: *"the agent can change all links and should be able to save
that in their brand. We don't want anyone coming to our site unless they need to or we are activly
marketing to."*

**We are white-label infrastructure the agent puts their name on. We are not a traffic destination.**
Routing the agent's own audience to `swfldatagulf.com` is a leak, and it quietly competes with the
person we are selling to. An earlier draft of §0.1c had this backwards — it made our community page
the "strongly preferred" target. That was wrong and is corrected above.

- **Default every link to the agent's destination.** Ours is the FALLBACK, used when the agent has
  not set one — never the preference.
- **Traffic to our site is legitimate in exactly two cases:** the agent deliberately chose our page
  as the destination, or we are actively marketing (our own outbound, our own funnel). Neither is
  the default for a client's send.
- **The agent can change any link and save it in their brand.** Their saved value wins over anything
  a recipe or seed hard-codes.
- **What the code does TODAY — know the limit before you promise it:**
  - Brand `website_url` sets both `WEBSITE_URL` and `CTA_URL`
    (`branding-to-tokens.ts`), and `applyBrand`'s button branch states the principle outright —
    *"Brand owns ordinary link destinations"* — rewriting any non-`mailto:` button URL to the brand
    CTA. An engine-set `mailto:` reply CTA deliberately survives; keep it that way.
  - ⚠️ **That is ONE GLOBAL override, not per-link control.** Every ordinary button in a doc is
    rewritten to the SAME `website_url`. An agent cannot yet give the community button one
    destination and a booking button another. It also means a community button pointed at our page
    is silently clobbered to the agent's homepage as soon as they set `website_url` — which is the
    right DIRECTION (agent wins) but not the control the decree asks for. Open:
    `brand_per_link_destination_overrides`.
  - ⚠️ **On non-Lab send paths none of this runs at all** — `applyBrand` is browser-only, so links
    stay whatever the engine set, i.e. OURS. The leak is worst exactly where nobody is watching.
    Open: `applybrand_no_server_side_caller`.
- **Building a new block with a link? Read its destination from brand with our page as fallback.**
  Never hard-code a `swfldatagulf.com` URL into a recipe, seed, or block as the default.

### 0.2 Type, spacing, grid — mirror of §4, `lib/email/blocks/scale.ts` is authority

**These numbers are RESTATED from §4 for reading order — this is a deliberate duplicate inside one
file, so it can rot.** §4 carries the provenance chain (doc → code root → enforced API); `scale.ts`
carries the truth. Changing any value below is a THREE-PLACE edit in one commit: `scale.ts` first,
then §4, then this list. All three or none — never patch this list alone.

- **Type scale (px), seven roles, there is no eighth:** hero 64 · h1 44 · metric 36 · h2 28 ·
  body 16 · caption 14 · mono 12. Density is `compact(role)` — ONE STEP DOWN the same ladder,
  never a second scale, never a new number.
- **Weights:** 600 display · 500 section-headers/emphasis/mono · 400 body. **Never 700/800.**
- **Leading:** display (28px+) 1.1 · body 1.55 · caption 1.4 — always unitless, never absolute.
- **Tracking:** −0.015em at display sizes · +0.06em on uppercase labels.
- **Spacing: 8px base grid**, tokens `0/4/8/12/16/24/32/48/64/96`, typed as a union so an off-grid
  literal is a COMPILE error. Card padding 24 · metric row 12 · table row 8. The 8pt-grid rule and
  its companion **internal ≤ external** (the space around an element ≥ the space inside it —
  Gestalt proximity) come from the 07/01 design-quality research (cieden.com, crawl4ai-verified).
- **`tabular-nums` on every figure** — `text(role, {numeric: true})`.
- **Never hand-type a px value in an email block.** Call `text(role)` — it returns size + leading +
  weight together, which is what makes the injected-24px line-height bug unreachable. A hand-typed
  size is the bug, not a style choice.
- **Canvas:** react-grid-layout · 12 columns · 600px email canvas · rowHeight 30 (advisory) ·
  margin [8,8]. Users pick width PRESETS (Full/⅔/½/⅓ = 12/8/6/4 cols).
- **Contrast (WCAG AA):** 4.5:1 functional text · 3:1 large text (18pt+, or 14pt+ bold) and icons ·
  3:1 between adjacent chart elements (1.4.11). Decoration exempt. `legibleInk()` guards every raw
  brand-ink site at render.
- **Scope limit (operator ruling 07/14):** the scale unifies RHYTHM, not appearance. Color, block
  order, and what a given template looks like stay per-template choices. "Consistent" does not mean
  "identical."

### 0.3 Render constraints — the base skeleton is not a free choice

From the 08/03 research, Part D (Litmus / Email on Acid / caniemail.com, 19 pages fetched live).
None of this was written down here before 08/03/2026.

- **Build the base layout in nested tables. Not div, not flexbox, not grid.** Outlook Windows
  (2007–2019) renders through the **Word engine** and shows NO support cell at all for
  `display:flex` / `display:grid` on caniemail. Ecosystem support is ~83% and the entire gap is
  Outlook Windows desktop — disproportionately what brokers on corporate email actually use.
  Flex/grid MAY layer on top as progressive enhancement; the skeleton underneath stays tables.
- **Any stat grid or property-card row uses fluid-hybrid**, not media queries alone: table at
  `width="100%"` + `style="max-width:600px"` + an MSO-conditional **ghost table** giving Outlook a
  fixed-pixel fallback. Plain side-by-side `<td>` stacking misaligns on Android with unequal column
  heights — that is exactly a 3–4-column stat row's failure mode.
- `role="presentation"` on **layout** tables only — leave it OFF a table presenting real tabular
  data. `cellpadding="0" cellspacing="0"` explicitly on every layout table. Cap nesting depth 4–6.
- **Set the HTML `width` attribute AND CSS width/max-width on every `<img>`** — Outlook ignores CSS
  image sizing. **ALT text is mandatory, not optional**: Outlook has images off by default, so ALT
  is the only pre-click signal.
- **Never size a `<div>` with CSS width/height and expect Outlook to honor it** — divs collapse to
  text-height/100%-width regardless. This is the entire reason ghost tables exist.
- **Dark mode is three different behaviors, not one.** Apple Mail: no change. Gmail mobile /
  Outlook Web / Outlook mobile: partial invert, addressable with `[data-ogsc]` / `[data-ogsb]`
  (repeat the attribute on EVERY comma-separated selector). **Outlook desktop Windows and Gmail
  desktop webmail: FULL invert with no coding workaround at all.** Ship both meta tags together
  (`color-scheme` + `supported-color-schemes`) plus a `prefers-color-scheme` block. **Never pure
  `#FFFFFF` or `#000000`** — multiple clients force-invert these even with `!important`; use
  near-white/near-black (`#FEFEFE` / `#0E0E0E`).
- **Gmail clips any message whose HTML/CSS source exceeds ~102KB.** Images don't count. The clip
  lands wherever the byte limit hits — it can sever an open `<table>` tag and break visible layout,
  not just truncate. **Target under 80KB**; ESP-injected tracking/footer markup adds bytes after
  your authoring is "done." Measure the ACTUAL sent HTML, not the source. Email-safe minifiers only
  (a generic one strips MSO conditionals and breaks Outlook).
- **SVG icons render as text in Outlook** — use the established fallback, never raw SVG.
- **Gmail does not support `<details>`/`<summary>`** — no client-side accordions. Compact by
  construction (count + link out).
- Charts ship as a **static image, one chart, not a dashboard** — never an HTML data table.

### 0.4 Logo

- **No paid logo vendor.** Logo.dev is on the kill list (§9). Custom social icons = keyless favicon
  → globe fallback.
- The brand logo enters through `applyBrand` (`lib/email/brand/apply-brand.ts`, `LOGO_URL` token)
  and renders in `HeaderBlock`. **A branded doc with a `COMPANY_NAME` but no `LOGO_URL` deletes the
  logo rather than falling back** — never ship SWFL Data Gulf imagery under someone else's brand.
- **A logo must survive uncontrolled full inversion** — Outlook desktop and Gmail desktop webmail
  invert with no workaround available. Give it a midtone color, a stroke, or a background shape.
  A pure-black wordmark on transparent becomes invisible in half the ecosystem.
- ⚠️ **LIVE CAVEAT, do not write this rule as if it holds today:** `applyBrand` is browser-only, so
  **any non-Lab send path currently ships unbranded** — no logo, no colors, no agent identity, and
  an empty CAN-SPAM footer address. Open defect: `applybrand_no_server_side_caller`.

### 0.5 CAN-SPAM — 4 requirements, not 3

A working opt-out · accurate headers · no misleading subject · **AND a valid physical postal
address** (business address, PO box, or mailbox service) in every commercial email. Corrected
07/02/2026 against Shopify's FTC-sourced guide; older docs said "3." The footer `address` field is
its home, populated from the brand profile's `business_address`; the lab nudges non-blocking when
empty. **No compliance lecture in product copy.** Same live caveat as §0.4 — the non-Lab send paths
ship that footer empty today (`applybrand_no_server_side_caller`).

### 0.6 Market-report / market-update emails — the content order

The most universal recurring email type across every platform scanned. Use this order (08/03
research, Part C synthesis — NAR, Keeping Current Matters, Rev Real Estate School, EmerickTech):

1. **One headline number, alone, first** — before any sentence (NAR leads with a bare `-2.4%`).
2. **One plain-English sentence translating it** — direction + why, no jargon.
3. **An authority interpretation line** — direct, not hedged into mush, never beyond the audited
   figure (the no-invention gate applies here exactly).
4. **Local grounding, one comparable-level cut** — new/sold/reduced comps with a link OUT to the
   properties, not a full inline data table. Cite the source.
5. **One static chart image** — not a dashboard, not an HTML table.
6. **A "what this means for you" line, segmented by recipient type** (buyer / seller / past
   client). EmerickTech's central complaint is exactly the generic unsegmented market email:
   *"It should not simply repeat market statistics."*
7. **A close that pushes to conversation** — never end on a number.
8. **A reporting-period stamp + the next-update date, stated plainly** — provenance and cadence in
   one line. Matches our as-of convention (MM/DD/YYYY, stated once).

Cadence follows the JOB, not a best-practice number: NAR's monthly mirrors a data drop (education);
Rev's weekly "Market Monday" is paced to seller anxiety during an active listing (maintenance).

### 0.6b ⛔ THE COMPS EMAIL — THE ONE RECIPE. There is no second one.

**Operator, 08/04/2026: *"Write the recipe as the only fucking one for comps."*** He asked for
this twice. Everything about building a comparables email is here: the data lanes, the photo rules,
the block order, the spend ceilings. `docs/standards/data-roots.md` keeps only the TABLE facts and
points here. Do not start a third document.

**C1 · THE COMP SET IS CHOSEN BY COMPARABILITY, THEN FILTERED TO PHOTOGRAPHED.**
Rank the pool with the size-band ranker (`compsForAddress` + `subjectDims` — hand it the subject's
own sqft/beds/baths or it silently falls through to the vendor's raw nearest-first slice, which is
how a $385,000 home got defended with $850,000 "comparables"). Filter: real home (beds AND sqft),
not the subject itself, sale not stale. THEN drop every comp we hold no photo for — operator decree,
*"Get rid of the no photo comps."* Dropped from the SET, not the table, so the median, the range and
the count all recompute on the rows the reader can see. **Floor: `MIN_PHOTOGRAPHED_COMPS` (2).**
Below it the full ranked set ships and the shortfall is logged loudly — a vendor outage must never
pass for a thin market.
⚠️ **The accepted cost:** photo coverage now selects the set, so it moves the median and the claim.
That was the operator's call, made with the trade stated. It is the one place this email lets
something other than the houses change the comparison.

**C2 · WHAT EACH ROW SHOWS.** Photo · price · $/sq ft · address · **beds · baths** · sq ft ·
sold/valued date · listing link. Baths are NOT optional — the ranker scores on them and the
operator's rule is *"SIMILAR SQ FT, STYLE, BEDS AND BATHS SAME OR CLOSE ... WE ARE FUCKING
COMPARING"*. Half-baths are real (2.5); never integer-format them, never print "0 ba".
Lake baths win; the vendor's fill the hole only.

**C3 · BLOCK ORDER, and it is not a free choice.**
`header → ribbon → hero photo → address + price → stat strip → DESCRIPTION → comps table →
narrative → agent card + ONE CTA → sources → footer`.
The listing's own description sits **directly below the property facts** (operator: *"Description
below property info"*) — it is the prose form of the numbers above it. It is RESERVED as an empty
slot at the head of the recipe's middle so the layout seam mints its coordinates; a block spliced in
afterwards carries no `layout` and sinks to `y = 1_000_000`, i.e. under the CTA and under the
sources line, which is exactly how it shipped on 08/04/2026.

**C4 · THERE IS NO CHART.** Operator, three times. A comparable set clusters by construction, so
bars of it are decoration — and swapping the bars' unit from price to $/sq ft is not a fix, it is
the same chart. The comparison already appears twice in plainer form: the strip's "$333 this home"
against "$212 comp median", and each comp's own $/sq ft on its row.

**C5 · TYPE, GRID, AND ONE GRAMMAR.**
Family follows the TYPE ROLE, never the block (`familyForRole`): display sizes (hero/h1/metric/h2)
take the display family, body/caption/mono take the body family. Two families, split by role — a
44px serif price above a 28px sans heading reads as an accident.
Stat-strip labels must fit ONE LINE in their own cell: five cells share 600px, so "$/Sq Ft — this
home" wraps to two lines while "BEDS" does not, and the row goes ragged. Keep them short.
Every row of a list shares ONE grid: columns belong to the LIST, not the row. A missing photo is an
empty cell, never a missing column, never a placeholder image.

**C6 · PHOTOS: WHERE THEY COME FROM.**
Cache first (`data_lake.apify_property_records`), then ONE dated ZIP pull per SALE MONTH, joined on
address. Never a per-address lookup — the vendor has none (see data-roots "THE APIFY RECIPE" R1).
Never an unwindowed ZIP sweep — it joins 0 of 6 by construction. No derivable sale window → buy
NOTHING. Ceilings: 200 results/month, hard stop 700 (~$7), and the Apify account's own
`maxMonthlyUsageUsd`. A property visual is that listing's own photo or it is nothing — no aerial,
no street view, no map tile, no placeholder (`no-aerial.test.ts` enforces it).

**C7 · A ZERO IS NEVER SELF-EXPLANATORY.** "No photos" / "the pull was capped" / "the vendor
refused" look identical in the HTML. Every lane that can return empty logs which one it was.

**C8 · HOW TO VERIFY — LOOK AT IT.** `bun scripts/email/campaign-sim.mts --only market-comps`, then
**open the built HTML and look**. Counting with `grep -o 'Listing photo of'` proves a tag exists; it
cannot see that a block is in the wrong place or that a table renders as two interleaved grids. Both
of those shipped to a real inbox on 08/04/2026 behind a green grep.

### 0.7 The rules that are already code — do not restate, call them

`scale.ts` (type/spacing) · `lib/brand/fonts.ts` (6 families, all engines) · `capabilities.ts`
(`FEATURE_ROUTING`/`FONT_ROUTING`, the tier dial) · `claims.ts` (the claim gate) ·
`assertHeroChartCoherence` (headline within ~3× the chart's plotted range) · `legibleInk` (contrast)
· `csv-escape.ts` (escape at EXIT) · `url-lint` · the SEED slot rule (§4 / `lib/email/CLAUDE.md`).
If a rule has a code root, the root is the answer — this card is the index, not a second copy.

---

## 1. THE 60-SECOND VERSION

1. **One build path — and since 08/02/2026 ONE LANE.** Every door carries a **recipe key** into
   `authorDoc()` (`lib/email/build-doc.ts`). The key is the identity — never the prompt string,
   never a regex over the prompt. A prompt-regex gate once silently killed 15 of 17 recipes
   (07/13). **Every build now lands on a coded-grid recipe:** a keyless/organic ask — and any
   builder miss — lands on the `default-grid` recipe (blank skeleton + sourced fill, open slots
   for the rest). The free author (model-composed layout) is DELETED. Typed asks may get ≤2
   **suggestion chips** ("Looks like Just Sold — use that grid?") — navigation-only links to
   recipe doors; the model proposes from the closed key list and can never route
   (`lib/email/suggest-recipe.ts`). The advisory prose registry (`author-recipes.ts`, 11 ids,
   keyword detection) is DELETED too — its editorial family survives as `voice-presets.ts`
   (explicit pick only; stale saved ids degrade to "plain"). The pick is CONSUMED (08/02, check
   `voice_presets_not_consumed` closed): `resolveVoice(recipeId ?? recipe.prose)` in
   `buildContentDoc`/`authorDoc` → `voiceSection` appended to `contentPatchSystem` (tone-only —
   the fixed-structure block rules always win). "plain" appends nothing, byte-identical;
   coded builders' own narrators (framing policy, no-numbers letters) deliberately ignore it.
   End-to-end guard: `lib/email/voice-wiring.test.ts` fails if a pick stops changing the
   fill model's prompt.
2. **The subject is resolved from OUR lake first.** `resolveSubjectListing`
   (`lib/listings/resolve-subject.ts`) reads `data_lake.listing_dom` before any vendor call.
   The vendor's exact-address lookup DIED silently on 07/19 and every address email shipped
   empty. Never wire a vendor lookup for data the nightly sweep already lands.
3. **Drive the builder — never hand-author.** Fill-with-AI pulls LIVE web data; retyping its
   numbers, "fixing" its output by hand, or overriding a fresh web value with a staler held one
   IS the invented number the moat forbids (operator blowup 06/28).
4. **Nothing silent.** A recipe build that fails validation must be LOUD (it now is —
   `console.error` in the dispatcher), a resolver miss must ask for the link/photo — never
   render the placeholder grid, never invent, never refuse the build (RULE 0.7).
5. **Three render engines** disagree with each other (free-tier email / grid-tier email / PDF).
   Any font or block-style change must touch ALL THREE. §5.
6. **The design system is CODE, not taste.** Every font size, weight, line-height, and spacing
   value comes from `lib/email/blocks/scale.ts` (`text()`, `label()`, `statRole()`) — the
   executable form of the researched `app/_design/05-color-and-type.md`. Hand-typing a px value
   in an email block is the bug, not a style choice. §4.
7. **Send lanes are separate systems.** Blast (segments) ≠ digest broadcast (audiences) ≠
   outreach ≠ cold email. Don't merge them. §6.
8. **Builds are free; SEND is the paywall** (watermark only, no Stripe on creation).

### THE CUT — 07/19/2026, operator decree: ONE email system (EmailDoc/authorDoc)

Executed same day:
- 🟢 `/api/email-lab/render` is **EmailDoc-only** — the legacy `{template, tokens}` branch is
  DELETED (its last poster, `components/email-lab/parked/classic-templates.ts`, deleted with it).
- 🟢 Blast route sends **block-canvas only** — the grounded token-template fallback is gone;
  a docless deliverable gets 422 `legacy_deliverable_rebuild_in_lab`. Email SENDING now has
  exactly one render root: `renderEmailDocHtml`.
- 🟢 All run outputs live under gitignored `runs/` (campaign-out, insiders-runs, outreach-runs,
  weekly-read-runs — writers + weekly-read.yml repointed).
- 🟢 **The scheduler worker is EmailDoc-only** (same-day rip): the digest / grounded-report /
  scoped / token-template lanes are DELETED from `scripts/email/run-schedules.mts` — the two
  keepers are the sequence one-shot (frozen doc) and the block-canvas occurrence (fresh
  re-build). A legacy row now throws a loud per-row error until re-linked to a saved Email Lab
  design. `lib/email/scoped-content.ts` + `lib/email/recurring-report.ts` DELETED
  (`resolveReportZip` relocated into `lib/deliverable/schedule-recipe.ts`, its one consumer).
- 🟢 The digest GENERATOR island is **DELETED** (07/19, on the operator's word): `build-digest` /
  `fetch-digest-data` / `hero-tokens` / `freshness-preflight` / `DigestEmail.tsx` / `log-io`
  (+ all their tests) + the disabled `daily-email-digest.yml`. Deliberately KEPT:
  `scripts/email/types.ts` (theme root — `SWFL_THEME`/`BrandTheme` feed live templates, outreach,
  and the social rasterizer) and `setup-digest-segment.mts` (provisions the Resend segment the
  broadcast route still uses as its default audience).

Staged (open checks — the map is wrong the day these close if it isn't updated):
- 🟡 `email_prospect_seed_block_canvas` — `lib/prospects/open-project.ts:29` still SEEDS new
  legacy `template:"email"` rows from the prospect-claim funnel.
- 🟢 `grounded_report_out_of_email` — DONE 07/19: `grounded-report` relocated to
  `lib/deliverable/grounded-report.ts` (+ both tests), all importers repointed; `lib/email`
  keeps only the activation wrapper (`activation/render.ts`) over the spine.
- 🟢 The site-footer daily-digest signup is CUT (07/19, closes `footer_dead_digest_cta`) —
  the capture component is renamed `SubscribeCapture` with NO product defaults (its one live
  instance is the zip-report weekly-read capture). `/api/email/subscribe` stays (broadcast
  list enrollment) but now has NO UI poster — product call tracked in
  `general_email_list_no_signup_surface`.
- 🟡 `web_chart_lib_consolidation` — recharts (6 files) + echarts (2 files) are WEB chart
  surfaces (zero imports inside lib/email); port to the bklit/visx kit, then drop both deps.
- Note: `/api/templates/render` + `lib/templates/render-html-template.ts` are the **viz-template
  showcase** (a WEBSITE surface, `/showcase` previews) — not part of the email system, not in
  this cut. `lib/email/templates/charts` stays: it feeds the LIVE social/og rasterizer.

---

## 2. THE PIPELINE — how an email actually gets built

```
DOOR                      IDENTITY                 BUILD                        AFTER
homepage hero  ─┐   lib/lab-entry/          authorDoc()                  applyBrand overlay
campaign btn   ─┼─→ destination.ts +   ─→   lib/email/build-doc.ts  ─→   (client-side)
showcase       ─┤   arrival.ts              recipe lane │ default grid        │
lab pick       ─┘   (?recipe=<key>)              │                        3 render engines
seed card ──→ same skeleton, unfilled       resolveSubject                    │
                                            (lake-first)                 send lanes / PDF
```

**Step by step, with the owning file:**

1. **Doors** — `lib/lab-entry/destination.ts` (URL builders) + `arrival.ts` (pure `planArrival()`:
   which doc, which popups, whether to auto-build). EVERY navigation into the lab goes through
   these; `destination.static.test.ts` fails the suite on any raw `/email-lab` nav string. A
   recipe arrival opens the BLANK skeleton (`skeleton-clean-white`) — never the fake-fill demo
   doc. The generic on-mount auto-build is dead (it built the wrong-listing email).
2. **Identity** — `lib/deliverable/recipes.ts` = THE root for what a recipe IS. `RECIPE_KEYS`
   (15 keys as of 08/02/2026 — count the file, don't trust this number later): the 7-recipe
   listing lifecycle (new-listing → just-sold, ONE shared address spine + resolver), 5 area/agent
   recipes (ZIP/city/agent spine — never force the flyer on them), `default-grid` (the terminal
   fallback every keyless ask lands on), 2 social. Each recipe declares
   `positioning: "sell-side" | "story-side"` and a `ChartPolicy`. Parity across every surface is
   enforced by `recipes.parity.test.ts`.
3. **Dispatch** — `authorDoc()` resolves `recipeByKey(recipeKey) ?? recipeFromPrompt(prompt)`,
   and since 08/02/2026 a null resolve lands on `RECIPES["default-grid"]` (one lane — no free
   author to fall to; the legacy subject-listing flyer lane still catches keyless listing-shaped
   asks first). The default grid fills the blank skeleton through `fillSkeletonFromSources` —
   the SAME fill core `buildContentDoc` uses. The address reaches the builder from the scope
   FIELD or the PROMPT TEXT (the lab's campaign button seeds only text) — the builder decides,
   never the door.
4. **Subject resolution** — `resolveSubjectListing()` in `lib/listings/resolve-subject.ts`.
   Lane 0 = LAKE-FIRST (`listing_dom` authority view: house-number + ZIP narrow fetch, canonical
   street match, zero vendor quota). Vendor address-slug + ≤800-row city scan are FALLBACKS only
   (the slug lane is functionally dead — §8). There is ONE resolver; never write a second.
   A miss returns the "paste your link or add a photo" ask — an honest gap, never a placeholder.
5. **Recipe builders** — `lib/deliverable/recipes/*.ts` (per-key builders; prose prompts like
   `authorListingNarrative` live in `recipes/shared.ts`; `FAVORABLE_FRAMING_POLICY` is pasted
   verbatim into exactly THREE prompts — see `lib/deliverable/CLAUDE.md` for which, and which
   two must NEVER get it).
6. **Skeletons / seeds** — `lib/email/doc/default-docs.ts` (`SEED_DOCS`). **THE SLOT RULE:**
   a field whose right answer depends on real data stays EMPTY (`""`) with the instruction in
   the label — `docSkeleton` skips empty fields, so empty = open slot the AI fills, filled =
   "the current answer" it may keep. A label is an instruction, not a caption.
   Playbook: `docs/superpowers/specs/2026-07-08-seed-slot-playbook-handoff.md`.
7. **Validation** — `EmailDocSchema` (`lib/email/doc/schema.ts`) — **strip-mode**: a new prop
   missing from its `*PropsSchema` is silently dropped on every save/load/AI-fill. Every new
   prop gets a schema entry + round-trip test. An invalid recipe build logs a LOUD error and
   falls back to the DEFAULT GRID (a real coded-grid email with open slots — never a refusal,
   never camouflage; the generic author it used to fall to is deleted).
8. **Truth gates** — `lib/deliverable/claims.ts` (CODE computes every comparison/count/ordering;
   the narrator receives settled sentences — invention is CLAIM-shaped, not number-shaped:
   playbook Part 1–2), `gateNarrative` (`lib/deliverable/build.ts`, the no-invention output
   lint), `narrative-lint.ts`, `assertHeroChartCoherence` (`lib/deliverable/chart-coherence.ts`
   — headline within ~3× of the chart's plotted range; CI over every seed + soft at runtime),
   `lib/email/voice-guard.ts` (product voice — NOT the operator's personal ricky-voice skill).
9. **Charts** — `buildChartForQuestion` (`lib/email/build-doc.ts`). Every plotted number is
   REAL (four-lane); the model selects points, never writes a number. `ChartPolicy` per recipe:
   a chart ONLY when the deliverable is ABOUT a number, about the SUBJECT. Empty chart slot =
   drop the slot. Seeds never author charts — reserve an `image` block; `upsertChartBlock`
   replaces it.
10. **Brand overlay** — runs client-side AFTER authoring. TWO files exist:
    `lib/project/apply-brand.ts` (project side — stamps project tokens like `HERO_LABEL`) and
    `lib/email/brand/apply-brand.ts` (email side). **An overlay fills BLANKS; it never
    overwrites authored content** — `HERO_LABEL` clobbered the authored listing address on
    07/19; the fix (fill only blank/house-default labels) is pinned in `apply-brand.test.ts`.
    Read both files before touching brand behavior.
11. **Save model** — `use-autosave.ts` (5s debounce + `pagehide` keepalive; an empty prompt
    never wipes the stored build prompt) + `use-leave-guard.ts`. Canvas shell:
    `components/email-lab/EmailLabGridShell.tsx` — it surfaces schema-parse failures in both
    build paths (they used to be SILENT; 07/19 fix).

---

## 3. WHERE THINGS LIVE — the component map

| Concern | ONE root | Never |
|---|---|---|
| Recipe identity | `lib/deliverable/recipes.ts` | restate skeleton values there |
| Lab entry/arrival | `lib/lab-entry/` | raw `/email-lab` URLs anywhere |
| Skeletons/seeds | `lib/email/doc/default-docs.ts` | fill data-dependent slots |
| Build engine | `lib/email/build-doc.ts` (`authorDoc`) | a second build path |
| Subject resolver | `lib/listings/resolve-subject.ts` | a second resolver |
| Doc schema | `lib/email/doc/schema.ts` | a prop without a schema entry |
| Tier dial (free/paid) | `lib/email/lab/capabilities.ts` (`FEATURE_ROUTING`/`FONT_ROUTING`) | hardcoding a tier diff in a component |
| Social platform list | `lib/email/social/platforms.ts` (8 display) | confusing it with the 5 PUBLISHABLE channels (`lib/social/channels/index.ts`) |
| Contact segmentation (blast) | `lib/email/segments/` → `contact_segments` | merging with `email_audiences` |
| Audience cache (digest broadcast) | `lib/email/audience-sync.ts` → `email_audiences` | merging with segments |
| CSV export escaping | `lib/email/csv-escape.ts` (escape at EXIT) | sanitizing contacts on import |
| Charts in deliverables | `buildChartForQuestion` | a model writing a number |

**Socials = TWO unwired systems.** `lib/social/` is a complete publish/schedule engine (OAuth,
5 channel adapters, cron, `SOCIAL_PUBLISH_ENABLED` dry-mode default, resvg PNG rasterizer);
`lib/email/social-calendar/` is the lab's Generate-Week (EmailDoc cards, paid-only). The seam
is `SocialModel` vs `EmailDoc`. Confirm which system you're in before building.

---

## 4. THE DESIGN SYSTEM — fonts, sizes, spacing, and where every number came from

The visual rules were **researched for days, written into `app/_design/`, committed — and then
read by ZERO CODE**, because they lived in markdown and markdown cannot be imported. Measured
07/14/2026, before the executable form existed: 17 distinct font sizes in use where the scale
defines 7 · 30 fontWeight declarations, ZERO compliant · `tabular-nums` (required on every
numeric cell) used ZERO times · ~30 text nodes with no lineHeight, silently inheriting
@react-email's injected ABSOLUTE `lineHeight: 24px` — a 36px stat clipped into a 24px box was
the mechanical cause of "the emails look uneven." The lesson is structural: **research that
lives only in a doc does not govern anything; it must become a typed code root that makes
violations uncompilable.**

**The provenance chain — doc → code root → enforced API:**

| Layer | Source doc (the research) | Executable root (what code reads) |
|---|---|---|
| Type scale, weights, leading, tracking, spacing tokens | `app/_design/05-color-and-type.md` | `lib/email/blocks/scale.ts` — every constant cites its doc line |
| Shared weights (email + social) | social-design-root handoff 07/14 | `lib/brand/weight.ts` |
| Fonts (6 families, all engines) | brand-tokens-one-root spec 07/02 | `lib/brand/fonts.ts` — stack + webfontUrl + pdf built-in + canvas face per family; `font-parity.test.ts` |
| Canvas geometry | render-stack research 06/28 | `lib/email/grid-schema.ts` |
| Style atoms / section padding | scale.ts | `lib/email/blocks/styles.ts` (`PAD_Y`, `MUTED`, `BORDER`) |
| Contrast / legible ink | ink-fence spec+plan 07/09 (WCAG floors) | `lib/email/blocks/on-dark.ts` (`legibleInk`); math from `lib/charts/palette.ts` (ONE root) |
| Unbranded seed palette | — | `lib/email/doc/skeleton-style.ts` (`NEUTRAL_SKELETON_STYLE`, grayscale — never ship SWFL navy/teal on an unbranded seed) |
| Brand → tokens | brand-tokens-one-root spec 07/02 | `lib/email/brand/branding-to-tokens.ts` + `apply-brand-style.ts` |
| Charts | `app/_design/07-charts-and-dataviz.md` + taskC chart-type verification 07/01 | `lib/email/templates/charts/chart-defaults.ts` |

**The numbers themselves (from `scale.ts`, which cites `05-color-and-type.md` per line):**
- **Type scale (px):** hero 64 · h1 44 · metric 36 · h2 28 · body 16 · caption 14 · mono 12.
  Seven roles. There is no eighth. A "compact" variant is `compact(role)` — ONE STEP DOWN the
  ladder (operator ruling 07/14: density is a variant, never a second scale, no new numbers).
- **Weights:** 600 display · 500 section-headers/emphasis/mono · 400 body. Never 700/800.
- **Leading:** display (28px+) 1.1 · body 1.55 · caption 1.4 — always unitless, never absolute.
- **Tracking:** −0.015em at display sizes · +0.06em on uppercase labels.
- **Spacing:** 8px base grid, tokens `0/4/8/12/16/24/32/48/64/96` — typed as a union, so an
  off-grid literal is a COMPILE error. Card padding 24 · metric row 12 · table row 8.
- **Numerics:** `tabular-nums` on every figure (`text(role, {numeric: true})`).
- **The API rule:** `text(role)` returns size+leading+weight TOGETHER — you cannot pick a size
  and forget the line-height; the injected-24px bug is unreachable. `statRole()` is the
  importance dial (primary > default > muted, monotonic at every density). `lines(role, n)`
  derives reserved heights — never hand-type a `minHeight`.
- **Scope:** scale.ts unifies RHYTHM, not appearance — color, block order, and what a template
  looks like remain per-template choices (operator ruling 07/14).

**Fonts (policy operator-locked 07/02):** progressive enhancement, auto-safe, no toggles. The
email-safe `stack` is ALWAYS inline; `webfontUrl` is an additive `<Head>` link (~24% of clients
honor @font-face, per caniemail); Outlook is pinned to the stack via `[if mso]` (its @font-face
bug otherwise lands on Times New Roman). Six families; `Record<FontFamily, …>` + `FONT_ROUTING`
(`lib/email/lab/capabilities.ts`) mean a new font cannot ship without a complete entry AND a
tier route.

**Canvas (from the 06/28 render-stack research, values re-verified against vendor docs
in-session that day):** react-grid-layout v2.2.3 · 12 columns · 600px email canvas · rowHeight
30 (advisory — email height is content-driven) · margin [8,8]. Users pick width PRESETS
(Full/⅔/½/⅓ = 12/8/6/4 cols) — the 12-col grid is internal plumbing. `isGridDoc()` (any block
with a `layout`) is what routes a doc to the grid renderer vs the free-tier stack. NOTE: a
07/06 gridstack-migration plan exists in `docs/superpowers/plans/` but gridstack is NOT in
`package.json` — the canvas is still react-grid-layout; treat that plan as not-current.

**Contrast:** WCAG floors 4.5:1 functional text · 3:1 large text (18pt+/14pt+bold) and icons;
decoration exempt. `legibleInk(preferred, bg, floor)` guards every raw brand-ink site at
render; a low-contrast saved palette warns (non-blocking) — saves never blocked, colors never
rewritten.

**Render-stack decisions from the 06/28 research — settled, do not re-evaluate:** react-email
compiles blocks to table HTML (MJML REJECTED — same model, extra binary); Photopea is the
in-browser photo editor (free, iframe, no key); Craft.js for editor state; Graphite is a
design-side SVG tool only (no data injection for 12–18mo); Inkscape is GHA-only (no desktop
binaries on Vercel); GIMP, SendGrid/Twilio, Beefree, Easy Email, Litmus all rejected —
reasons in `docs/superpowers/specs/2026-06-28-email-lab-ai-design-research.md` §8.

---

## 5. RENDER — three engines that disagree

**CORRECTED 08/03/2026 — the old wording of this section said "THREE independent engines" and a
session read it back to the operator as live architecture. It is not. Live email has ONE renderer.
See §00 for the verification.** What follows is the honest list: one live engine, one backcompat
limb, one separate output format.

An `EmailDoc` reaches HTML through `renderEmailDocHtml` and nothing else. A font or block-style
change must still be checked against the PDF, which is a genuinely separate renderer.

1. **Grid email — THE live engine** — `lib/email/compile-grid.ts` (`compileGrid`), used whenever
   ANY block has a `layout`, which is every doc the seam produces. This is the email path.
2. **Free-tier stacker — BACKCOMPAT ONLY, not reachable from a recipe** —
   `lib/email/blocks/EmailDocRenderer.tsx` (`@react-email`). Runs only for a doc where NO block
   carries a `layout`, i.e. rows saved before the grid existed
   (`lib/email/__tests__/block-canvas-backcompat.test.ts`). No code strips layouts to produce one.
   The 06/29 empty-`<Head>` font gap is FIXED (verified 07/19): both email engines build their head
   from the SHARED `lib/email/blocks/email-head.ts` (`emailHeadChildren` + `msoFontPin`) — keep it
   that way; never hand-build a `<Head>`.
3. **PDF** — `lib/pdf/email-doc-pdf.tsx` (`@react-pdf/renderer`, separate `PdfBlock` switch,
   built-in fonts only unless `Font.register` from a pinned CDN URL — `public/` is not in the
   Vercel lambda fs; unresolved variants THROW).

**Outlook:** SVG icons render as text — use the established fallback, never raw SVG.

---

## 6. SEND — the lanes (separate systems, don't merge)

- **One-off blast** — `ContactPickerModal` → `POST /api/deliverables/[id]/blast`, recipients
  from `contact_segments` (`lib/email/segments/`). Attribute/engagement conditions are
  paid-only, enforced server-side in every `/api/segments*` route. **Block-canvas only**
  (07/19 cut): a deliverable without an EmailDoc gets 422 — rebuild it in the lab.
- **Recurring digest broadcast** — `email_audiences` (tag → Resend segment id cache,
  `lib/email/audience-sync.ts`). Different table, different send path from blast.
- **Outreach** — `lib/email/outreach/` (campaign/send/recipients).
- **Cold email** — SETTLED 07/17: separate NON-Resend provider + separate domain; opt-out
  compliance already built. The 21k DBPR prospect list is PARKED outside the repo until the
  operator lifts it. Do not re-raise the legality objection; only provider wiring remains.
- **Schedulers** — `email-scheduler.yml` (multi-tenant, */15 cron) is LIVE but all
  `email_schedules` rows are paused as of 07/16. The worker (`run-schedules.mts`) is
  **EmailDoc-only** since the 07/19 rip — frozen sequence one-shots + block-canvas
  occurrences; legacy rows error loudly. `daily-email-digest.yml` is DELETED (07/19) — §9.
- **Sender** — verified `hello@swfldatagulf.com` via Resend (`RESEND_API_KEY` in `.env.local`
  + gh secrets). Resend has NO native A/B; DMARC gap noted 06/27.
- **CAN-SPAM = 4 real requirements** (corrected 07/02 — it was wrongly "3" in older docs):
  working opt-out, accurate headers, no misleading subject, AND a valid physical postal
  address in every commercial email. The footer `address` field is its home (from the brand
  profile's `business_address`); the lab nudges non-blocking when empty. No compliance lecture
  in product copy.
- **Paywall** — builds free (watermark only); send is the paywall.
- **Test recipients** — operator inboxes ethanrickyjrjr@gmail.com + allstatecoop@gmail.com.
  `allstatecoop@gmail.com` is a FULLY FICTIONAL demo account: never treat as a real client,
  never send it anything externally-visible.

---

## 7. THE FAILURE CATALOG — why emails have actually broken

Every entry is a class of bug, not just an incident. Check your change against each class.

- **07/20 — the operator received "Under Contract" THREE TIMES, and a formula footnote shipped
  to a real inbox.** Both found by the campaign simulator (§6, `scripts/email/campaign-sim.mts`)
  on its first live run. (1) THREE concurrent sender processes ran the same campaign: the agent
  harness reported two background runs as killed/stopped, the `bun` processes SURVIVED and kept
  sending on their original cadence, and a "resume" was started on top of two live senders.
  Deliverable rows are the proof — `under-contract` built at 20:04:12 AND 20:04:13, one second
  apart, plus a third at 20:15; stages 4–7 each sent 3×. The run-state file did NOT prevent it
  because the duplicate-send guard was read ONCE at startup: that defends re-running a FINISHED
  campaign, not two live processes, and all three held a snapshot taken before the others acted.
  Fix: a PID+heartbeat lock that refuses a second live sender, AND a re-read of run state from
  disk in the moment before each send (the real net — it survives a stale or forced lock).
  (2) `specFootnote` emitted "*Computed from list price ÷ listed square footage." under every
  lifecycle spec strip. Killed by operator decree: $/sq ft is the most self-evident derivation in
  residential real estate and BOTH OPERANDS SIT IN THE SAME STRIP, so the sentence was a developer
  narrating a formula. The surviving rule: **a derived cell earns a note when the derivation is
  NON-OBVIOUS or could be MISREAD** — price-reduced's "previous price = ask + reduction on record"
  (uncheckable from the page) and just-sold's "$/Sq Ft is the SALE price ÷ sq ft" (distinguishes it
  from the list-price version) both keep theirs. CLASSES: *a concurrency guard read once at startup
  is not a concurrency guard — re-read the authority immediately before the irreversible act; a
  reported process kill is a claim, not a fact; provenance is for numbers the reader CANNOT check,
  and explaining arithmetic they can do in their head reads as a spreadsheet export, not an agent.*
  META-CLASS, and the reason this entry exists at all: *the sends were verified against the
  program's OWN state file and declared correct. The inbox — the only authority on what a
  subscriber received — was never checked. Verify a send against the recipient, never against
  your own record of having sent it.*

- **07/19 (fixed 07/20) — sources "accordion" shipped as a wall of text in Gmail; baseline +
  next email were ~99% identical.** Three defects, one inbox review: (1) SourcesBlock's
  `<details>` accordion — Gmail REPLACES `<details>/<summary>` with `<u></u>` (caniemail,
  verified in-session), so the closed accordion rendered permanently expanded; a code comment
  claiming "Gmail honors <details>" was wrong. Fix: email render is compact BY CONSTRUCTION —
  one "Sources (N) — view all" line linking to the report's `#section-sources` (`viewAllUrl`
  prop); the accordion stays canvas-only. (2) The baseline welcome shows ALL current area
  events, alerts bypass cadence, and lifecycle bursts re-fire from the same weekly counts —
  so the next day's "alert" restated the welcome. Fix: every confirmed send stores each shown
  event's `eventKey()` on the subscriber row (`last_event_keys`, migration 20260720); the next
  alert/weekly EXCLUDES them ("nothing_new" reported skip). (3) The heat leaderboard ranked 0
  of 19 areas — momentum needs the PREVIOUS 30-day sold window and the lake's transition
  history starts 07/02, so demanding all four components blanked the block. Fix: a component
  NO area holds drops from the formula for everyone (weights renormalize); a component SOME
  areas hold keeps the strict exclusion. CLASSES: *an email client is not a browser — verify
  interactive HTML per client, not per spec; content-identity dedupe must survive cadence
  bypasses; an all-or-nothing input rule on a young lake silently blanks features.*

- **07/19 — the inventory card served a MONTH-OLD vendor snapshot as "homes for sale now"** (Redfin
  end-of-month 639 for 33908 while realtor.com's public page showed 1,153 — and our own daily sweep
  held 918 the whole time). Labeling the vendor on the card was tried first; operator killed that:
  fix the ROOT, not the caption. `active_inventory` primary now reads `active-listings-swfl`
  (`listing_active_stats`, our daily realtor.com sweep — the data-roots authority) across the ZIP
  page, weekly-read/zip-seed cards, and activation emails; Redfin demoted to a labeled monthly
  cross-check in the rail. CLASS: *when a fresher root we already hold covers the concept, serving
  the staler vendor is a defect — repoint, don't relabel. data-roots names the authority; consumers
  must actually read it.*
- **07/19 — "ALL EMAILS BROKEN" (empty skeleton, `applied: true`).** The vendor's exact-address
  search slug silently degraded to the bare city feed → every address-spine recipe resolved no
  subject → honest empty grid shipped with a 200. Root fix: lake-first resolver (§2.4).
  CLASS: *vendor behavior drifts silently; a lookup for data we already hold is a defect;
  a "success" response with empty output must be surfaced, not returned.*
- **07/19 — brand overlay clobbered the authored address; DOM cell fell back to a dead vendor
  chain; editor-only "KICKER" placeholder leaked onto flyer heroes.** CLASS: *overlays fill
  blanks only; prefer lake-carried fields over vendor re-fetch; editor affordances must never
  render on output paths.*
- **07/16 — digest shipped crime/courts news ("WE AREN'T A NEWS EMAILER ABOUT SWINDLERS").**
  Fix (historical): `NEWS_EXCLUDE` drop-gate BEFORE topic checks in `fetch-digest-data.mts`;
  digest itself killed (§9). The generator — and with it the gate — was deleted 07/19, so any
  future City Voices email consumer must REBUILD the drop-gate before its first send.
  CLASS: *curation must DROP, not rank-to-tail; a $ figure can't launder a crime story.*
- **07/13 — invention is CLAIM-shaped.** Seven workers built seven deliverables; four shipped
  falsehoods with ZERO invented digits (inverted comparison, phantom DOM interval, fabricated
  ordering, "widening" from one level, wrong count, wrong city as subject). Fix: the claim gate
  (`claims.ts`) — code computes relations, the narrator gets settled sentences. Full story:
  playbook Part 1. CLASS: *a digit lint can't see an invented comparison; a confidently wrong
  SUBJECT is worse than a gap.*
- **07/13 — prompt-regex identity killed 15/17 recipes** (only new-listing matched the regex;
  everything else fell to the free author's photo-less grab-bag). Fix: key dispatch. CLASS:
  *identity by string/regex WILL drift; keys are identity.*
- **07/13 — silent recipe-validation fallback** seated a Lee County figure in a NATIONAL
  headline slot, rendered fine, looked fine. Fix: LOUD error on invalid recipe output. CLASS:
  *a fallback that looks like success is the disease wearing a lab coat.*
- **07/14 — the design system existed only as markdown, so nothing obeyed it.** 17 rogue font
  sizes, zero compliant weights, zero `tabular-nums`, ~30 nodes clipped by an invisible
  injected 24px line-height — "the emails look uneven" for weeks. Fix: `scale.ts` (§4), typed
  so violations don't compile. CLASS: *research that lives only in a doc is read by zero code;
  encode it as a typed root or it never happened.*
- **06/29 — grid-tier renderer had an empty `<Head>`** — web fonts silently fell back on the
  paid tier only. CLASS: *three render engines; test the one you didn't change.*
- **06/28 — hand-editing an AI fill** (about to overwrite web-fresh "60 days" with held "72"
  for consistency). CLASS: *forcing a held number over a web-fresh one IS invention; flag
  inconsistencies, never hand-patch.*

---

## 8. VENDOR REALITY (as of 07/19/2026)

**SteadyAPI** (the listing vendor — NEVER surface this name to end users; it's plumbing):
- Quota 50k/mo, 1 req/s live limit — use the headroom, but **real spend only on the final
  serve; mock the dev loop.**
- `/search` returns NO property-type field — property type is a request FILTER only
  (enum value `condos`).
- **Address-slug centering is DEAD** (07/19): `location=<street>_<city>_FL_<zip>` returns rows
  byte-identical to the bare city slug. The lake-first resolver made this survivable; the slug
  lane remains as fallback. Re-probe due ~08/19/2026 (`steady_search_slug_drift_reprobe`
  check) — if permanently dead, delete the lane.
- General lesson: probe vendor behavior LIVE (crawl4ai / direct probe) before building on it;
  a behavior verified once (slug centering, 07/08) can be gone eleven days later.

**Resend:** broadcast/segment lane only (§6). No native A/B. DMARC gap. Never the cold-email
provider.

**Gmail (all platforms):** does NOT support `<details>/<summary>` — the tags are replaced
with `<u></u>`, so nothing interactive-collapsible survives (caniemail HTML5-semantics,
verified 07/19/2026). Email-side "collapsed" content must be compact by construction
(count + link out), never a client-side accordion.

---

## 9. KILL LIST — dead by operator decree; never re-propose, never re-enable

- **Daily digest** — killed 07/16 (workflow disabled + schedules paused); generator island
  permanently DELETED 07/19 on the operator's word. Nothing is left to re-enable — a revival
  is a from-scratch build, ONLY on explicit operator say-so, and must rebuild the
  `NEWS_EXCLUDE` crime/courts drop-gate (§7, 07/16 entry) before any send.
- **Logo.dev / any paid logo vendor** — custom icons = keyless favicon → globe fallback.
- **`labDestination` / `projects[0]` auto-pick** — deleted; `signedInLabArrival` replaced it.
- **Prompt-regex recipe gating** (`isNewListingRecipePrompt`) — deleted; keys are identity.
- **Hand-editing AI fills** — see §7, 06/28.
- **A second subject resolver / second segments table / second social-platform list / second
  render root** — extend the existing root (RULE C2).
- **The email grid builder is the crown jewel** — never kill or bypass it; drive it.

---

## 10. THE RESEARCH SHELF — everything we researched before writing this code

The email system was NOT designed from vibes; each layer has a research artifact behind it.
Before re-deriving, re-crawling, or re-evaluating ANYTHING email, check this shelf — most
"open questions" were answered, verified via crawl4ai, and written down already.

**Committed (in the repo — read these first):**
- `app/_design/` — THE design-doc series (00-START-HERE → 07-charts-and-dataviz +
  QUICK-REFERENCE): product brief, motion rules, surface recipes, color & type (the §4
  numbers' source), voice & microcopy, charts/dataviz, anime.js docs mirror.
- `docs/superpowers/specs/2026-06-28-email-lab-ai-design-research.md` — the render-stack
  research (grid canvas, Photopea, react-email, Graphite, Inkscape + the full rejected list).
  Header says it: "Do NOT re-crawl these topics. Build from here."
**Gitignored but ON THIS MACHINE — `_RESEARCH/` (paths corrected 08/03/2026).** These moved out
of `_ASSISTANT/research/` in the 07/20/2026 consolidation and this shelf pointed at the dead
directory for two weeks. `_RESEARCH/` is invisible to Grep — a search returning nothing is NOT
evidence the research is absent. Read by path, and start at `_RESEARCH/INDEX.md`.
- `_RESEARCH/deliverable-and-design/2026-07-01-ai-deliverable-design-quality-research.md` (+
  `2026-07-01-design-quality-BCD-handoff.md`, `2026-07-01-taskB-wcag-contrast-verification.md`,
  `2026-07-01-taskC-charttype-verification.md`) — the design-QUALITY research: 8pt grid +
  internal≤external spacing, M3 grouping/rhythm, type-scale ratios, WCAG contrast math,
  chart-type selection — all crawl4ai-verified with sources. **Distilled into §0.2.**
- `_RESEARCH/email-and-social/2026-08-03-email-length-and-per-type-benchmarks.md` — the measured
  numbers behind §0.1/§0.1b: the 50–125-word band and its floor, questions/reading-level/sentiment
  mechanics (Boomerang, response-rate so MPP-proof), per-TYPE and cadence figures (GetResponse
  2024, 4.4B messages), the real-estate industry row, and the ~2× conflict between two ESPs that
  forbids ever promising an absolute open/click rate. **Distilled into §0.1 + §0.1b.**
- `_RESEARCH/email-and-social/2026-08-03-strongest-real-estate-email-concepts-structure.md` —
  10-platform template anatomy, copy/subject-line craft, market-report structure, and the
  email-client rendering constraints (Outlook Word engine, fluid-hybrid, dark mode, the 102KB
  Gmail clip). **Distilled into §0.1, §0.3, §0.6.**
- `_RESEARCH/email-and-social/2026-07-01-social-safezone-meta-firstparty-verification.md` +
  `2026-07-01-email-social-ai-pipeline-report.md` — social safe zones + the pipeline report.
- `_RESEARCH/real-estate-market/2026-07-01-listing-lifecycle-marketing-research.md` — the
  lifecycle recipes' marketing research (stage sequence + drip cadence).
- The trio behind `FAVORABLE_FRAMING_POLICY`, split across two categories (verified 08/03/2026):
  `_RESEARCH/voice-and-positioning/2026-07-15-sell-side-copywriting-research.md` +
  `2026-07-15-authority-reasoning-not-hype-research.md`, and
  `_RESEARCH/agent-behavior/2026-07-15-ai-steering-anti-drift-research.md`.
- `docs/superpowers/plans/2026-07-08-ai-design-and-email-marketing-hacks-sweep.md`,
  `2026-07-09-email-ink-fence-and-palette-gate.md`, `2026-06-29-email-lab-text-styling.md`,
  `2026-07-06-email-grid-gridstack-*` (NOT executed — §4) — the design/build plan trail.
- `docs/standards/deliverable-playbook.md` + `docs/standards/email-images.md`.

**Local-only (gitignored — on this machine, never committed):**
- `docs/steadyapi-research/STEADY-PAINS.md` — THE distilled buyer/seller/agent pain reference
  (weighted, quoted, mapped to what we already hold). Load it whenever writing to customer
  pains. Standing rule: fold every new research round into it or it's stale.
- `docs/steadyapi-research/2026-07-17-*.md`, `2026-07-18-*.md`, `2026-07-19-20-users-launch-kit.md`
  — the dated evidence trail (landscape scans, execution briefs, launch kit).

Distilled PROCESS facts (vendor behavior, pipeline shape, design constants) belong in this
committed map; strategy content stays local. Nothing matching `*crawl4ai*` is ever committed.

---

## 11. VERIFY BEFORE YOU CLAIM ANYTHING WORKS

1. `bun test` the touched surfaces — `lib/email` + `lib/deliverable` + `lib/listings` is
   ~2,800 tests as of 07/19 and runs in seconds. Recipe touched → `recipes.parity.test.ts`.
   Seed touched → `preview-fill.test.ts` (chart coherence CI).
2. `bunx next build` — NOT `npx tsc` (the ruled verification command).
3. **A code fix is NOT live until it's deployed/rebuilt.** Verify served bytes / the rendered
   canvas on prod, not the diff. Open a `checks` live-verify entry for anything you can't
   verify this session (RULE 2.4 — no silent deferrals).
4. Real vendor/API spend only on the final serve; mock the dev loop.
5. Live-verify IN THE LAB by driving the builder (one-line prompt, then observe) — never by
   hand-assembling the doc you wish it had built.
