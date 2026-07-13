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

# 2 — DESIGN

## 2.1 Numbers are still flat everywhere OUTSIDE the listing strip

`StatItem.emphasis` now exists and the listing spec strip uses it (`$/Sq Ft` primary, `Type`
muted). **The other 27 templates and the area recipes have no order of importance** — every
cell still renders at identical weight.

**HOW:** give each template and area recipe an emphasis/rank. **One primary figure per
deliverable; everything else recedes.** Enforce it the way `assertHeroChartCoherence` already
enforces chart/headline magnitude.
**WHERE:** `lib/email/doc/default-docs.ts` (27 seeds) · the area recipe builders.
**CHECK:** `stat_number_visual_hierarchy`.

## 2.2 The seeds should BE the sample design, not a plainer one

The listing family is now dragged onto the chrome automatically (the collision test forces
it). **The newsletter and editorial seeds are still plain.** They should get the same
treatment: the sample's design, not a second, lesser one.

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

## 5.2 Visual hierarchy of numbers

**Research:** how financial/real-estate newsletters rank figures — size ratios, colour,
position. **storytellingwithdata.com** (one emphasised thing; everything else recedes),
**NN/g** on scanning and data tables, **Litmus** typography.
**Encode as:** the `StatItem.emphasis` rank across all templates + a coherence rule — **one
primary figure per deliverable**, enforced like `assertHeroChartCoherence`.

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
