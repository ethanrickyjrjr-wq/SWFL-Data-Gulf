# Follow-ups from the deliverable session — 07/13/2026

**Everything here was found by building the twelve recipes for real and looking at the
rendered artifacts.** Nothing is from memory. Each item says WHAT, WHY, HOW, WHERE.

The single lesson that produced most of this list:

> **Invention is CLAIM-shaped, not NUMBER-shaped.** Four of seven deliverables shipped a
> falsehood, and **not one contained an invented number**. Every figure was correctly
> sourced; what was invented was the *claim drawn between* correctly-sourced numbers —
> a comparison, a trajectory, a count, a sequence, a location, a motive. A digit lint
> cannot see any of them. `lib/deliverable/claims.ts` closes it. **The same hole is wide
> open on the social path.**

---

## 0 — THE ACTUAL PRODUCT (operator, 07/13/2026 — this is the priority)

**Nothing we have gets deleted.** Every design, recipe and layout that exists today STAYS as
a **choice a user can pick.** The work below is ADDITIVE — more options, not different ones.

### 0.1 Build the campaigns out FULLY, end to end

**What.** A campaign is not a pile of emails a user builds one at a time. **The user schedules
the FIRST one, and we take care of the rest.** They pick the campaign, give us the address,
and the whole sequence — Coming Soon → New Listing → Open House → Price Improved → Market
Comps → Under Contract → Just Sold — is authored, scheduled, and released at the right points
in the sales process, automatically.

**Why.** This is the product. Everything else is a component of it. Today a user gets one
email per click and has to come back seven times. That is not "set it once."

**Same design across the whole sequence.** All seven emails wear the ONE chrome
(`lib/email/lifecycle-chrome.ts`): same ribbon band, same centred address-over-price, same
hairline spec strip, same signature and footer. Only the ribbon WORD, the numbers, the middle
content and the CTA change. **The user's brand rides through every email untouched**
(`globalStyle` is sticky — the chrome is the SHAPE, the brand is the SKIN). Six emails
arriving over six weeks must read as one campaign from one agent.

**How.**
- The scheduling spine already exists in part (`schedule_suggestion`, the cadence registry,
  the arc strip, `buildWeek` for social). **It is not wired to the recipe system.**
- A campaign needs: an ordered list of recipe keys, a trigger per step (listed → open house →
  price change → pending → closed), and a send schedule. `lib/showcase/registry.ts` already
  models a campaign as an ordered set of slides — **the slide order IS the campaign order.**
- The steps that are EVENT-driven (went pending, sold) cannot be scheduled by date. They need
  a trigger, or the agent confirms the milestone and the next email fires.
- **`scheduleSuggestion` is currently LOST on every recipe build** (see §4) — fix that first,
  it is the thread the whole thing hangs on.

**Where.** `lib/showcase/registry.ts` (campaign order) · `lib/deliverable/recipes.ts` (the
keys) · `lib/email/lifecycle-chrome.ts` (the one look) · the schedule/cadence surface ·
`lib/email/build-doc.ts` (where `scheduleSuggestion` is dropped).

### 0.2 Build the SHOWCASES we had — with the research — so users get OPTIONS

**What.** The showcase examples were researched (crawl4ai evidence is cited throughout
`lib/email/author-recipes.ts`: Mailchimp single-column, Klaviyo welcome benchmarks, Vero
inverted pyramid, Litmus typography, NN/g scanning, Luxury Presence one-CTA, Sprout Social
serialised content). **That research is real and it must not be thrown away.** The designs
themselves live as hand-written HTML in `public/showcase/*/live/*.html`.

**Those designs need to be BUILDABLE — not just screenshots.** A user picking a campaign
should be choosing between REAL, researched designs that the builder can actually produce for
their address.

**Why it matters.** Right now the researched design exists only as a picture. The block types
now carry a design vocabulary (`align`, `ribbon`, `order`, `emphasis`, `variant:"strip"`), so
the sample's look IS expressible — it just has to be encoded, once per showcase, as a chrome
the recipes can wear.

