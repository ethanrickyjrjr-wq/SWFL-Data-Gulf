# AI-steering / anti-drift research — persistent stylistic policy across many LLM call sites

Date: 2026-07-15
Method: WebSearch to locate candidate URLs, `crawl4ai` (pinned CLI, never Firecrawl) to fetch the
real page content of each candidate. 13 pages fetched; two Anthropic doc URLs (system-prompts,
xml-tags) turned out to redirect to the same consolidated canonical page
(`claude-prompting-best-practices`), and two more (increase-consistency, keep-claude-in-character)
also resolved to one page — so 13 fetches yielded 9 distinct documents, all read in full below.

This report is scoped exactly as requested: **AI-engineering-authority sources on encoding a
persistent stylistic/behavioral policy across many LLM call sites without drift, combined with a
hard factual constraint that must never be weakened.** It is not a real-estate-flavored answer.

---

## Q1 — Anthropic's own guidance

**Source:** [Prompting best practices — Claude Platform Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
(this is the canonical, current page both the "system-prompts" and "use-xml-tags" URLs now redirect to)

- **Give Claude a role in the system prompt.** "Setting a role in the system prompt focuses Claude's
  behavior and tone for your use case. Even a single sentence makes a difference." The role/system
  content is kept structurally separate from the task-specific user message.
- **XML tags for structuring.** "XML tags help Claude parse complex prompts unambiguously,
  especially when your prompt mixes instructions, context, examples, and variable inputs."
  Recommended practice: "Use consistent, descriptive tag names across your prompts" and nest tags
  when content has a natural hierarchy. This is the direct mechanism for keeping a stylistic policy
  legible and separated from other instructions in the same prompt.
- **Tell Claude what to do, not what not to do — and use an XML tag as a format indicator.**
  Concrete recommended pattern: instead of "Do not use markdown," write "Your response should be
  composed of smoothly flowing prose paragraphs," optionally reinforced with a named tag like
  `<smoothly_flowing_prose_paragraphs>`.
- **Few-shot/multishot examples for tone are explicitly Anthropic's preferred lever for style,
  not description.** "Examples are one of the most reliable ways to steer Claude's output format,
  tone, and structure... Include 3–5 examples for best results," wrapped in `<example>` /
  `<examples>` tags, made "Relevant" (mirror the real use case) and "Diverse" (cover edge cases
  without teaching unintended patterns).
- **A named, reusable persistent-policy block is Anthropic's own documented pattern for exactly
  this "many call sites, one policy" problem.** The same page ships a literal example: a
  `<frontend_aesthetics>` block — several paragraphs of durable style guidance ("Avoid generic
  AI-generated aesthetics... Overused font families... Clichéd color schemes...") meant to be
  pasted verbatim into *any* frontend-generation prompt to keep tone/aesthetic consistent across
  many independent generations. This is a first-party precedent for "one named block, many call
  sites."

**Source:** [Increase output consistency — Claude Platform Docs](https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/increase-consistency)

- Consistency techniques, in Anthropic's own stated order: specify the exact output format;
  prefill the response (not available on the newest model family — see below); **constrain with
  examples** ("Provide examples of your desired output. This trains Claude's understanding better
  than abstract instructions."); ground with retrieval; **chain prompts for complex tasks**
  ("Break down complex tasks into smaller, consistent subtasks... reducing inconsistency errors
  across scaled workflows").
- **"Keep Claude in character"** is the section most directly on-point for a persistent behavioral
  policy: "Use system prompts to define Claude's role and personality. This sets a strong
  foundation for consistent responses... provide detailed information about the personality,
  background, and any specific traits or quirks... Prepare Claude for possible scenarios: provide
  a list of common scenarios and expected responses in your prompts. This 'trains' Claude to
  handle diverse situations without breaking character." — i.e., don't just state the policy,
  enumerate the scenarios where it's easy to get wrong.
- Important caveat surfaced on the same page: prefilling the assistant turn (one historical
  consistency lever) is **no longer supported starting with Claude 4.6 models / Claude Fable 5 /
  Claude Mythos 5** — Anthropic now steers via system-prompt instructions and Structured Outputs
  instead. Relevant if this codebase's recipes ever relied on prefill for structure.

**Source:** [Effective context engineering for AI agents — Anthropic Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) (Sep 29, 2025)

- **"Right altitude" system prompts.** Anthropic frames the core failure mode as a spectrum: at
  one extreme, "engineers hardcoding complex, brittle logic in their prompts... creates fragility
  and increases maintenance complexity over time"; at the other, "vague, high-level guidance that
  fails to give the LLM concrete signals." The fix is organizing prompts into **distinct, named
  sections** (their example: `<background_information>`, `<instructions>`, `## Tool guidance`,
  `## Output description`) using XML tags or Markdown headers.
- **Curate few, diverse, canonical examples — explicitly reject the "laundry list of edge cases."**
  "Teams will often stuff a laundry list of edge cases into a prompt in an attempt to articulate
  every possible rule the LLM should follow... We do not recommend this. Instead, we recommend
  working to curate a set of diverse, canonical examples that effectively portray the expected
  behavior." Directly applicable to a "sell-side framing" policy that must generalize across ~10
  different recipe contexts without a bespoke paragraph per recipe.
- General principle stated as the through-line: "the smallest possible set of high-signal tokens
  that maximize the likelihood of some desired outcome" — i.e. minimal but sufficient, not
  necessarily short.

**Constitutional AI (background, for the "combining hard constraints with soft style" angle):**
[Constitutional AI: Harmlessness from AI Feedback — Anthropic Research](https://www.anthropic.com/research/constitutional-ai-harmlessness-from-ai-feedback)
([paper](https://arxiv.org/abs/2212.08073)) — a training-time technique (not directly what a
prompt-only, per-recipe system works with), but the structural idea transfers: a short, explicit,
written set of principles, checked against outputs, is more durable than diffuse instruction. The
practical analog for a prompt-only codebase is a single named "policy constants" module that every
call site imports rather than restating — see Recommendation 1.

---

## Q2 — OpenAI's guidance (triangulation)

**Primary source — genuine OpenAI prompt-engineering guidance:**
[GPT-4.1 Prompting Guide — OpenAI Cookbook](https://cookbook.openai.com/examples/gpt4-1_prompting_guide)

This is the closest OpenAI-proper analog to Anthropic's prompting-best-practices page, and it is
unusually direct about the exact failure mode this project is worried about (a hard constraint and
a softer style rule coexisting in one prompt, across many call sites):

- **Literal instruction-following raises the stakes on completeness, not just correctness.**
  "GPT-4.1 exhibits outstanding instruction-following performance... However, since the model
  follows instructions more literally, developers may need to include explicit specification
  around what to do or not to do... implicit rules are no longer being as strongly inferred." This
  is the OpenAI-side mirror of Anthropic's "be clear and direct" — an unstated policy will not be
  reliably inferred, it must be written down.
- **Recommended workflow for layering instructions, in order:** (1) start with an overall
  "Response Rules"/"Instructions" section of high-level guidance; (2) add a **named subsection**
  for a specific behavior category (their own example is literally `# Sample Phrases`); (3) add an
  ordered list for specific workflow steps; (4) when behavior still misfires, debug by checking for
  **conflicting instructions first** — "If there are conflicting instructions, GPT-4.1 tends to
  follow the one closer to the end of the prompt" — then add examples, keeping examples and rules
  in sync ("ensure that any important behavior demonstrated in your examples are also cited in
  your rules").
- **Named common failure modes directly relevant to a style policy:** an absolute "always" rule
  can misfire in edge cases (their example: "you must call a tool before responding" can induce
  hallucinated tool inputs — the fix is an explicit escape hatch, "if you don't have enough
  information... ask the user"); **sample phrases get reused verbatim and start sounding
  repetitive** unless the model is explicitly told to vary them — a direct warning for a
  favorable-framing block that ships worked examples; and models add unwanted extra prose/formatting
  without explicit output-format instructions.
- **The worked "Customer Service" example prompt is a live, real demonstration of combining a hard
  constraint with a softer style policy in one system prompt**, cleanly separated into named
  sections: `# Instructions` (mixes hard rules — "Do not discuss prohibited topics," "Always call a
  tool before answering factual questions... never rely on your own knowledge" — with soft style
  rules — "Maintain a professional and concise tone," "use emojis between sentences"), `# Precise
  Response Steps`, `# Sample Phrases` (with an explicit instruction to vary them), and
  `# Output Format` (which states the citation contract and out-of-scope refusal in the same
  breath as tone guidance). This is the single most directly-transferable worked example found in
  this research for "one system prompt, hard rule + soft rule, cleanly separated by heading."
- **General prompt-structure template** they recommend as a default skeleton: `# Role and
  Objective` / `# Instructions` (with sub-category headers) / `# Reasoning Steps` / `# Output
  Format` / `# Examples` / `# Context` / final "think step by step" instruction.

**Secondary source (Microsoft's own OpenAI docs — same model family, independent authorship, used
for triangulation on the system-message-design angle specifically):**
[System message design — Microsoft Foundry / Azure OpenAI docs](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/advanced-prompt-engineering)

- Gives the cleanest **design checklist** found in this research for exactly "combining hard
  constraints with softer stylistic guidance in the same system prompt":
  1. **Start with the assistant's job** — state role and expected outcome.
  2. **Define boundaries** — list what the assistant must avoid.
  3. **Specify the output format** — plainly and consistently.
  4. **Add a "when unsure" policy** — explicit fallback for ambiguous/out-of-scope/missing-info
     cases.
  5. **Test, measure, and iterate** — because system messages "can overfit to specific examples
     or fail in edge cases."
- **Named common pitfall #1: "Conflicting instructions"** — their literal example is "be brief"
  and "be comprehensive" without prioritization. This is the exact shape of risk a favorable-framing
  default creates against a no-invention factual gate if the two aren't explicitly prioritized.
- **Explicit limitation, stated plainly:** "A system message influences the model, but it doesn't
  guarantee compliance... Behavior can change when user content conflicts with system instructions,
  especially in long conversations." This is the strongest argument in all the sources for why the
  factual claim gate must stay a **code-level, post-hoc, fail-closed check** — the system prompt
  alone is never a sufficient guarantee, from either vendor's own admission.

---

## Q3 — Independent practitioners: "many call sites, one policy, no drift"

**Supporting source (OpenAI, eval-process discipline rather than prompt-authoring — belongs here,
not Q2):** [Evaluation best practices — OpenAI API docs](https://developers.openai.com/api/docs/guides/evaluation-best-practices)

- Explicit **eval-driven development** as a named practice: "Adopt eval-driven development:
  Evaluate early and often. Write scoped tests at every stage," plus **continuous evaluation** —
  "run evals on every change, monitor your app to identify new cases of nondeterminism, and grow
  the eval set over time."
- Named **anti-patterns** directly relevant to a stylistic policy that could silently degrade:
  "Vibe-based evals: Using 'it seems like it's working' as an evaluation strategy, or waiting until
  you ship before implementing any evals," and "Ignoring human feedback: Not calibrating your
  automated metrics against human evals." Note for citation hygiene: this page states OpenAI is
  deprecating its Evals dashboard platform (read-only Oct 31 2026, shut down Nov 30 2026) — the
  guidance text remains current best practice; don't cite the platform itself as a durable tool.

**Source:** [Your AI Product Needs Evals — Hamel Husain](https://hamel.dev/blog/posts/evals/) (Mar 2024, still the most-cited practitioner reference in this space; author co-teaches the "AI Evals for Engineers and PMs" course with alumni from Anthropic/OpenAI)

- **Level 1 "unit tests" are fast, cheap, deterministic assertions run on every code change** — his
  concrete example is a regex check that a UUID is never exposed in an LLM's output, run as a
  generic (not per-feature) test. This is structurally identical to what a "no invented
  comparison" claim-gate check already is, and the natural template for a parallel, cheap,
  regex/structural check on stylistic drift (e.g., banned superlative vocabulary).
- **The failure mode Hamel names for why this matters at scale:** "Addressing one failure mode led
  to the emergence of others, resembling a game of whack-a-mole... Prompts expanded into long and
  unwieldy forms, attempting to cover numerous edge cases and examples" — the exact drift risk of
  letting each of ~10 recipes independently accrete framing language over time.
- **Model-based (LLM-as-judge) eval must be calibrated against humans, tracked for agreement, and
  is a "meta-problem" requiring its own mini-evaluation system** — not a fire-and-forget layer.
- Explicit prioritization advice: "It's also helpful to conquer a good portion of your Level 1
  tests before you move into model-based tests, as they require more work and time to execute" —
  i.e., cheap deterministic checks first, LLM-judge checks second.

**Source:** [Prompt Drift: What It Is and How to Detect It — Agenta](https://agenta.ai/blog/prompt-drift) (Feb 2026)

- Names **three root causes of drift**, the third of which is precisely this codebase's shape:
  1. Silent model updates (cites the Stanford/Berkeley GPT-4 behavior-change study).
  2. Input distribution shifts.
  3. **"Dependent prompt changes"** — "Most production LLM applications don't use a single prompt
     in isolation... When you update one prompt in a chain [or, by direct analogy, one shared
     system-prompt fragment reused across many recipes], every downstream prompt is affected...
     it's easy to miss because the drifting prompt was never touched."
- **Prevention checklist, directly transferable:** pin model versions (dated, not floating
  aliases); build a **regression test suite** of representative cases run against every model or
  prompt change; set monitoring alerts on score drops; **version everything** — "Use prompt
  management to version your prompts, model configurations, and system parameters... Without
  version history, debugging drift is guesswork."
- Detection signal list worth reusing verbatim for a style policy: score drops without prompt
  changes, increased output variance, **length creep**, latency changes.

**Source:** [Demystifying evals for AI agents — Anthropic Engineering](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) (Jan 2026) — Anthropic's own current field-tested practice, and the single richest source found for Q3/Q4 combined.

- **Three grader types, explicitly compared:** code-based (fast, cheap, objective, but brittle to
  valid variation), model-based (flexible, scalable, handles nuance, but non-deterministic and
  needs calibration), human (gold-standard, but slow/expensive). "An essential component of
  effective evaluation design is to choose the right graders for the job" — i.e., don't put a
  factual/no-invention check behind an LLM judge when a deterministic one already exists, and don't
  try to make a deterministic check carry a subjective style judgment.
- **Capability evals vs. regression evals** is the load-bearing distinction for "no drift over
  time": "Regression evals ask 'Does the agent still handle all the tasks it used to?' and should
  have a nearly 100% pass rate... After an agent is launched and optimized, capability evals with
  high pass rates can 'graduate' to become a regression suite that is run continuously to catch
  any drift." This is the exact mechanism this project should apply to a stylistic policy: once the
  favorable-framing behavior is validated, it graduates into a regression suite, not a one-time
  check.
- **"Model grading often takes careful iteration to validate accuracy... grade each dimension with
  an isolated LLM-as-judge rather than using one to grade all dimensions."**
- **Practical eval-driven-development roadmap** ("Step 0. Start early... 20-50 simple tasks drawn
  from real failures is a great start" through "Step 8: Keep evaluation suites healthy long-term
  through open contribution and maintenance") is directly reusable for standing up a framing-policy
  regression suite from nothing.

---

## Q4 — LLM-as-judge / rubric-based grading for "did this favor the subject without inventing anything"

**Source:** [Demystifying evals for AI agents — Anthropic Engineering](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) (same page as above, reused for Q4)

- To avoid judge hallucination: **"give the LLM a way out, like providing an instruction to return
  'Unknown' when it doesn't have enough information."**
- **"Create clear, structured rubrics to grade each dimension of a task, and then grade each
  dimension with an isolated LLM-as-judge rather than using one to grade all dimensions."**

**Source:** [LLM as a Judge prompts: templates, rubrics, and best practices — Galtea](https://galtea.ai/blog/llm-as-a-judge-prompts-templates-rubrics-and-best-practices) (May 2026) — the most concrete, production-grade source found for Q4; includes tested prompt templates (`gpt-4o-2024-11-20`, temperature 0).

- **A working judge prompt has four load-bearing parts, in order:** (1) a criterion definition in
  domain vocabulary, never a generic adjective ("high quality" is not a definition); (2) an
  explicit **reasoning structure that forces enumeration of discrete units** before scoring (claims
  for faithfulness, intents for relevance) — "Chain-of-thought reasoning only helps when the judge
  is enumerating the right units"; (3) a **deterministic scoring rule** that maps the reasoning
  result to a verdict mechanically, removing judgment from the scoring step; (4) explicit
  **edge-case handling** for the malformed inputs production actually produces.
- **"One rubric per dimension."** "A single prompt that scores faithfulness, relevance, fluency,
  and format compliance in one pass produces correlated, unreliable scores. The model anchors on
  the first dimension and lets that anchor bleed into the others." Directly answers this project's
  combination question: grade "favorable framing" and "no invented number" as **separate judge
  calls**, never one.
- **Pick the lowest-precision scale that captures the distinction that matters.** Binary
  pass/fail beats 5-point scales for alignment with human raters in their and MT-Bench's findings —
  "Fine-grained scales invite the judge to invent distinctions it cannot defend."
- **"Operationalize fuzzy criteria."** "'Helpful' is a feeling, not a rubric... If you find yourself
  writing an adjective in the rubric ('helpful,' 'accurate,' 'professional'), replace it with the
  procedure a human evaluator would actually perform." Directly transferable: "favorable" is an
  adjective; the rubric needs to be a checkable procedure (e.g., "does the copy state a strength
  before any limitation is mentioned; are all comparatives sourced").
- **Length-neutrality / verbosity bias is real and measurable** — LLM judges systematically score
  longer answers higher unless the rubric explicitly bounds "thoroughness."
- **Explicit anti-pattern directly on point:** "Mixing the generator's instructions into the
  judge's instructions. Copy-pasting the system prompt from the generator into the judge... makes
  the judge score responses against the generator's persona rather than against the rubric. The
  judge has one job: apply the rubric. Strip everything else." — i.e., the favorable-framing system
  prompt and the judge-rubric prompt must be two separate artifacts, not one reused verbatim.
- **Rubrics drift too, and should be versioned like code:** cites Shankar et al. 2024 on "criteria
  drift" (human evaluators revise criteria after seeing outputs) — "A rubric written upfront is a
  hypothesis, not a final artefact... version it, track which gold labels were produced under which
  version, and recalibrate after material edits."
- **"Use your judgment" anywhere in a judge prompt is itself a red flag** signaling an incomplete
  rubric — replace with a deterministic rule.

---

## CONCRETE RECOMMENDATIONS

Codebase grounding for these: the deliverable builder already has a single fail-closed factual
claim gate (`lib/deliverable/claims.ts`, wired into `gateNarrative` in `lib/deliverable/build.ts`,
documented in `docs/standards/deliverable-playbook.md` Part 2/Part 3.4 — "The model writes prose,
nothing else"), and it already has exactly one shared, reusable system-prompt builder that many
listing-lifecycle recipes call into (`authorListingNarrative` in
`lib/deliverable/recipes/shared.ts`), with the other ~5 area/agent recipes (`market-pulse.ts`,
`sphere-weekly.ts`, `agent-brand-intro.ts`, etc.) as separate call sites. Every recommendation below
is anchored to something actually read above.

1. **One shared constant, not ten pastes.** Add the favorable-framing policy to
   `lib/deliverable/recipes/shared.ts` as a single exported string/function, and have every recipe
   that builds a system prompt interpolate it — mirroring how `authorListingNarrative` is already
   the one shared narrator seven of the twelve recipes call into. Anthropic's context-engineering
   post is explicit that curated, centralized guidance beats "a laundry list... stuffed into a
   prompt" per call site; this project's own memory rule ("one authority per shared concept —
   extract on copy #2") already names this exact pattern for the claim gate — apply it here too.

2. **Wrap it in one named XML tag, reused verbatim.** Anthropic's own docs demonstrate this exact
   pattern with their reusable `<frontend_aesthetics>` block, copy-pasted across every
   frontend-generation prompt to keep tone consistent. Define `<favorable_framing_policy>` once in
   `shared.ts`, and every recipe's system-prompt template inserts that tag's contents unmodified —
   not a paraphrase, not a "the gist of it."

3. **State the priority order explicitly, in the block itself.** Azure's system-message design
   checklist names "conflicting instructions" as the #1 common pitfall and mandates a "when unsure"
   clause. Add one sentence to the shared block: cited facts (including unfavorable ones — a real
   price cut, a slow-selling comp) are never dropped, softened, or omitted; favorable framing
   governs *emphasis and ordering* of true facts, never *which* facts appear. This keeps the
   existing claim gate's authority completely untouched (satisfies this project's own rule against
   erecting new mandatory gates) while making the new policy's boundary unambiguous to whoever
   edits a recipe next.

4. **Add 3-5 worked examples, not more adjectives.** Both Anthropic's prompting-best-practices page
   ("3-5 examples... wrapped in `<example>` tags") and its context-engineering post ("curate a set
   of diverse, canonical examples... examples are the pictures worth a thousand words") converge:
   examples anchor interpretation across many independent recipe edits far better than prose
   description of "favorable." Include one paired counter-example showing favorable framing tipping
   into an invented comparison, so the boundary is visible, not just stated.

5. **Extend the existing claim gate; do not build a second validator.** Any new banned-vocabulary
   entries this policy motivates (unsourced superlatives like "best," "unbeatable," "outperforms")
   belong inside the existing `lib/deliverable/claims.ts` / `gateNarrative` fail-closed-drop path —
   Anthropic's evals post calls this a "code-based grader" (fast, cheap, objective) and recommends
   it run before any model-based grading. This keeps enforcement in exactly one place, so the
   factual gate is never duplicated or, worse, quietly weakened by a second, looser mechanism.

6. **If you add an LLM-as-judge check for "framing," make it a separate call, never merged with the
   factual grader.** Galtea's strongest, most specific finding: a single judge prompt scoring
   multiple dimensions in one pass produces correlated, unreliable scores because the model anchors
   on the first dimension. Score "did this lead with a strength before any limitation" as its own
   isolated, binary (pass/fail, not 1-5) rubric call, run offline on a sample — never synchronously
   gating the send path, which stays the deterministic claim gate's job alone (per Anthropic's own
   grader-type guidance: code-based graders for fast objective checks, model-based only where
   nuance is unavoidable).

7. **Operationalize "favorable," don't leave it as an adjective in any prompt or test.** Per
   Galtea's clearest anti-pattern warning, write the rubric as a checkable procedure (e.g. "the
   first sentence about the subject states a strength; no sentence states a weakness without a
   sourced fact behind it") rather than asking a judge to rate "favorability" on a scale — the
   adjective version is exactly what produces unreproducible scores across recipe edits.

8. **Add a handful of fast, deterministic regression tests for the policy, alongside the existing
   recipe test files.** Hamel Husain's "Level 1 unit tests" pattern — cheap, structural, run on
   every change — is a direct template: each recipe already has a `*.test.ts` sibling
   (`market-comps.test.ts`, `just-sold.test.ts`, etc.); add assertions there (or in `shared.test.ts`)
   that the shared framing block is present verbatim and that no banned-comparison vocabulary
   appears unsourced. This reuses the project's existing Gate 5 pack/catalog test-and-push
   mechanism rather than inventing a new one.

9. **Log which model produced each recipe's output, and treat a framing regression after an
   unpinned model update as drift, not a policy bug.** Agenta's prompt-drift piece documents
   "silent model updates" and "dependent prompt changes" as two of the three root causes of exactly
   this class of slow degradation. Since all ~12 recipes call Sonnet, a dated/pinned model
   reference plus a note of which model served each generation lets a future regression be
   attributed correctly (prompt edit vs. silent model change vs. input-distribution shift) instead
   of triggering a wrong-cause fix.

10. **Version the shared framing block like the claim gate is already versioned, and require the
    regression suite to pass before any edit to it merges.** Galtea's closing recommendation —
    treat a rubric/policy prompt "like code: version it, track which gold labels were produced
    under which version, recalibrate after material edits" — and Anthropic's "capability evals
    graduate into a continuously-run regression suite" both point the same direction: once this
    policy is validated, any future session editing `shared.ts`'s framing block should be forced
    through the same test gate that already blocks pack/catalog and vocab changes from shipping
    silently, so the ten call sites cannot individually drift out of sync with each other over
    time.

---

## Sources crawled (13 fetches, 9 distinct documents)

1. https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/system-prompts → redirects to
2. https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/use-xml-tags → same canonical page:
   **https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices**
3. https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/increase-consistency
4. https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/keep-claude-in-character → same page as #3
5. https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/multishot-prompting → same canonical page as #1/#2
6. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
7. https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
8. https://developers.openai.com/api/docs/guides/evaluation-best-practices
9. https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/advanced-prompt-engineering
10. https://hamel.dev/blog/posts/evals/
11. https://agenta.ai/blog/prompt-drift
12. https://galtea.ai/blog/llm-as-a-judge-prompts-templates-rubrics-and-best-practices
13. https://cookbook.openai.com/examples/gpt4-1_prompting_guide

Also referenced (background, not separately fetched — well-established public facts):
https://www.anthropic.com/research/constitutional-ai-harmlessness-from-ai-feedback (Constitutional AI overview page).
