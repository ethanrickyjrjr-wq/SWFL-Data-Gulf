# One-Lane Email Recipes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 6 tasks, 10 files, keywords: schema, architecture

**Goal:** Collapse email building to one lane — every build lands on a coded-grid recipe; the free-author layout path dies; typed asks get a default grid plus navigation-only suggestion chips; the 11 advisory recipes become voice presets.

**Architecture:** The structural registry (`lib/deliverable/recipes.ts`) gains a `default-grid` key whose builder loads the blank skeleton and fills open slots through the EXISTING sourced-fill machinery (`buildContentDoc`'s fill path — already re-fills fixed skeletons). `authorDoc`'s dispatch gains `?? default-grid` as terminal fallback and deletes the free-author layout path in the same commit. Advisory prose moves to `lib/email/voice-presets.ts`.

**Tech Stack:** TypeScript (Next.js app code, NOT Deno — `supabase/functions` rules do not apply here), bun test, Zod (`EmailDocSchema`).

**Spec:** `docs/superpowers/specs/2026-08-02-one-lane-email-recipes-design.md` — read it first; the 9 failure modes there name the tests here.

## Global Constraints

- Verify compilation with `bunx next build` — never `npx tsc` (operator rule).
- Stage explicit paths only — never `git add -A` (RULE 1.5).
- Commit locally; do NOT push. Push is per-approval, operator's call, every time.
- No new tables, no ingest, no `data_lake.*` writes, no brain/pack changes.
- Task 3's commit must contain BOTH the keyless→default-grid routing AND the free-author deletion — no commit may route keyless builds to the default grid while the free author still exists (spec §B).
- Every email number is sourced or an open slot — never invented. Open slots render on canvas, are absent from sends (existing behavior — do not re-implement).
- Touched packs/vocab? Not in this plan — if you find yourself editing `refinery/`, stop; wrong plan.
- `lib/email/CLAUDE.md` and `lib/deliverable/CLAUDE.md` load conventions when editing there — read them at task start.

---

### Task 1: `default-grid` registry entry

**Files:**
- Modify: `lib/deliverable/recipes.ts` (RECIPE_KEYS ~line 50, RECIPES ~line 156)
- Test: `lib/deliverable/recipes.parity.test.ts` (extend)

**Interfaces:**
- Produces: `"default-grid"` as a valid `RecipeKey`; `RECIPES["default-grid"]` entry. Later tasks rely on the literal key string `"default-grid"`.

- [ ] **Step 1: Write the failing test** — append to `recipes.parity.test.ts`:

```ts
describe("default-grid — the terminal fallback recipe (one-lane collapse)", () => {
  test("exists in the registry with the fallback contract", () => {
    const r = RECIPES["default-grid"];
    expect(r).toBeDefined();
    expect(r.subject).toBe("area");
    expect(r.positioning).toBe("story-side");
    expect(r.chart).toBe("none"); // ask-driven charts ride the fill path, not the policy
    expect(r.target ?? "email").toBe("email");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `bun test lib/deliverable/recipes.parity.test.ts` → FAIL (`default-grid` not in Record; a TypeScript error is the same failure).

- [ ] **Step 3: Minimal implementation** — in `RECIPE_KEYS`, after `"market-pulse"` and BEFORE the social group, add:

```ts
  // The terminal fallback — every keyless/typed ask lands here (one-lane collapse,
  // spec 2026-08-02). A coded grid with open slots; NEVER free-form layout.
  "default-grid",
```

In `RECIPES`, add (same position order):

```ts
  "default-grid": {
    key: "default-grid",
    positioning: "story-side",
    label: "Market Email",
    // The blank skeleton every recipe arrival already opens (emails.md §2 step 1).
    skeleton: "skeleton-clean-white",
    prose: null,
    subject: "area",
    // Policy "none" = no FORCED chart. An ask that is about a number still gets its
    // chart from the fill path's buildChartForQuestion — ask-driven, not policy-driven.
    chart: "none",
    prompt:
      "Build a market email for [[your city or ZIP]] — real figures with named sources, and open slots for anything we can't source.",
    needs: ["agent_name", "brokerage", "business_address"],
  },
```

- [ ] **Step 4: Run tests** — `bun test lib/deliverable/recipes.parity.test.ts` → PASS (all pre-existing 17 + new). If a parity test enumerates surfaces offering each key, follow its failure message: default-grid is NOT a door/showcase card yet — mirror how `social-pack` is exempted if the test demands a surface.

- [ ] **Step 5: Commit** — `git add lib/deliverable/recipes.ts lib/deliverable/recipes.parity.test.ts && git commit -m "feat(recipes): register default-grid, the terminal fallback recipe"`

---

### Task 2: `fillSkeletonFromSources` seam + default-grid builder

**Files:**
- 🔴 Modify: `lib/email/build-doc.ts` (extract seam near `buildContentDoc`, ~line 704)
- Create: `lib/deliverable/recipes/default-grid.ts`
- Test: `lib/deliverable/recipes/default-grid.test.ts`

**Interfaces:**
- Consumes: `RecipeBuildContext` (`lib/deliverable/recipes/index.ts:53`), `EmailDocSchema` (`lib/email/doc/schema.ts`), `SEED_DOCS` (`lib/email/doc/default-docs.ts`).
- Produces: `fillSkeletonFromSources(args: { prompt: string; doc: EmailDoc; scope?: { kind: "zip" | "city"; value: string } }): Promise<EmailDoc>` exported from `build-doc.ts`; `buildDefaultGrid(ctx: RecipeBuildContext): Promise<EmailDoc | null>` exported from `default-grid.ts`. Task 3 imports `buildDefaultGrid`.

- [ ] **Step 1: Write the failing test** (spec failure mode 1 — MUST build from empty context):

```ts
import { describe, expect, test } from "bun:test";
import { EmailDocSchema } from "@/lib/email/doc/types";
import { RECIPES } from "@/lib/deliverable/recipes";
import { buildDefaultGrid } from "./default-grid";
import { SEED_DOCS } from "@/lib/email/doc/default-docs";

const emptyCtx = {
  recipe: RECIPES["default-grid"],
  prompt: "   ",
  currentDoc: SEED_DOCS.find((d) => d.id === "skeleton-clean-white")!.doc,
  facts: null,
  resolved: false,
  zip: undefined,
};

describe("FM1: default-grid builds from a completely empty context", () => {
  test("returns a schema-valid doc, never null, with no invented figures", async () => {
    const doc = await buildDefaultGrid(emptyCtx as never);
    expect(doc).not.toBeNull();
    expect(EmailDocSchema.safeParse(doc).success).toBe(true);
  });
});
```

Adjust the `SEED_DOCS` lookup to the module's real export shape (it may be a keyed record — read `default-docs.ts` first; the skeleton id is `"skeleton-clean-white"`).

- [ ] **Step 2: Run to verify it fails** — `bun test lib/deliverable/recipes/default-grid.test.ts` → FAIL ("Cannot find module ./default-grid").

- [ ] **Step 3: Extract the seam in `build-doc.ts`.** `buildContentDoc` (line 704) already refills a FIXED skeleton from sourced figures. Extract its post-validation core (everything after the `EmailDocSchema.safeParse` + placeholder gate, through the sourced fill and lint) into:

```ts
/** ONE-LANE SEAM: fill a fixed skeleton's open slots from sourced lanes.
 *  Never invents; a slot with no sourced value stays open. Throwing is allowed —
 *  callers (default-grid builder) catch and fall back to the raw skeleton. */
export async function fillSkeletonFromSources(args: {
  prompt: string;
  doc: EmailDoc;
  scope?: { kind: "zip" | "city"; value: string };
}): Promise<EmailDoc> { /* moved body of buildContentDoc's fill core */ }
```

`buildContentDoc` becomes a thin wrapper: validate + placeholder-gate, call `fillSkeletonFromSources`, wrap in its existing `BuildResult` HTTP shape. Behavior of existing callers must be byte-identical — `bun test lib/email/build-doc.test.ts` guards this.

- [ ] **Step 4: Write the builder** — `lib/deliverable/recipes/default-grid.ts`:

```ts
// The terminal fallback builder (one-lane collapse, spec 2026-08-02). Loads the
// blank skeleton and fills open slots through the SAME sourced machinery every
// fixed-skeleton fill uses. An unfillable slot STAYS OPEN — that, not refusal
// and not invention, is the contract that makes this safe as the last resort.
import type { EmailDoc } from "@/lib/email/doc/types";
import type { RecipeBuildContext } from "./index";
import { fillSkeletonFromSources } from "@/lib/email/build-doc";

export async function buildDefaultGrid(ctx: RecipeBuildContext): Promise<EmailDoc | null> {
  const base = ctx.currentDoc; // dispatcher already seats skeleton or user layout
  const prompt = ctx.prompt?.trim() ?? "";
  if (!prompt) return base; // empty context: the open-slot skeleton IS the build
  try {
    return await fillSkeletonFromSources({
      prompt,
      doc: base,
      scope: ctx.zip ? { kind: "zip", value: ctx.zip } : undefined,
    });
  } catch {
    return base; // sourcing failed → open slots, never null, never invented
  }
}
```

Register it in `lib/deliverable/recipes/index.ts` `RECIPE_BUILDERS`: `"default-grid": buildDefaultGrid,` (own line, own file rule).

- [ ] **Step 5: Run tests** — `bun test lib/deliverable/recipes/default-grid.test.ts lib/email/build-doc.test.ts lib/deliverable/recipes.parity.test.ts` → all PASS.

- [ ] **Step 6: Commit** — `git add lib/deliverable/recipes/default-grid.ts lib/deliverable/recipes/default-grid.test.ts lib/deliverable/recipes/index.ts lib/email/build-doc.ts && git commit -m "feat(recipes): default-grid builder over the extracted fillSkeletonFromSources seam"`

---

### Task 3: Dispatch collapse — keyless → default grid, free author DELETED (ONE commit)

**Files:**
- 🔴 Modify: `lib/email/build-doc.ts` (`authorDoc`, dispatch at ~line 1173; free-author layout section ~lines 1430-1520; invalid-builder fallback ~lines 1197-1218)
- Test: `lib/email/build-doc.test.ts` (extend)

**Interfaces:**
- Consumes: `RECIPES["default-grid"]`, `buildDefaultGrid` (Tasks 1-2).
- Produces: `authorDoc` never returns a doc that did not come from a recipe builder. The free-author `authorSystem` layout call inside `authorDoc` is gone (the figure-menu/anchor machinery it shared with the fill path SURVIVES — it now serves only `fillSkeletonFromSources`).

- [ ] **Step 1: Write the failing tests** (spec failure mode 5 plus the fallback rule):

```ts
test("FM5: an organic typed ask lands on the default grid, not a free-authored doc", async () => {
  // mock buildDefaultGrid (mock.module on ./default-grid) to return a sentinel doc
  // and assert authorDoc({ prompt: "a plain note with no keywords", ... }) returns it.
});

test("FM5b: a builder returning an INVALID doc falls back to the default grid, loudly", async () => {
  // mock a lifecycle builder to return { not: "a doc" }; spy console.error;
  // assert the returned doc is the default-grid sentinel and console.error fired.
});
```

Use the existing `build-doc.test.ts` mock pattern (it already mocks at the data boundary with `mock.module`; mirror its setup verbatim).

- [ ] **Step 2: Run to verify both fail** — `bun test lib/email/build-doc.test.ts` → FAIL (organic ask currently takes the free-author path).

- [ ] **Step 3: Implement, in one edit pass:**
  1. Dispatch (line ~1173): `const activeRecipe = recipeByKey(recipeKey) ?? recipeFromPrompt(prompt) ?? RECIPES["default-grid"];` — the prefix bridge stays (key resolution, not free authoring).
  2. Seat the skeleton for the fallback exactly as a door arrival does: when `activeRecipe.key === "default-grid"` and the caller passed no doc beyond the demo default, load `loadUserLayout("default-grid") ?? SEED skeleton-clean-white` as `currentDoc` (mirror the existing user-grid pour-through at ~line 1220 — reuse, don't duplicate).
  3. Invalid-builder fallback (~line 1212): keep the `console.error` VERBATIM; replace "fall through to the generic author" with a call to `buildDefaultGrid` on the same context (its empty-context guarantee makes this total).
  4. DELETE the free-author layout section of `authorDoc` (the `authorSystem`/`assembleAuthoredDoc` call path, ~lines 1430-1520): remove the `resolveRecipe`/`recipeSection` import and usage (lines 22, 1449, 1476). Keep every shared helper the fill path uses (`fetchLakeParts`, `buildFigureMenu`, anchors, `buildChartForQuestion`). Anything now unimported will surface in Step 4's build.

- [ ] **Step 4: Verify** — `bun test lib/email/build-doc.test.ts lib/deliverable/recipes/default-grid.test.ts` → PASS; `bunx next build` → compiles (this is what catches dead imports and any hidden free-author consumer — spec FM6, loud break preferred).

- [ ] **Step 5: Campaign sim (spec FM8)** — `bun scripts/email/campaign-sim.mts` (dry run, no `--send`) → all 7 listing recipes green.

- [ ] **Step 6: Commit (THE one-commit rule)** — `git add lib/email/build-doc.ts lib/email/build-doc.test.ts && git commit -m "feat(email)!: one lane — keyless builds land the default grid; free-author layout path deleted"`

---

### Task 4: Voice presets replace the advisory registry

**Files:**
- Create: `lib/email/voice-presets.ts`, `lib/email/voice-presets.test.ts`
- Modify: every importer of `lib/email/author-recipes.ts` (grep first — known: `lib/concoctions/author-section.ts:37` comment, the lab picker UI using `RECIPE_LABELS`, saved `preferred_recipe` readers)
- Delete: `lib/email/author-recipes.ts`, `lib/email/author-recipes.test.ts`

**Interfaces:**
- Produces: `VOICE_PRESET_IDS = ["plain", "editorial-letter", "editorial-showcase", "editorial-magazine"] as const`; `type VoicePresetId`; `voiceSection(id: VoicePresetId): string` (digit-free prose guidance); `resolveVoice(explicit: string | null | undefined): VoicePresetId` (explicit pick wins, unknown → `"plain"`, NO keyword detection); `LEGACY_RECIPE_ID_TO_VOICE: Record<string, VoicePresetId>` mapping the 3 editorial ids to themselves and the 8 type-shaped ids to `"plain"`.

- [ ] **Step 1: Write the failing tests** (carry the old invariants + spec FM4):

```ts
describe("voice presets — the surviving invariants of author-recipes", () => {
  test("every preset's guidance contains ZERO digits", () => {
    for (const id of VOICE_PRESET_IDS) expect(voiceSection(id)).not.toMatch(/\d/);
  });
  test("explicit pick wins; unknown/stale ids degrade to plain, never throw (FM4)", () => {
    expect(resolveVoice("editorial-letter")).toBe("editorial-letter");
    expect(resolveVoice("monthly-newsletter")).toBe("plain"); // type-shaped: promoted later
    expect(resolveVoice("not-a-recipe")).toBe("plain");
    expect(resolveVoice(null)).toBe("plain");
  });
  test("there is NO keyword detection export", async () => {
    const mod = await import("./voice-presets");
    expect("detectRecipe" in mod).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify fail** — `bun test lib/email/voice-presets.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `voice-presets.ts`** — move the editorial family's prose sections verbatim from `author-recipes.ts` (they are digit-free by test); add a `"plain"` preset whose section is the empty string (generic prompt, byte-identical to a no-recipe build today). Letter-style prose lives in `editorial-letter` (spec FM7).

- [ ] **Step 4: Repoint importers, then delete** — grep `author-recipes` tree-wide; the lab picker offers voice presets (labels: Plain, Editorial letter, Editorial showcase, Magazine issue) instead of the 11 ids; `preferred_recipe` readers pass stored values through `resolveVoice` (stale ids degrade, FM4). Delete `author-recipes.ts` + its test file. `Recipe.prose` (recipes.ts:144) now names a `VoicePresetId` — update its comment; all current values are `null`, no data change.

- [ ] **Step 5: Verify** — `bun test lib/email` → PASS; `bunx next build` → compiles (FM6: loud break finds any missed importer).

- [ ] **Step 6: Commit** — `git add -- lib/email/voice-presets.ts lib/email/voice-presets.test.ts <each repointed file>`, then `git rm lib/email/author-recipes.ts lib/email/author-recipes.test.ts`, then `git commit -m "feat(email)!: advisory registry → voice presets; keyword detection deleted"`

---

### Task 5: Suggestion chips — suggest, never route

**Files:**
- Create: `lib/email/suggest-recipe.ts`, `lib/email/suggest-recipe.test.ts`
- Modify: the authorDoc API response (the `app/api` route wrapping `authorDoc` — grep `authorDoc(` in `app/`), lab client chip rendering (`app/email-lab/grid/EmailLabGridClient.tsx`)

**Interfaces:**
- Produces: `suggestRecipes(prompt: string): Promise<RecipeKey[]>` (length ≤ 2, possibly empty; NEVER throws — any failure → `[]`). API response gains optional `suggestions?: RecipeKey[]`, present only when the build had no explicit key. Chips render as `<a href>` links built by `lib/lab-entry/destination.ts`'s existing URL builders with `?recipe=<key>` — a chip IS a door.

- [ ] **Step 1: Write the failing tests** (spec FM2, FM3):

```ts
describe("suggestRecipes — proposes from the closed list, never routes", () => {
  test("FM3: a hallucinated key is filtered to nothing", async () => {
    // mock the model call to return ["just-sold", "definitely-not-a-key"]
    expect(await suggestRecipes("just sold 123 Main St")).toEqual(["just-sold"]);
  });
  test("model failure degrades to no chips, never an error", async () => {
    // mock the model call to throw
    expect(await suggestRecipes("anything")).toEqual([]);
  });
  test("never more than two", async () => {
    // mock returns 4 valid keys → expect length 2
  });
});
```

- [ ] **Step 2: Run to verify fail** — `bun test lib/email/suggest-recipe.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — one model call through the repo's existing LLM client seam (grep `getAnthropic(` in `lib/email` and mirror the nearest call site's model + callType registration; update `docs/standards/repo-inventory-audit.md` #llm-call-sites-email in the SAME commit — that doc's read-first/update-last rule is binding). Output parsed, filtered with `isRecipeKey`, sliced to 2. The function has NO access to dispatch — it returns strings.

- [ ] **Step 4: Wire the surface** — the API includes `suggestions` only on keyless builds; `EmailLabGridClient` renders each as a link chip ("Looks like {label} — use that grid?") using the destination builder. A component test (or, minimally, a static test asserting the chip element is an anchor with a `?recipe=` href and no build-triggering handler) covers FM2.

- [ ] **Step 5: Verify** — `bun test lib/email/suggest-recipe.test.ts` → PASS; `bunx next build` → compiles.

- [ ] **Step 6: Commit** — explicit paths, `git commit -m "feat(email-lab): suggestion chips — model proposes from closed key list, navigation-only"`

---

### Task 6: Full-suite proof + docs sync

**Files:**
- Modify: `docs/standards/emails.md` (§1 rule 1 + §2 pipeline: one lane, default grid, chips; advisory registry removed), `lib/email/CLAUDE.md` + `lib/deliverable/CLAUDE.md` (digest lines), `docs/standards/repo-inventory-audit.md` (LLM call-site delta if not done in Task 5), `SESSION_LOG.md`

- [ ] **Step 1: Full test pass** — `bun test lib/email lib/deliverable` → all green; paste counts into the SESSION_LOG entry.
- [ ] **Step 2: Build** — `bunx next build` → compiles; paste tail.
- [ ] **Step 3: Campaign sim** — `bun scripts/email/campaign-sim.mts` dry run → 7/7 green; paste tail.
- [ ] **Step 4: Docs** — update the email map in the same session (its update rule is binding); SESSION_LOG entry.
- [ ] **Step 5: Commit** — explicit paths, `git commit -m "docs(email): one-lane collapse landed — map, digests, inventory synced"`. Do NOT push — operator approval per push. Closing `one_lane_email_recipes_live_verify` requires LIVE evidence after deploy (checks = prod evidence, not dev attestation) — leave it open until the deployed surface is verified.

---

## Self-review notes (done at write time)

- Spec coverage: §A→Tasks 1-2, §B→Task 3, §C→Task 5, §D→Task 4, §E deferred by design (promotion queue = follow-on builds), FM1-FM8 each named in a test step, FM9 n/a (no env change). Gap: none found.
- Type consistency: `buildDefaultGrid(ctx: RecipeBuildContext): Promise<EmailDoc | null>` matches `RecipeBuilder` (index.ts:70); `fillSkeletonFromSources` defined once (Task 2), consumed in Tasks 2-3; the `"default-grid"` literal is consistent throughout.
- Known execution-time checks (flagged at the step that needs each): `SEED_DOCS` export shape (Task 2 Step 1), the parity test's surface-enumeration behavior (Task 1 Step 4), the exact `app/` route wrapping `authorDoc` (Task 5 Step 4).

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 2, Task 3 | `lib/email/build-doc.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
