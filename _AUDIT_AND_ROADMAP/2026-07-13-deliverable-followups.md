# FOLLOW-UPS — the deliverable engine, 07/13/2026

Everything here was found by building the twelve recipes for real, rendering them, and having
adversarial verifiers try to break them. Nothing is from memory. Each item: **WHAT · WHY ·
HOW · WHERE.**

**Nothing we have is deleted.** Every design, recipe and layout stays as a **choice**. All of
this is **additive** — more options, not different ones.

---

## THE ONE LESSON

> **INVENTION IS CLAIM-SHAPED, NOT NUMBER-SHAPED.**

Four of seven deliverables shipped a falsehood, and **not one contained an invented number**.
Every figure was correctly sourced; what was invented was **the claim drawn between**
correctly-sourced numbers — a comparison, a trajectory, a count, a sequence, a location, a
motive, a **feature**, or a real number **wearing the name of a quantity we do not hold**.

`lib/deliverable/claims.ts` closes it structurally: code computes the relation, the narrator
gets the RESULT and **no raw set**. It has been beaten **three times** by classes it did not
enumerate. **Assume there is a fourth.**

---

# 0 — THE PRODUCT (do these first)

## 0.0 STATUS — the seven listing emails EXIST AND WORK

`coming-soon` · `new-listing` · `open-house` · `price-reduced` · `market-comps` ·
`under-contract` · `just-sold`

All build from an address alone, through the real Lab door. All wear **ONE design**
(`lib/email/lifecycle-chrome.ts`) — the showcase sample's design: accent ribbon (the word
changes, the band does not) · photo · centred address over price · one hairline spec strip ·
the recipe's own middle · narrative · agent card · one CTA · footer. **Brand rides through
untouched.** `campaign-coherence.test.ts` fails the suite if any of the seven drifts.

**What is NOT built: the campaign that runs itself.**

## 0.1 BUILD THE CAMPAIGN — end to end, JUST IN TIME

**⚠️ DO NOT BUILD ALL SEVEN AT ONCE. A HOUSE CAN SELL TOMORROW.**

Operator: *"We don't want the campaign to build all at once because a house can sell the next
day. We just want to show the user the path, so get them to finish."*

Seven emails built up front is waste (the house goes pending on day three and five are dead)
and wrong (the numbers are stale by send time). Show **THE PATH**; build **just in time**.

**THE FLOW:**

1. **User clicks BUILD CAMPAIGN** → picks the campaign → gives the **address**.
2. **The FIRST email is produced immediately**, and it collects **UP FRONT everything we do
   not hold about the property**:
   - the **DESCRIPTION** — no vendor sells MLS remarks; it is a lane-2 fact the agent pastes,
     and it becomes the narrator's source of truth **for the whole campaign**;
   - the **SPECIFIC COMPS** the agent wants to argue with;
   - the **open-house date and time**, and anything else the sequence needs later.
   **Ask ONCE. Save it. Reuse it for all seven.** The user builds the campaign in one sitting.
3. **The user schedules the first email.** The rest of the path is **shown, not built**.
4. **When the SECOND comes due, the user is TOLD we are building it** — and can **edit it
   before the send date**. Never a surprise send.
5. **"Your third email goes out in 2 days"** — built automatically from the **saved
   information**, and the user can edit it.
6. **And so on.** Build → notify → editable window → send.

**MECHANICS:**
- A campaign needs: an ordered list of recipe keys, a **per-step trigger**, a send schedule,
  and a **saved property dossier** (the step-2 answers) every later email reads from.
- **The pending / sold / price-change steps are EVENT-DRIVEN.** They cannot be scheduled by
  date — they fire on a trigger, or the agent confirms the milestone.
- **THE CAMPAIGN MUST BE ABLE TO STOP.** The house sold; the sequence ends.
- **FIRST BLOCKER: `scheduleSuggestion` is LOST on every recipe build.** It is the thread the
  whole thing hangs on. Fix it first.
- `lib/showcase/registry.ts` already models a campaign as an ordered set of slides — **the
  slide order IS the campaign order.**