**How.** For each showcase (listing-to-close · agent-launch · market-pulse · launch-blitz):
read its hand-written HTML, encode its look as a chrome (the way `lifecycle-chrome.ts` encodes
the listing-to-close look), and let the user PICK which chrome their campaign wears. **Keep
the research citations attached** — they are the reason the design is what it is, and they are
part of the pitch.

**The user picks. We build.** Options, not a single opinion.

**Where.** `public/showcase/*/live/*.html` (the researched designs) ·
`lib/email/author-recipes.ts` (the cited research — do not delete it) ·
`lib/email/lifecycle-chrome.ts` (the pattern to copy) · `lib/showcase/registry.ts`.

---

## 1 — BLOCKING (a user hits these today)

### 1.1 The showcase samples sell fiction we cannot build

**What.** The 18 hand-written HTML samples in `public/showcase/*/live/` promise numbers
that do not exist.
**Why it matters.** A customer clicks "Make this" expecting what they were shown. They
cannot get it — not because the builder is weak, but because **the data was never there.**
The samples were drawn without checking.

- `465 Gordonia Road` (the whole Latitude 26 campaign) **is fictional and does not
  resolve.** Never use it as an acceptance target.
- **Under Contract** — "pending in 90 days while rival estates sit at 238 and 279 days",
  "85 pendings, 31 of them at $2M+". **The vendor returns NULL for days-on-market. There
  is no contract date anywhere in our data.** The registry prompt then *told the builder to
  lead with that number*, and it duly fabricated *"went under contract after 75 days."*
  **A spec that asks for a number no lane holds is an instruction to lie.**
- **Market Comps** — "six live comparable listings". The real set is **2 recorded sales +
  4 valuations**.
- "156 of Collier's 8,067 active homes at $10M+" — not reproducible.

**How.** Re-shoot every sample **from the real builder**, against `326 Shore Dr, Fort Myers
33905` (the known-good fixture: $595,000 · 3 bd · 3.5 ba · 2,847 sqft · 0.26 ac). Delete
the hand-written HTML. `scripts/capture-showcase.mjs` currently only screenshots the
fiction — point it at the builder instead.
**Where.** `public/showcase/*/live/*.html` · `scripts/capture-showcase.mjs` ·
`lib/showcase/registry.ts` (the `whatsHappening` / `howAiHandled` copy also describes the
fiction).
**Check.** `under_contract_showcase_premise_unsourceable`.

### 1.2 The social path has NO no-invention gate at all

**What.** A social post can ship a fabricated number **today**.
**Why.** `SOCIAL_SOURCING_RULES` is **prose in a prompt** — advisory, unverified.
`applyDesignPatch` confines the model to TEXT fields, which stops a fake *photo* but
**not a fake number**: `stat.value` is a text field the model writes freely. Social pulls
the *same sourced lake feed* as email and then hands it to a model **with no gate on the
way out**.
**How.** `lib/deliverable/claims.ts` was written to be **liftable** — apply `auditClaims`
+ `CLAIM_PROHIBITION` to the social author, fail-closed. Also decide the contract: social
is **not** `RecipeBuilder`-shaped (two live systems — the Konva composer via "Make this",
and `buildWeek` via the socials campaign — and **neither touches `RECIPE_BUILDERS`**).
**Where.** `lib/social/design/author.ts` · `lib/email/social-calendar/build-week.ts`.
**Check.** `social_path_has_no_no_invention_gate`.

### 1.3 The gallery preview inverts the operator's own ruling and models invention

**What.** `preview-fill.ts`'s `price-reduced` preview puts the **cut** in `hero.value`
(`−$25,000`) and demotes the price to the label — the **exact inverse** of the ruling (cut
*above* price, smaller, accent-colored). Its commentary is hard-coded invention: *"a
$25,000 move on asking says the seller is serious… the ones that reprice decisively are
the ones that close"* — a seller-**motive** claim and a market claim, **modeled by the
product's own preview.**
**How.** Rebuild the preview from the real builder's output, or at minimum invert the hero
and delete the commentary.
**Where.** `lib/email/doc/preview-fill.ts` (~line 635).
**Check.** `preview_fill_price_reduced_inverts_ruling`.

