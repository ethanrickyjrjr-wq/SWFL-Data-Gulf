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