**WHERE:** `lib/showcase/registry.ts` · `lib/deliverable/recipes.ts` ·
`lib/email/lifecycle-chrome.ts` · `lib/email/build-doc.ts` · the schedule/cadence surface.
**CHECK:** `campaigns_end_to_end_scheduled` · `campaign_just_in_time_build_flow`.

## 0.2 PLACEMENT — showcase first

**Put the built campaign in the SHOWCASE, beside the hand-written HTML version**, so the two
can be compared. **Do not touch the homepage "Campaign" pill** — the operator wires the other
surfaces later.

**WHERE:** `app/showcase/page.tsx` (`ShowcaseGrid`, `CampaignExamples`, `SeedGallery`).

## 0.3 BUILD THE SHOWCASE DESIGNS — with the research — so users get OPTIONS

The showcase looks were **researched** (Mailchimp single-column, Klaviyo welcome benchmarks,
Vero inverted pyramid, Litmus typography, NN/g scanning, Luxury Presence one-CTA, Sprout
Social serialised content — all cited in `lib/email/author-recipes.ts`). **That research is
real and must not be thrown away.**

Today those designs exist **only as hand-written HTML** — a picture the builder cannot
produce. The block types now carry a design vocabulary (`align`, `ribbon`, `order`,
`emphasis`, `variant:"strip"`), so the look **is** expressible.

**HOW:** for each showcase (listing-to-close · agent-launch · market-pulse · launch-blitz),
read its HTML, encode its look as a **chrome** (the way `lifecycle-chrome.ts` encodes
listing-to-close), and let the **user pick** which chrome their campaign wears. **Keep the
research citations attached** — they are the reason the design is what it is.

**Operator: set up TWO campaigns with DIFFERENT designs that do the same thing, side by
side**, so there is an order to pick from.

**WHERE:** `public/showcase/*/live/*.html` · `lib/email/author-recipes.ts` (**do not delete
the citations**) · `lib/email/lifecycle-chrome.ts` (the pattern) · `lib/showcase/registry.ts`.
**CHECK:** `showcase_designs_buildable_as_options`.

---

# 1 — BLOCKING (a user hits these today)

## 1.1 Under Contract's SAMPLE has a hole no address can fill

The showcase slide promises *"pending in 90 days while rivals sit at 238 and 279"* and
*"85 pendings, 31 at $2M+"*. **The vendor returns NULL for days-on-market and there is no
contract date anywhere.** Its hero slot is a number **no house will ever fill**.

*A sample is a sample* — the house need not exist. But a layout whose centrepiece cannot be
sourced is broken for **every** address. **Re-concept or re-shoot that slide.**
**CHECK:** `under_contract_showcase_premise_unsourceable`.

## 1.2 The social path has NO no-invention gate at all

A social post can ship a **fabricated number today**. Its sourcing rules are **prose in a
prompt** — advisory, unverified. `applyDesignPatch` confines the model to TEXT fields, which
stops a fake *photo* but **not a fake number**: `stat.value` is free text the model writes.
Same sourced lake feed as email, **ungated on the way out**.

`claims.ts` was built to be **liftable** onto it. Also: two live social systems, neither
touches the recipe dispatch table.
**WHERE:** `lib/social/design/author.ts` · `lib/email/social-calendar/build-week.ts`.
**CHECK:** `social_path_has_no_no_invention_gate`.

## 1.3 The gallery preview inverts the operator's ruling and models invention

`preview-fill.ts`'s `price-reduced` preview puts the **cut** in the hero value (`−$25,000`)
and demotes the price to the label — **the exact inverse** of the ruling. Its commentary is
hard-coded invention: *"a $25,000 move on asking says the seller is serious… the ones that
reprice decisively are the ones that close"* — a seller-**motive** claim, modelled by the
product's own preview.
**WHERE:** `lib/email/doc/preview-fill.ts` (~line 635).
**CHECK:** `preview_fill_price_reduced_inverts_ruling`.

---

# 2 — DESIGN + THE SPRAWL

## 2.0 ⛔ THE DESIGN SYSTEM ALREADY EXISTS. READ THIS BEFORE YOU CRAWL ANYTHING.

**Operator, 07/13: *"the recipes came from the research you aren't even looking at. where is
the real one?"* He was right. Here it is — the whole chain, newest to oldest.**

