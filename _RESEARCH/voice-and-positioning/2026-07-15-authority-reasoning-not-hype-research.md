# Authority-reasoning voice vs. hedged/hype prose — research

**Date:** 07/15/2026
**Method:** crawl4ai (pinned CLI, per CLAUDE.md RULE 0.4) against 4 real pages, discovered via WebSearch. No Firecrawl used.
**Why this pass exists:** the first copywriting research pass (`2026-07-15-sell-side-copywriting-research.md`) covered realtor-blog style rules. The operator's objection: don't let the existing "do not pitch" language in the recipe prompts (shared.ts, LETTER_SYSTEM, market-comps buildNarratorPrompt) push the design toward hedging real, code-computed extremes into mush. This pass researches **named, real authorities who make confident, data-backed calls with zero hype language** — because that combination (confident AND non-hype) is exactly what the product needs and exactly what "do not pitch" was never meant to prevent.

**Pages crawled (4):**
1. https://nowbam.com/how-to-win-listings-with-sharran-srivatsaas-pricing-matrix/ (Sharran Srivatsaa — real, named, $3.4B-production real-estate coach)
2. https://www.mckissock.com/blog/appraisal/checklist-narrative-appraisal-report/ (USPAP narrative appraisal report standard, citing Standards Rule 2-2(a)(viii))
3. https://www.wallstreetprep.com/knowledge/sample-equity-research-report/ (sell-side equity research "Buy" rating methodology)
4. https://excellagent.com/reit-valuation-metrics-price-to-book-dividend-yield-ffo-explained (REIT NAV-discount reasoning — the closest real-world analogue to a comps-defense email)

---

## 1. Sharran Srivatsaa — the "invitation" mechanism, not adjectives

Source: nowbam.com transcript of Srivatsaa's live Pricing Matrix teaching (a named, real, $3.4B-in-production coach, cited directly).

**The exact mechanism the operator described, independently confirmed in a real named source:** Srivatsaa teaches agents to use an **extreme, deliberately non-subtle price example — listing at $1 vs. $10 million — specifically to make the mechanical consequence of an extreme price undeniable to the seller**: *"He uses an extreme example—listing at $1 vs. $10 million—to show how price impacts the size of the invitation."* The price is never described with an adjective ("amazing," "can't-miss") — it's framed as a **mechanism**: price sets the size of the buyer response, full stop, and an extreme price produces an extreme response. That's a causal claim about market behavior, stated as a plain fact, not a sales adjective.

**Why it works:** the confidence comes from **naming the mechanism**, not from intensifying the language. "The launch price controls how many people see your home" is a flat, checkable, mechanical statement — it reads as authority precisely because it explains *why*, not because it's excited.

