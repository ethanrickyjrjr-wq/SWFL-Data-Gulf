# ⛔ TYPOGRAPHY IS DECIDED. DO NOT PICK A FONT, A SIZE, OR A CLIPPING RULE.

**The two roots, both COMMITTED and readable — `docs/design-reference/` was UN-GITIGNORED
08/06/2026 for exactly this reason:**

- `app/_design/05-color-and-type.md` — **Display: Inter Display** (or General Sans / Söhne).
  **Body: Inter**, weight 400 body / 500 emphasis. **Mono: JetBrains Mono** (or IBM Plex
  Mono), weight 500. **Numbers: `font-variant-numeric: tabular-nums`, always** — its own
  words: *"so columns of numbers align."*
- `docs/design-reference/colors_and_type.css` — the executable token file. `--font-display`
  and `--font-body` = Inter, `--font-mono` = JetBrains Mono, plus the scale (hero clamp
  3–5rem / h1 2.75 / h2 1.75 / metric 2.25 / body 1 / small+label 0.875 / caption 0.75rem),
  line-heights 1.08 display · 1.55 body · 1.4 caption, tracking −0.02em display · +0.06em
  label, and the 8px tokens 4/8/12/16/24/32/48/64/96. Stated direction: *"sharp
  financial-adjacent display type, tabular figures, borders not shadows."* Take the
  direction, re-implement in our stack — its README says do not ship it as-is.

**Executable form for email:** `lib/email/blocks/scale.ts` (`text(role)` — seven roles, size +
weight + leading TOGETHER) and `lib/brand/fonts.ts` (the six brand families, every engine).
A raw `fontSize`/`fontWeight`/`lineHeight`/`fontFamily` fails `blocks/type-conformance.test.ts`.

## THREE RULES THAT WERE WRITTEN DOWN AND OBEYED NOWHERE — all three fixed 08/06/2026

1. **NUMBERS CARRY TABULAR FIGURES.** Use `TABULAR` from `lib/charts/format.ts` on every SVG
   text node that renders a number. Not one of the 15 SVG chart builders did, so a stat row
   showed aligned figures while the chart directly beneath it showed proportional ones — same
   email, same numbers. Labels stay proportional; only NUMBERS align.
2. **NEVER FIT TEXT BY CHARACTER COUNT.** Use `fitText` / `labelGutterFor` / `measureText`
   from `lib/brand/text-metrics.ts`, which read real advance widths out of the bundled TTFs.
   A character budget is blind on two axes at once — measured off our own faces 08/06/2026:
   the same 22 characters span **1.14x across our six faces** and **3.08x inside Montserrat
   alone** (87.4px of "1" versus 268.9px of "W" at 11px). It was never right for any font:
   under the old 26-character budget `"Whiskey Creek 33919 — SOLD"` passed untouched and
   painted **20.7px over the bars in Liberation Sans** — the incumbent Arial-metric face,
   before any brand font was wired. The `s.length > N ? s.slice(0, N-1) + "…" : s` idiom is
   BANNED in any rendered surface.
3. **A GUTTER IS MEASURED, NOT PINNED.** `labelGutterFor(labels, {...})` sizes the label
   column to the real labels in the face that will actually rasterize, clamped at both ends.
   The pinned `padL = 150/156` was wrong in both directions at once: ZIP labels wasted a
   quarter of a 600px canvas, and street addresses were cut against a gutter nobody measured.

**The face must reach the BUILDER, not just the rasterizer.** `fontFamily` threads recipe →
`chartSpecToEmailImage` → `chartSpecToEmailSvg` → every builder → `svgToPng`. Handing it only
to `svgToPng` rasterizes the right typeface into a layout fitted for a different one — which
is exactly how a label that "passed" its budget still overflowed.

---

# lib/deliverable/ — sell-side vs story-side conventions (loads when you edit here)

> **CODING A RECIPE? → `docs/standards/emails.md` §0 "BEFORE YOU CODE A RECIPE" FIRST.** The
> rules card: body **50–125 words** (the floor bites harder than the ceiling), 1–3 questions,
> 3rd-grade reading level, never neutral; per-TYPE numbers (triggered beats newsletter, drip CTR
> halves after msg 2); subject **3–4 words for a reply, 30–40 chars for an open**; the 5-part
> skeleton, one CTA, type scale + 8px grid + canvas, Outlook/dark-mode/102KB render constraints,
> logo, CAN-SPAM, and the market-report content order — one place, each number pointed at the code
> root that owns it. Recipes are exactly what §0 was written for.

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
- **`FAVORABLE_FRAMING_POLICY` (`recipes/shared.ts`) is pasted VERBATIM into exactly TWO prompts** —
  `authorListingNarrative` (shared.ts) and `buildNarratorPrompt` (market-comps.ts) — never paraphrased,
  never re-typed. (**Was three.** `authorUnderContractNote` was the third and died with the July
  under-contract recipe, rewritten new 08/06/2026. The replacement carries no narrator prompt of its
  own: it calls the shared `authorListingNarrative`, so it inherits the block rather than pasting a
  second copy — which is the preferred shape for any new recipe.) **Never paste it into `authorAreaRead`
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