**① `docs/superpowers/specs/2026-07-03-author-layout-recipes-design.md` — THE DESIGN
AUTHORITY.** Crawled in-session 07/02/2026. This is where the recipes came from. Sources:
Mailchimp (single column for any email with a CTA; hook at top; 600–800px), Campaign Monitor
(≥50% of opens are mobile — hierarchy must survive stacking), Vero (inverted pyramid →
everything leads to ONE button), Klaviyo (welcome = 51% open; value prop, bite-size story,
*"not a lengthy biography"*, expectation-setting), Scalero (hero 600–900px, in-body 300–600,
≤100KB/image, 2x for retina, 60/40 text-to-image), **Chase Dimond's 45-brand layout
analysis**, Techelix (*"exclusivity comes from what is intentionally left out"*; serif display
+ clean sans body = the luxury formula), Litmus (max two font styles), Shopify/FTC (CAN-SPAM
is FOUR requirements).

**Its three recipe families are the product:** Prospect (cold-open conversion) · Monthly
newsletter · **Editorial** (warm-audience premium, where the KPI is *feel*, not opens).

**② `docs/superpowers/specs/2026-07-08-email-grid-fence-system-design.md` — THE ENFORCEMENT.**
Crawled 07/08/2026. Golden-ratio/Fibonacci span proportions; serif-display + geometric-sans
pairing (**40–60% more visual distinction** than same-class pairs); MLS photo standard 3:2 /
4:3, headshots 4:5; MIT Media Lab 2026 (88% of first brand impressions in 90ms are colour
alone). **And the reason the whole system exists:** arXiv 2605.15124 — *AI design output is
DOCUMENTED to revert to generic defaults unless mechanically prevented.*

**Fences 1–6 are LIVE IN CODE, not advice:** Fence 1 blessed span pairs + Fence 2 row-order
zones + Fence 5 accent-colour budget (`lib/email/author-doc.ts`) · Fence 3 photo aspect lock
(`lib/email/blocks/ImageBlock.tsx`) · Fence 4 `BLESSED_PAIRINGS`
(`lib/email/brand/apply-brand-style.ts`) · Fence 6 contrast (`lib/brand/palette-contrast.ts`).

**③ `docs/email-marketing/QUALITY-BAR-data-deliverables.md`** — 06/26/2026, the OLDEST. Still
the only doc with a **numeric type scale** (hero KPI 32–40px / headers 18–22 / body 14–16) and
the **metric callout** (label small grey caps · value large bold · **delta on its own line,
coloured, with a triangle glyph**). Use it for §B and §C only. **It is not the recipe
authority — ① is.**

### ⚠️ AND HERE IS WHY THE BUILD DOESN'T LOOK LIKE THE SAMPLE

**The samples were authored through the design system. The seven lifecycle builders bypass
it.**

`author-recipes.ts` + the fences live on the **AUTHOR path** (`author-doc.ts` — Fence 5's own
comment says *"AI path only"*). The recipe builders (`lib/deliverable/recipes/*` →
`lifecycle-chrome.ts`) **construct the `EmailDoc` block-by-block directly.** They never pass
through the recipe prose and they are not fence-checked.

**That is the whole answer.** Not "a worker didn't know the design." Not "someone changed it."
**Two code paths, one design system, and the new builders are on the path that has none of
it.**

### ✅ VERIFIED 07/13 — TRACED, NOT ASSUMED

- `assembleAuthoredDoc` — the function that applies **Fence 1 (span snap), Fence 2 (zone
  sort), Fence 5 (accent budget)** — has **exactly ONE caller: `build-doc.ts:1232`, the AI
  author path.**
- `lifecycle-chrome.ts:106` — the shared row helper for **every listing email** — is
  hardcoded: `layout: { x: 0, y, w: 12, h }`.
- **Every `w:` in every recipe builder is `12`.** `agent-brand-intro.ts:870`,
  `agent-launch.ts:481`, `coming-soon.ts:504/512/538`, `just-sold.ts:378` — all `w: 12`.
  **There is not one block in any builder that is not full width.**

**So the fences are not merely skipped — the layout vocabulary they govern is UNREACHABLE.**
No ⅔/⅓, no ½/½, no blessed multiset, because there are no multi-block rows *at all*. Every
deliverable is a one-column stack of full-bleed cards.

