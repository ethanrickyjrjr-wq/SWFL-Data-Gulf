# Seed Capture-or-Blank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 10 tasks, 17 files, keywords: migration, schema, architecture

**Goal:** Every template chip click ends in a build — skip-and-build when the subject is known, capture-then-build when it isn't, or an explicit "Start blank" choice — with everything captured saved so it is never asked twice.

**Architecture:** A pure decision module (`lib/lab-entry/seed-start.ts`) holds the matrix; `planArrival` delegates its seed branch to it and the gallery's in-place pick calls it directly. `SeedDoc` gains a required `subject` classification. Persistence rides existing seams: brand → the shell's `buildAfterBrand` → PATCH `/api/user/brand` (already built, untouched); address/area → PATCH `/api/projects/[id]` (allowlist extended) + new `projects.subject_area` column.

**Tech Stack:** Next.js App Router, React 19, bun:test, Supabase (typed client, RLS cookie client), Bun.SQL migrations.

**Spec:** `docs/superpowers/specs/2026-07-16-seed-capture-or-blank-design.md` · **Check:** `seed_capture_or_blank_live_verify`

## Global Constraints

- Never `git add -A` / `git add .` — stage explicit paths only; the index is shared with concurrent sessions (`git commit -- <paths>`).
- Verify with `bunx next build`, never `npx tsc` (repo rule).
- Tests: `bun test <path>` per task; the prettier/eslint lint-staged hook reformats on commit — that churn is expected.
- `react-hooks/set-state-in-effect` is a hard ESLint error — never setState synchronously in an effect body.
- No invented numbers anywhere in fill prompts or copy — builds fill from real sources or leave slots open (RULE 0.7).
- Migration must be idempotent (`ADD COLUMN IF NOT EXISTS`); run directly with `bun scripts/run-migration.ts`; regen types with `bun run gen:types` in the same task.
- Copy style: plain language, no system nouns ("template", never "seed doc", in user-facing strings).
- Do NOT push. Commit per task; the operator decides the push.

---

### Task 1: `SeedDoc.subject` — required classification on every template

**Files:**
- Modify: `lib/email/doc/default-docs.ts` (interface at ~line 200 + all SEED_DOCS entries)
- Test: `lib/email/doc/default-docs.subject.test.ts` (create)

**Interfaces:**
- Produces: `SeedDoc.subject: "address" | "area" | "none"` — read by Tasks 2, 7, 8. `export type SeedSubject = SeedDoc["subject"]`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/email/doc/default-docs.subject.test.ts
import { describe, expect, it } from "bun:test";
import { SEED_DOCS } from "./default-docs";

const SUBJECTS = new Set(["address", "area", "none"]);

