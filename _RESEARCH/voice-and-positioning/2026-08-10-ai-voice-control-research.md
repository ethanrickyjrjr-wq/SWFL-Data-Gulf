# How to Get AI to Speak How You Want — Voice Control Research

**Date:** 08/10/2026
**Ordered by:** operator, verbatim: *"CRAWL4AI INSRUCTIONS ON HOW TO GET AI TO SPEAK HOW YOU
WANT IT TO BECUASE CLAUDE OBVIOUSLY DOESN'T KNOW."* Trigger: the New Listing narrator paragraph
repeated the description's "150 homes", recited the $225 HOA, wrote *"softens the inland
trade-off"*, and read like a model.
**Method:** crawl4ai (pinned CLI, RULE 0.4), two live sources. No memory-only claims.

**Pages crawled (2):**
1. https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing — the largest maintained catalog
   of measured AI-writing tells, with study citations per item.
2. https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
   — Anthropic's consolidated live prompting guide (both the multishot and system-prompts URLs
   redirect here now).

---

## Q1 — What actually steers voice (Anthropic, live doc)

1. **"Examples are one of the most reliable ways to steer Claude's output format, tone, and
   structure. A few well-crafted examples (known as few-shot or multishot prompting) improve
   accuracy and consistency."** A wall of prohibitions is the WEAK form; a worked
   Use-This/Not-This pair is the strong form.
2. **"Setting a role in the system prompt focuses Claude's behavior and tone for your use case.
   Even a single sentence makes a difference."** Our narrator prompt had no role at all — it
   opened with a job description, not an identity.
3. **"The formatting style used in your prompt may influence Claude's response style … try
   matching your prompt style to your desired output style as closely as possible."** A prompt
   written in stiff spec-language invites stiff spec-language back.

## Q2 — The measured AI tells (Wikipedia catalog, per-item study citations)

- **AI vocabulary** (multiple studies, post-2022 frequency spikes): *boasts* (for "has"),
  *vibrant*, *showcase*, *crucial*, *enhance*, *fostering*, *pivotal*, *underscore*,
  *testament*, *landscape/tapestry* (abstract), *nestled*. Co-occurring: one implies more.
- **Copulative avoidance:** *serves as / stands as / features / offers / boasts* replacing plain
  *is/has* — one study measured a >10% drop in "is/are" usage in 2023 academic text. Marketing
  verbs standing in for "has" are the listed tell.
- **Negative parallelisms:** "not just X, but Y", "isn't X — it's Y", "X rather than Y".
- **Rule of three:** adjective-adjective-adjective / three parallel phrases, used to make thin
  analysis look comprehensive.
- **Em-dash overuse** and **significance-summing clauses** ("...which means", "highlighting the
  enduring...", trailing "making it perfect for...").

## What was DONE with this (same session)

`lib/deliverable/recipes/shared.ts` `authorListingNarrative`:
- Role sentence added (SWFL agent writing to their own contacts, says it out loud, 3rd-grade
  register per playbook §1.9).
- `SOUND LIKE A PERSON` section bans the measured tells by name + a digit-free
  Use-This/Not-This worked example.
- Assignment rewritten: the GOOD around the home (community, beach, nearby) replaces the old
  "monthly HOA / $ per square foot" material; NEVER TALK ABOUT COSTS + NEVER A NEGATIVE
  (incl. concessives "even though/although/despite") added, each with a delete-only sentence
  filter in code behind it — a rule only in a prompt is a rule the model can miss.
- No-repeat rule extended to the seller's description ("150 homes" case, verbatim).

Related, already on file: `2026-07-15-sell-side-copywriting-research.md` (benefit-forward
framing, "numbers beat adjectives"), `_RESEARCH/email-and-social/2026-08-06-just-sold-craft-and-agent-email-voice.md`
(reader-is-the-hero voice card).