**And read the PROBLEM STATEMENT that research spec ① was written to solve, verbatim:**

> *"The Email Lab AUTHOR engine produces correct, cited emails that all look the same: **a flat
> stack of cards.**"*

**The 07/13 builders reproduce, exactly, the defect the design system was built to eliminate.**
That is not a near-miss. The samples look better than the builds because the samples went
through the system and **the builds were written underneath it.**

**THE FIX:** run every builder's doc through the same fence pass the AI path gets — snap spans
onto blessed multisets, sort rows into zones, cap the accent budget — **or** delete the second
path and have the builders emit a plan the author path assembles. **One path, one design.**

**CHECK:** `builders_bypass_the_fence_system`.

## 2.1 Numbers are flat — and NOTHING in the fences covers it

The fences govern **span, row zone, photo ratio, font pairing, accent budget, contrast.**
**None of them governs which NUMBER matters.** That is the genuine, un-researched-by-us gap
behind the operator's *"numbers need different sizes and colors by importance."*

**The structural blocker is a TYPE, not a builder.** `StatItem` is `{value, label, emphasis?}`.
**There is no `delta` field anywhere.** So the quality bar's central rule — *value large bold,
delta on its own line, coloured, with a glyph* — **is not expressible.** `$485,000 — up 2.1%
from last month` cannot be *styled* because it cannot be *stated*. Same failure as the layout
vocabulary: not wrong, **inexpressible**.

**HOW:**
1. Add `StatItem.delta?: { value: string; direction: "up" | "down" | "flat"; basis: string }`
   — `basis` (*"vs last month"*) is **required**: a delta with no basis is a number with no
   source. Renderer draws the glyph + colour.
2. Apply the type scale (32–40 / 18–22 / 14–16) in the stats + hero renderers.
3. **Add it as Fence 7 — ONE primary figure per deliverable**, enforced like
   `assertHeroChartCoherence`. A red test, not a style note. It belongs with the other fences
   because it is the same class of rule.
4. **Then** audit the seeds and area recipes against it.

**WHERE:** `lib/email/doc/types.ts` · `lib/email/blocks/StatsBlock.tsx` ·
`lib/email/doc/default-docs.ts`.
**CHECK:** `stat_number_visual_hierarchy`.

## 2.2 RETRACTION — "the seeds should BE the sample design" was WRONG

An earlier draft of this file said *"the newsletter and editorial seeds are still the plain
design instead of the sample's."* **That is a false defect and it is withdrawn.**

**Editorial Letter is deliberately plain, AND THE RESEARCH SAYS SO.** Its description in
`default-docs.ts` — *"Plain letters out-open designed emails for warm audiences"* — is not a
preference. It is **Chase Dimond's 45-brand layout analysis, in spec ① above: a text-only
personal letter opens at 35–50% versus 20–25% for a designed email, and is the best-performing
shape for relationship building.** It is a header, one text block, an agent card and a footer
**on purpose, for a measured reason.**

**Making it look like the sample would make it WORSE.** The seed is right; the defect report
was wrong.

**And "the sample" was never named**, because two different galleries were mashed together:

- **`SHOWCASES`** (`lib/showcase/registry.ts`) — 4 **finished campaign examples**, with
  committed live HTML at `public/showcase/<id>/live/*.html`. *These* are the samples.
- **`SEED_DOCS`** (`lib/email/doc/default-docs.ts`) — 27 **starter templates**, governed by
  the SLOT RULE (data fields empty, structure/style filled). A canvas you fill.

**Different jobs. Nothing says a seed must look like a showcase.** That "should be" had no
source — **which is exactly the defect the claim gate exists to catch, committed in this very
document.** The lesson at the top of this file applies to the file itself.

## 2.3 ONE HOOD — why are there so many of these? (OPERATOR QUESTION, 07/13)

> *"WHY DO WE HAVE SO MANY SHOWCASES? WHY ISN'T EVERYTHING UNDER ONE HOOD AND IT BRANCHES OUT
> WHEN FIXED TO WHERE IT NEEDS TO GO?"*

**He is right. Here is the honest inventory.**