---

## 2 — DESIGN (the operator called this out directly)

### 2.0 THE CAMPAIGN DID NOT LOOK LIKE A CAMPAIGN — **fixed at the root, migration in flight**

**What.** Operator: *"each email would have the same look, just different information. I want
to make sure that is the case."* **It was not.** Seven lifecycle emails, **seven different
layouts** — each built by a different worker, in a different file, with its own idea of a grid,
because there was nothing to build ONTO:

```
new-listing     header · RIBBON · photo · hero(center) · ONE 6-cell STRIP · text · …
coming-soon     header · photo · hero(LEFT) · stats[3] · stats[3] · text · …
market-comps    header · hero(LEFT) · photo · stats[3] · stats[2] · chart · list · …
under-contract  header · photo · hero(LEFT) · stats[3] · stats[3] · stats[3] · stats[1]  ← a WALL
just-sold       header · photo · hero(LEFT) · stats[3] · stats[3] · text · list · …
open-house      header · photo · hero(LEFT) · stats[2] · stats[3] · text · cta · card · …
price-reduced   header · hero(LEFT) · stats[2] · photo · stats[3] · stats[3] · NO agent card
```

**Why it matters.** A subscriber walking the campaign from Coming Soon to Sold would have
received seven emails that looked like they came from **seven different companies**. That is
not a campaign; it is a pile — and the campaign is the product.

**How (done).** `lib/email/lifecycle-chrome.ts` — ONE layout. A recipe supplies the ribbon
word, the numbers, its own middle content and a CTA; it does not get to invent a shape. Brand
stays sticky (`globalStyle`, header, agent card, footer ride through untouched — the chrome is
the SHAPE, the brand is the SKIN). `lib/deliverable/campaign-coherence.test.ts` fails the suite
if any of the seven drifts.

**Where.** `lib/email/lifecycle-chrome.ts` · `lib/email/listing-flyer.ts` (the reference, now a
thin chrome call) · the six `lib/deliverable/recipes/*.ts` being migrated onto it.

### 2.1 Numbers are visually FLAT in every deliverable

**What.** `StatItem` is `{ value: string; label: string }`. **That is the entire type.**
No size, no color, no weight, no rank.
**Why.** A recipe **cannot say which number matters**, because the type has nowhere to say
it. Every cell renders at identical weight and color; only the cell *count* changes the
size. So `$209/sq ft` — the number that wins a listing argument — renders at exactly the
same weight as `Type: Residential`, which nobody cares about. There are only two tiers:
the hero (one big number) and then an undifferentiated wall.
**How.** Type-lift `StatItem` with an `emphasis` / `rank` field, and have **each recipe
declare its order of importance** rather than emitting cells in whatever order the vendor
returned. **Atomic type-lift**: `StatItem` changes ship with a backfill of every template
in the same commit.
**Where.** `lib/email/doc/types.ts` (`StatItem`) · `lib/email/blocks/StatsBlock.tsx` ·
all 27 `SEED_DOCS` · all 12 recipe builders.
**Check.** `stat_number_visual_hierarchy`.

---

## 3 — THE AGENT PROFILE (pieces 2-UI and 3)

Full brief: `docs/superpowers/plans/2026-07-13-agent-profile-handoff.md`.
Spec: `docs/superpowers/specs/2026-07-13-agent-profile-design.md`.

**Done + committed (`f1d9de8c`):** the `agent_bio` column (it never existed — the save
silently dropped the bio), the `agent_profile_facts` store (one fact, one row, one
**source**, `NOT NULL` + `CHECK` — a fact with no provenance *cannot be written*), and the
token resolver that makes the bio **update itself** (a market figure frozen into saved
text is *a lie with a delay*).

**Remaining:**
- **2-UI** — the "Your story" section: the AI interviews, saves each fact **verbatim**
  with `source: agent_stated`, and drafts the bio **template** (tokens, never numbers).
  Fail-closed on `auditClaims`.