describe("SeedDoc.subject classification", () => {
  it("every template declares a valid subject", () => {
    for (const s of SEED_DOCS) {
      expect(SUBJECTS.has(s.subject), `${s.id} subject=${String(s.subject)}`).toBe(true);
    }
  });

  it("listing-shaped templates need an address", () => {
    for (const id of ["just-sold", "just-sold-grid", "new-listing", "listing-feature", "open-house", "price-reduced", "skeleton-listing-showcase"]) {
      expect(SEED_DOCS.find((s) => s.id === id)?.subject, id).toBe("address");
    }
  });

  it("market-shaped templates need an area", () => {
    for (const id of ["market-spotlight", "market-letter", "luxury-market-report", "weekly-pulse", "neighborhood-report", "investment-brief", "rate-watch", "monthly-digest", "year-in-review", "trend-snapshot"]) {
      expect(SEED_DOCS.find((s) => s.id === id)?.subject, id).toBe("area");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/doc/default-docs.subject.test.ts`
Expected: FAIL — `subject` is `undefined` on every entry.

- [ ] **Step 3: Add the field to the interface**

```ts
export interface SeedDoc {
  id: string;
  name: string;
  description: string;
  /** What the right content depends on: a specific listing ("address"), a market
   *  area ("area"), or nothing beyond brand/region ("none"). Drives the
   *  capture-or-blank arrival (spec 2026-07-16-seed-capture-or-blank-design.md). */
  subject: "address" | "area" | "none";
  /** Builds a fresh EmailDoc with newly-minted block ids each call. */
  build: () => EmailDoc;
}
export type SeedSubject = SeedDoc["subject"];
```

- [ ] **Step 4: Classify every entry** (the compiler now lists every missing site — add `subject:` to each). Classification:

`address`: just-sold, just-sold-grid, new-listing, listing-feature, open-house, price-reduced, skeleton-listing-showcase
`area`: market-spotlight, market-letter, luxury-market-report, weekly-pulse, neighborhood-report, investment-brief, rate-watch, monthly-digest, year-in-review, trend-snapshot, listing-digest
`none`: welcome, minimal, agent-spotlight, skeleton-clean-white, skeleton-dark-pro, skeleton-agent-feature, stay-in-touch, editorial-letter, magazine-issue

`listing-digest` is a multi-listing area roundup → `area` (deviates from the spec's initial list under its file-level adjustment clause; the rule — content varies by area, not one property — holds). If the file has entries not named here, classify by the rule and add them to the Step 1 test lists.

- [ ] **Step 5: Run test + typecheck**

Run: `bun test lib/email/doc/default-docs.subject.test.ts` → PASS. Then `bunx next build` → compiles (catches any entry the test lists missed).

- [ ] **Step 6: Commit**

```bash
git add lib/email/doc/default-docs.ts lib/email/doc/default-docs.subject.test.ts
git commit -m "feat(email-lab): every template declares its subject — address, area, or none" -- lib/email/doc/default-docs.ts lib/email/doc/default-docs.subject.test.ts
```

---

### Task 2: `planSeedStart` — the pure decision matrix

**Files:**
- Create: `lib/lab-entry/seed-start.ts`
- Test: `lib/lab-entry/seed-start.test.ts`

**Interfaces:**
- Consumes: `SeedSubject` from Task 1.
- Produces (Tasks 3, 7, 8 rely on these exact shapes):

```ts
export type SeedStartPlan =
  | { mode: "build"; subjectValue: string | null }   // skip-and-build (value = known subject; null when subject "none")
  | { mode: "ask"; inputKind: "address" | "area" }    // capture popup
  | { mode: "choice" }                                 // fill-or-blank popup (subject "none")
  | { mode: "blank" };                                 // explicit blank → today's skeleton
export function planSeedStart(input: {
  subject: SeedSubject;
  knownAddress: string | null;
  knownArea: string | null;
  blankChosen: boolean;
}): SeedStartPlan;
```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/lab-entry/seed-start.test.ts
import { describe, expect, it } from "bun:test";
import { planSeedStart } from "./seed-start";

describe("planSeedStart", () => {
  const base = { knownAddress: null, knownArea: null, blankChosen: false };

  it("blank chosen always wins", () => {
    expect(planSeedStart({ ...base, subject: "address", blankChosen: true })).toEqual({ mode: "blank" });
    expect(planSeedStart({ ...base, subject: "none", blankChosen: true })).toEqual({ mode: "blank" });
  });

  it("address template + known address → skip-and-build", () => {
    expect(planSeedStart({ ...base, subject: "address", knownAddress: "123 Palm Ave" }))
      .toEqual({ mode: "build", subjectValue: "123 Palm Ave" });
  });

  it("address template + no address → ask (even when an area is known)", () => {
    expect(planSeedStart({ ...base, subject: "address", knownArea: "Cape Coral" }))
      .toEqual({ mode: "ask", inputKind: "address" });
  });

  it("area template + known area → skip-and-build", () => {
    expect(planSeedStart({ ...base, subject: "area", knownArea: "33904" }))
      .toEqual({ mode: "build", subjectValue: "33904" });
  });

  it("area template with only an address known still asks — an address is not an area", () => {
    expect(planSeedStart({ ...base, subject: "area", knownAddress: "123 Palm Ave" }))
      .toEqual({ mode: "ask", inputKind: "area" });
  });

  it("no-subject template → fill-or-blank choice", () => {
    expect(planSeedStart({ ...base, subject: "none" })).toEqual({ mode: "choice" });
  });

  it("blank/whitespace known values do not count as known", () => {
    expect(planSeedStart({ ...base, subject: "address", knownAddress: "  " }))
      .toEqual({ mode: "ask", inputKind: "address" });
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `bun test lib/lab-entry/seed-start.test.ts` → module not found.

- [ ] **Step 3: Implement**

```ts
// lib/lab-entry/seed-start.ts
//
// THE ONE decision for what a template pick does (spec
// 2026-07-16-seed-capture-or-blank-design.md). Pure. planArrival's seed branch
// and the gallery's in-place pick both call this — the matrix cannot drift
// between the URL door and the click door.
import type { SeedSubject } from "@/lib/email/doc/default-docs";

export type SeedStartPlan =
  | { mode: "build"; subjectValue: string | null }
  | { mode: "ask"; inputKind: "address" | "area" }
  | { mode: "choice" }
  | { mode: "blank" };

const known = (s: string | null) => {
  const t = (s ?? "").trim();
  return t.length > 0 ? t : null;
};

export function planSeedStart(input: {
  subject: SeedSubject;
  knownAddress: string | null;
  knownArea: string | null;
  blankChosen: boolean;
}): SeedStartPlan {
  if (input.blankChosen) return { mode: "blank" };
  if (input.subject === "none") return { mode: "choice" };
  const value = input.subject === "address" ? known(input.knownAddress) : known(input.knownArea);
  if (value) return { mode: "build", subjectValue: value };
  return { mode: "ask", inputKind: input.subject };
}
```

- [ ] **Step 4: Run to verify PASS** — `bun test lib/lab-entry/seed-start.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/lab-entry/seed-start.ts lib/lab-entry/seed-start.test.ts
git commit -m "feat(lab-entry): planSeedStart — the pure capture-or-blank decision matrix" -- lib/lab-entry/seed-start.ts lib/lab-entry/seed-start.test.ts
```

---

### Task 3: `planArrival` — seed branch delegates to the matrix

**Files:**
- Modify: `lib/lab-entry/arrival.ts`
- Test: `lib/lab-entry/arrival.test.ts` (extend)

**Interfaces:**
- Consumes: `planSeedStart`, `SeedStartPlan` (Task 2).
- Produces: `ArrivalInput` gains `seedSubject: SeedSubject | null`, `seedBlankChosen: boolean`, `subjectArea: string | null`. `ArrivalPlan` gains `seedStart: SeedStartPlan | null` (null on non-seed arrivals). Existing fields untouched — Tasks 7/8 read `plan.seedStart`.

- [ ] **Step 1: Write the failing tests** (append to `arrival.test.ts`)

```ts
describe("seed arrivals — capture or blank (spec 2026-07-16)", () => {
  const seedBase = {
    params: { seed: "just-sold" },
    signedIn: true,
    offeredProject: null,
    insideProject: true,
    subjectAddress: null,
    subjectArea: null,
    recipeHasBlank: false,
    recipeInputKind: null,
    firstRunGalleryEligible: false,
    seedSubject: "address" as const,
    seedBlankChosen: false,
  };

  it("address seed, no known address → seed doc + address popup, no auto-build", () => {
    const p = planArrival(seedBase);
    expect(p.doc).toEqual({ kind: "seed", seedId: "just-sold" });
    expect(p.seedStart).toEqual({ mode: "ask", inputKind: "address" });
    expect(p.addressPopup).toBe(true);
    expect(p.autoBuildAfterConfirm).toBe(false);
  });

  it("address seed, project knows the address → skip-and-build", () => {
    const p = planArrival({ ...seedBase, subjectAddress: "123 Palm Ave" });
    expect(p.seedStart).toEqual({ mode: "build", subjectValue: "123 Palm Ave" });
    expect(p.addressPopup).toBe(false);
    expect(p.autoBuildAfterConfirm).toBe(true);
  });

  it("area seed uses subjectArea, not subjectAddress", () => {
    const p = planArrival({ ...seedBase, seedSubject: "area", subjectAddress: "123 Palm Ave" });
    expect(p.seedStart).toEqual({ mode: "ask", inputKind: "area" });
  });

  it("blank chosen → exactly today's behavior", () => {
    const p = planArrival({ ...seedBase, seedBlankChosen: true });
    expect(p).toEqual({
      doc: { kind: "seed", seedId: "just-sold" },
      projectConfirm: false,
      addressPopup: false,
      autoBuildAfterConfirm: false,
      legacyAutoGenerate: false,
      seedStart: { mode: "blank" },
    });
  });

  it("unclassifiable seed (seedSubject null) → today's behavior, no popups", () => {
    const p = planArrival({ ...seedBase, seedSubject: null });
    expect(p.addressPopup).toBe(false);
    expect(p.seedStart).toBeNull();
  });

  it("non-seed arrivals carry seedStart: null", () => {
    const p = planArrival({ ...seedBase, params: {}, insideProject: false });
    expect(p.seedStart).toBeNull();
  });
});
```

Also mechanical: every EXISTING test's expected plan object gains `seedStart: null` (or use `expect.objectContaining` where the test already does).

- [ ] **Step 2: Run to verify FAIL** — `bun test lib/lab-entry/arrival.test.ts`.

- [ ] **Step 3: Implement.** In `ArrivalInput` add `subjectArea: string | null; seedSubject: SeedSubject | null; seedBlankChosen: boolean;` (all with existing callers updated in this same commit — grep `planArrival(` : two clients; pass `subjectArea: null, seedSubject: null, seedBlankChosen: false` for now, real values arrive in Tasks 7/8). In `ArrivalPlan` add `seedStart: SeedStartPlan | null`, and add `seedStart: null` to every existing return. Replace the seed branch:

```ts
  // Template pick (spec 2026-07-16-seed-capture-or-blank-design.md): the pure
  // matrix decides capture / skip-and-build / explicit blank. A seed with no
  // classification resolvable (unknown id) keeps the legacy no-popups landing.
  if (trimmed(params.seed)) {
    const seedStart = input.seedSubject
      ? planSeedStart({
          subject: input.seedSubject,
          knownAddress: input.subjectAddress,
          knownArea: input.subjectArea,
          blankChosen: input.seedBlankChosen,
        })
      : null;
    return {
      doc: { kind: "seed", seedId: params.seed! },
      projectConfirm: false,
      addressPopup: seedStart?.mode === "ask",
      autoBuildAfterConfirm: seedStart?.mode === "build",
      legacyAutoGenerate: false,
      seedStart,
    };
  }
```

- [ ] **Step 4: Run to verify PASS** — `bun test lib/lab-entry/arrival.test.ts` and `bunx next build` (callers compile).

- [ ] **Step 5: Commit**

```bash
git add lib/lab-entry/arrival.ts lib/lab-entry/arrival.test.ts app/email-lab/grid/EmailLabGridClient.tsx "app/project/[id]/email-lab/ProjectEmailLabClient.tsx"
git commit -m "feat(lab-entry): planArrival seed branch plans capture-or-blank via planSeedStart" -- lib/lab-entry/arrival.ts lib/lab-entry/arrival.test.ts app/email-lab/grid/EmailLabGridClient.tsx "app/project/[id]/email-lab/ProjectEmailLabClient.tsx"
```

---

### Task 4: `AddressPopup` — "Start blank instead" escape + choice mode

**Files:**
- Modify: `components/lab-entry/AddressPopup.tsx`
- Test: `components/lab-entry/AddressPopup.test.tsx` (extend or create)

**Interfaces:**
- Produces: new optional props `onStartBlank?: () => void` and `choiceMode?: boolean`. With `choiceMode`, the popup renders no subject input, headline "Fill it with your data?", primary button "Fill with AI" (calls `onBuild("", patch, useSaved)`), and the escape. `onStartBlank` renders a quiet "Start blank instead" button above Cancel in every mode. Existing callers unchanged (both props optional).

- [ ] **Step 1: Write the failing tests**

```tsx
// components/lab-entry/AddressPopup.test.tsx (append; create with the imports below if absent)
import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { AddressPopup } from "./AddressPopup";

describe("AddressPopup capture-or-blank additions", () => {
  it("renders the Start blank escape only when a handler is given", () => {
    const withEscape = renderToStaticMarkup(
      createElement(AddressPopup, { inputKind: "address", initialValue: "", onBuild: () => {}, onCancel: () => {}, onStartBlank: () => {} }),
    );
    const without = renderToStaticMarkup(
      createElement(AddressPopup, { inputKind: "address", initialValue: "", onBuild: () => {}, onCancel: () => {} }),
    );
    expect(withEscape).toContain("Start blank instead");
    expect(without).not.toContain("Start blank instead");
  });

  it("choice mode: no subject input, Fill with AI primary", () => {
    const html = renderToStaticMarkup(
      createElement(AddressPopup, { inputKind: null, choiceMode: true, initialValue: "", onBuild: () => {}, onCancel: () => {}, onStartBlank: () => {} }),
    );
    expect(html).toContain("Fill with AI");
    expect(html).not.toContain("Listing address");
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `bun test components/lab-entry/AddressPopup.test.tsx`.

- [ ] **Step 3: Implement.** Add to props interface:

```ts
  /** Capture-or-blank (spec 2026-07-16): render a quiet escape that commits the
   *  raw template instead of building. */
  onStartBlank?: () => void;
  /** Subject-less template pick: no input to collect — the ask is fill vs blank. */
  choiceMode?: boolean;
```

Headline/copy: when `choiceMode`, `<h2>` is `Fill it with your data?` and the sub-line is `We'll fill this template with your brand and your market's real numbers — or start from the clean layout.`; primary button label `Fill with AI` (choiceMode) else `Build`. Escape button, inserted between Build and Cancel in the footer stack:

```tsx
          {onStartBlank && (
            <button
              type="button"
              onClick={onStartBlank}
              className="rounded-lg border border-white/15 py-2 text-sm text-white/70 hover:bg-white/5"
            >
              Start blank instead
            </button>
          )}
```

`ready` stays `true` when `choiceMode` (no input required): `const ready = choiceMode ? true : inputKind ? value.trim().length > 0 : true;`

- [ ] **Step 4: Run to verify PASS** — `bun test components/lab-entry/AddressPopup.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add components/lab-entry/AddressPopup.tsx components/lab-entry/AddressPopup.test.tsx
git commit -m "feat(lab-entry): AddressPopup gains Start-blank escape and fill-or-blank choice mode" -- components/lab-entry/AddressPopup.tsx components/lab-entry/AddressPopup.test.tsx
```

---

### Task 5: `projects.subject_area` column + PATCH allowlist

**Files:**
- Create: `docs/sql/20260716_projects_subject_area.sql`
- Modify: `app/api/projects/[id]/route.ts` (PATCH allowlist), `database-generated.types.ts` (regenerated)
- Test: `app/api/projects/[id]/route.test.ts` (extend)

**Interfaces:**
- Produces: PATCH `/api/projects/[id]` accepts `{ subject_address?: string | null, subject_area?: string | null }` (strings trimmed; empty → null). Tasks 7/8 call it.

- [ ] **Step 1: Write the migration**

```sql
-- docs/sql/20260716_projects_subject_area.sql
-- Capture-or-blank (spec 2026-07-16): the remembered market area for area-subject
-- template builds, sibling of subject_address. Idempotent.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS subject_area text;
```

- [ ] **Step 2: Run it + verify**

Run: `bun scripts/run-migration.ts docs/sql/20260716_projects_subject_area.sql` → `✓ done`.
Verify: `bun scripts/run-migration.ts` is write-only, so check via a one-off: `echo "SELECT column_name FROM information_schema.columns WHERE table_name='projects' AND column_name='subject_area';" > "$TMPDIR/check.sql"` — or simpler, re-run the migration (idempotent, still `✓ done`) and regen types next step; the column appearing in `database-generated.types.ts` IS the verification.

- [ ] **Step 3: Regen types** — `bun run gen:types`; confirm `subject_area: string | null` appears under `projects` in `database-generated.types.ts`.

- [ ] **Step 4: Write the failing route test** (append to `app/api/projects/[id]/route.test.ts`, following that file's existing PATCH-test pattern for auth/supabase mocking):

```ts
  it("PATCH accepts subject_address and subject_area, trimming empties to null", async () => {
    // Follow this file's established mock harness; assert the update object passed
    // to supabase contains { subject_address: "123 Palm Ave", subject_area: null }
    // for body { subject_address: " 123 Palm Ave ", subject_area: "  " }.
  });
```

Write it concretely against the file's real harness (it already mocks the cookie client for title/branding cases — mirror the nearest existing test verbatim, changing only the body and assertion).

- [ ] **Step 5: Run to verify FAIL**, then implement in the PATCH handler beside the `title` line:

```ts
  if ("subject_address" in body) {
    update.subject_address =
      typeof body.subject_address === "string" && body.subject_address.trim()
        ? body.subject_address.trim()
        : null;
  }
  if ("subject_area" in body) {
    update.subject_area =
      typeof body.subject_area === "string" && body.subject_area.trim()
        ? body.subject_area.trim()
        : null;
  }
```

- [ ] **Step 6: Run to verify PASS** — `bun test app/api/projects/[id]/route.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add docs/sql/20260716_projects_subject_area.sql "app/api/projects/[id]/route.ts" "app/api/projects/[id]/route.test.ts" database-generated.types.ts
git commit -m "feat(projects): subject_area column + PATCH allowlist for subject_address/subject_area" -- docs/sql/20260716_projects_subject_area.sql "app/api/projects/[id]/route.ts" "app/api/projects/[id]/route.test.ts" database-generated.types.ts
```

---

### Task 6: `seedFillPrompt` — the synthesized build prompt

**Files:**
- Create: `lib/lab-entry/seed-fill-prompt.ts`
- Test: `lib/lab-entry/seed-fill-prompt.test.ts`

**Interfaces:**
- Consumes: `SeedDoc` (Task 1).
- Produces: `seedFillPrompt(seed: Pick<SeedDoc, "name" | "subject">, subjectValue: string | null): string` — Tasks 7/8 feed it to the shell's mount build.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/lab-entry/seed-fill-prompt.test.ts
import { describe, expect, it } from "bun:test";
import { seedFillPrompt } from "./seed-fill-prompt";

describe("seedFillPrompt", () => {
  it("address subject names the listing", () => {
    const p = seedFillPrompt({ name: "Just Sold", subject: "address" }, "123 Palm Ave, Fort Myers FL");
    expect(p).toContain("Just Sold");
    expect(p).toContain("123 Palm Ave, Fort Myers FL");
    expect(p).toContain("my listing at");
  });

  it("area subject names the area", () => {
    const p = seedFillPrompt({ name: "Rate Watch", subject: "area" }, "Cape Coral");
    expect(p).toContain("Cape Coral");
    expect(p).toContain("Rate Watch");
  });

  it("no subject builds from brand + region", () => {
    const p = seedFillPrompt({ name: "Welcome", subject: "none" }, null);
    expect(p).toContain("Welcome");
    expect(p.toLowerCase()).toContain("my area");
  });

  it("never fabricates figures — instructs sourced fill only", () => {
    for (const p of [
      seedFillPrompt({ name: "Just Sold", subject: "address" }, "123 Palm Ave"),
      seedFillPrompt({ name: "Welcome", subject: "none" }, null),
    ]) {
      expect(p).toContain("real");
    }
  });
});
```

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement**

```ts
// lib/lab-entry/seed-fill-prompt.ts
//
// The build prompt a template pick synthesizes (spec 2026-07-16). The template
// IS the layout — this prompt only tells the builder whose numbers fill it.
// Wording mirrors the PLATFORM_ARC recipe register: plain, sourced, no hype.
import type { SeedDoc } from "@/lib/email/doc/default-docs";

export function seedFillPrompt(
  seed: Pick<SeedDoc, "name" | "subject">,
  subjectValue: string | null,
): string {
  const v = (subjectValue ?? "").trim();
  if (seed.subject === "address" && v) {
    return `Fill this ${seed.name} email for my listing at ${v} — keep the layout, fill every open slot with real sourced figures for that property and its market.`;
  }
  if (seed.subject === "area" && v) {
    return `Fill this ${seed.name} email for ${v} — keep the layout, fill every open slot with real sourced figures for that area.`;
  }
  return `Fill this ${seed.name} email for my area — keep the layout, use my brand details and real sourced figures for my region.`;
}
```

- [ ] **Step 4: Run to verify PASS**, **Step 5: Commit**

```bash
git add lib/lab-entry/seed-fill-prompt.ts lib/lab-entry/seed-fill-prompt.test.ts
git commit -m "feat(lab-entry): seedFillPrompt — synthesized sourced-fill prompt for template picks" -- lib/lab-entry/seed-fill-prompt.ts lib/lab-entry/seed-fill-prompt.test.ts
```

---

### Task 7: Project lab wiring — URL seed door + gallery pick + persistence

**Files:**
- Modify: `app/project/[id]/email-lab/page.tsx` (pass `seedId` + `subjectArea` down), `app/project/[id]/email-lab/ProjectEmailLabClient.tsx`

**Interfaces:**
- Consumes: `plan.seedStart` (Task 3), `planSeedStart` (Task 2), `seedFillPrompt` (Task 6), popup props (Task 4), PATCH fields (Task 5).
- Produces: the user-visible behavior; no new exports.

- [ ] **Step 1: Server page.** In `page.tsx`: select `subject_area` alongside `subject_address` (line ~94 select string); pass two new props `seedId={seedId}` and `subjectArea={project.subject_area ?? null}`. Note: `?blank=1` (`const blankChosen = sp.blank === "1"`) read and passed as `seedBlankChosen`.

- [ ] **Step 2: Client — feed the plan.** Add props `seedId: string | null; subjectArea: string | null; seedBlankChosen?: boolean`. Resolve the subject and extend the `planArrival` call:

```ts
  const seedSubject = seedId ? (SEED_DOCS.find((s) => s.id === seedId)?.subject ?? null) : null;
  const [plan] = useState(() =>
    planArrival({
      params: { did: deliverableId, seed: seedId, recipe: initialRecipe?.prompt ?? null },
      /* ...existing fields... */
      subjectArea: subjectArea ?? null,
      seedSubject,
      seedBlankChosen: Boolean(seedBlankChosen),
    }),
  );
```

CAREFUL: the seed branch now precedes the recipe branch for arrivals carrying BOTH (the arc deep link `?arcStep=&seed=&recipe=`). The arc flow must keep its existing behavior — guard by NOT passing `seed` into params when `arcStep` is present (the arc already carries its own recipe + address machinery): `seed: arcStep ? null : seedId`.

- [ ] **Step 3: Client — act on `plan.seedStart`.** A single state derived at mount, reusing the existing `addressOpen`/`buildPrompt`/`buildKey` plumbing:

```ts
  // Capture-or-blank (spec 2026-07-16): what this template pick needs before it builds.
  const [seedAsk, setSeedAsk] = useState<null | { inputKind: "address" | "area" } | { choice: true }>(
    plan.seedStart?.mode === "ask"
      ? { inputKind: plan.seedStart.inputKind }
      : plan.seedStart?.mode === "choice"
        ? { choice: true }
        : null,
  );
  // The seed the current canvas came from (URL arrival or gallery pick) — the
  // fill prompt needs its name/subject.
  const [activeSeed, setActiveSeed] = useState<SeedDoc | null>(
    seedId ? (SEED_DOCS.find((s) => s.id === seedId) ?? null) : null,
  );
```

Skip-and-build on mount: initialize `buildPrompt` instead of leaving it null —

```ts
  const [buildPrompt, setBuildPrompt] = useState<string | null>(() =>
    plan.seedStart?.mode === "build" && activeSeed
      ? seedFillPrompt(activeSeed, plan.seedStart.subjectValue)
      : null,
  );
```

(`buildKey` starts 0; the shell's mount-only auto-generate consumes the initial prompt exactly as the recipe lane's remount path does — follow `fireBuild`'s existing wiring.)

- [ ] **Step 4: Client — submit + persistence.** New handler; PATCH only fills a hole, never overwrites:

```ts
  async function onSeedSubjectBuild(value: string) {
    if (!activeSeed) return;
    setSeedAsk(null);
    const v = value.trim();
    // Never asked twice: bank the captured subject on the project when it has none.
    if (activeSeed.subject === "address" && v && !subjectAddress) {
      void fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject_address: v }),
      }).catch(() => {});
      void recordAddress(v);
    }
    if (activeSeed.subject === "area" && v && !subjectArea) {
      void fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject_area: v }),
      }).catch(() => {});
    }
    setBuildPrompt(seedFillPrompt(activeSeed, v || null));
    setBuildKey((k) => k + 1);
  }
```

Render the popup (alongside the existing recipe popup block, keyed on `seedAsk`):

```tsx
      {seedAsk && activeSeed && (
        <AddressPopup
          inputKind={"inputKind" in seedAsk ? seedAsk.inputKind : null}
          choiceMode={"choice" in seedAsk}
          initialValue={"inputKind" in seedAsk && seedAsk.inputKind === "address" ? (subjectAddress ?? "") : ""}
          onBuild={(value) => void onSeedSubjectBuild(value)}
          onStartBlank={() => setSeedAsk(null)}
          onCancel={() => setSeedAsk(null)}
        />
      )}
```

("Start blank instead" and Cancel both land on the already-loaded skeleton — that IS the blank outcome; no navigation.) Brand gaps: none collected here — the shell's own auto-build gap popup (`buildAfterBrand` → PATCH `/api/user/brand`) fires during the build when fields are missing; that seam is untouched and satisfies the never-ask-twice rule for brand.

- [ ] **Step 5: Client — gallery pick routes through the same matrix.** Replace `onPick={(seed: SeedDoc) => seedCanvas(seed.build())}` with:

```tsx
            onPick={(seed: SeedDoc) => {
              seedCanvas(seed.build());
              setActiveSeed(seed);
              const sp = planSeedStart({
                subject: seed.subject,
                knownAddress: subjectAddress ?? null,
                knownArea: subjectArea ?? null,
                blankChosen: false,
              });
              if (sp.mode === "build") {
                setBuildPrompt(seedFillPrompt(seed, sp.subjectValue));
                setBuildKey((k) => k + 1);
              } else if (sp.mode === "ask") {
                setSeedAsk({ inputKind: sp.inputKind });
              } else if (sp.mode === "choice") {
                setSeedAsk({ choice: true });
              }
            }}
```

- [ ] **Step 6: Verify.** `bun test app/project` (existing suites stay green), `bunx next build` → compiles. Manual smoke (operator or dev server): New Project → Just Sold chip → popup appears, not the raw skeleton.

- [ ] **Step 7: Commit**

```bash
git add "app/project/[id]/email-lab/page.tsx" "app/project/[id]/email-lab/ProjectEmailLabClient.tsx"
git commit -m "feat(email-lab): project template picks capture their subject or start blank, and bank what they capture" -- "app/project/[id]/email-lab/page.tsx" "app/project/[id]/email-lab/ProjectEmailLabClient.tsx"
```

---

### Task 8: Standalone grid door — `?seed=` handled at last

**Files:**
- Modify: `app/email-lab/grid/page.tsx`, `app/email-lab/grid/EmailLabGridClient.tsx`

**Interfaces:**
- Consumes: same modules as Task 7.
- Produces: `/email-lab/grid?seed=<id>` (the /showcase start-from door, `seedGalleryDestination`) actually loads the template and runs the same capture-or-blank flow. Anonymous: no project PATCH (nothing to save to); brand rides the session as today.

- [ ] **Step 1: Server page.** Read `const seedId = sp.seed ?? null;` and `const blankChosen = sp.blank === "1";`; when `seedId` resolves via `seedById(seedId)`, build the template as the initial doc (mirror the project page's `initialDoc = seedById(seedId)?.build() ?? null`) and pass `seedId`/`seedBlankChosen` props in both the signed-in and anonymous returns. (Today this page ignores `?seed=` entirely — the /showcase door lands on a plain canvas; this step is the fix.)

- [ ] **Step 2: Client.** Mirror Task 7's client work with the standalone differences: `subjectAddress: null, subjectArea: null` (no project belief), so address/area seeds always ask (`mode: "ask"`); `onSeedSubjectBuild` skips the project PATCH entirely (no `projectId` on the anonymous path; on the signed-in path the existing project-confirm flow owns attachment) and only fires the build; `choice`/blank flows identical. The seed doc feeds the client's existing seed-doc state the same way `seedDoc` (zip) does today.

- [ ] **Step 3: Verify** — `bunx next build`; manual: `/email-lab/grid?seed=just-sold` shows the popup over the Just Sold layout; `/email-lab/grid?seed=just-sold&blank=1` lands the raw layout silently.

- [ ] **Step 4: Commit**

```bash
git add app/email-lab/grid/page.tsx app/email-lab/grid/EmailLabGridClient.tsx
git commit -m "feat(email-lab): standalone grid handles ?seed= — showcase start-from door gets capture-or-blank" -- app/email-lab/grid/page.tsx app/email-lab/grid/EmailLabGridClient.tsx
```

---

### Task 9: TemplateRail — lifecycle order, Just Sold off the lead

**Files:**
- Modify: `components/project/TemplateRail.tsx`
- Test: `components/project/TemplateRail.test.tsx` (create)

**Interfaces:** none new — display order only. Chip hrefs (`openSeed`) unchanged; the arrival now does the work.

- [ ] **Step 1: Failing test**

```tsx
// components/project/TemplateRail.test.tsx
import { describe, expect, it } from "bun:test";
import { RAIL_ORDER } from "./TemplateRail";

describe("TemplateRail order", () => {
  it("leads with campaign-start templates, not lifecycle tails", () => {
    expect(RAIL_ORDER.indexOf("new-listing")).toBeLessThan(RAIL_ORDER.indexOf("just-sold"));
    expect(RAIL_ORDER.indexOf("listing-feature")).toBeLessThan(RAIL_ORDER.indexOf("just-sold"));
  });
  it("every railed id is a real template", () => {
    // guards drift when SEED_DOCS renames
    const { SEED_DOCS } = require("@/lib/email/doc/default-docs");
    for (const id of RAIL_ORDER) expect(SEED_DOCS.some((s: { id: string }) => s.id === id), id).toBe(true);
  });
});
```

- [ ] **Step 2: FAIL** (no `RAIL_ORDER` export), **Step 3: Implement** — export a `RAIL_ORDER: string[]` listing every SEED_DOCS id in lifecycle-then-market-then-relational order (listing-feature, new-listing, open-house, price-reduced, under-contract-adjacent market-spotlight, just-sold, then area templates, then none templates — full list written out in the file); render `RAIL_ORDER.map(id => SEED_DOCS.find(...)).filter(Boolean)` with a fallback append of any SEED_DOCS ids missing from RAIL_ORDER (new templates never vanish from the rail).

- [ ] **Step 4: PASS + commit**

```bash
git add components/project/TemplateRail.tsx components/project/TemplateRail.test.tsx
git commit -m "feat(project): template rail ordered by lifecycle — Just Sold off the lead" -- components/project/TemplateRail.tsx components/project/TemplateRail.test.tsx
```

---

### Task 10: Full verification + session close

- [ ] **Step 1:** `bun test lib/lab-entry lib/email/doc components/lab-entry components/project "app/api/projects/[id]"` → all green.
- [ ] **Step 2:** `bunx next build` → clean compile.
- [ ] **Step 3:** Append SESSION_LOG.md entry (what shipped, spec/plan links, `seed_capture_or_blank_live_verify` open for operator).
- [ ] **Step 4:** Commit SESSION_LOG; report to operator with the live-verify script from the spec (New Project → Just Sold → popup → build; second chip skip-and-builds; Start blank lands skeleton; brand asked once). Operator pushes; operator runs `node scripts/check.mjs close seed_capture_or_blank_live_verify` only after live proof.

## Self-review notes

- Spec coverage: §1→Task 1, §2→Tasks 2-3, §3→Task 4, §4→Tasks 5+7 (brand via untouched shell seam, stated in Task 7 Step 4), §5→Task 6 (prompt) + existing build path, §6→Tasks 7-9. Live-verify→Task 10.
- The arc guard (Task 7 Step 2) prevents the seed branch from hijacking `?arcStep=` arrivals — the one ordering hazard found in exploration.
- `listing-digest` classified `area`, deviating from the spec's initial list under its file-level adjustment clause (multi-listing roundup — content varies by area, not one property).