**The 4 showcases are NOT the sprawl.** They are 4 example *brands/scenarios*
(listing-to-close, launch-blitz, agent-launch, market-pulse) and **as of 07/13 they all point
at the one recipe registry** — a slide carries `recipe: RECIPES["…"]`, it does not redefine
one. That was today's fix: identity used to be the **prompt string**, so the same deliverable
built two different ways depending on which button you pressed.

**The real sprawl is THREE CATALOGS and SIX SURFACES — and the word "recipe" means three
different things.**

- **`RECIPE_IDS` — 11** (`lib/email/author-recipes.ts`). **The DESIGN recipes**, straight out
  of research spec ①. `agent-intro`, `monthly-newsletter`, `editorial-letter`,
  `editorial-magazine`, `sphere-weekly`, `year-in-review`… They are **advisory prose appended
  to the system prompt** — the file says so: *"The model MAY deviate — nothing here is
  enforced."* **This is the design system the samples were built with.**
- **`RECIPE_KEYS` — 14** (`lib/deliverable/recipes.ts`). **The DELIVERABLE recipes**, built
  07/13. Identity, subject spine, chart policy, claim gate, parity test. **Do not pass through
  the design recipes above.**
- **`SEED_DOCS` — 27** (`lib/email/doc/default-docs.ts`). **The starter templates.** Preview
  image + slot rule. **No key, no subject, no gate.**

**AND THEY COLLIDE BY NAME ACROSS ALL THREE.** `sphere-weekly` is a design recipe *and* a
deliverable key. `year-in-review` and `editorial-letter` are design recipes *and* seeds.
`new-listing`, `just-sold`, `open-house`, `price-reduced` are deliverable keys *and* seeds —
which is exactly how four seed cards built a *different email* than the button of the same
name, two of them **emailing coaching notes to real recipients**.

`seed-recipe-parity.test.ts` now blocks that one collision. **But a test that forbids a
collision is not the same as not having three catalogs.** Three catalogs is why nobody can
keep track — including the people building it. The operator's complaint is the correct
diagnosis.

**Six UI surfaces that each show a user "here is an example":**
`ShowcaseOverlay` · `SeedGallery` · `TemplateGallery` · `CampaignExamples` ·
`ExamplesAccordion` · `TemplateRail`. Plus `pick-seed.ts` choosing one server-side.

**THE FIX — ONE HOOD, branch at the leaf. This is the operator's own design and it is right.**

1. **`RECIPES` is the hood.** Every buildable thing gets ONE key — the 27 seeds and the 11
   design recipes fold in. One record:
   `Recipe { key, design: RecipeId, skeleton, subject, chart, gate, needs }`.
2. **`design` is the branch that fixes 2.0.** A deliverable recipe now *names its design
   recipe*, so `new-listing` inherits the researched Prospect/Editorial structure instead of a
   builder re-inventing a stack of cards. **The design system stops being a separate path and
   becomes a FIELD.** That is "branches out to where it needs to go."
3. **A surface may only LIST and DISPATCH.** Filter the registry; hand off `?rkey=`. It never
   owns a prompt, a layout, or a copy of the catalog. The six components collapse to one list
   renderer with a filter.
4. **The rule that stops the next one:** *a surface may not DEFINE a deliverable — it may only
   REFERENCE a key.* `recipes.parity.test.ts` already enforces exactly this for what was
   migrated. **It has never been extended to the seeds or the design recipes.** Extend it and
   the sprawl cannot regrow.

**Half of this is already built.** `authorDoc` dispatches on key today. What is missing is that
the seeds never got keys and the deliverable recipes never got a `design`.

**WHY IT KEEPS HAPPENING:** every new surface shipped with its own copy of "what can I
build," because there was no registry to add to. **The registry now exists.** The rule that
prevents the next one: *a surface may not define a deliverable — it may only reference a
`RecipeKey`.* `recipes.parity.test.ts` already enforces this for the surfaces that were
migrated. **Migrate the seeds and the rule covers everything.**

**CHECK:** `one_catalog_seeds_get_recipe_keys`.

---

# 3 — THE AGENT PROFILE (pieces 2-UI and 3)