- **3 — the growth loop** — a build that needs a fact we don't hold **records the gap**;
  the panel shows *"three things would make your emails stronger"*, each naming the
  deliverable that wanted it; the AI asks; the answer is saved. Today a gap opens a popup
  and is then **forgotten**.
**Check.** `agent_profile_live_verify`.

---

## 4 — ENGINE DEBT (found while building; none of it blocks a user yet)

| What | Why it bites | Where |
|---|---|---|
| **Three render engines disagree** | The canvas drew chart axes the emailed PNG lacked — *the preview lied about what the recipient got*. An Outlook-breaking 3-column table **passed a Chromium screenshot**. | `GridCanvas`/`BlockRenderer` · `EmailDocRenderer`/`compile-grid` · `lib/pdf` |
| **`compile-grid` ghost column** | An empty cell in a **multi-column** row still emits a phantom `<div>`. Unreachable from the flyer (full-bleed rows), but a user-built 2-col row hits it. ~4-line fix. | `lib/email/compile-grid.ts` |
| **`upsertChartBlock` drops `layout`** | Its own comment claims "id and position preserved" — it rebuilds `{id,type,props}` and **loses the grid position**. | `lib/email/inject-chart.ts` |
| **Chart source caption overflows the canvas** | `rankedDeltaSvg` draws the source line at x=150 with no wrap/clamp — it **clipped "· as of 04/30/2026" clean off the PNG**. *An as-of the reader cannot see is an as-of we never stated.* Clips ANY long citation on ANY recipe. | `lib/charts/svg/ranked-delta.ts` |
| **The shared chart producer binds YoY, not MoM** | `findRankedDeltaPair` takes the *first* delta column sharing a stem, and `value_yoy_pct` is declared before `value_mom_pct` — so a "month-over-month" email would ship **−8% YoY chips** under a MoM headline. | `refinery/lib/chart-from-metrics.mts` |
| **`hero` and `signal` don't honor `emailRender`** | R0 generalized the open-slot contract to `stats`/`image`/`text`, but an empty **hero** would still ship a naked label. R0 is half-done. | `lib/email/blocks/{HeroBlock,SignalBlock}.tsx` |
| **`scheduleSuggestion` is lost on every recipe build** | The recipe lane returns early without it — so *"Schedule it every Tuesday morning"* (load-bearing, the author emits `schedule_suggestion` from it) is **dead on the recipe path**. | `lib/email/build-doc.ts` |
| **`RecipeBuildContext` comment is FALSE for area recipes** | It claims the dispatcher resolves the ZIP/city scope. It does not — `zipFromPromptPlace` runs *after* dispatch, so **every area builder re-resolves the place itself** (three copies now). | `lib/deliverable/recipes/index.ts` |
| **Untyped `data_lake` reads** | Generated types cover `public` only, so every `data_lake` read uses the untyped hatch. A renamed column becomes a **runtime null**, not a compile error. | `verification/supabase-untyped-allowlist.json` · check `review_reply_untyped_zhvi_view_read` |

---

## 5 — WHAT TO RESEARCH WITH crawl4ai, AND PUT INTO CODE

**The point is not to read — it is to encode.** Each of these should end as a **rule in
code or a test**, not a paragraph in a doc. RULE 0.4: research the outside answer, write
the evidence into `SESSION_LOG.md`, then build from it.

### 5.1 Email rendering reality (highest value — we shipped a Chromium-only email)

**Research:** Outlook/Word rendering engine limits, `mso` conditionals, table-layout rules,
what actually breaks in Outlook 2016/365 vs Apple Mail vs Gmail. Sources: **Litmus**,
**Email on Acid**, **Can I Email** (caniemail.com — it has a machine-readable dataset),
**Campaign Monitor's CSS support tables**.
**Encode as:** a lint over `compileGrid` output — every row's widths sum ≤ 12, no ghost
tables, no `width="1800"`, no unsupported CSS property. **A screenshot is not proof for an
email.** This is exactly the class that passed a Chromium screenshot and would have
shipped broken.

### 5.2 Visual hierarchy of numbers in email

