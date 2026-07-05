# Deliverable Distiller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — 7 files, keywords: schema, architecture

**Goal:** Build the versioned operator factory (a project skill) that distills a found email or social post into committed artifacts — a prose recipe and/or a positioned skeleton in the existing registries — then prove it end-to-end with one email distillation and one social distillation.

**Architecture:** The method lives as a checklist skill at `.claude/skills/deliverable-distiller/SKILL.md` (first project skill in this repo). Distillations emit into the two EXISTING registries only: `lib/email/author-recipes.ts` (prose recipes + `detectRecipe` keyword routing) and `lib/social/design/templates.ts` (`SocialTemplate` factories). No new format, no new gate (RULE C2) — structure travels as block JSON we already own, guidance travels as prose.

**Tech Stack:** TypeScript, bun:test, crawl4ai (capture lane, local-only output), native vision (screenshot lane, zero paid API).

**Spec:** `docs/superpowers/specs/2026-07-05-deliverable-distiller-design.md` · **Check:** `deliverable_distiller_live_verify` (stays open — live send/post is operator-run).

## Global Constraints

- **Advisory only, no new gate** (RULE C2). Recipes append to `authorSystem`; no-match leaves the generic prompt byte-identical.
- **ZERO digits in recipe prose** — test-enforced (`author-recipes.test.ts`). Numbers are words: "six of the twelve columns".
- **Footer sentence in every recipe** — test-enforced: prose must contain "footer" (the unsubscribe + postal-address line always renders).
- **Content stripping:** NO source copy, figures, or images survive into any artifact. Layout is an uncopyrightable system; expression is not ours to take (copyright.gov FAQ, fetched 07/05/2026).
- **Social templates:** colors/fonts ONLY via `TemplateTokens`; element ids are FIXED, readable, and match `/^[a-z0-9]+$/` (test-enforced — a minted id ships placeholder text with no error).
- **`templates.test.ts:118` asserts the exact offerable id list** `["stat-hero","headline-cta","three-stat"]` — any new offerable template updates that assertion in the SAME commit.
- **crawl4ai is the ONLY web-crawl tool.** Interpreter: `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe`. All `*crawl4ai*` files stay local (gitignored) — never `git add` them.
- **Provenance comment on every distilled entry:** named source homepage URL + date MM/DD/YYYY + why-tag evidence refs.
- **Parallel session:** `lib/email/author-recipes.ts`, `author-recipes.test.ts`, `build-doc.ts` are dirty with session `44264cf6`'s uncommitted `sphere-weekly` work. If still dirty at execution, do email-side work in a worktree (`node scripts/worktree.mjs new distill`) per RULE 1.5. NEVER `git add -A`; explicit paths only.
- **Verify bar:** `bun test lib/email/author-recipes.test.ts` + `bun test lib/social/design/__tests__/templates.test.ts` + `bunx next build` (never bare `npx tsc`).
- **Commit, then STOP.** Push only on explicit operator confirmation (memory: no-autonomous-push). SESSION_LOG entry before any push.

---

### Task 1: The distiller skill document

**Files:**
- Create: `.claude/skills/deliverable-distiller/SKILL.md`

**Interfaces:**
- Consumes: nothing (first project skill; `.claude/skills/` does not exist yet).
- Produces: the method Tasks 2–4 execute. Later sessions invoke it with "distill this" + a screenshot or URL.

- [ ] **Step 1: Verify the referenced symbols exist as the skill will describe them**

Run (all should print matches — these are the contracts the skill document names):

```bash
grep -n "export type BlockType" lib/email/doc/types.ts
grep -n "export const DEFAULT_BLOCK_PROPS" lib/email/doc/default-docs.ts
grep -n "export const SEED_DOCS" lib/email/doc/default-docs.ts
grep -n "export type SocialElementType" lib/social/design/types.ts
grep -n "export interface SocialTemplate" lib/social/design/templates.ts
grep -n "designToSkeleton" lib/social/design/serialize.ts
```

Expected: each grep returns exactly one definition line. If any moved, fix the path in the skill text before writing it.

- [ ] **Step 2: Write the skill document**

