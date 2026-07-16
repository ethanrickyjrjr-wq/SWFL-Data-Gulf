# Sell-side favorable framing — design

**Date:** 07/15/2026
**Status:** approved design, pre-plan
**Research:** `_ASSISTANT/research/2026-07-15-sell-side-copywriting-research.md` (10 pages crawl4ai'd — real-estate copywriting / elite-producer technique), `_ASSISTANT/research/2026-07-15-ai-steering-anti-drift-research.md` (13 pages crawl4ai'd — Anthropic/OpenAI/Microsoft/practitioner guidance on encoding one persistent stylistic policy across many LLM call sites without drift), and `_ASSISTANT/research/2026-07-15-authority-reasoning-not-hype-research.md` (4 pages crawl4ai'd — a named $3.4B-production real-estate coach, the USPAP narrative-appraisal standard, sell-side equity-research "Buy" methodology, and REIT NAV-discount reasoning — researched specifically to resolve whether "favorable" and the existing "do not pitch" prompt language are in conflict; they are not). Every rule below traces to one of those three files. **These three files are the permanent record for this design — see "Where this research lives" below; do not re-derive this reasoning from memory in a future session.**

## Deviations committed during execution

**Dated 07/16/2026, added by the final whole-branch review.** This spec is a permanent
"do not re-derive" record, and two passages below no longer describe the committed code. Both
deviations are intentional fixes made DURING execution, not drift to correct back toward this
doc:

1. **`isExtreme` shipped range-exclusivity-only.** §4a.1 below (and the original Task 5 plan
   code block) describes a threshold that fires on EITHER "subject sits outside the full comp
   range" OR "the gap exceeds ~40% of the median" — an OR condition. That OR condition shipped a
   reproduced bug: it could claim "not just the median, the entire range" while the subject sat
   strictly INSIDE `[min(allPpsf), max(allPpsf)]`, directly contradicting the very next,
   correctly-computed sentence in the same paragraph. The committed `isExtreme` is
   range-exclusivity-only (`subjectPpsf < min(allPpsf)` or `> max(allPpsf)`), with an added
   `n >= 2` floor so a single priced comp — where "outside the range" and "outside the median"
   are the same comparison wearing two names — can never trigger it either. See
   `market-comps.ts`'s own inline comment above `isExtreme` for the full incident.
2. **The `assertHeroChartCoherence` wiring was removed from `price-reduced`'s chart.** §"Charts
   carry the argument too" below (and the plan's Task 9/10 code) wires the same coherence gate
   used by `market-comps` onto the new `price-reduced` chart. It was removed: `price-reduced`'s
   hero is the TOTAL price, its chart plots $/SQFT — two different quantities that the gate's
   4-way `UnitClass` (currency/percent/count/other) both read as plain "currency", so the gate
   would fire on every real listing (price runs ~1000x its own $/sqft) and drop the chart every
   time. That is the exact cross-quantity comparison the coherence module's own header documents
   as unsafe, not a real coherence check. The gate remains fully wired on `market-comps`, where
   both plotted quantities genuinely are the same unit. See `price-reduced.ts`'s own inline
   comment above its chart-fill block for the full reasoning.

## The problem

The deliverable builder's AI commentary should read as coming from the agent with the most data at their fingertips — an authority, not a hype machine. Today the twelve recipes are honest by construction (the claim gate, the banned-comparative-vocabulary lists, `authorListingNarrative`'s "describe, do not pitch" instruction) but they are *neutral* by default, not favorable. The operator wants a deliberate, code-enforced default: recipes that pitch a specific property or the agent's own brand should lead with strength, favor the property in a true light, and lean on the agent's own description for amenities/lifestyle color — while recipes that are relationship/informational newsletters stay exactly as neutral as they are today.

**The one line that must never move:** favorable framing governs *emphasis and ordering of true, sourced facts* — never *which* facts appear. The existing claim gate, banned-vocabulary lists, and no-invention architecture are untouched by this design. A price cut still ships. A comp that argues against the ask still ships. Nothing gets hidden; only what gets *led with* changes.

## Recipe positioning — confirmed against the running code, not declared

