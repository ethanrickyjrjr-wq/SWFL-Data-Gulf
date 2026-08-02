# lib/deliverable/ — sell-side vs story-side conventions (loads when you edit here)

> **READ FIRST → `docs/standards/emails.md` — the ONE email map** (pipeline, recipe dispatch,
> truth gates, render engines, send lanes, failure catalog). Doctrine detail stays in
> `docs/standards/deliverable-playbook.md`; this file is the in-context digest.

> **ALSO READ FIRST, UPDATE LAST → `docs/standards/repo-inventory-audit.md`** — `build.ts` and the
> 8 recipe files' LLM call sites (#llm-call-sites-email, `deliverable_build` callType) and the
> precompute gap where `buildDeliverableNarrative()` re-fires its Sonnet call on every
> `/api/deliverables/[id]/refresh` even when the source brain data hasn't moved
> (#precompute-candidates). Add/remove a recipe's LLM call or wrap a build step in a cache? Update
> the matching section in the SAME commit — that file exists so this audit never has to be re-run cold.

- **ONE LANE (08/02/2026):** `default-grid` in `recipes.ts` is the terminal fallback — every
  keyless/organic ask and every builder miss lands there (blank skeleton + sourced fill, open
  slots). Its builder (`recipes/default-grid.ts`) rides `fillSkeletonFromSources` and is TOTAL
  (empty context → the open-slot skeleton, never null, never invented). `Recipe.prose` names a
  `voice-presets.ts` VoicePresetId now — the advisory author-recipes registry is dead.
- **Every `Recipe` declares `positioning: "sell-side" | "story-side"`** (`recipes.ts`). Sell-side = pitches
  a specific property or the agent's own brand; story-side = recurring relationship/informational content.
  Adding a recipe? It will not compile without this field.
- **`FAVORABLE_FRAMING_POLICY` (`recipes/shared.ts`) is pasted VERBATIM into exactly THREE prompts** —
  `authorListingNarrative` (shared.ts), `authorUnderContractNote` (under-contract.ts), `buildNarratorPrompt`
  (market-comps.ts) — never paraphrased, never re-typed. **Never paste it into `authorAreaRead`
  (agent-brand-intro.ts) or `LETTER_SYSTEM` (agent-launch.ts)** — both carry an absolute no-numbers/no-facts
  constraint the block would contradict, not just leave unused. `positioning: "sell-side"` on those two
  recipes is a categorization fact only; it does not mean their prompts change.
- **The block's priority sentence is load-bearing:** cited facts — including unfavorable ones — are never
  dropped, softened, or omitted. Favorable framing governs emphasis and ordering, never which facts appear.
- **A big, sourced gap is stated directly, not hedged — and this must be direction-symmetric.** A tier or
  instruction that only sharpens language when the gap flatters the subject is spin, not authority — see
  `buildPriceCase`'s magnitude tier in `market-comps.ts` for the reference implementation.
- **Charts carry the argument too.** Where a recipe's sourced data supports a real magnitude claim, prefer a
  chart over prose alone (see `price-reduced.ts`'s `priceVsAreaDotSpec` for the pattern: reuse an existing
  frame — `dot-plot`/`z-gauge` for "one value vs. a reference" — rather than inventing a new renderer).
- **Full doctrine, citations, and the recipe table:** `docs/standards/deliverable-playbook.md` Part 10.
- **Design doc + research (do not re-derive):** `docs/superpowers/specs/2026-07-15-sell-side-favorable-framing-design.md`,
  `_ASSISTANT/research/2026-07-15-sell-side-copywriting-research.md`,
  `_ASSISTANT/research/2026-07-15-ai-steering-anti-drift-research.md`,
  `_ASSISTANT/research/2026-07-15-authority-reasoning-not-hype-research.md`.
