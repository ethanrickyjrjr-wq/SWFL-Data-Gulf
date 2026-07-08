# Email Builder — Integration System ("bring it all together")

## Context

Recent sessions dropped new capabilities into the repo — react-email preview, Storybook +
Playwright visual regression, an email voice guard, new chart frames, a grid/fence design
system, and reference card/widget catalogs. Each arrived via its own spec. **What's missing
is the connective tissue** — the system that lets the AI builder (and the user) pick from a
menu of blocks + charts, arrange them under research-backed guardrails **without collapsing
into one look**, bind every number to real data, and verify the result.

Operator intent (07/08/2026), verbatim spirit: fences are for the AI, and *somewhat* for the
user — a strong research-backed floor, **not handcuffs**. We must still create many different
looks: multiple layouts, different border treatments, different photo placement and **sizes**.
We lead with research-backed defaults, then grow into **recipes** the user can pick from and
**modify heavily**, finally **saving their own full-time brand setup**. Project creation must
keep working. Charts + widgets move to a handoff doc, not this plan's execution.

## Ground truth (verified in code this session)

1. **Fences 1/2/5 do NOT need a new plan→fill pipeline.** A forced-tool funnel already exists:
   `AUTHOR_TOOL` (Anthropic `tool_choice`-forced JSON schema) → `AuthoredBlockSchema` →
   `assembleAuthoredDoc` → `deriveLayout`. It's **clamp/repair**, not reject/fallback. New fences
   plug in here — no second LLM call, no added latency/spend.
2. **A saveable brand already exists.** `resolveUserBrand` (`lib/email/templates/resolve-brand.ts`)
   cascades **`projects.branding` → `user_brand_profiles` → prompt**. Today it stores only
   primary/accent/logo. "Save my full-time brand setup" = **extend this existing seam** (add fonts,
   blessed-pairing choice, default photo ratio, border style, preferred recipe) — not net-new plumbing.
3. **Fence 3 currently over-locks.** Shipped code hard-locks EVERY `kind:"photo"` image to 3:2.
   That fights "photo sizes the user may like." It must become a **blessed ratio SET** (3:2, 4:3,
   4:5, 1:1), default 3:2, user-choosable — variety within a researched set, not one forced ratio.
4. **The builder lives inside projects.** `app/project/[id]/email-lab/ProjectEmailLabClient.tsx`
   renders the same `EmailLabGridShell` + uses `resolveUserBrand`. Protecting project creation = an
   explicit verification step, and M1 being behavior-neutral.

## The mental model — a bounded DESIGN SPACE, not one design

Three planes, one loop — but the fences define the **broad legal bounds of a variety space**,
not a single template:

- **SUPPLY** — what can occupy a grid cell: block kinds + chart frames. What the AI picks from
  AND what the user drags in.
