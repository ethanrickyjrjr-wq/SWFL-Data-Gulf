# Sell-side favorable framing — design

**Date:** 07/15/2026
**Status:** approved design, pre-plan
**Research:** `_ASSISTANT/research/2026-07-15-sell-side-copywriting-research.md` (10 pages crawl4ai'd — real-estate copywriting / elite-producer technique) and `_ASSISTANT/research/2026-07-15-ai-steering-anti-drift-research.md` (13 pages crawl4ai'd — Anthropic/OpenAI/Microsoft/practitioner guidance on encoding one persistent stylistic policy across many LLM call sites without drift). Every rule below traces to one of those two files.

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

### 2. One shared, named policy block — not nine pastes

Both research passes converged hard on this pattern. Anthropic's own prompting docs ship a worked example of exactly this shape: a `<frontend_aesthetics>` block, several paragraphs of durable style guidance, pasted verbatim into every frontend-generation prompt to keep many independent generations consistent. This codebase already has the identical precedent for the claim gate (`CLAIM_PROHIBITION`, printed verbatim into every recipe's system prompt) and the same operator rule already on record: "one authority per shared concept — extract on copy #2."

So: one exported constant, `FAVORABLE_FRAMING_POLICY`, defined once in `lib/deliverable/recipes/shared.ts`, wrapped in `<favorable_framing_policy>` tags. Every sell-side recipe's system prompt interpolates it verbatim — never a paraphrase, never "the gist of it." A recipe test asserts the literal string is present in the constructed prompt (see Testing below), so a future edit that types out its own version instead of importing the constant fails CI immediately.

### 3. Four integration points, not nine

Checked directly against the code (not assumed): six of the nine sell-side recipes route their property-description prose through the one shared narrator, `authorListingNarrative` in `shared.ts` — confirmed by reading `new-listing.ts` and `price-reduced.ts`, and by grepping that `coming-soon.ts` builds no system prompt of its own (it must be calling the shared one). The other three sell-side recipes each carry their own bespoke system prompt because their subject matter needs different constraints (market-comps computes the price case in code and only lets the model add context; agent-brand-intro and agent-launch have no property at all). So the block gets pasted into exactly **four** places:

1. `authorListingNarrative` (`shared.ts`) — covers new-listing, coming-soon, price-reduced, just-sold, open-house, under-contract (confirm the last four's exact call sites during planning — strongly implied by the shared narrator's existing "playbook Part 6" framing but not read line-by-line in this pass).
2. `buildNarratorPrompt` (`market-comps.ts`).
3. `authorAreaRead` (`agent-brand-intro.ts`).
4. `LETTER_SYSTEM` (`agent-launch.ts`).

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

### 5. Enforcement stays inside the existing gate — no second validator

Any new banned-vocabulary entries this motivates (unsourced superlatives) go into the existing `lib/deliverable/claims.ts` / `gateNarrative` fail-closed path. No parallel lint, no second regeneration loop. A handful of deterministic tests alongside each touched recipe's existing `*.test.ts` (or a new `favorable-framing.test.ts` beside `shared.test.ts`) assert: the block's text is present verbatim in the built system prompt for each of the four integration points, and the story-side recipes' system prompts do **not** contain it.

## What is explicitly out of scope for this pass

- **No runtime positioning override at build time.** Confirmed by the operator: build-time framing is always the recipe's declared default. There is no "detect the user is asking for a neutral view mid-build" logic in this design.
- **Post-build "show me a different angle" is a separate, later capability.** The operator's actual ask is: after a deliverable is built, a user clicks on a piece of commentary (or a chart) already on the canvas and asks the AI to rewrite that one element in a different frame — a neutral read, an investor's angle, whatever they ask for. That is an editing/regeneration interaction on an existing built artifact, not a build-time positioning switch, and it is not designed here. **A `checks` entry is being opened for it in this same session** (per the no-silent-deferrals rule) rather than left as a sentence in this doc.
- **No LLM-as-judge "favorability" grader.** The anti-drift research recommends one as a long-term drift-detection layer (a separate, offline, binary pass/fail rubric call — never merged with the factual grader, never gating the send path). Useful later; not required for the behavior itself to work now.

## The playbook auto-load file

`lib/email/CLAUDE.md` already exists and auto-loads whenever a file under `lib/email/` is touched. There is no equivalent for `lib/deliverable/`, even though every recipe file already references "the playbook" (`docs/standards/deliverable-playbook.md`, real, current, just not force-loaded). This design adds:

- **`lib/deliverable/CLAUDE.md`** — new, same dense bullet style as `lib/email/CLAUDE.md`. States the positioning doctrine inline (the sell-side/story-side split, "one shared block, never paraphrase it, the priority sentence lives inside the block") and points at the playbook's new Part 10 for the full doctrine and citations.
- **`docs/standards/deliverable-playbook.md` Part 10 — Positioning: sell-side vs story-side.** The full doctrine, the recipe table, the four integration points, and links to both research files.

## Testing / done-condition

- `Recipe` type change compiles only when every `RECIPE_KEYS` entry declares `positioning` — a type-level test, not a runtime one.
- New/updated recipe tests assert `FAVORABLE_FRAMING_POLICY`'s exact text appears in the constructed system prompt at each of the four integration points, and is absent from the three story-side recipes' prompts.
- Existing claim-gate tests (`claims.test.ts`, each recipe's own claim-gate tests) are unchanged and must still pass untouched — this design adds a section to a system prompt, it does not touch `auditClaims`, `gateNarrative`, or any banned-vocabulary regex.
- One live build per lane (a sell-side listing recipe and a sell-side agent recipe) reviewed by eye against the four-part judge criteria from the research (leads with a strength; no unsourced comparative; unfavorable facts, where present, still ship; no steering language) before calling this done.
