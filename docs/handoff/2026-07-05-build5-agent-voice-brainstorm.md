# HANDOFF — Build 5 (brainstorm-only): the agent's own voice in commentary

## Mission

Produce a SPEC, not code. Ladder item 5 of
`docs/superpowers/specs/2026-07-05-agent-first-homepage-design.md`: the authored commentary should
carry the agent's own voice and brand, because the research found third-party generic content is
what makes agents "feel ingenuine" and generic AI voice is instantly mocked in their community.
This ticket = run `superpowers:brainstorming` with the operator + the mandatory crawl4ai research
pass, then write the spec and register the build. STOP after the spec is approved.

## Evidence base to load first (do not re-derive)

- SESSION_LOG 07/05/2026 entry "SPEC: agent-first homepage re-flip" — Reddit research bullets:
  "your newsletter should reflect you, not just the market. People connect with authenticity, not
  automation" (r/realtors); "ChatGPT slop" recognition; zero-context auto-stats dismissal. The voice
  work exists to answer these three, nothing else.
- Hard boundary that CANNOT move: the model never types a number. Voice shapes PROSE ONLY —
  `lib/email/author-doc.ts` (id-selection tool + `lintAuthoredProse`) stays the wall. Any voice
  mechanism must compose WITH the figure-menu architecture, not around it.
- Existing seams to consider extending (RULE C2 — extend, don't erect): the brand profile
  (`components/brand/BrandingBlock.tsx` fields + `lib/email/schedule`-side branding),
  `lib/email/author-recipes.ts` (advisory prose recipes — zero digits, non-enforced),
  and the per-mode system prompts in `lib/email/build-doc.ts`.

## Questions the brainstorm should put to the operator

- Where does voice come from: a short "how I talk" profile field? Sample emails the agent pastes
  (their own past sends)? Learned from edits they make in the lab? (Research pass should check what
  voice-capture patterns exist in the wild — crawl4ai, never Firecrawl.)
- Where is it applied: authoring only, or also the social calendar captions?
- Free vs paid: is voice a paid-tier feature? (Tier routing has ONE root:
  `lib/email/lab/capabilities.ts` — any tier decision lands there.)
- How is it kept honest: a voice must never soften the cited-figures discipline or smuggle
  hedge-encoding into hard numbers (speaker rules).

## Definition of done

- Spec at `docs/superpowers/specs/<date>-agent-voice-design.md`, operator-approved, committed;
  build registered via `node scripts/new-build.mjs agent-voice "<label>"`. NO implementation.
- SESSION_LOG entry with the research findings (RULE 0.4). STOP before push.