- **FENCES = the bounds of the design space.** Wide enough for real variety, tight enough to keep
  the floor high. Enforced **hard for the AI** (can't leave the space) and **soft for the user**
  (guided/warned, can push further, and what they settle on can be saved as their brand).
- **DATA** — real figures bound into every cell (`fetchLakeParts` + `bind-frame` + id-selection moat).

**Variety axes inside the space** (this is how we get "different looks"):
- *Layout* — blessed span multisets `{12}/{6,6}/{8,4}/{7,5}/{4,4,4}` = 5 row archetypes, freely combined.
- *Photo* — ratio SET (3:2/4:3/4:5/1:1), placement (left/right/full via flip-to-correct), size (span).
- *Border/style* — border treatment + radius as a design dimension (new; today it's a fixed render detail).
- *Emphasis* — `band`/accent (budgeted, not banned).
- *Typography* — research-backed blessed pairings; user can override when building their brand.

**Recipes = curated named points in the space** (research-backed defaults to lead with), which the
user can select, modify heavily, and **save to their brand profile** as a personal full-time setup.

**Anti-forgetting spine:** today "what exists / what's legal / what varies" is duplicated across
`KNOWN_TYPES`, `BLOCK_MENU`, `CHART_REGISTRY`, `AUTHOR_TOOL` schema, and the recipes, and drifts.
One shared contract every consumer reads from is both the enforcement point AND the variety registry.

## Build order (operator-confirmed)

### M1 — Shared supply/design contract, big-bang converge  *(operator: "big bang… we get it done")*
- One contract: block kind → allowed zone(s), allowed spans, **variety axes** (photo ratios,
  border styles, band options), data-bound?, chart-capable?, user-addable?.
- Refactor ALL consumers to read from it in one PR: `AUTHOR_TOOL` schema builder, `AddBlockPanel`,
  `deriveLayout`/`assembleAuthoredDoc` validators, `CHART_REGISTRY` lookup.
- Behavior-neutral (encodes TODAY's rules first) + comprehensive seam tests + `bunx next build` clean.
  This is a >5-file refactor — operator gave explicit buy-in (RULE 1).

### M2 — Fences as bounds of the space (hard AI / soft user)  *(closes `fences_1_2_5_need_planfill_layer`)*
- **Fence 1 (blessed spans):** span enum in schema; blessed-**pair** check (unordered multisets, so the
  existing `[4,8]` seed stays legal) in `deriveLayout`; AI clamped, user warned-not-blocked.
- **Fence 2 (zones OPEN/BODY/CLOSE):** validate at merge; hard for AI, advisory for the user's manual edits.
- **Fence 3 → blessed ratio SET:** replace the single 3:2 lock with {3:2,4:3,4:5,1:1}, default 3:2, user-choosable.
- **Fence 5 (accent budget ≤2):** guardrail; hard for AI, soft for user.
- **Flip-to-correct:** pure left↔right prop-flip for canvas reorder (photo placement variety, no model call).
- Verify: unit tests at the `deriveLayout`/schema seam; react-email fixture per fence.

### M3 — Recipes + saveable brand (the "many looks, save your own" layer)
- Recipes become **selectable + modifiable** design variants (research-backed defaults first), not just
  advisory prose. User modifications persist by **extending `user_brand_profiles`/`projects.branding`**
  (fonts, pairing, default photo ratio, border style, preferred recipe) through `resolveUserBrand`.
- This is where "modify more than most would want, then save as full-time brand" lands.

## HANDOFF (documented, NOT executed in this plan)
- **Widgets (light):** rebuild a few frankuxui patterns (earnings stat, sparkline, avatar stack) as
  `stats`/`list` variants registered in the M1 contract; observe AI output before going richer.
- **bklit charts (web only):** better-looking on web (visx+motion), MIT; NOT easier (adds `@visx/*`+`d3`
  + theme bridge); does NOTHING for email (still PNG). Deeper "charts suck" fix is data-binding, below.
- **Data-bound cells:** stat/chart cells pick real figures from `fetchLakeParts` instead of free text.

## What the user can do vs the AI

- **User (soft-fenced):** drag blocks, resize via presets, choose photo ratio/placement/size, pick a
  recipe and modify it, edit text, add media/brand — guided by fences but able to push further, then
  **save the result as their brand**.
- **AI (hard-fenced):** one prompt → full in-bounds layout from supply, data-bound; per-block re-author; fill.
- **Never authored (moat):** brand identity, links, numbers (id-selection only).

## Critical files
- Contract + fences: `lib/email/author-doc.ts` (`AUTHOR_TOOL`, `assembleAuthoredDoc`, `deriveLayout`),
  `lib/email/doc/schema.ts` (`AuthoredBlockSchema`), `lib/email/build-doc.ts`.
- Photo ratio: `lib/email/blocks/ImageBlock.tsx`. Flip/canvas: `components/email-lab/{GridCanvas,EmailLabGridShell}.tsx`.
- Recipes/brand: `lib/email/author-recipes.ts`, `lib/email/templates/resolve-brand.ts`,
  `lib/deliverable/brand-theme.ts`, `user_brand_profiles`/`projects.branding` tables.
- Verify harness: `emails/*.tsx`, `.storybook/`, `emails/visual-regression.spec.ts`.

## Verification
- **Project creation stays green (explicit):** create a project, open its Email tab, build with AI +
  manually — before and after M1. `resolveUserBrand` cascade unaffected.
- `bunx next build` clean; full `lib/email` suite green; unit tests at each new seam.
- react-email fixture + Playwright screenshot per new fence/variant.
- Prove variety: generate 3+ visibly different layouts from the same prompt to confirm fences don't monoculture.
- Each milestone: SESSION_LOG entry + close/flip the relevant check.

## Operator decisions (07/08/2026)
1. Order: supply contract FIRST (confirmed coherent with the research), then fences, then recipes/brand.
2. Fences hard for AI, soft for user; variety is first-class — never one forced design.
3. Widgets = light + handoff; charts = handoff (web-only); data-bound = handoff.
4. Supply contract = big-bang converge (explicit >5-file buy-in).
5. Must not break project creation.

## M3 status (07/08/2026) — recipe-picker DONE, brand type-lift STAGED

**Shipped (no migration, no `BrandTheme` ripple):**
- Recipes are now user-SELECTABLE: `resolveRecipe(explicit, prompt)` (author-recipes.ts) —
  an explicit pick wins over keyword detection; unknown/empty falls back. `RECIPE_LABELS` +
  `isRecipeId` added. Wired: `BuildArgs.recipeId` → `authorDoc` → `/api/email-lab/ai` → a
  recipe `<select>` in `EmailLabGridShell`. The pick lives in the brand blob
  (`branding.preferred_recipe`), so it persists to **projects.branding JSONB** on brand-save
  and round-trips (project scope). `brandingToTokens` ignores it (no visual side effect).

**STAGED — ready, NOT run (operator call: run the migration under supervision):**
Migration file written: `docs/sql/20260708_user_brand_variety_defaults.sql` (adds
`preferred_recipe`, `default_photo_ratio` to `user_brand_profiles`). To finish M3-B, in ONE
atomic diff (phantom columns = compile errors, so these move together):
1. Run the migration (idempotent) + verify the two columns exist.
2. Regenerate the typed Supabase client (`database-generated.types.ts`) so the new columns type.
3. `app/api/user/brand/route.ts`: add a `PREFERENCE_FIELDS = ["preferred_recipe",
   "default_photo_ratio"]` group to BOTH `BASE_SELECT` (GET) and the PATCH write loop — mirrors
   the existing FONT_FIELDS/CONTACT_FIELDS pattern. (Do NOT land this before step 1: the GET
   `BASE_SELECT` has no missing-column fallback, unlike `color_palettes`.)
4. Seed the lab picker from the account profile (GET `/api/user/brand`) on first Brand-panel
   open, same as agent fields, so a saved default carries to NEW projects.
5. (Optional, pairs with the type-lift) Apply `default_photo_ratio` on build: thread it into
   `assembleAuthoredDoc` so authored `kind:"photo"` blocks get `props.ratio` = the saved default
   (today photos default 3:2 in `ImageBlock`; per-block ratio picker already ships from M2).

**Also deferred (checks opened):** M2 soft span/accent WARNINGS in the canvas (AI already
hard-clamps; user path unblocked, just not yet nudged) + react-email visual-regression fixtures
per fence (CI-only).
