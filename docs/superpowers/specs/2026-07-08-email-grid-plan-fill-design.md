# Two-phase plan+fill grid authoring for Email Lab

**Date:** 2026-07-08

## Problem

`authorDoc()` (`lib/email/build-doc.ts:767`) composes a whole email in ONE forced
tool-call (`callAuthor`, capped at `AUTHOR_MAX_TOKENS = 8192`): the model picks
every block, every row grouping, every band/pad styling choice, AND writes all
the copy, all in a single pass. Operator-observed failure modes, confirmed
against the code:

1. **Styling drift row to row** — `band`/`pad` are decided per-block, in the same
   pass as everything else, with nothing forcing row 6's choice to agree with
   row 1's.
2. **Weak/repetitive layout** — the model pattern-matches to a generic shape
   instead of visibly planning against the specific recipe + data on hand.
3. **Truncation on bigger builds** — more content packed into the same
   `AUTHOR_MAX_TOKENS` ceiling risks a cut tool_use call losing blocks or fields.

## Research (crawl4ai + WebSearch + SteadyAPI social sweep, 07/08/2026)

Four independent sources converge on the same fix:

- **Anthropic's multi-agent engineering post**
  (anthropic.com/engineering/multi-agent-research-system): fully independent
  parallel agents are the wrong shape for tasks that share context/state —
  exactly what per-row styling is. Multi-agent also runs ~15x the token cost of
  a single call; not justified here.
- **Vercel/shadcn "registry" pattern** (v0.app/docs/design-systems): a registry
  passes "components, blocks, and design tokens" to the model as context so it
  composes from real pre-built pieces rather than raw markup — already how
  `AUTHOR_TOOL`'s block vocabulary works here.
- **PrototypeFlow** (arXiv 2412.20071v3): an academic system that generates a
  frozen "Theme Design" once, then executes per-component sub-modules against
  it. Human eval: 4.2/5 on maintained thematic consistency, vs **plain v0
  (single-shot generation) scoring only 3.5/5** — direct evidence single-shot
  generation is measurably worse at cross-block consistency. Ablation: removing
  their knowledge-retrieval/grounding module hurt quality more than removing the
  theme module itself (FID 23.76 → 42.56, the largest drop of any ablation) —
  the grounded DATA MENU + BLOCK VOCABULARY this repo already has is the
  single biggest lever, theme-freezing is the next one.
- **Real practitioner sentiment** (SteadyAPI Reddit/Instagram sweep,
  `new_steady` key): r/formblocks — "AI doesn't need to generate entire
  components. It only needs to generate a structured configuration. The
  framework guarantees rendering, validation, and behavior... Predictability is
  the feature." r/VibeCodeDevs (91 upvotes) — a builder scraping a site's real
  design tokens FIRST, then handing the AI a frozen design system, to fix
  "vibe coded sites all looking the same." Instagram (`uiux.subash`, recurring
  theme) — "a design system starts with structure," `DESIGN.md` as a written
  contract the AI reads before generating.

Conclusion: freeze structure + style once, then fill content against that
frozen contract — not a single pass, not fully-parallel independent agents.

## Goal

Fix all three failure modes without touching anything downstream of assembly:
`assembleAuthoredDoc`, the no-invention lint, `voiceGuard`, brand overlay, and
the free content-patch path (`buildContentDoc`) stay untouched. The blast
radius is `callAuthor` and what feeds it.

## What we're building

### Two calls instead of one

**Phase 1 — PLAN** (`planEmail()`, new `PLAN_TOOL`, forced tool call). Decides
structure and style ONLY — no prose. Input: the recipe, the block vocabulary,
the figure menu's ids + labels only (never the formatted values — PLAN
references a figure, it never needs to quote one), chart/photo/asset
availability as booleans. Output schema — rows as a nested array (not flat blocks + `new_row`
flags — removing that footgun is a free byproduct of splitting the phases):

```
rows: [
  {
    band?: "light" | "dark" | "accent",
    pad?: "airy" | "normal" | "tight",
    blocks: [
      { type: "hero", span: 12, value_figure?: "f2", image_role?: "chart"|"photo", asset?: "a0" }
    ]
  },
  ...
]
schedule_suggestion?: { cadence, reason }   // unchanged from today
```

This call is small by construction (no prose fields at all), so it can never
approach a token ceiling regardless of email size.

**Phase 2 — FILL** (`fillRow()`, new `FILL_ROW_TOOL`, one forced call per row,
run in `Promise.all` — genuinely parallel). Each call receives: that row's
block skeleton from the plan (types + any `value_figure`/`asset`/`image_role`
already chosen), ONLY the menu figures referenced by that row (not the whole
menu), and a one-line neighbor-context string built from the plan's row *types*
by the orchestrator (e.g. "previous row: property hero. next row: agent
sign-off.") — zero extra model calls to produce. Output: content fields only
(`kicker`/`prose`/`title`/`body`/etc.), reusing the exact same `AuthoredBlock`
content shape `applyContent()` (`author-doc.ts:386`) already consumes.

This is the parallel-but-safe shape: what Anthropic warns against is parallel
agents each *deciding shared state* independently. Here the shared state
(style/structure) is already frozen by PLAN before fan-out; FILL's freedom is
narrowed to content only, so nothing the row-fill calls decide can conflict.

### Merge, unchanged downstream

Concatenate every row's filled blocks, in plan order, into one flat
`AuthoredBlock[]` (row boundaries become `new_row` booleans) — the exact shape
`assembleAuthoredDoc` already accepts. No changes to assembly, the no-invention
lint, `voiceGuard`, or the regenerate-once-then-strip repair loop
(`build-doc.ts:971-1024`): they keep reading one merged `AuthoredDoc`, same as
today.

### Fallback ladder (never block a build — RULE 0.7 spirit)

1. PLAN call fails to parse → fall back to today's existing single-shot
   `callAuthor()` untouched. Zero regression risk: today's path becomes the
   safety net, not a deleted code path.
2. One row's FILL call fails/misparses → retry that row once; still failing →
   drop that row's content blocks (never abort the whole build). The footer is
   already guaranteed separately by `assembleAuthoredDoc` regardless.
3. Final merged doc still fails the no-invention lint or `EmailDocSchema` →
   identical existing fallback to `currentDoc` with a "try rephrasing" message.

### Caching

Both `PLAN_TOOL` and `FILL_ROW_TOOL` get `cache_control: ephemeral` on their
static description/schema, mirroring `AUTHOR_TOOL`'s existing pattern
(`author-doc.ts:120`) — the mechanism already proven in this codebase, not a
new one.

### Testing

- Pure unit tests: `PLAN_TOOL`/`FILL_ROW_TOOL` schema parsing, and the
  rows→flat-`AuthoredBlock[]` merge function (fully deterministic, no I/O).
- Golden-path test: mock PLAN + FILL responses for one recipe (`agent-intro`),
  assert `assembleAuthoredDoc` output matches today's expectations.
- Fallback test: simulate a PLAN parse failure, assert the existing
  `callAuthor()` single-shot path runs unchanged.
- Fallback test: simulate one row's FILL failure, assert that row is dropped
  and the rest of the build still succeeds.

### Explicitly out of scope

- The free-tier `buildContentDoc` content-patch path — untouched.
- Any change to `AUTHOR_TOOL`'s existing block vocabulary, the DATA MENU, the
  no-invention lint, or `voiceGuard` — all reused as-is.
- Fully-parallel independent per-row agents deciding their OWN style — the
  research above argues directly against this shape.