**How it's built, structurally transferable:**
- Never call a number "great" or "amazing" — state what the number *causes* ("more buyers see it," "the strip sits below every comp in the set").
- Reserve the most extreme, plainest phrasing for the most extreme gaps — don't spend the same soft language on a $1-vs-$10M gap that you'd use on a $2k gap. Srivatsaa deliberately picks the most extreme example precisely because a huge gap deserves undiluted, direct language, not a hedge.
- Back every claim with a named, statistical artifact (comps' actives/pendings/solds relationship, days-on-market, list-to-sale ratio) — never "trust me," always "here's the data in front of both of us."

## 2. USPAP narrative appraisal reporting — confident conclusion + explicit reasoning, zero salesmanship, by law

Source: McKissock's checklist of narrative appraisal report contents, citing USPAP Standards Rule 2-2(a)(viii) verbatim.

**The mechanism:** a licensed appraiser is legally required to reach one **definitive value conclusion** (not a hedge, not a range dodge) — but is required by the same standard to attach **"the reasoning that supports the analyses, opinions and conclusions"**, reconcile across all three valuation approaches, and **explicitly explain any exclusion** ("if the use of one or more of the three approaches to value is not appropriate, explain the exclusion(s) as well"). There is no persuasion language anywhere in the standard — the entire authority of the document comes from stating the number plainly and showing the work behind it, including openly naming what was excluded and why.

**Why it works:** authority here is earned by two things happening together — a firm, undiluted number, and full transparency about the reasoning and any excluded evidence. Neither one alone would be credible: a firm number with no shown reasoning is just an assertion; a fully-reasoned document that won't commit to a number is worthless to the reader.

**How it's structurally transferable (this is the closest match to our own claim-gate architecture already):** our `buildPriceCase`/`compareToSet` already compute the number and the relation in code — that's the appraiser's "reasoning that supports the conclusion," done deterministically instead of by a licensed human. What our current prompts are missing is the appraiser's OTHER habit: when a fact runs against the thesis (a comp that argues against the ask), **name it and explain why it doesn't overturn the conclusion**, rather than either hiding it or drowning the whole paragraph in qualifiers. This is already design rule #7 in the spec ("name the specific factual difference rather than silently dropping it or going vague") — this research confirms it's not just good practice, it is *the* mechanism that makes a confident, unhedged conclusion earn trust instead of read as spin.

## 3. Equity research "Buy" ratings — confidence is a function of the size of the gap, not the adjective

Source: Wall Street Prep's equity-research-report guide (sell-side methodology reference).

**The mechanism:** *"If an equity research analyst marks a stock as a 'Buy'... the analyst has determined the stock is a worthwhile investment. The markets tend to interpret the rating as a 'Strong Buy', especially if the report's findings resonate with investors."* Analysts don't have five levels of adjective intensity between "Buy" and "Strong Buy" — the SAME rating word carries more or less conviction **entirely based on the size of the valuation gap the analyst's own comps math produced**. The prose never gets more excited; the number does the convincing.

**Why it works:** removing adjective-intensity as a lever forces every ounce of persuasive weight onto the one thing that's actually true and checkable — the computed gap. A reader who's seen a hundred of these reports learns to trust the rating precisely because the analyst never had room to oversell it with language.

## 4. REIT NAV-discount reasoning — the exact "$1 vs. $200k" analogy, run as an actual valuation argument

Source: excellagent.com's REIT valuation explainer (educational, plain-language, but accurately describing real NAV-discount analyst practice).

**This is the most direct real-world match to the operator's own example.** The reasoning voice, verbatim: *"If the stock trades at $40 and the NAVPS is $48, the REIT is trading at a 16% discount. That's a signal... you're paying $25 for $30 worth of assets. That's a 17% discount."* No adjective anywhere in that sentence — the magnitude alone ("$25 for $30 of assets") is the entire argument, stated as flatly as a fact because it *is* one.

**Critically, the same source shows the "unless" clause working in the same breath, never suppressing the number:** *"Is the stock trading below NAV? If it's 10% or more below, that's a potential value signal—unless there's a reason (like bad tenants or declining markets)."* The magnitude is stated first and plainly; the countervailing fact (if one exists) is named right after, not hidden and not allowed to soften the number itself.

---

## Synthesis — what this resolves in the design

**None of the four real authorities researched here use hype/adjective language. All four are MORE confident, not less, than a typical listing-copy paragraph — and their confidence comes from letting a computed magnitude speak plainly, not from intensifying the prose.** This means the "do not pitch" language already hardcoded into `shared.ts`, `LETTER_SYSTEM`, and `market-comps.ts`'s `buildNarratorPrompt` was never actually in conflict with what "favorable, authoritative framing" should mean — hype language and genuine authority are opposites in every one of these fields, not two ends of the same dial.

**What today's prompts are actually missing is a permission, not a persuasion technique:** an instruction that when the settled, code-computed facts show a large or extreme gap, the narrator (or, better, the code-authored verdict sentence itself) should state the size of that gap directly and plainly, with no softening — because the gap's size is the entire case, exactly like "$25 for $30 of assets" or "$1 vs. $10 million." The current absence of that permission is what produces an over-hedged, bland restatement of an extreme number — the failure mode the operator is objecting to — and it is a completely different fix than relaxing the no-invention/no-motive/no-pitch architecture, which stays untouched.

Concretely, this suggests two additions to the design (not a scope cut, an addition that fits inside the existing architecture):
1. A magnitude-tier in the CODE-authored verdict text itself (`buildPriceCase`'s `s1`/`compareToSet` sentence templates) — when the subject sits at the extreme edge of (or clearly outside) the comp set, the deterministic sentence should read as directly as "priced $X below every comparable in the set," not the same flat "sits above/below the median" phrasing used for a marginal gap. Zero LLM involvement, zero new invention risk — this is Rule 2's own architecture, just with the REIT-analyst voice applied to the sentence templates that already exist.
2. One explicit sentence inside `FAVORABLE_FRAMING_POLICY`: state a large, sourced gap directly and without hedging language ("well below," "somewhat under") when the settled facts support a plain, larger claim — paired with the existing priority sentence that an unfavorable fact is still never dropped. This sits beside "do not pitch," it does not contradict it, once "do not pitch" is read (correctly, per this research) as "do not add invented motive/hype adjectives" rather than "never say a number is big."