**SELL-SIDE (9)** — pitches a specific property or the agent's own brand/track record; default posture is favorable-but-true:
`new-listing` · `coming-soon` · `market-comps` · `under-contract` · `just-sold` · `open-house` · `price-reduced` · `agent-brand-intro` · `agent-launch`

**STORY-SIDE (3)** — recurring relationship/informational content, no single sale or brand pitch riding on it; stays exactly as neutral as today:
`sphere-weekly` · `market-pulse` · `review-reply`

All three story-side recipes already contain an explicit, near-verbatim "never add a selling claim of your own — 'now is the time' are your words, not facts" instruction in their live system prompts (verified by reading `sphere-weekly.ts`, `market-pulse.ts`, `review-reply.ts`). That is real, current behavior, not a category being invented — this design does not touch those three recipes at all.

**Out of scope:** `social-pack` / `social-cut`. They are not `RecipeBuilder`-shaped and have no no-invention gate at all today (tracked separately as `social_path_has_no_no_invention_gate`) — applying a framing policy on top of a system with no factual floor would be building on sand. A future pass that lifts the claim gate onto social should apply this design at the same time, not before.

## The mechanism

### 1. A required field closes the drift path structurally

Add `positioning: "sell-side" | "story-side"` to the `Recipe` interface in `lib/deliverable/recipes.ts`. Every field on that interface is already required (`skeleton`, `prose`, `subject`, `chart`), so this is not a new convention to remember — a new recipe cannot compile without declaring its lane. This is the concrete, structural answer to "the builder doesn't drift unless asked."

**`RECIPES` is `Record<RecipeKey, Recipe>` over all 14 `RECIPE_KEYS`, including `social-pack` and `social-cut`** — a required field cannot be skipped for the two out-of-scope keys just because this design doesn't touch their behavior. Both ship `positioning: "story-side"`: neither reads `FAVORABLE_FRAMING_POLICY` or any prompt this design touches (they are "not `RecipeBuilder`-shaped," per the Out-of-scope note above), so the value is inert — `"story-side"` is the honest default because it is the value that asserts nothing about a posture that hasn't been built yet, and it keeps every non-social recipe's `positioning === "sell-side" ⟺ FAVORABLE_FRAMING_POLICY present` test from having to special-case them.

### 2. One shared, named policy block — not nine pastes

Both research passes converged hard on this pattern. Anthropic's own prompting docs ship a worked example of exactly this shape: a `<frontend_aesthetics>` block, several paragraphs of durable style guidance, pasted verbatim into every frontend-generation prompt to keep many independent generations consistent. This codebase already has the identical precedent for the claim gate (`CLAIM_PROHIBITION`, printed verbatim into every recipe's system prompt) and the same operator rule already on record: "one authority per shared concept — extract on copy #2."

So: one exported constant, `FAVORABLE_FRAMING_POLICY`, defined once in `lib/deliverable/recipes/shared.ts`, wrapped in `<favorable_framing_policy>` tags. Every sell-side recipe's system prompt interpolates it verbatim — never a paraphrase, never "the gist of it." A recipe test asserts the literal string is present in the constructed prompt (see Testing below), so a future edit that types out its own version instead of importing the constant fails CI immediately.

### 3. Three block integration points; five prompt call sites total; nine `positioning: "sell-side"` recipes

Three separate counts, deliberately not collapsed into one, because collapsing them is what produced the original four-vs-nine confusion:

