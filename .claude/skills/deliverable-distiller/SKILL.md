---
name: deliverable-distiller
description: Use when the operator says "distill this" and hands a found email or social post (screenshot or URL). Reverse-engineers the find into committed artifacts — a prose recipe and/or a positioned skeleton — in the existing registries, with every invariant test-enforced. Operator factory only; users never see this machinery.
---

# Deliverable Distiller

Turn a found deliverable into library growth. One find per run (imports run one
at a time — parallel distillations collide on registry order and test updates).

**Spec:** `docs/superpowers/specs/2026-07-05-deliverable-distiller-design.md`

## Step 1 — Target surface

Email or social? This forks ONLY the emit step (Step 5). Capture, stripping,
and mapping are shared. If the find could serve both, distill the primary
surface first; the second is its own run.

## Step 2 — Capture

- **URL:** fetch with crawl4ai (`C:\Users\ethan\crawl4ai-venv\Scripts\python.exe`).
  Output stays LOCAL — `*crawl4ai*` is gitignored; never `git add` any of it.
  HTML capture preserves structure precisely; SKIP junk: tracking pixels,
  view-in-browser links, preference-center chrome, spacer hacks.
- **Screenshot/image:** Read it directly — vision is native to the session;
  zero paid API calls. Screenshot captures don't carry original images: every
  image slot becomes a placeholder/intent description, and the emit gets one
  extra polish pass (typography and spacing read less precisely from pixels).

## Step 3 — Strip content (non-negotiable)

NO source copy, figures, or images survive into any artifact. What you keep:
arrangement, hierarchy, rhythm, proportions, the conversion mechanics. What
you drop: every sentence, every number, every photo, the sender's brand
(colors, fonts, logos). Layout is an uncopyrightable system/method; the
expression is not ours to take.

## Step 4 — Map to our vocabulary

Read the registry you're emitting into FIRST — it is the live contract; this
skill only points at it.

**Email** (`lib/email/doc/types.ts` → `BlockType`; defaults in
`lib/email/doc/default-docs.ts` → `DEFAULT_BLOCK_PROPS`):
header, hero, stats, signal, text, image, listing, multi-column, list,
metric-card, agent-card, agent-hero, social-icons, button, divider, footer —
plus the semantic knobs existing recipes use (band light/dark/accent, pad
airy, overlay_title, N-of-twelve column spans). The AI author writes message
content only (kicker/value/label/prose/title/body/caption/alt/stats);
styling/link/identity fields are user-owned and stripped by the patch schema.

**Social** (`lib/social/design/types.ts` → `SocialElementType`):
text, image, stat, chart, cta, logo — positioned as x/y/width/height inside a
`SocialFormat`'s bounds (`lib/social/formats.ts`), honoring
`lib/social/safe-zones.ts`. Size fonts off `min(W,H)` and center vertical
stacks (see the `dims`/`stackTop` helpers in templates.ts) so one layout fits
every declared format.

## Step 5 — Emit

### Per-find decision rule (email)

- The find's value is a **repeatable pattern** (a structure the author should
  compose freely around) → **prose RECIPE**.
- The find's value is its **EXACT arrangement** (typography, spacing, a
  specific composition) → **SEED_DOC** in `lib/email/doc/default-docs.ts` — a
  fixed skeleton the content-patch path refills by block id.
- Both can ship when both halves are genuinely valuable; default is one.

### Email → RECIPE (`lib/email/author-recipes.ts`)

1. Add the id to `RECIPE_IDS`.
2. Add the prose entry to `RECIPES` — existing format exactly:
   - Header line: `RECIPE — NAME (one-line intent).`
   - `Target structure, top to bottom:` then ordered `- ` moves.
   - EVERY structural move carries its why-tag — the researched reason it
     converts. If the find introduces a pattern our evidence base (the
     provenance comments + specs already in the file) doesn't cover, fetch
     the evidence NOW via crawl4ai (RULE 0.4) before writing the tag.
   - ZERO digits (test-enforced) — numbers are words.
   - Footer line present: state that the footer with unsubscribe and postal
     address always renders (test-enforced).
   - Advisory tone — the model MAY deviate; never write a gate.
3. Wire detection: a new keyword regex + an explicit position in the fixed
   `detectRecipe` order, with a comment stating WHY that position (what must
   win before it, what it must beat). Update routing tests in the SAME commit:
   at least one positive case, precedence cases against both neighbors, and
   a near-miss that stays null.
4. Provenance comment above the entry:
   `// PROVENANCE: distilled from <source homepage URL>, found MM/DD/YYYY.`
   `// Why-tag evidence: <source — finding>, …`

### Email → SEED_DOC (`lib/email/doc/default-docs.ts`)

Append to `SEED_DOCS` following the existing `SeedDoc` shape (`id`, `name`,
`description`, `build()` minting fresh block ids via `seedBlock`). Every
placeholder is an **intent description** — what the section is FOR ("Letter
opening: why the reader is receiving this"), never sample copy. These become
the section briefs the future per-section UI surfaces. No `slot_intent` prop
(deferred, YAGNI). Provenance comment, same format.

### Social → TEMPLATE (`lib/social/design/templates.ts`)

1. New `SocialTemplate` factory `(tokens, format) => SocialDesign`:
   - Elements pre-positioned inside the format bounds via `dims`/`stackTop`.
   - Colors/fonts ONLY from `TemplateTokens` — the finder's brand never leaks.
   - **Fixed, readable element ids** matching `/^[a-z0-9]+$/` (test-enforced;
     NO hyphens, never minted). The author patches by id — a minted id ships
     placeholder text with no error.
   - Declare only the `formats` the geometry actually fits.
   - Placeholder text = intent descriptions, zero real figures ("$0" is the
     house placeholder convention for stat values).
2. Append to `SOCIAL_TEMPLATES`.
3. `templates.test.ts` asserts the EXACT offerable id list — update
   `offerableTemplates` expectations in the SAME commit. Decide explicitly:
   always offerable, or gated like `listing-feature`?
4. Provenance comment, same format as email.
5. Caption recipes (`build-content.ts`) are OUT of scope — do not add them.

## Step 6 — Verify (before commit, not by review vibes)

```bash
bun test lib/email/author-recipes.test.ts               # email emits
bun test lib/social/design/__tests__/templates.test.ts  # social emits
bunx next build                                          # the Vercel-truth typecheck
```

The registries' suites iterate `RECIPE_IDS` / `SOCIAL_TEMPLATES`, so every new
entry inherits the zero-digit, footer, bounds, fixed-id, and patch-contract
tests automatically. Stage explicit paths only. Commit, then stop — push is
operator-confirmed.

## What this skill never does

No new file formats or carriers. No new mandatory gate (RULE C2). No paid
vision/API calls (the session IS the model). No source copy or images in any
artifact. No edits to figure-menu id-selection, prose lint, brand-applied-last,
CAN-SPAM footer survival, block cap, or capabilities routing. `detectRecipe`
no-match stays byte-identical generic.