**Done:** the `agent_bio` column (it **never existed** — the save silently dropped the bio),
`agent_profile_facts` (one fact, one row, one **source**; `NOT NULL` + `CHECK`, so **a fact
with no provenance cannot be written** — an invented credential is structurally impossible),
and the token resolver that makes the bio **update itself** (a market figure frozen into saved
text is *a lie with a delay*).

**Remaining:**
- **2-UI** — the "Your story" section: the AI interviews, saves each fact **verbatim** with
  `source: agent_stated`, drafts the bio **template** (tokens, never numbers). Fail-closed on
  `auditClaims`.
- **3 — the growth loop** — a build that needs a fact we don't hold **records the gap**; the
  panel shows *"three things would make your emails stronger"*, each naming the deliverable
  that wanted it; the AI asks; the answer is saved. **Today a gap opens a popup and is then
  forgotten.**

**WHERE:** `docs/superpowers/plans/2026-07-13-agent-profile-handoff.md` (full brief).
**CHECK:** `agent_profile_live_verify`.

---

# 4 — ENGINE DEBT

| What | Why it bites | Where |
|---|---|---|
| **The vendor has the FULL price history and we don't read it** | `/property-tax-history` returns `Listed $765,000 → $699,975 → $595,000`. So `reduced_amount` is only the **last** cut; the true cut from the original ask is **$170,000**. Reading it makes Price Improved *stronger*, not just safer. | check `listing_price_history_original_ask` |
| **`scheduleSuggestion` is LOST on every recipe build** | The campaign hangs on it. | `lib/email/build-doc.ts` |
| **Three render engines disagree** | The canvas drew chart axes the emailed PNG lacked. An Outlook-breaking 3-column table **passed a Chromium screenshot**. | GridCanvas · compile-grid · lib/pdf |
| **`hero` and `signal` don't honor `emailRender`** | An empty hero still ships a naked label. The open-slot contract is half-done. | `lib/email/blocks/{HeroBlock,SignalBlock}.tsx` |
| **`upsertChartBlock` drops `layout`** | Its comment claims "position preserved". It isn't. | `lib/email/inject-chart.ts` |
| **The chart caption overflows and CLIPS the as-of date off the PNG** | *An as-of the reader cannot see is an as-of we never stated.* Clips any long citation on any recipe. | `lib/charts/svg/ranked-delta.ts` |
| **The shared chart producer binds YoY, not MoM** | A "month-over-month" email would ship **−8% YoY** chips. | `refinery/lib/chart-from-metrics.mts` |
| **`compile-grid` ghost column** | An empty cell in a multi-column row emits a phantom `<div>`. | `lib/email/compile-grid.ts` |
| **`RecipeBuildContext` comment is FALSE for area recipes** | It claims the dispatcher resolves the ZIP/city scope. It doesn't — every area builder re-resolves it (three copies). | `lib/deliverable/recipes/index.ts` |
| **Untyped `data_lake` reads** | Generated types cover `public` only. A renamed column is a **runtime null**, not a compile error. | check `review_reply_untyped_zhvi_view_read` |
| **The gazetteer doesn't hold real SWFL places** | North Fort Myers, East/North Naples, Bonita Beach now correctly **refuse** (open slot) instead of resolving to a neighbour — but they are real places an agent farms. Register them with **real, sourced ZIPs**. **Do not invent ZIPs to make the match work.** | check `gazetteer_missing_swfl_places` |
| **`sphere-weekly`** | Refuted on its structural guarantee; needs one more pass. | `lib/deliverable/recipes/sphere-weekly.ts` |

---

# 5 — RESEARCH WITH crawl4ai, AND **PUT IT IN CODE**

**The point is not to read — it is to encode.** Each ends as a **rule or a test**, not a
paragraph.

## 5.1 Email rendering reality — HIGHEST VALUE (we shipped a Chromium-only email)

**Research:** Outlook/Word engine limits, `mso` conditionals, table-layout rules. Sources:
**caniemail.com** (machine-readable dataset), **Litmus**, **Email on Acid**, **Campaign
Monitor CSS tables**.
**Encode as:** a lint over `compileGrid` output — every row's widths sum ≤ 12, no ghost
tables, no `width="1800"`, no unsupported CSS. **A screenshot is not proof for an email.**