**Research:** how financial/real-estate newsletters rank figures — size ratios, color as
emphasis, position. Sources: **storytellingwithdata.com** (make it clear where to look; one
emphasized thing, everything else recedes), **NN/g on data tables and scanning**,
**Litmus typography guidance**, real chartbooks (dailychartbook, thechartreport).
**Encode as:** the `StatItem` emphasis/rank field (§2.1) + a coherence rule — *a
deliverable may have exactly ONE primary figure; everything else recedes.* Enforce it the
way `assertHeroChartCoherence` already enforces chart/headline magnitude.

### 5.3 What real-estate vendors actually sell (so a spec can never ask for a lie again)

**Research:** for each field a recipe wants — days-on-market, contract date, sold price,
MLS remarks — **which vendor actually sells it, and at what grain.** We already know: no
vendor sells MLS remarks (all 18 SteadyAPI endpoints checked 07/13); `daysOnMarket` is
null; there is no contract date. **What we do not know is what a paid tier or a different
vendor would give us.**
**Encode as:** a **field→source capability matrix in code**, and a **spec-time gate**: a
recipe whose prompt names a figure with no source in the matrix **fails the build of the
registry**, not the build of the email. *That is the fix for "the spec asked for a
fabrication."*

### 5.4 Anti-hallucination in generative UI/copy (make the claim gate stronger)

**Research:** current practice on constraining LLM output to a fact set — structured
generation, "cite-or-abstain", claim-level verification, NLI-based entailment checks
against a source set. Sources: Anthropic's own tool-use/citations docs, recent work on
groundedness/faithfulness metrics.
**Encode as:** upgrade `auditClaims` from regex backstop to an **entailment check** — every
sentence must be entailed by the settled fact set, or it is dropped. The regexes are a net;
entailment is a floor. **Keep the structural rule regardless: the narrator receives no raw
set to compare.**

### 5.5 CAN-SPAM / deliverability, once sends scale

**Research:** already partly done (4 real requirements, corrected 07/02). Refresh on:
reply-rate as a sender-trust signal, DMARC/BIMI, list-hygiene.
**Encode as:** the footer already enforces address + unsubscribe. Add a **pre-send lint**:
no misleading subject, a working opt-out, a valid postal address.

---

## 6 — Playbook corrections (fold into `docs/standards/deliverable-playbook.md`)

Every worker was required to audit its own Part 6 entry. The playbook is not merely
stale — **it has entries that CAUSE bugs**:

- **A KEY COLLISION.** Part 6 assigns `market-pulse` as the key for **both** Monthly Market
  Pulse **and** The Social Cut. It would have sent two workers at one key.
- **The roster is wrong** — "these **five** lifecycle recipes" when there are **seven**.
  `open-house` and `price-reduced` have **no entry at all**.
- **It states the drift bug BACKWARDS** — it claims the agent-launch follow-up and the
  "Headlines vs Here" slide "are the SAME prompt". **They were not.** They differed by a
  trailing sentence, and *that difference is the entire drift story*. Calling them
  identical is what hid it.
- **"The skeleton probably already exists — load it"** is **actively harmful** for
  Coming Soon: every listing seed is **address-forward** (hero label literally "Price and
  address"), so loading one leaves an open slot **inviting the user to paste back the
  address the recipe exists to suppress.**
- **It omits the biggest address-leak vector** — `authorListingNarrative` builds its fact
  sheet **from `facts.address`**. Handing it raw `ctx.facts` types the street into the
  model's context and relies on a framing sentence to stop it echoing back.
- **The operator's price-cut ruling is buried mid-bullet inside the *lot-size* landmine**,
  where it reads as if it belongs to lot sizes.
- **R-numbers in the playbook and the code disagree**, so two workers cited different
  numbers for the same recipe.
- **Parts 4 and 9 are stale** — `stats`/`image`/`text` now honor `emailRender`;
  `hero`/`signal` still do not. R0 is half-done, not un-done.
- **NEW SECTION NEEDED — the claim gate.** A comparison is a factual claim. Compute it in
  code, hand the narrator the result, and **give it no raw set to derive a new relation
  from.** A banned-word list was tried and lost ("street" was banned; the model wrote
  "on Shore Dr").