**Nine recipes carry `positioning: "sell-side"`** (§ "Recipe positioning" above) — that field is a categorization fact about what the recipe is *for* (pitches a property or the agent's own brand), independent of whether any given prompt can safely say more about it today.

**Five prompt call sites exist across those nine recipes**, checked directly against the code, call site by call site — not assumed. `under-contract.ts` does **not** route through the shared narrator: it has its own bespoke prompt in `authorUnderContractNote` (`under-contract.ts:978`), with a comment block explaining why (`authorListingNarrative` is a property-description writer handed the whole fact sheet; under-contract has no timing data to describe, and the shared narrator invented a days-on-market claim when it was tried). The grep that first suggested otherwise was hitting that comment, not a call — same pattern as `market-comps.ts`, confirmed by reading both call sites directly.

1. `authorListingNarrative` (`shared.ts`) — covers new-listing, coming-soon, price-reduced, just-sold, open-house (confirmed: none of the five builds a second system prompt of its own; each only supplies a `framing` string to the shared function).
2. `authorUnderContractNote` (`under-contract.ts`) — its own bespoke prompt, confirmed not routed through `shared.ts`.
3. `buildNarratorPrompt` (`market-comps.ts`).
4. `authorAreaRead` (`agent-brand-intro.ts`).
5. `LETTER_SYSTEM` (`agent-launch.ts`).

**`FAVORABLE_FRAMING_POLICY` is pasted into exactly THREE of those five — 1, 2, and 3 above.** Points 4 and 5 carry an absolute constraint the block's own content would *contradict*, not just leave unused: `authorAreaRead`'s bookend sentences "must assert NO fact of any kind — no number, no comparison, no count" (`agent-brand-intro.ts:738-739`); `LETTER_SYSTEM` states "NO NUMBERS. Not one digit, anywhere" (`agent-launch.ts:242`). Pasting "numbers beat adjectives, categorically" and "lead with strength" into either prompt is not inert — it is the exact conflicting-instruction failure the anti-drift research itself warns against, now locked in by a test asserting the block's verbatim presence. Caught during planning review, before any code was written.

So: `authorListingNarrative`, `authorUnderContractNote`, and `buildNarratorPrompt` get the block — the three narrators whose entire job is stating facts about a property or a price, i.e. the ones its content can be true inside. `agent-brand-intro` and `agent-launch` keep `positioning: "sell-side"` (they do pitch the agent's own brand) but their prompts are **untouched by this design** — `positioning` there is a categorization fact for later capabilities (e.g., a future favorability grader scoped by lane), not a promise that today's prompt changes. The Testing invariant is **block-present ⟺ one of these three narrators** — not `positioning === "sell-side"` (which would wrongly include agent-brand-intro/agent-launch) and not "all five prompt call sites" (which would wrongly include them too).

`authorListingNarrative` (5 of 9 recipes) already contains "lead with what is most distinctive and true" (`shared.ts:239-240`) — the policy is mostly a rename/extraction there, not new behavior. `market-comps` is where this design adds something genuinely new.

### 4. The block's content — checkable rules, not adjectives

The anti-drift research was explicit that leaving "favorable" as an adjective in a prompt is exactly what produces drift across many call sites and many editing sessions — a rubric or instruction has to be a procedure a human could actually check, not a vibe. Pulled from the copywriting research's 15 sourced style rules, operationalized:

- Benefit rides on the fact; it never replaces it. State the sourced number, then attach the one concrete thing it lets the reader do.
- Lead with a confirmed strength before any limitation.
- **When a comps or pricing paragraph must acknowledge a less-favorable data point, name the specific factual difference rather than silently dropping it or going vague.** This is the direct code-level translation of "talk about this property's strengths, not the comps'" — real top-producer scripts do exactly this (name why a comp differs), they do not go quiet.
- Numbers beat adjectives, categorically.
- No steering language, no describing who "should" want the property (this reinforces, never loosens, the existing Fair-Housing-adjacent banned-vocabulary list already in `market-comps.ts`).
- Cap superlatives entirely — "unbeatable," "guaranteed," "won't last" stay banned, they were never allowed and remain not allowed.

**Stated inside the block itself, first:** *"Cited facts — including unfavorable ones, a real price cut, a slow-selling comparable — are never dropped, softened, or omitted. This policy governs the emphasis and ordering of true facts. It never governs which facts appear."* This is the sentence that keeps the claim gate's authority completely intact, and it is the first thing the block says, per the anti-drift research's finding that conflicting-instruction risk is resolved by explicit priority stated in-line, not left implicit.

3-5 worked examples ship with the block (Anthropic's own stated best lever for steering tone, ahead of description) — including one paired counter-example showing favorable framing tipping over into an invented comparison, so the boundary is visible in the prompt itself, not just asserted.

### 4a. "Do not pitch" and "favorable" were never in conflict — state extremes plainly, don't hedge them

Every one of the three narrators the block actually reaches already carries a hardcoded "do not pitch / no selling claims of your own" instruction (`shared.ts:249`, `under-contract.ts`'s own system, `buildNarratorPrompt` in `market-comps.ts`). The risk, flagged during planning review, was that pasting a "lead with strength" block next to an existing "do not pitch" sentence is exactly the conflicting-instruction failure mode the anti-drift research itself warns about.

`_ASSISTANT/research/2026-07-15-authority-reasoning-not-hype-research.md` resolves this directly, against four real, named authorities who make confident, data-backed calls with **zero hype language**: a $3.4B-production real-estate coach (Sharran Srivatsaa — teaches the exact "$1 vs. $10 million" extreme-price example to show price mechanically controls buyer response, no adjectives), the USPAP narrative-appraisal standard (a firm value conclusion, required by law to carry its reasoning and name any excluded evidence — never hedged, never a sales pitch), sell-side equity-research "Buy" methodology (conviction is the size of the valuation gap, never the adjective), and REIT NAV-discount reasoning (*"you're paying $25 for $30 worth of assets — a 17% discount"* — the magnitude alone is the entire argument, stated as flatly as a fact because it is one).

**The finding: hype language and genuine authority are opposites in every one of these fields, not two ends of the same dial.** "Do not pitch" was never in tension with sounding authoritative — it was only ever in tension with *hedging*, which none of these sources do either. What today's five integration points are actually missing is a permission, not a persuasion technique: **when the settled, code-computed facts show a large or extreme gap, state its size directly and plainly, with no softening language ("somewhat," "a bit," "in the neighborhood of").** The gap's size is the case, exactly like "$25 for $30 of assets."

Two concrete additions carry this, and neither touches the no-invention/claim-gate architecture:

1. **A magnitude tier in the CODE-authored verdict itself — direction-symmetric, not a spin dial.** `market-comps.ts`'s `buildPriceCase` composes its `s1` sentence with the same flat "sits $X above/below the median" phrasing whether the gap is $2k or $190k. Add a threshold (e.g., subject sits outside the full comp range, or the gap exceeds some percentage of the median) at which the deterministic sentence template states the position more directly — still 100% code, zero LLM, zero new invention surface. **The tier must fire identically whether the subject sits far above the set or far below it.** `buildPriceCase` exists specifically to defend an ask that can legitimately sit on either side of the comps (a stronger asking price is not automatically "the favorable direction") — a tier that only sharpens language when the gap happens to flatter the ask is spin, and it re-opens exactly the inverted-comparison risk this file's own header incident (`$209 sits below…` when it was above) was written to prevent. This is the direct fix for "priced at $1 when every comp is $200k": the code already computes the gap; it should say so as plainly as the number warrants, in whichever direction the number actually points.
2. **One line inside `FAVORABLE_FRAMING_POLICY`**, sitting beside — not replacing — the existing "do not pitch" text: state a large, sourced gap directly and without hedge-words when the settled facts support a plain, larger claim. Paired with the block's existing priority sentence (an unfavorable fact is never dropped), this is a permission to be direct about the data, not a license to invent tone.

### 5. Enforcement stays inside the existing gate — no second validator

Any new banned-vocabulary entries this motivates (unsourced superlatives) go into the existing `lib/deliverable/claims.ts` / `gateNarrative` fail-closed path. No parallel lint, no second regeneration loop. A handful of deterministic tests alongside each touched recipe's existing `*.test.ts` (or a new `favorable-framing.test.ts` beside `shared.test.ts`) assert: the block's text is present verbatim in the built system prompt for each of the three narrators it belongs in, and absent from every other prompt — the story-side recipes' AND `authorAreaRead`/`LETTER_SYSTEM`'s.

## Charts carry the argument too

**Operator directive (07/15/2026):** the favorable-but-true argument should be shown, not just told, everywhere the sourced data supports it — a chart that visualizes the same computed relationship the prose states is a second, independent witness to the claim, and it should be **the recipe's natural, default chart**, not an optional extra. Where no chart shape fits an argument the data actually supports today, build one — so it gets naturally chosen in the build, the same way `market-comps`'s comps-bar already is chosen, never bolted on after the fact.

**Audited against the running code, recipe by recipe (9 sell-side):**

| Recipe | Chart today | Argument the data supports | Gap? |
|---|---|---|---|
| `market-comps` | `comps-bar` | subject vs. every comp | already carries it |
| `just-sold` | `comps-bar` | the close among real nearby sales | already carries it |
| `agent-brand-intro` | `zip-by-zip-asking` | the farm area's spread | already carries it |
| `coming-soon` | `inventory-scarcity` | how scarce homes like it are | already carries it |
| **`price-reduced`** | **`none`** | **the new price vs. the market it's now positioned against** | **yes — see below** |
| `new-listing` | `none` | none — the photo is the visual, by deliberate operator call (07/13/2026: "NO CHART on a new listing") | no gap, not an argument recipe |
| `under-contract` | `none` | none we can source — no days-to-contract interval exists in any lane (the recipe's own header documents the invented-number incident this avoids) | no gap, genuine data absence |
| `open-house` | `none` | none — about a date/time, not a number | no gap, not an argument recipe |
| `agent-launch` | `none` | none, by deliberate operator call — a cross-SWFL ranking chart shipped wrongly in this exact recipe on 07/05/2026 and the design now forbids ever creating a chart block here | no gap, settled against |

**The one real, sourced gap: `price-reduced`.** Its own file comment already computes `old = price + cut` and states the new price plainly, but ships `chart: "none"` on a 07/13/2026 stylistic call. **Named plainly, not smoothed over: that 07/13 comment says two separate things, and this design only agrees with one of them.** "Two bars (was/now) is a fact wearing a chart costume — write the fact instead" is still right (two points from the SAME house isn't a market argument, and the was/now text is untouched). But the same comment also says "No comps bar either: this email is about a HOUSE, not a market" — and the new chart below is exactly a comps-referenced chart on this recipe. That is a real, deliberate override of a dated, documented design call, not an addition sitting quietly beside it. It is made here on the operator's own 07/15/2026 directive (show the argument visually wherever the data supports it, build the chart shape if it doesn't exist yet) — but it should be read as an explicit reversal of that one clause, not as something that was always compatible with it.

- The **`dot-plot` frame already exists, is already email-safe, and is already wired into the SVG/PNG rasterizer** (`lib/charts/svg/dot-plot.ts` → `chartSpecToEmailSvg` → `chartSpecToEmailImage`) — one row, a grey reference dot, an accent value dot, a shared scale, built for exactly "this value vs. a reference." No new chart-rendering code is needed.
- The data root is the same one `market-comps.ts` already calls (`compsForAddress`/`lib/assistant/comp-helper.ts`) — reused, not duplicated, per the "one authority per shared concept" rule.
- This is additive, not a reversal of the 07/13 call: the was/now text stays exactly as it is; a new sourced chart gets built alongside it using data already in hand.
- `z-gauge` (also already registered, also `single-vs-target`-shaped) is the fallback frame to evaluate in planning if `dot-plot`'s one-row-per-comp shape doesn't read cleanly for a single reduced-price home — the decision belongs to planning, not this doc, but the shape being needed is confirmed here.

**The guardrail, stated explicitly so this doesn't over-reach:** this is not "add a chart to every recipe." `under-contract`, `open-house`, `agent-launch`, and `new-listing` keep `chart: "none"` — three for a genuine data absence (no source holds the fact a chart would need) and one (`new-listing`) because there is no comparative argument being made at all, only a property being shown. Forcing a chart onto any of the four would either invent a number RULE 0.7 already forbids, or overturn a specific, dated operator call this design has no mandate to reverse. `assertHeroChartCoherence` gates the new `price-reduced` chart exactly as it gates every existing chart-bearing recipe today — an incoherent chart is dropped, never shipped, never blocking the send.

## What is explicitly out of scope for this pass

- **No runtime positioning override at build time.** Confirmed by the operator: build-time framing is always the recipe's declared default. There is no "detect the user is asking for a neutral view mid-build" logic in this design.
- **Post-build "show me a different angle" is a separate, later capability.** The operator's actual ask is: after a deliverable is built, a user clicks on a piece of commentary (or a chart) already on the canvas and asks the AI to rewrite that one element in a different frame — a neutral read, an investor's angle, whatever they ask for. That is an editing/regeneration interaction on an existing built artifact, not a build-time positioning switch, and it is not designed here. **A `checks` entry is being opened for it in this same session** (per the no-silent-deferrals rule) rather than left as a sentence in this doc.
- **No LLM-as-judge "favorability" grader.** The anti-drift research recommends one as a long-term drift-detection layer (a separate, offline, binary pass/fail rubric call — never merged with the factual grader, never gating the send path). Useful later; not required for the behavior itself to work now.

## The playbook auto-load file

`lib/email/CLAUDE.md` already exists and auto-loads whenever a file under `lib/email/` is touched. There is no equivalent for `lib/deliverable/`, even though every recipe file already references "the playbook" (`docs/standards/deliverable-playbook.md`, real, current, just not force-loaded). This design adds:

- **`lib/deliverable/CLAUDE.md`** — new, same dense bullet style as `lib/email/CLAUDE.md`. States the positioning doctrine inline (the sell-side/story-side split, "one shared block, never paraphrase it, the priority sentence lives inside the block", the magnitude-tier permission from §4a, and the chart-carries-the-argument principle) and points at the playbook's new Part 10 for the full doctrine and citations. **This file is itself part of "where this research stays findable"** — it auto-loads on every future edit under `lib/deliverable/`, so the reasoning is in front of whoever touches this code next, not just archived in a research file nobody re-opens.
- **`docs/standards/deliverable-playbook.md` Part 10 — Positioning: sell-side vs story-side.** The full doctrine, the recipe table, the three-of-five-of-nine integration counts (§3) and why they don't collapse into one number, the chart audit table, and links to all three research files by path.

## Where this research lives (so it is never re-derived from memory)

Three durable anchors, each independently sufficient to find this reasoning again:

1. **The three research files themselves** — `_ASSISTANT/research/2026-07-15-sell-side-copywriting-research.md`, `2026-07-15-ai-steering-anti-drift-research.md`, `2026-07-15-authority-reasoning-not-hype-research.md`. Confirmed git-tracked (not gitignored — `_ASSISTANT/research/*.md` is a normal, committed path; only `*crawl4ai*`-named files are excluded), so they survive exactly like any other file in this repo.
2. **This spec's header** links all three by path (updated 07/15/2026) — the first thing anyone opening this doc reads.
3. **`lib/deliverable/CLAUDE.md`** (new, per above) and **`docs/standards/deliverable-playbook.md` Part 10** (new, per above) both cite all three files by path and auto-load / are the canonical reference for anyone editing this code going forward — this is the mechanism, not just a promise: a future session editing `lib/deliverable/recipes/*.ts` sees the doctrine and the citations without having to know this session happened.

## Testing / done-condition

- `Recipe` type change compiles only when every `RECIPE_KEYS` entry declares `positioning` — a type-level test, not a runtime one. Includes `social-pack`/`social-cut` at `"story-side"` per §1.
- New/updated recipe tests assert `FAVORABLE_FRAMING_POLICY`'s exact text appears in the constructed system prompt at exactly the **three** narrators it belongs in (`authorListingNarrative`, `authorUnderContractNote`, `buildNarratorPrompt` — §3), and is **absent** everywhere else: the three story-side recipes' prompts, AND `authorAreaRead` / `LETTER_SYSTEM` (sell-side `positioning`, but no prompt change — §3). The invariant under test is block-present ⟺ one of the three fact-stating narrators, not `positioning === "sell-side"`.
- A test for the magnitude-tier verdict template (§4a.1) asserts the code-authored sentence changes wording at the threshold, over a synthetic comp set crossing it — pure function, no LLM, no mock.
- A test for the new `price-reduced` chart (§ Charts carry the argument too) asserts: the chart is built only when a real sourced reference exists (no reference → dropped, never an empty box, per the existing `dropEmptyChartSlot` contract), and `assertHeroChartCoherence` still gates it exactly as it gates every other chart-bearing recipe.
- Existing claim-gate tests (`claims.test.ts`, each recipe's own claim-gate tests) are unchanged and must still pass untouched — this design adds a section to a system prompt and one new chart, it does not touch `auditClaims`, `gateNarrative`, or any banned-vocabulary regex.
- One live build per lane (a sell-side listing recipe, a sell-side agent recipe, and `price-reduced` specifically for its new chart) reviewed by eye against the four-part judge criteria from the research (leads with a strength; no unsourced comparative; unfavorable facts, where present, still ship; no steering language) before calling this done.