## 5.2 Email/layout design — ⛔ DO NOT RE-RESEARCH. THREE DOCS ALREADY EXIST.

**See 2.0 for the full chain.** ① `2026-07-03-author-layout-recipes-design.md` (the recipe
authority — Mailchimp/Klaviyo/Vero/Chase Dimond/Techelix/Litmus, 07/02) · ②
`2026-07-08-email-grid-fence-system-design.md` (Fences 1–6, **live in code**) · ③
`QUALITY-BAR-data-deliverables.md` (06/26 — the numeric type scale + metric callout).

**An earlier draft of this file told the next session to go crawl number hierarchy. That would
have re-bought research the operator already paid for — twice. The job is to ENCODE, not to
buy it again.** Before ANY crawl on email design, read those three.

**The only genuinely open questions (crawl ONLY these):**
- **Dark mode.** ~1/3 of opens. Nothing in ①②③ says how a coloured **delta** (green up / red
  down) survives a dark-mode client's colour inversion. Answer it when building
  `StatItem.delta`.
- **Which number leads.** No doc we hold ranks *which* figure a reader wants first in a
  listing vs a market brief. That is the honest gap behind Fence 7.

## 5.3 A FIELD → VENDOR CAPABILITY MATRIX, and a SPEC-TIME GATE ← the deepest fix

**Research:** for every field a recipe wants — days-on-market, contract date, sold price, MLS
remarks, **price history** — *which vendor actually sells it, at what grain, and what does the
field actually MEAN.*

We already know: no vendor sells MLS remarks; `daysOnMarket` is null; there is no contract
date; and **`reduced_amount` is the LAST cut, not the cut from the original ask** — a
distinction that shipped a falsehood.

**Encode as:** a **capability matrix in code**, plus a **spec-time gate**: a recipe whose
prompt names a figure with no source in the matrix **fails the build of the REGISTRY**, not
the build of the email.

> **A SPEC THAT NAMES A FIGURE NO LANE HOLDS IS AN INSTRUCTION TO LIE, AND THE MODEL WILL
> OBEY IT.** That is not a model failure. It is a spec failure. This gate is the fix.

## 5.4 Anti-hallucination — upgrade the gate from regex to entailment

**Research:** constraining LLM output to a fact set — structured generation, cite-or-abstain,
claim-level verification, NLI entailment against a source set.
**Encode as:** every shipped sentence must be **entailed by the settled fact set**, or it is
dropped. The regexes are a net; entailment is a floor. **Keep the structural rule regardless:
the narrator receives no raw set.**
**CHECK:** `claims_gate_entailment_upgrade`.

## 5.5 CAN-SPAM / deliverability

Already partly done (4 real requirements). Refresh on reply-rate as a trust signal, DMARC,
BIMI, list hygiene.
**Encode as:** a pre-send lint — working opt-out, accurate headers, no misleading subject,
valid postal address.

---

# 6 — WHAT THE VERIFIERS CAUGHT (keep them; they pay for themselves)

Every one of these was in the **sendable bytes**, and every one was signed off by an author
who had opened the screenshot:

- *"$209/sq ft sits **below** the $213 median"* — **$209 is ABOVE it.** The argument of a
  price-defense email, inverted.
- *"went under contract after **75 days**"* — the vendor's DOM is **null**.
- *"came down by $104,975 **from the original ask**"* — it's the **last** cut; the real one is
  **$170,000**. **Written by CODE, in two files.** *(And the playbook's own rule caused it.)*
- *"the gap is **widening**"* — from ONE data point.
- *"**five** of those six ZIPs"* — it was **four**.
- *"All **6** comparable homes are recorded sales"* — it was **two**. (Digit counts sailed
  past a lint that only caught spelled ones.)
- *"From the **dock**…"* — **no source holds a dock.**
- *"I farm **North Fort Myers**"* → a fully-cited email **about Fort Myers**.
- Coming Soon printed a criterion (**$536K–$655K**) that **did not reproduce its own number**
  (a reader gets 330, not the 328 printed in gold).

**A green test suite was green for all of these.** Do not skip the adversarial pass, and make
it **re-derive every comparison with arithmetic** — a reversed inequality looks exactly like a
correct one.
