# Grounding a build-time AI: constrained generation, abstention, and cheap context — Outlines/Self-Refine/CRITIC + Anthropic

**Date:** 08/12/2026
**Lane:** agent-behavior — a second, smaller crawl4ai pass (7 pages) run inside the Open House /
email-lab-AI debugging session, distinct from the same-day dedicated research agents
(`2026-08-12-validator-in-the-loop-generation.md`, `2026-08-12-grounding-abstention-and-context-injection.md`).
Extracted from `docs/handoff/2026-08-12-open-house-and-build-ai-grounding-handoff.md` §3, where it
sat unfiled — filed here per that handoff's §6 ("0 of 2").
**Feeds:** `docs/handoff/2026-08-12-open-house-and-build-ai-grounding-handoff.md` §4 Steps 3–4 —
grounding `app/api/email-lab/ai/route.ts` in project context + per-recipe constraints (ONE-AI-TWO-FEEDS),
and widening `validateNarrative()` into the live open-house narrator.

**COUNT LINE:** 7 of 7 pages crawled via crawl4ai, 0 failures. No Reddit/practitioner-forum pass —
this was a targeted doc-crawl inside a live debugging conversation, not a dedicated multi-source
research agent run. Treat as a smaller, faster companion to the two fuller research files above,
not a replacement.

---

## Topic 1 — grounding a build-time AI in structural constraints

- **Outlines** (github.com/dottxt-ai/outlines): most solutions "fix bad outputs **after**
  generation using parsing, regex, or fragile code"; Outlines "**guarantees structured outputs
  during generation**." Constrained decoding fixes *shape* (JSON/schema/grammar) — not prose
  length or "must contain an ask," which are semantic, not grammatical. **Implication:** constrained
  decoding is the wrong tool for the open-house narrator's actual failure mode (missing ask, wrong
  length) — those need a post-generation validator, which is what `validateNarrative()` already is.
- **Self-Refine** (arXiv:2303.17651, Madaan et al., v2 25 May 2023 — title/authors verified in the
  crawled abstract): generate → self-critique → refine, no training required; "~20% absolute"
  average gain across 7 tasks. The retry loop with the model as its own critic.
- **CRITIC** (arXiv:2305.11738, Gou et al., ICLR 2024): the model "interacts with appropriate tools
  to evaluate certain aspects of the text, and then revises the output based on the feedback" —
  emphasis on **external** feedback over self-critique. The literature analogue of wiring a
  validator into the loop, and an argument that our deterministic `validateNarrative()` is the
  *stronger* form (external, deterministic feedback beats the model grading itself — corroborated
  independently by findings #9/#10/#12 in `2026-08-12-validator-in-the-loop-generation.md`).
- **Honest gap:** no crawl this session returned a specific, citable write-up of "linters wired
  into AI code-review loops" or "form-filling assistants grounded against a schema." Not
  researched, not invented. (`2026-08-12-validator-in-the-loop-generation.md` finding #14 — the
  Codacy/deterministic-static-analysis post — is the closest analogue found elsewhere the same day.)

## Topic 2 — anti-hallucination / say what you don't know

External practice **validates** our existing doctrine (`refinery/lib/rules-of-engagement.mts`); it
does not challenge it.

- Anthropic, *Reduce hallucinations*
  (platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations):
  explicit permission to say "I don't know" ("drastically reduce false information"); ground in
  **direct quotes** pulled before the task; verify with citations — "if it can't find a quote, it
  must retract the claim"; restrict to the provided documents only.
- *Sufficient Context* (arXiv:2411.06037, Joren et al., v3 23 Apr 2025): strong models "excel when
  the context is sufficient, but **often output incorrect answers instead of abstaining when the
  context is not**"; their selective-generation method improves correct-answer fraction 2–10%.
  **Implication:** an unguarded email-lab AI asked "why don't I have X" confabulates by measured
  default — the fix is supplying the sufficiency signal, i.e. Step 3 of the build plan (the
  `recipeKey` → constraints resolver, so the model can see what it does and doesn't have).

## Topic 3 — broad project context + narrow per-task constraints, cheaply

- Anthropic, *Effective context engineering for AI agents*
  (anthropic.com/engineering/effective-context-engineering-for-ai-agents): context is "a finite
  resource with diminishing marginal returns," subject to **context rot** (independently measured
  at scale by the Chroma Research paper cited in `2026-08-12-grounding-abstention-and-context-injection.md`
  finding A); aim for "the **smallest possible set of high-signal tokens**." The named pattern is a
  **hybrid** — "CLAUDE.md files are naively dropped into context up front, while primitives like
  glob and grep allow it to… retrieve files just-in-time." Applied here: per-recipe constraints
  small and always-on; the broad project digest coarse, not exhaustive.
- Anthropic, *Prompt caching* (platform.claude.com/docs/en/build-with-claude/prompt-caching):
  caching covers `tools`, `system`, `messages` **in that order** up to the `cache_control`
  breakpoint; **5-minute** default TTL refreshed free on each hit, **1-hour** available; **cache
  reads 0.1× base input**, 5-min writes 1.25×, 1-hour writes 2×; put static content first. So both
  feeds (project digest + recipe constraints) belong **ahead** of the volatile document, behind a
  breakpoint.

All seven pages crawled 08/12/2026 via crawl4ai.

---

## APPLIED TO OUR BUILD

Ties directly into `docs/handoff/2026-08-12-open-house-and-build-ai-grounding-handoff.md` §4:

1. **Step 3 (ground the email-lab AI)** — Topic 2 + Topic 3 are the direct citations for why Feed 2
   (the `recipeKey` resolver) needs to hand the model an explicit "here's what you have, here's how
   to say you don't have the rest" surface, not just more raw data. Topic 3's caching guidance is
   the citation for putting both feeds ahead of the volatile document behind one `cache_control`
   breakpoint, as already specified in that step's failure-mode (b).
2. **Step 4 (widen `validateNarrative()` into the live narrator)** — Topic 1's Outlines/CRITIC
   framing is the citation for why this is a validator problem, not a constrained-decoding problem:
   the failure (no ask present, wrong length) is semantic/structural, not a JSON-shape problem, so
   generate → validate → one retry → fallback (CRITIC's external-feedback shape) is the right
   pattern, not schema-constrained decoding.
3. **Cross-reference, don't re-derive:** this file's Topic 1 overlaps in subject with
   `2026-08-12-validator-in-the-loop-generation.md` (same day, dedicated agent, far deeper — 15
   findings vs. 3 citations here) and this file's Topics 2–3 overlap with
   `2026-08-12-grounding-abstention-and-context-injection.md` (same day, dedicated agent, 24
   findings). Where they overlap, the dedicated files are the fuller source — this file exists
   because its citations (Outlines, Self-Refine, CRITIC specifically) do not appear in either of
   the other two and were already crawled and written up inside the handoff before this session
   filed them properly.

## HONEST GAP

- This was a 7-page targeted crawl run inline during a debugging conversation, not a dedicated
  research-agent pass — no Reddit/practitioner corroboration was attempted for these specific
  citations (unlike the two fuller files above, which did attempt it and reported their own
  Apify-cap losses). Treat Topics 1–3 as doc-verified but not practitioner-corroborated.
- No controlled comparison of Outlines-style constrained decoding vs. a post-hoc validator was
  found or attempted — the "wrong tool for this failure mode" conclusion above is architectural
  reasoning from the two papers' own stated scope, not a benchmarked result.