Create `.claude/skills/deliverable-distiller/SKILL.md` with exactly this content:

````markdown
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
bun test lib/email/author-recipes.test.ts        # email emits
bun test lib/social/design/__tests__/templates.test.ts  # social emits
bunx next build                                   # the Vercel-truth typecheck
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
````

- [ ] **Step 3: Sanity-check the skill loads as a project skill**

Run: `ls .claude/skills/deliverable-distiller/SKILL.md` — file exists. Frontmatter has `name` + `description` (the loader's contract). No digits-in-prose concern here (the skill doc is not recipe prose).

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/deliverable-distiller/SKILL.md
git commit -m "feat(distiller): deliverable-distiller operator skill — found email/social → recipe/skeleton, invariants test-enforced"
```

---

### Task 2: First email distillation end-to-end (proves the method)

**Files:**
- Modify: `lib/email/author-recipes.ts` (append to `RECIPE_IDS`, `RECIPES`, one regex + one `detectRecipe` line)
- Test: `lib/email/author-recipes.test.ts` (routing cases; invariant tests auto-inherit)

**Interfaces:**
- Consumes: the Task 1 skill (follow it literally, step by step — this run is the proof it works).
- Produces: one new `RecipeId` + routing. Task 4 consumes the same find's capture notes for the seed-doc decision.

> Runtime input note: the recipe's prose is produced BY the distillation from the captured find — it cannot be pre-written here without making the plan the distillation. The steps below pin everything that is fixed: source, decision rule, wiring shape, and the test contract the output must pass.

- [ ] **Step 1: Parallel-session pre-flight**

Run: `git status --short lib/email/author-recipes.ts lib/email/author-recipes.test.ts`
- Clean → work on main.
- Still dirty (session `44264cf6`'s sphere-weekly hunks) → `node scripts/worktree.mjs new distill` and do Tasks 2+4 in `../bp-distill`; land with `node scripts/worktree.mjs land distill` after Task 5. Never stage the foreign hunks.

- [ ] **Step 2: Capture a find (URL lane — also proves the crawl4ai capture path)**

Source: reallygoodemails.com (public email-design gallery; named source for provenance). Operator-supplied finds substitute freely — the gallery is the default so the build never blocks (RULE 0.7 lane three).

```bash
C:\Users\ethan\crawl4ai-venv\Scripts\python.exe -c "import asyncio; from crawl4ai import AsyncWebCrawler; asyncio.run((lambda: AsyncWebCrawler().__aenter__())()) " # illustrative — use the house crawl pattern
```

Practical form (write a throwaway local script, output local-only):

```python
# scratchpad/crawl4ai-distill-find.py  (LOCAL ONLY — *crawl4ai* is gitignored)
import asyncio
from crawl4ai import AsyncWebCrawler

async def main():
    async with AsyncWebCrawler() as c:
        r = await c.arun(url="https://reallygoodemails.com/industries/real-estate")
        print(r.markdown[:8000])

asyncio.run(main())
```

Pick ONE email whose pattern the six existing recipes do NOT cover (existing coverage: agent intro/welcome, weekly sphere contrast, monthly newsletter, editorial letter, editorial showcase, magazine issue). Candidate gap-patterns to prefer: annual/year-in-review recap, open-house/event invitation, neighborhood guide. Then fetch THAT email's page for the structure read.

- [ ] **Step 3: Strip + map (skill Steps 3–4)**

Write the structure read as a local note (scratchpad, not committed): ordered block sequence in OUR vocabulary, knobs (band/pad/overlay/spans), and the conversion mechanics observed. Zero source copy in the note's recipe-bound parts.

- [ ] **Step 4: Write the failing routing tests FIRST**

Add to the `cases` array in `lib/email/author-recipes.test.ts` (concrete shape — ids/keywords finalized from the find; `<new-id>` is the chosen recipe id):

```ts
// <new-id> — distilled 07/05/2026 (see PROVENANCE in author-recipes.ts)
["<a natural prompt naming the pattern>", "<new-id>"],
["<precedence: a prompt that must STILL hit the earlier neighbor>", "<neighbor-id>"],
["<precedence: a prompt that must NOT fall through to the later neighbor>", "<new-id>"],
["<near-miss that stays generic>", null],
```

Run: `bun test lib/email/author-recipes.test.ts`
Expected: the new positive cases FAIL (recipe id not in `RECIPE_IDS`, `detectRecipe` returns null / wrong id). Existing cases all still pass.

- [ ] **Step 5: Emit the recipe (skill Step 5, email → RECIPE contract)**

In `lib/email/author-recipes.ts`, all four wiring points, following the sphere-weekly entry as the house pattern:
1. Append the id to `RECIPE_IDS`.
2. Add the regex with a placement comment (what wins before it, what it beats).
3. Add the `detectRecipe` line at that exact position.
4. Add the `RECIPES` entry: `RECIPE — …` header, ordered moves, why-tags (fetch missing evidence via crawl4ai per RULE 0.4 before tagging), zero digits, footer sentence, PROVENANCE comment with the find's homepage URL + 07/05/2026 + evidence refs.

- [ ] **Step 6: Run the suite**

Run: `bun test lib/email/author-recipes.test.ts`
Expected: ALL pass — new routing cases, and the inherited zero-digit / footer / RECIPE-header / length tests over the new id.

- [ ] **Step 7: Commit**

```bash
git add lib/email/author-recipes.ts lib/email/author-recipes.test.ts
git commit -m "feat(distiller): first email distillation — <new-id> recipe + routing (source: <domain>)"
```

(If in the worktree: commits land on `wt/distill`; land after Task 5.)

---

### Task 3: First social distillation end-to-end

**Files:**
- Modify: `lib/social/design/templates.ts` (new factory + `SOCIAL_TEMPLATES` append)
- Test: `lib/social/design/__tests__/templates.test.ts` (offerable-list assertion; registry invariants auto-inherit)

**Interfaces:**
- Consumes: Task 1 skill; `TemplateTokens`, `dims`, `stackTop`, `logoItem` already in templates.ts.
- Produces: one new `SocialTemplate` (`id` chosen from the find, e.g. `"quotecard"` — must match `/^[a-z0-9-]*$/` for the TEMPLATE id; ELEMENT ids inside must match `/^[a-z0-9]+$/`).

> `lib/social/**` is clean of foreign edits — this task runs on main regardless of Task 2's worktree decision.

- [ ] **Step 1: Capture + strip + map a social find**

Same skill steps. Source: a publicly fetchable example (public gallery/page via crawl4ai) or an operator screenshot (native vision — screenshot lane proof). Pick a layout the four existing templates do NOT cover (existing: stat-hero, headline-cta, three-stat, listing-feature). Candidate gaps: quote/testimonial card, before-after split, checklist/tips stack. Local structure note; no source copy.

- [ ] **Step 2: Write the failing test delta FIRST**

In `templates.test.ts`, update the exact-list assertion to include the new id (decide offerability explicitly — default: always offerable):

```ts
expect(offerableTemplates().map((t) => t.id)).toEqual([
  "stat-hero",
  "headline-cta",
  "three-stat",
  "<new-template-id>",
]);
```

Run: `bun test lib/social/design/__tests__/templates.test.ts`
Expected: FAIL — the list doesn't contain the new id yet. All other tests pass.

- [ ] **Step 3: Emit the template factory**

New factory in `templates.ts` following the house shape (statHero is the canonical example already in the file): `dims(format)` for geometry, fonts sized off `base = min(W,H)`, `stackTop` centering, `logoItem` if the layout carries a logo slot, every color/font read from `tokens`, fixed lowercase-alphanumeric element ids, placeholder text as intent descriptions, `formats` limited to what the geometry fits. Append to `SOCIAL_TEMPLATES`. PROVENANCE comment above the factory (homepage URL, MM/DD/YYYY, why-tag evidence).

- [ ] **Step 4: Run the suite**

Run: `bun test lib/social/design/__tests__/templates.test.ts`
Expected: ALL pass — the new factory inherits bounds, logo-overlap, deterministic-id, patch-round-trip, and no-logo-without-URL tests automatically via the `SOCIAL_TEMPLATES` iteration.

- [ ] **Step 5: Commit**

```bash
git add lib/social/design/templates.ts lib/social/design/__tests__/templates.test.ts
git commit -m "feat(distiller): first social distillation — <new-template-id> template (source: <domain>)"
```

---

### Task 4: Seed-doc decision for the email find (conditional)

**Files:**
- Modify (only if warranted): `lib/email/doc/default-docs.ts` (append to `SEED_DOCS`)

**Interfaces:**
- Consumes: Task 2's capture notes; `SeedDoc` shape + `seedBlock` from default-docs.ts.
- Produces: at most one new seed doc.

- [ ] **Step 1: Apply the decision rule and RECORD it**

Rule (from the skill): exact arrangement is the value → seed doc; repeatable pattern → recipe only. Task 2 already shipped the recipe; ship a seed doc IN ADDITION only if the find's typography/spacing/composition would be lost as prose. Write the decision + one-line reason into the Task 5 SESSION_LOG entry either way — "skipped, pattern not arrangement" is a valid, recorded outcome that closes this task.

- [ ] **Step 2 (only if emitting): Append the SeedDoc**

Follow the existing entries' shape exactly — `id`, `name`, `description`, `build()` returning `{ globalStyle: style(), blocks: [seedBlock(...), …] }`, first block `header`, last block `footer`. Every placeholder an intent description ("Letter opening: why the reader is receiving this"), never sample copy, no digits in placeholder prose. PROVENANCE comment above the entry.

- [ ] **Step 3 (only if emitting): Verify + commit**

Run: `bun test lib/email/doc` — expected: pass (schema tests cover seed docs).

```bash
git add lib/email/doc/default-docs.ts
git commit -m "feat(distiller): seed doc <id> — exact-arrangement skeleton from the email find"
```

---

### Task 5: Full verify, SESSION_LOG, handoff

**Files:**
- Modify: `SESSION_LOG.md` (top-of-file entry)

- [ ] **Step 1: Full verify bar**

```bash
bun test lib/email/author-recipes.test.ts
bun test lib/social/design/__tests__/templates.test.ts
bunx next build
```

Expected: both suites green; `next build` completes with no type errors. A red that reproduces without the diff → suspect flake first (loop it) before blaming the commit.

- [ ] **Step 2: Worktree landing (only if Task 2 used one)**

`node scripts/worktree.mjs land distill` — rebases and prints finish commands. Do not push yet.

- [ ] **Step 3: SESSION_LOG entry + commit**

Append a top-of-file entry: skill shipped, the two distillations (ids + named sources), the Task 4 decision + reason, tests green, `deliverable_distiller_live_verify` still OPEN (live send/post evidence is operator-run).

```bash
git add SESSION_LOG.md
git commit -m "docs(session-log): deliverable-distiller build — skill + first email/social distillations"
```

- [ ] **Step 4: STOP — show the log, ask before push**

Run: `git log --oneline origin/main..HEAD` and `git status --short`. Present to the operator; push (`node scripts/safe-push.mjs`, after checking for foreign commits per memory) ONLY on explicit confirmation. Do NOT close `deliverable_distiller_live_verify` — it closes when a distilled recipe/template produces a real deliverable end-to-end, operator-run.

---

## Self-review notes

- **Spec coverage:** skill doc (spec §1) → Task 1; email artifacts a/b/d (§2) → Task 2; seed doc c decision → Task 4; social a/b (§2) → Task 3; caption recipes explicitly out (§2c) → skill "never does" list; §3 untouched surfaces → skill "never does" list; testing section → Tasks 2–5 verify steps; build order 1-4 → task order.
- **Known runtime inputs:** recipe prose, template geometry, ids, and keywords come from the captured find at execution time — the plan pins the sources, decision rules, wiring points, and the test contracts they must pass; the skill doc (Task 1, complete in this plan) is the step-by-step procedure.
- **Type consistency:** `RecipeId` via `RECIPE_IDS` append (Task 2) matches the test's `RECIPE_IDS` iteration; `SocialTemplate`/`TemplateTokens`/`SOCIAL_TEMPLATES` names match templates.ts as read on 07/05/2026.
