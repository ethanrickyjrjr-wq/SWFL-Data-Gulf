# Lab-Entry Root Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 11 tasks, 39 files, keywords: migration, refactor, schema

**Goal:** Give every door into the email lab one arrival path — blank skeleton → (signed-in) project confirm → address/area popup → Build — and make in-lab work impossible to lose silently.

**Architecture:** Two pure-logic modules under `lib/lab-entry/` are the root: `destination.ts` (the ONE URL builder every navigating door calls) and `arrival.ts` (the ONE pure planner both lab clients call to decide doc + popups + auto-build). Two shared popup components (`ProjectConfirmPopup`, `AddressPopup`) are driven by the arrival plan and mounted by both clients. Save safety is three cooperating pieces: debounced autosave, a `pagehide`/`visibilitychange` flush, and a leave guard combining `nextjs-nav-guard` (internal App Router nav) with a dirty-only `beforeunload` (tab close). Everything routes `"both"` in the tier dial — free and paid get identical entry + safety.

**Tech Stack:** Next.js 16.2.9 App Router (RSC + client components), React 19.2.7, TypeScript, Zod v4, Bun test, `nextjs-nav-guard` (new dep), Tailwind, Supabase.

## Global Constraints

- **Versions (verbatim):** `next` = 16.2.9, `react` = 19.2.7. `nextjs-nav-guard` supports Next 14/15/16 incl. 16.2+ (fork of LayerX `next-navigation-guard`, which is unmaintained — use the fork, NOT the original).
- **New dependency gate (pre-push gate 1):** adding `nextjs-nav-guard` to `package.json` requires `bun install` + `git add bun.lock` in the SAME push.
- **Verify builds with `bunx next build`, never bare `npx tsc`** — local tsc ≠ Vercel.
- **Never `git add -A`** — stage explicit paths only.
- **Tier dial has ONE root** (`lib/email/lab/capabilities.ts`): all of B/C/D behavior is `"both"` — never hardcode a tier difference in a shell/component.
- **Blank skeleton = the `skeleton-clean-white` seed** (`lib/email/doc/default-docs.ts`), run through `ensureGridLayouts(doc, DEFAULT_H)` before the grid canvas mounts. NEVER `defaultDoc()`, NEVER `luxury-market-report`, NEVER a one-shot generic auto-build for a new-build arrival.
- **No invented numbers:** the blank skeleton's content slots are empty strings — that is the point (kills the $485K/34 DOM fake-fill).
- **`react-hooks/set-state-in-effect` is a hard ESLint error** — use the "set state during render" pattern or DOM-only mount effects (existing lab code does this; mirror it).
- **Layout:** `h-full` / `dvh`, never `h-screen`.
- **Commit per task**, stage explicit paths.

## Locked design decisions (resolved from spec + advisor pass — do not re-litigate)

1. **Signed-in standalone boundary.** `/email-lab/grid` STOPS redirecting signed-in users; it renders `EmailLabGridClient` with `{signedIn, offeredProject:{id,title}|null, seedDoc, recipe carry}` and the grid client hosts the project-confirm + address popups. The block-canvas `/email-lab` (the dying page — never invest in it) redirects signed-in users to `/email-lab/grid` carrying params, so only the grid client grows popups. `labDestination`'s `projects[0]` pick is deleted with the module.
2. **Popups are shared.** `ProjectConfirmPopup` / `AddressPopup` are built once under `components/lab-entry/` and driven by the arrival plan; both `EmailLabGridClient` and `ProjectEmailLabClient` mount them. No duplication.
3. **`destination.ts` owns ALL email-lab navigation URLs** — new-build (`?recipe=`), map (`?zip=`), open-existing (`?did=`), template (`?seed=`), and the ArcStrip deep link — not just the three A1 builders. The static door-pin test is only meaningful if every navigating door routes through it.
4. **Address pre-fill source is `projects.subject_address`** (the system's belief, set at project creation via `extractAddress`), else empty. `inferScopeFromItems` returns a zip/place, NOT a street address, so there is no separate "infer address from items" path to build — `subject_address` IS that belief.

## File Structure

**Create:**
- `lib/lab-entry/destination.ts` — ONE URL builder. Re-exports `recipeDestination`/`heroDestination` (unchanged, stay in their homes) and adds `openDoc`/`openSeed`/`openZip`/`arcStepDestination` builders + a `signedInLabArrival` helper (replaces `labDestination`). No `projects[0]`.
- `lib/lab-entry/destination.test.ts`
- `lib/lab-entry/destination.static.test.ts` — grep pin: no raw email-lab nav strings outside `lib/lab-entry/`.
- `lib/lab-entry/arrival.ts` — pure `planArrival(input): ArrivalPlan`.
- `lib/lab-entry/arrival.test.ts`
- `lib/lab-entry/address-reconcile.ts` — pure `reconcileAddress(...)` state machine.
- `lib/lab-entry/address-reconcile.test.ts`
- `lib/lab-entry/use-autosave.ts` — debounced autosave + exit-flush hook.
- `lib/lab-entry/use-autosave.test.ts` — pure timing/dirty logic extracted as `planAutosave` (testable without React).
- `lib/lab-entry/use-leave-guard.ts` — nav-guard + dirty-only `beforeunload` hook.
- `components/lab-entry/ProjectConfirmPopup.tsx`
- `components/lab-entry/AddressPopup.tsx`

**Modify:**
- `lib/project/items.ts` (+ `lib/project/items.test.ts`) — add `{kind:"address"}` union member.
- `app/layout.tsx` — wrap `children` with `<NavigationGuardProvider>`.
- `app/email-lab/grid/page.tsx` — stop redirecting signed-in; select `id,title`; pass arrival props.
- `app/email-lab/page.tsx` — signed-in → redirect to `/email-lab/grid` (carry params); delete `labDestination` use.
- `app/email-lab/AutoCreateProject.tsx` — keep (no-projects case) but source its route from `destination.ts`.
- `app/email-lab/grid/EmailLabGridClient.tsx` — arrival plan, blank skeleton for recipe, mount popups, create-project + route-into-project carrying recipe, autosave/leave-guard for the anonymous saved case is N/A (no saved doc) — leave-guard only.
- `app/project/[id]/email-lab/ProjectEmailLabClient.tsx` — arrival plan, remove `autoGenerate` for new-build arrivals, blank skeleton for recipe, mount popups, wire autosave + leave guard.
- `app/project/[id]/email-lab/page.tsx` — pass `subjectAddress` + already-present `initialRecipe`/`scope` into the client (mostly already there; confirm address carry).
- Door components migrated to `destination.ts` imports (Task 2 list).
- `lib/email/lab/capabilities.ts` (+ `capabilities.test.ts`) — add the `labEntry` capability routed `"both"`.

**Delete (Task 2, after migration):**
- `lib/project/lab-redirect.ts` + `lib/project/lab-redirect.test.ts` — `labDestination` dies; callers move to `destination.ts`.

---

## Task 1: The destination builder (`lib/lab-entry/destination.ts`)

**Files:**
- Create: `lib/lab-entry/destination.ts`
- Test: `lib/lab-entry/destination.test.ts`

**Interfaces:**
- Consumes: `recipeDestination`, `type ShowcaseRecipe` from `@/lib/showcase/recipe`; `heroDestination`, `type HeroCampaignEntry` from `@/lib/campaigns`.
- Produces:
  - `recipeDestination`, `heroDestination` (re-exported verbatim).
  - `openDoc(projectId: string, did: string, opts?: { schedule?: boolean }): string`
  - `openSeed(projectId: string, seedId: string): string`
  - `openZipLab(zip: string, opts?: { addr?: string | null; ref?: string | null }): string`
  - `arcStepDestination(projectId: string, step: { key: string; seed_doc_id: string; recipe_prompt: string; deliverable_id?: string | null }): string`
  - `signedInLabArrival(recipe?: { recipe?: string | null; recipeNeeds?: string | null; zip?: string | null } ): string` — the URL a signed-in standalone-lab visit lands on: ALWAYS `/email-lab/grid` carrying params, NEVER a project pick.
  - `projectEmailLabBase(projectId: string): string` → `/project/${projectId}/email-lab`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/lab-entry/destination.test.ts
import { describe, expect, test } from "bun:test";
import {
  openDoc,
  openSeed,
  openZipLab,
  arcStepDestination,
  signedInLabArrival,
  projectEmailLabBase,
} from "./destination";

describe("lab-entry destination builder", () => {
  test("openDoc builds the ?did= open-existing URL", () => {
    expect(openDoc("p1", "d9")).toBe("/project/p1/email-lab?did=d9");
    expect(openDoc("p1", "d9", { schedule: true })).toBe(
      "/project/p1/email-lab?did=d9&schedule=1",
    );
  });

  test("openSeed builds the ?seed= template URL", () => {
    expect(openSeed("p1", "skeleton-clean-white")).toBe(
      "/project/p1/email-lab?seed=skeleton-clean-white",
    );
  });

  test("openZipLab carries zip + optional addr/ref", () => {
    expect(openZipLab("33901")).toBe("/email-lab?zip=33901");
    expect(openZipLab("33901", { addr: "123 Main St", ref: "abc" })).toBe(
      "/email-lab?zip=33901&addr=123+Main+St&ref=abc",
    );
  });

  test("arcStepDestination carries step seed + recipe (+ did when present)", () => {
    const url = arcStepDestination("p1", {
      key: "coming-soon",
      seed_doc_id: "seed-x",
      recipe_prompt: "Coming soon email for [[your listing address]]",
    });
    expect(url).toContain("/project/p1/email-lab?arcStep=coming-soon");
    expect(url).toContain("seed=seed-x");
    expect(url).toContain("recipe=");
    expect(url).not.toContain("did=");
  });

  test("signedInLabArrival ALWAYS lands on /email-lab/grid — never picks a project", () => {
    expect(signedInLabArrival()).toBe("/email-lab/grid");
    expect(signedInLabArrival({ zip: "33901" })).toBe("/email-lab/grid?zip=33901");
    const withRecipe = signedInLabArrival({ recipe: "Make X", recipeNeeds: "agent_name" });
    expect(withRecipe.startsWith("/email-lab/grid?")).toBe(true);
    expect(withRecipe).toContain("recipe=Make+X");
    expect(withRecipe).toContain("recipeNeeds=agent_name");
    // The disease we're curing: no project id EVER appears.
    expect(signedInLabArrival({ recipe: "Make X" })).not.toContain("/project/");
  });

  test("projectEmailLabBase is the canonical in-project base", () => {
    expect(projectEmailLabBase("p1")).toBe("/project/p1/email-lab");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/lab-entry/destination.test.ts`
Expected: FAIL — `Cannot find module './destination'`.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/lab-entry/destination.ts
//
// THE ONE ROOT for every URL that navigates INTO the email lab. Before this,
// each door improvised its own href/push (spec 2026-07-06-lab-entry-root):
// campaign clicks, map clicks, open-existing rows, template rails, the arc
// deep link. They all build here now — destination.static.test.ts fails the
// suite if a raw "/email-lab" nav string appears outside this directory.
//
// Re-exports the two recipe/hero builders unchanged (they already live in
// their feature homes and are pure); adds the open-existing / seed / zip / arc
// builders and `signedInLabArrival`, which REPLACES lib/project/lab-redirect's
// labDestination — the projects[0] pick is deleted: a signed-in standalone
// visit lands on /email-lab/grid and the arrival controller asks which project.
export { recipeDestination, type ShowcaseRecipe } from "@/lib/showcase/recipe";
export { heroDestination, type HeroCampaignEntry } from "@/lib/campaigns";

export function projectEmailLabBase(projectId: string): string {
  return `/project/${projectId}/email-lab`;
}

/** Open an existing block-canvas deliverable for editing (?did=). */
export function openDoc(
  projectId: string,
  did: string,
  opts: { schedule?: boolean } = {},
): string {
  const q = opts.schedule ? `?did=${did}&schedule=1` : `?did=${did}`;
  return `${projectEmailLabBase(projectId)}${q}`;
}

/** Open a template seed by id (?seed=) — an explicit template pick, no popups. */
export function openSeed(projectId: string, seedId: string): string {
  return `${projectEmailLabBase(projectId)}?seed=${encodeURIComponent(seedId)}`;
}

/** Homepage-map / zip-report click → the anonymous grid lab's deterministic
 *  ZIP seed doc. Signed-in users hit /email-lab first, which carries this. */
export function openZipLab(
  zip: string,
  opts: { addr?: string | null; ref?: string | null } = {},
): string {
  const params = new URLSearchParams({ zip });
  if (opts.addr) params.set("addr", opts.addr);
  if (opts.ref) params.set("ref", opts.ref);
  return `/email-lab?${params.toString()}`;
}

/** The lifecycle arc strip's deep link into a milestone step. */
export function arcStepDestination(
  projectId: string,
  step: {
    key: string;
    seed_doc_id: string;
    recipe_prompt: string;
    deliverable_id?: string | null;
  },
): string {
  const params = new URLSearchParams({
    arcStep: step.key,
    seed: step.seed_doc_id,
    recipe: step.recipe_prompt,
  });
  if (step.deliverable_id) params.set("did", step.deliverable_id);
  return `${projectEmailLabBase(projectId)}?${params.toString()}`;
}

/** A signed-in visit to a standalone lab (/email-lab or /email-lab/grid). ALWAYS
 *  /email-lab/grid — the arrival controller asks which project once there. This
 *  is the deleted labDestination's replacement: NO projects[0], NO project id. */
export function signedInLabArrival(
  carry: { recipe?: string | null; recipeNeeds?: string | null; zip?: string | null } = {},
): string {
  const params = new URLSearchParams();
  if (carry.zip && /^\d{5}$/.test(carry.zip)) params.set("zip", carry.zip);
  if (carry.recipe) params.set("recipe", carry.recipe);
  if (carry.recipeNeeds) params.set("recipeNeeds", carry.recipeNeeds);
  const q = params.size > 0 ? `?${params.toString()}` : "";
  return `/email-lab/grid${q}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/lab-entry/destination.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/lab-entry/destination.ts lib/lab-entry/destination.test.ts
git commit -F- <<'EOF'
feat(lab-entry): destination builder — one root for every email-lab nav URL

Absorbs recipe/hero builders + adds open-existing/seed/zip/arc builders and
signedInLabArrival (replaces labDestination's projects[0] pick with a plain
/email-lab/grid landing). Spec 2026-07-06-lab-entry-root A1.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
```

---

## Task 2: Migrate every door to `destination.ts`; delete `lab-redirect.ts`

**Files:**
- Modify: `components/showcase/CampaignExamples.tsx` — already imports `recipeDestination`; repoint import to `@/lib/lab-entry/destination`. Also `router.push("/email-lab/grid")` (onAuthedCta) → `router.push(signedInLabArrival())`.
- Modify: `components/campaigns/CampaignQuickStart.tsx` — `recipeDestination` import → `@/lib/lab-entry/destination`.
- Modify: `components/briefcase/BriefcasePanel.tsx` — `recipeDestination` import → `@/lib/lab-entry/destination`.
- Modify: `components/landing/HeroCampaign.tsx` — `heroDestination` import → `@/lib/lab-entry/destination` (stays from `@/lib/campaigns` for `HERO_CAMPAIGNS`; only `heroDestination` moves).
- Modify: `lib/geo/address-route.ts` — `heroDestination` import → `@/lib/lab-entry/destination`.
- Modify: `components/landing/Hero.tsx` — `window.location.href = \`/email-lab?zip=${zip}\`` → `openZipLab(zip)`.
- Modify: `app/r/zip-report/[zip]/page.tsx` — the `/email-lab?zip=` href → `openZipLab(zip, { ref })`.
- Modify: `components/landing/Capabilities.tsx`, `components/landing/DeliverableShowcase.tsx` — `href="/email-lab"` → a `const LAB_LANDING = "/email-lab"` re-exported from destination? No — these are the anonymous plain-open landing CTAs. Add `export const EMAIL_LAB_LANDING = "/email-lab";` to `destination.ts` and use it, so the static test excludes them by import.
- Modify: `components/project/MaterialRow.tsx` — both `?did=` builders → `openDoc(projectId, d.id)` / `openDoc(projectId, d.id, { schedule: true })`.
- Modify: `components/project/TemplateRail.tsx` — `?seed=` href → `openSeed(projectId, s.id)`.
- Modify: `app/project/[id]/workspace/ThisWeek.tsx` — two `?did=` pushes → `openDoc(...)`.
- Modify: `app/project/[id]/ProjectWorkspace.tsx` — `?did=` push → `openDoc(id, data.id)`.
- Modify: `app/project/[id]/workspace/BuildActions.tsx` — `href={\`/project/${id}/email-lab\`}` → `href={projectEmailLabBase(id)}`.
- Modify: `app/project/[id]/ToolSwitcher.tsx` — `href: (id) => \`/project/${id}/email-lab\`` → `projectEmailLabBase(id)`.
- Modify: `components/email-lab/ArcStrip.tsx` — the raw arc URL → `arcStepDestination(projectId, step)`.
- Modify: `components/email-lab/ScheduleSendModal.tsx` — `returnTo` `?did=&schedule=1` → `openDoc(projectId, deliverableId, { schedule: true })`.
- Modify: `components/email-lab/SendToSelfModal.tsx` — `/project/${data.projectId}/email-lab` and `/email-lab` targets → `projectEmailLabBase(...)` / `EMAIL_LAB_LANDING`.
- Delete: `lib/project/lab-redirect.ts`, `lib/project/lab-redirect.test.ts` (callers in `app/email-lab/page.tsx` + `app/email-lab/grid/page.tsx` are rewritten in Tasks 8–9; import removal happens there — leave those two page files for their tasks, so this task does not break them: keep `lab-redirect.ts` until Task 9's commit, OR do the page rewrites first). **Ordering note:** Do Tasks 8 and 9's page edits, THEN delete `lab-redirect.ts` — see Step 4.

**Interfaces:**
- Consumes: everything from `lib/lab-entry/destination.ts` (Task 1).
- Produces: no NEW exports; this task only repoints imports and inlines builders.

- [ ] **Step 1: Add the landing constant to destination.ts**

Append to `lib/lab-entry/destination.ts`:

```typescript
/** The anonymous plain-open landing (block-canvas taste surface). Landing CTAs
 *  point here; the static door-pin test treats this named export as the sanctioned
 *  reference so those hrefs read from ONE place, not scattered literals. */
export const EMAIL_LAB_LANDING = "/email-lab";
```

- [ ] **Step 2: Repoint every door listed in Files**

For each import-only door (CampaignExamples, CampaignQuickStart, BriefcasePanel, HeroCampaign, address-route): change the import source of `recipeDestination`/`heroDestination` to `@/lib/lab-entry/destination`. Example (CampaignExamples.tsx):

```typescript
import { recipeDestination, signedInLabArrival, type ShowcaseRecipe } from "@/lib/lab-entry/destination";
// ...
onAuthedCta={() => router.push(signedInLabArrival())}
```

For each raw-string door, replace the literal with the builder. Example (Hero.tsx):

```typescript
import { openZipLab } from "@/lib/lab-entry/destination";
// ...
window.location.href = openZipLab(zip);
```

Example (ToolSwitcher.tsx):

```typescript
import { projectEmailLabBase } from "@/lib/lab-entry/destination";
// ...
{ tool: "email", label: "Email", href: (id: string) => projectEmailLabBase(id) },
```

Example (ArcStrip.tsx) — replace the inline template:

```typescript
import { arcStepDestination } from "@/lib/lab-entry/destination";
// ...
onClick={() => router.push(arcStepDestination(projectId, step))}
```

(`step` already carries `key`, `seed_doc_id`, `recipe_prompt`, `deliverable_id` per the existing template — confirm field names against `ArcSequence` step type before editing.)

- [ ] **Step 3: Run the affected suites + typecheck to verify nothing broke**

Run: `bun test lib/lab-entry/ lib/campaigns.test.ts && bunx next build`
Expected: PASS / build green. (Landing pages + doors compile with the new imports.)

- [ ] **Step 4: Delete `lab-redirect.ts` AFTER the page rewrites**

> Only after Tasks 8 & 9 have rewritten `app/email-lab/page.tsx` and `app/email-lab/grid/page.tsx` to stop importing `labDestination`. At that point:

```bash
git rm lib/project/lab-redirect.ts lib/project/lab-redirect.test.ts
```

- [ ] **Step 5: Commit (doors only; the delete rides Task 9)**

```bash
git add components/showcase/CampaignExamples.tsx components/campaigns/CampaignQuickStart.tsx \
  components/briefcase/BriefcasePanel.tsx components/landing/HeroCampaign.tsx lib/geo/address-route.ts \
  components/landing/Hero.tsx app/r/zip-report/[zip]/page.tsx components/landing/Capabilities.tsx \
  components/landing/DeliverableShowcase.tsx components/project/MaterialRow.tsx components/project/TemplateRail.tsx \
  app/project/[id]/workspace/ThisWeek.tsx app/project/[id]/ProjectWorkspace.tsx \
  app/project/[id]/workspace/BuildActions.tsx app/project/[id]/ToolSwitcher.tsx \
  components/email-lab/ArcStrip.tsx components/email-lab/ScheduleSendModal.tsx components/email-lab/SendToSelfModal.tsx \
  lib/lab-entry/destination.ts
git commit -F- <<'EOF'
refactor(lab-entry): migrate every email-lab nav door to destination.ts

Import-only doors repoint to @/lib/lab-entry/destination; raw-string hrefs/pushes
(zip, did, seed, arc, tool tab) call the builders. Spec 2026-07-06-lab-entry-root A1.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
```

---

## Task 3: Static door-pin test

**Files:**
- Create: `lib/lab-entry/destination.static.test.ts`

**Interfaces:**
- Consumes: reads the repo tree (`app/`, `components/`, `lib/`) as text.
- Produces: a test that fails if a raw email-lab NAV string appears outside `lib/lab-entry/`.

**Matcher definition (locked — from advisor pass):** flag a line only if it is a navigation target — matches `href=`, `router.push(`, `router.replace(`, or `window.location` on the same line AND contains `/email-lab` or a `/project/…/email-lab` template. EXCLUDE:
- `/api/email-lab/*` fetches (data endpoints, not navigation).
- The prefix constants in `components/nav/nav-config.ts` (`CHROME_FREE_PREFIXES`) and `lib/briefcase/pill-mount.ts` (`AI_CHROME_FREE_PREFIXES`) — these are route-matching lists, not navigation.
- `window.history.replaceState` in `ProjectEmailLabClient.handleSave` (URL sync, not navigation).
- Any file under `lib/lab-entry/`.
- Test files (`*.test.ts`, `*.test.tsx`).

- [ ] **Step 1: Write the failing test**

```typescript
// lib/lab-entry/destination.static.test.ts
//
// Door pin: every navigation INTO the email lab must build its URL in
// lib/lab-entry/destination.ts. A raw href/push/location to /email-lab or a
// /project/*/email-lab template anywhere else fails the suite (spec A "door
// inventory — ALL of them route through the root").
import { test, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components", "lib"];
// A navigation token: JSX `href=`, object-literal `href:` (nav-config/ToolSwitcher
// shape), `router.push/replace(`, `redirect(`, or `window.location`. The object-
// literal `href:` matters — a future `href: (id) => `/project/${id}/email-lab``
// must fail too, and the JSX-only `href=` would miss it.
const NAV = /(href[=:]|router\.(push|replace)\(|redirect\(|window\.location)/;
const LAB = /\/email-lab|\/project\/[^"'`]*\/email-lab|\/project\/\$\{[^}]+\}\/email-lab/;

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === "lab-entry") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
}

test("no raw email-lab navigation strings outside lib/lab-entry", () => {
  const files: string[] = [];
  for (const r of ROOTS) walk(r, files);
  const offenders: string[] = [];
  for (const f of files) {
    if (f.includes(join("lib", "lab-entry"))) continue;
    const lines = readFileSync(f, "utf8").split("\n");
    lines.forEach((line, i) => {
      // Strip a trailing line comment so `// … /email-lab …` prose never trips
      // the pin (dozens of files reference the path in comments).
      const code = line.replace(/\/\/.*$/, "");
      if (!NAV.test(code) || !LAB.test(code)) return;
      if (code.includes("/api/email-lab")) return; // data fetch, not nav
      if (code.includes("history.replaceState")) return; // URL sync, not nav
      if (code.includes("CHROME_FREE_PREFIXES") || code.includes("AI_CHROME_FREE_PREFIXES")) return;
      offenders.push(`${f}:${i + 1}  ${line.trim()}`);
    });
  }
  expect(offenders, `Route these through lib/lab-entry/destination.ts:\n${offenders.join("\n")}`).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it PASSES (Task 2 already migrated the doors)**

Run: `bun test lib/lab-entry/destination.static.test.ts`
Expected: PASS. If it lists offenders, migrate each through `destination.ts` (they were missed in Task 2) — do NOT relax the matcher for a real navigation string.

- [ ] **Step 3: Commit**

```bash
git add lib/lab-entry/destination.static.test.ts
git commit -F- <<'EOF'
test(lab-entry): static door pin — no raw email-lab nav strings outside the root

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
```

---

## Task 4: `{kind:"address"}` project item

**Files:**
- Modify: `lib/project/items.ts` (add the union member)
- Test: `lib/project/items.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ProjectItem` union gains `{ kind:"address"; address: string; added_at: string }` (the outer `base` already supplies `id`/`added_at`/`origin`; the member adds `address` and a member-local `added_at` per the spec's `{ kind:"address", address, added_at }` shape — but since `base` already has `added_at`, the member carries only `address`). Final member shape: `{ kind: z.literal("address"), address: z.string().min(1) }`.

- [ ] **Step 1: Write the failing test**

Append to `lib/project/items.test.ts`:

```typescript
import { projectItemSchema } from "./items";

test("address item — a project's additional known address (lab-entry reconcile)", () => {
  const item = {
    id: "a1",
    added_at: "2026-07-06T00:00:00Z",
    origin: "web",
    kind: "address",
    address: "123 Palm Ave, Fort Myers FL 33901",
  };
  expect(projectItemSchema.parse(item).kind).toBe("address");
});

test("address item rejects an empty address", () => {
  expect(() =>
    projectItemSchema.parse({
      id: "a1",
      added_at: "t",
      origin: "web",
      kind: "address",
      address: "",
    }),
  ).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/project/items.test.ts`
Expected: FAIL — `address` is not a valid discriminator value yet.

- [ ] **Step 3: Add the union member**

In `lib/project/items.ts`, add to the `kinds` discriminated union (after the `note` member is a good spot):

```typescript
  z.object({
    // A street address the project has touched beyond its primary subject_address
    // (lab-entry reconcile, spec 2026-07-06). The build feed + assistant see every
    // address the project knows, enabling later "how do these two relate" work.
    kind: z.literal("address"),
    address: z.string().min(1),
  }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/project/items.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/project/items.ts lib/project/items.test.ts
git commit -F- <<'EOF'
feat(project): {kind:"address"} project item — additional known addresses

Rides projects.items jsonb (no migration). Spec 2026-07-06-lab-entry-root C.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
```

---

## Task 5: The arrival planner (`lib/lab-entry/arrival.ts`)

**Files:**
- Create: `lib/lab-entry/arrival.ts`
- Test: `lib/lab-entry/arrival.test.ts`

**Interfaces:**
- Consumes: nothing (pure — the caller passes params + context).
- Produces:

```typescript
export interface ArrivalInput {
  params: {
    did?: string | null;
    seed?: string | null;
    zip?: string | null;
    recipe?: string | null;
    recipeNeeds?: string | null;
    addr?: string | null; // hero pre-filled address (blank already answered)
  };
  signedIn: boolean;
  /** Present when the visitor is already inside a project (in-project client) OR
   *  the standalone client resolved a most-recent project to offer. */
  offeredProject: { id: string; title: string } | null;
  /** True only for the in-project client — a tool-tab/plain open inside project
   *  X never asks "is this for X?". */
  insideProject: boolean;
  /** The offered project's believed listing address (projects.subject_address). */
  subjectAddress: string | null;
  /** Does the pending recipe need an address/area blank filled? */
  recipeHasBlank: boolean;
  /** "address" (listing) vs "area" (zip/market) — labels the address popup. */
  recipeInputKind: "address" | "area" | null;
}

export type DocChoice =
  | { kind: "load-did"; did: string }        // open existing
  | { kind: "seed"; seedId: string }         // explicit template pick
  | { kind: "zip"; zip: string }             // deterministic ZIP prebuild
  | { kind: "blank" }                         // skeleton-clean-white
  | { kind: "gallery" };                      // first-run template gallery (plain open, no deliverables)

export interface ArrivalPlan {
  doc: DocChoice;
  /** Show the project-confirm popup first (signed-in new-build, not already inside). */
  projectConfirm: boolean;
  /** Show the address/area popup (recipe carries an unfilled blank). */
  addressPopup: boolean;
  /** Fire the build immediately (blank already answered — hero pre-fill). */
  autoBuildAfterConfirm: boolean;
  /** The generic on-mount auto-build is DEAD for new-build arrivals. */
  legacyAutoGenerate: false;
}

export function planArrival(input: ArrivalInput): ArrivalPlan;
```

Rules (from spec §A2 + door inventory):
- `did` present → `{ doc: load-did }`, no popups, no auto-build. (Open-existing door.)
- `seed` present → `{ doc: seed }`, no popups (explicit template pick).
- `zip` present (no recipe) → `{ doc: zip }`; `projectConfirm = signedIn && !insideProject`; no address popup (the ZIP is the subject).
- `recipe` present → `{ doc: blank }`; `projectConfirm = signedIn && !insideProject`; `addressPopup = recipeHasBlank && !addrPreFilled`; `autoBuildAfterConfirm = recipeHasBlank && addrPreFilled` (hero handed the address).
  - `addrPreFilled` = `Boolean(params.addr && params.addr.trim())`.
- Plain open (no params) → `{ doc: insideProject && hasNoDeliverables? gallery : blank }`. **Caller supplies gallery-eligibility**; to keep the planner pure, add `firstRunGalleryEligible: boolean` to `ArrivalInput` and choose `gallery` when true, else `blank`. No popups.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/lab-entry/arrival.test.ts
import { describe, expect, test } from "bun:test";
import { planArrival, type ArrivalInput } from "./arrival";

const base: ArrivalInput = {
  params: {},
  signedIn: true,
  offeredProject: { id: "p1", title: "Rainbow Meadows" },
  insideProject: false,
  subjectAddress: null,
  recipeHasBlank: false,
  recipeInputKind: null,
  firstRunGalleryEligible: false,
};

describe("planArrival", () => {
  test("?did= → load existing, no popups, no auto-build", () => {
    const p = planArrival({ ...base, params: { did: "d9" } });
    expect(p.doc).toEqual({ kind: "load-did", did: "d9" });
    expect(p.projectConfirm).toBe(false);
    expect(p.addressPopup).toBe(false);
    expect(p.legacyAutoGenerate).toBe(false);
  });

  test("?seed= → the chosen seed, no popups (explicit pick)", () => {
    const p = planArrival({ ...base, params: { seed: "skeleton-dark-pro" } });
    expect(p.doc).toEqual({ kind: "seed", seedId: "skeleton-dark-pro" });
    expect(p.projectConfirm).toBe(false);
    expect(p.addressPopup).toBe(false);
  });

  test("?zip= signed-in standalone → zip doc + project confirm, NO address popup", () => {
    const p = planArrival({ ...base, params: { zip: "33901" } });
    expect(p.doc).toEqual({ kind: "zip", zip: "33901" });
    expect(p.projectConfirm).toBe(true);
    expect(p.addressPopup).toBe(false);
  });

  test("?recipe= signed-in standalone → BLANK skeleton + confirm + address popup", () => {
    const p = planArrival({
      ...base,
      params: { recipe: "Just listed [[your listing address]]" },
      recipeHasBlank: true,
      recipeInputKind: "address",
    });
    expect(p.doc).toEqual({ kind: "blank" });
    expect(p.projectConfirm).toBe(true);
    expect(p.addressPopup).toBe(true);
    expect(p.autoBuildAfterConfirm).toBe(false);
    expect(p.legacyAutoGenerate).toBe(false);
  });

  test("recipe never yields the fake-fill default doc", () => {
    const p = planArrival({ ...base, params: { recipe: "x" }, recipeHasBlank: true });
    expect(p.doc.kind).toBe("blank");
  });

  test("?recipe= with addr pre-filled (hero) → skip address popup, auto-build after confirm", () => {
    const p = planArrival({
      ...base,
      params: { recipe: "Just listed [[addr]]", addr: "123 Palm Ave" },
      recipeHasBlank: true,
      recipeInputKind: "address",
    });
    expect(p.addressPopup).toBe(false);
    expect(p.autoBuildAfterConfirm).toBe(true);
  });

  test("in-project recipe → NO project confirm (already inside the project you clicked)", () => {
    const p = planArrival({
      ...base,
      insideProject: true,
      params: { recipe: "Just listed [[addr]]" },
      recipeHasBlank: true,
    });
    expect(p.projectConfirm).toBe(false);
    expect(p.addressPopup).toBe(true);
  });

  test("anonymous recipe → no project confirm (no projects exist)", () => {
    const p = planArrival({
      ...base,
      signedIn: false,
      offeredProject: null,
      params: { recipe: "x" },
      recipeHasBlank: true,
    });
    expect(p.projectConfirm).toBe(false);
  });

  test("plain open, gallery-eligible → gallery, no popups", () => {
    const p = planArrival({ ...base, insideProject: true, firstRunGalleryEligible: true });
    expect(p.doc).toEqual({ kind: "gallery" });
    expect(p.projectConfirm).toBe(false);
  });

  test("plain open, not gallery-eligible → blank", () => {
    const p = planArrival({ ...base, insideProject: true });
    expect(p.doc).toEqual({ kind: "blank" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/lab-entry/arrival.test.ts`
Expected: FAIL — `Cannot find module './arrival'`.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/lab-entry/arrival.ts
//
// THE ONE arrival controller (pure). Both lab clients decide doc + popups +
// auto-build here so every door arrives identically (spec 2026-07-06 §A2). The
// disease this cures: recipe clicks fake-filled a demo doc ($485K/34 DOM), the
// signed-in redirect auto-picked projects[0], and a generic on-mount auto-build
// produced wrong-listing emails. New-build arrivals now get a BLANK skeleton and
// the generic auto-build (legacyAutoGenerate) is dead.

export interface ArrivalInput {
  params: {
    did?: string | null;
    seed?: string | null;
    zip?: string | null;
    recipe?: string | null;
    recipeNeeds?: string | null;
    addr?: string | null;
  };
  signedIn: boolean;
  offeredProject: { id: string; title: string } | null;
  insideProject: boolean;
  subjectAddress: string | null;
  recipeHasBlank: boolean;
  recipeInputKind: "address" | "area" | null;
  firstRunGalleryEligible: boolean;
}

export type DocChoice =
  | { kind: "load-did"; did: string }
  | { kind: "seed"; seedId: string }
  | { kind: "zip"; zip: string }
  | { kind: "blank" }
  | { kind: "gallery" };

export interface ArrivalPlan {
  doc: DocChoice;
  projectConfirm: boolean;
  addressPopup: boolean;
  autoBuildAfterConfirm: boolean;
  legacyAutoGenerate: false;
}

const trimmed = (s?: string | null) => (s ?? "").trim();

export function planArrival(input: ArrivalInput): ArrivalPlan {
  const { params } = input;
  const dead = { autoBuildAfterConfirm: false, legacyAutoGenerate: false as const };

  // Open-existing — never any new-build flow.
  if (trimmed(params.did)) {
    return { doc: { kind: "load-did", did: params.did! }, projectConfirm: false, addressPopup: false, ...dead };
  }

  // Explicit template pick — the user chose this seed; no popups.
  if (trimmed(params.seed)) {
    return { doc: { kind: "seed", seedId: params.seed! }, projectConfirm: false, addressPopup: false, ...dead };
  }

  // A signed-in standalone new-build arrival must confirm the project (it rode
  // the redirect that used to silently pick projects[0]). In-project + anonymous
  // never confirm.
  const projectConfirm = input.signedIn && !input.insideProject && input.offeredProject !== null;

  // Map prebuild — the ZIP is the subject, so no address popup.
  if (/^\d{5}$/.test(trimmed(params.zip))) {
    return { doc: { kind: "zip", zip: params.zip! }, projectConfirm, addressPopup: false, ...dead };
  }

  // Recipe (Make-this / campaign / hero) — BLANK skeleton, never a demo doc.
  if (trimmed(params.recipe)) {
    const addrPreFilled = Boolean(trimmed(params.addr));
    const addressPopup = input.recipeHasBlank && !addrPreFilled;
    return {
      doc: { kind: "blank" },
      projectConfirm,
      addressPopup,
      autoBuildAfterConfirm: input.recipeHasBlank && addrPreFilled,
      legacyAutoGenerate: false,
    };
  }

  // Plain open (tool tab, landing CTA): gallery where it shows today, else blank.
  return {
    doc: input.firstRunGalleryEligible ? { kind: "gallery" } : { kind: "blank" },
    projectConfirm: false,
    addressPopup: false,
    ...dead,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/lab-entry/arrival.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/lab-entry/arrival.ts lib/lab-entry/arrival.test.ts
git commit -F- <<'EOF'
feat(lab-entry): arrival planner — blank skeleton + popup plan, no fake-fill

Pure planArrival(): did/seed/zip/recipe/plain → doc + projectConfirm +
addressPopup + auto-build. Kills legacyAutoGenerate for new-build. Spec A2.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
```

---

## Task 6: Address ↔ project reconciliation (`lib/lab-entry/address-reconcile.ts`)

**Files:**
- Create: `lib/lab-entry/address-reconcile.ts`
- Test: `lib/lab-entry/address-reconcile.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:

```typescript
export type ReconcileResult =
  | { kind: "match" }                              // address == what project knows → build, no friction
  | { kind: "no-belief" }                          // project has no address yet → adopt silently, build
  | { kind: "differ" };                            // needs the keep/new confirm

export function reconcileAddress(entered: string, believed: string | null): ReconcileResult;

/** Normalize for comparison — case/space/punctuation-insensitive. */
export function normalizeAddress(a: string): string;

/** The item appended when the user keeps a differing address in the current
 *  project (build feed + assistant see it). Caller stamps id/added_at/origin. */
export function addressItem(address: string): { kind: "address"; address: string };
```

Rules: `match` when `normalizeAddress(entered) === normalizeAddress(believed)`. `no-belief` when `believed` is null/empty. `differ` otherwise. The **Keep** path appends exactly ONE `addressItem` (dedup by normalized address is the caller's DB concern via `add-item`'s id check — the reconcile module just produces the item).

- [ ] **Step 1: Write the failing test**

```typescript
// lib/lab-entry/address-reconcile.test.ts
import { describe, expect, test } from "bun:test";
import { reconcileAddress, normalizeAddress, addressItem } from "./address-reconcile";

describe("reconcileAddress", () => {
  test("no belief yet → adopt silently", () => {
    expect(reconcileAddress("123 Palm Ave", null).kind).toBe("no-belief");
    expect(reconcileAddress("123 Palm Ave", "").kind).toBe("no-belief");
  });
  test("same address (case/space/punct-insensitive) → match", () => {
    expect(reconcileAddress("123 Palm Ave, Fort Myers", "123  palm ave  fort myers").kind).toBe("match");
  });
  test("different address → differ (keep/new confirm)", () => {
    expect(reconcileAddress("456 Oak St", "123 Palm Ave").kind).toBe("differ");
  });
});

test("normalizeAddress lowercases, collapses space, strips punctuation", () => {
  expect(normalizeAddress("123 Palm Ave., Fort Myers")).toBe("123 palm ave fort myers");
});

test("addressItem carries the kind + address (caller stamps id/added_at/origin)", () => {
  expect(addressItem("123 Palm Ave")).toEqual({ kind: "address", address: "123 Palm Ave" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/lab-entry/address-reconcile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/lab-entry/address-reconcile.ts
//
// On Build, reconcile the address the user entered against what the project
// already believes (projects.subject_address). Match → build. No belief → adopt.
// Differ → one confirm (new project titled the address, OR keep here + record it
// as an additional known address). Spec 2026-07-06 §C "Address ↔ project
// reconciliation on Build". Pure — the client owns the DB writes + the confirm UI.

export type ReconcileResult = { kind: "match" } | { kind: "no-belief" } | { kind: "differ" };

export function normalizeAddress(a: string): string {
  return (a || "")
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function reconcileAddress(entered: string, believed: string | null): ReconcileResult {
  const b = normalizeAddress(believed ?? "");
  if (!b) return { kind: "no-belief" };
  return normalizeAddress(entered) === b ? { kind: "match" } : { kind: "differ" };
}

export function addressItem(address: string): { kind: "address"; address: string } {
  return { kind: "address", address };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/lab-entry/address-reconcile.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/lab-entry/address-reconcile.ts lib/lab-entry/address-reconcile.test.ts
git commit -F- <<'EOF'
feat(lab-entry): address↔project reconcile — match/no-belief/differ

Pure state machine + normalizeAddress + addressItem. Spec 2026-07-06 §C.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
```

---

## Task 7: Shared popups (`ProjectConfirmPopup`, `AddressPopup`)

**Files:**
- Create: `components/lab-entry/ProjectConfirmPopup.tsx`
- Create: `components/lab-entry/AddressPopup.tsx`

**Interfaces:**
- Consumes: nothing from the planner directly — the clients pass props.
- Produces:

```typescript
// ProjectConfirmPopup
export interface ProjectConfirmPopupProps {
  projectTitle: string;
  /** Yes — build in this project. */
  onConfirm: () => void;
  /** New Project saved → the new project id (client routes + carries recipe). */
  onNewProject: (name: string) => Promise<void>;
  creating: boolean;
}

// AddressPopup
export interface AddressPopupProps {
  /** "address" (listing) vs "area" (zip/market) — labels the field + Build copy. */
  inputKind: "address" | "area";
  /** projects.subject_address pre-fill (in-project), else "". */
  initialValue: string;
  onBuild: (value: string) => void;
  onCancel: () => void;
}
```

Both are centered overlays over the blank canvas (mirror `ProjectEmailLabClient`'s existing `confirmOpen` modal styling — `fixed inset-0 z-[60] flex items-center justify-center bg-black/60`, card `rounded-2xl border border-white/10 bg-[#0a1822]`). `ProjectConfirmPopup` flips to a name field on **No**. `AddressPopup` has one editable field + Build/Cancel.

- [ ] **Step 1: Write `ProjectConfirmPopup.tsx`**

```tsx
"use client";
// components/lab-entry/ProjectConfirmPopup.tsx
// Signed-in new-build arrival: "Build this in <project>?" over the blank canvas.
// No → flips to a single-field New Project form. Spec 2026-07-06 §B.
import { useState } from "react";

export interface ProjectConfirmPopupProps {
  projectTitle: string;
  onConfirm: () => void;
  onNewProject: (name: string) => Promise<void>;
  creating: boolean;
}

export function ProjectConfirmPopup({
  projectTitle,
  onConfirm,
  onNewProject,
  creating,
}: ProjectConfirmPopupProps) {
  const [mode, setMode] = useState<"confirm" | "new">("confirm");
  const [name, setName] = useState("");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a1822] p-5 shadow-2xl">
        {mode === "confirm" ? (
          <>
            <h2 className="text-sm font-semibold text-white">Build this in {projectTitle}?</h2>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={onConfirm}
                className="rounded-lg bg-gulf-teal py-2 text-sm font-semibold text-[#070f14] hover:bg-[#17a3b3]"
              >
                Yes, build in {projectTitle}
              </button>
              <button
                type="button"
                onClick={() => setMode("new")}
                className="rounded-lg border border-white/15 py-2 text-sm text-white/70 hover:bg-white/5"
              >
                No — new project
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-sm font-semibold text-white">New project</h2>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/80 placeholder:text-white/25 focus:border-gulf-teal/50 focus:outline-none"
            />
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={!name.trim() || creating}
                onClick={() => void onNewProject(name.trim())}
                className="rounded-lg bg-gulf-teal py-2 text-sm font-semibold text-[#070f14] hover:bg-[#17a3b3] disabled:opacity-50"
              >
                {creating ? "Creating…" : "Save & build here"}
              </button>
              <button
                type="button"
                onClick={() => setMode("confirm")}
                className="py-1 text-xs text-white/40 hover:text-white/70"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `AddressPopup.tsx`**

```tsx
"use client";
// components/lab-entry/AddressPopup.tsx
// Replaces the off-screen in-textarea [[blank]] with a centered one-field popup.
// Labeled by what the recipe needs (listing address vs area/ZIP). Spec §C.
import { useState } from "react";

export interface AddressPopupProps {
  inputKind: "address" | "area";
  initialValue: string;
  onBuild: (value: string) => void;
  onCancel: () => void;
}

export function AddressPopup({ inputKind, initialValue, onBuild, onCancel }: AddressPopupProps) {
  const [value, setValue] = useState(initialValue);
  const label = inputKind === "address" ? "Listing address" : "Area or ZIP";
  const placeholder =
    inputKind === "address" ? "123 Palm Ave, Fort Myers FL 33901" : "Cape Coral or 33904";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a1822] p-5 shadow-2xl">
        <h2 className="text-sm font-semibold text-white">{label}</h2>
        <p className="mt-1 text-xs text-white/50">
          {inputKind === "address"
            ? "Which listing is this for?"
            : "Which area should the numbers cover?"}
        </p>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) onBuild(value.trim());
          }}
          placeholder={placeholder}
          className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/80 placeholder:text-white/25 focus:border-gulf-teal/50 focus:outline-none"
        />
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={!value.trim()}
            onClick={() => onBuild(value.trim())}
            className="rounded-lg bg-gulf-teal py-2 text-sm font-semibold text-[#070f14] hover:bg-[#17a3b3] disabled:opacity-50"
          >
            Build
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="py-1 text-xs text-white/40 hover:text-white/70"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify they compile**

Run: `bunx next build`
Expected: build green (components are unreferenced yet — compile-only check).

- [ ] **Step 4: Commit**

```bash
git add components/lab-entry/ProjectConfirmPopup.tsx components/lab-entry/AddressPopup.tsx
git commit -F- <<'EOF'
feat(lab-entry): shared ProjectConfirm + Address popups

Centered over the blank canvas; driven by the arrival plan in both lab clients.
Spec 2026-07-06 §B/§C.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
```

---

## Task 8: Wire arrival into the standalone grid lab

**Files:**
- Modify: `app/email-lab/grid/page.tsx` — stop redirecting signed-in; select `id, title` (most-recent); pass `signedIn` + `offeredProject` + `recipe`/`zip`/`addr` carry to `EmailLabGridClient`. Delete `labDestination` import.
- Modify: `app/email-lab/page.tsx` — signed-in → `redirect(signedInLabArrival({ zip, recipe, recipeNeeds }))` (to `/email-lab/grid`, NOT a project). Delete `labDestination` import + the `AutoCreateProject` render for the signed-in branch (grid page owns the signed-in path now); anonymous branch unchanged.
- Modify: `app/email-lab/grid/EmailLabGridClient.tsx` — accept the new props, run `planArrival`, blank skeleton for recipe, mount `ProjectConfirmPopup` + `AddressPopup`, create-project + route-into-project carrying the recipe.

**Interfaces:**
- Consumes: `planArrival`/`ArrivalInput` (Task 5), `ProjectConfirmPopup`/`AddressPopup` (Task 7), `signedInLabArrival`/`recipeDestination` (Task 1), `findPlaceholder` from `@/lib/showcase/recipe`, `POST /api/projects`.
- Produces: no exports; behavior only.

**Behavior change to note for the reviewer:** signed-in `/email-lab/grid` no longer redirects into `projects[0]`. It renders the grid client, which shows the project-confirm popup over a blank skeleton. A recipe click that lands here builds a BLANK skeleton, not the fake-fill demo.

- [ ] **Step 1: Rewrite `app/email-lab/grid/page.tsx`**

```tsx
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { buildZipSeedDoc } from "@/lib/email/zip-seed";
import { EmailLabGridClient } from "./EmailLabGridClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Email Lab — Grid (North Star)" };

// Signed-in visitors NO LONGER redirect into projects[0] (spec 2026-07-06 §A):
// the grid client shows a project-confirm popup over a blank skeleton and asks.
export default async function EmailLabGridPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const zip = /^\d{5}$/.test(sp.zip ?? "") ? (sp.zip as string) : null;
  const addr = (sp.addr ?? "").trim() || null;
  const recipe = sp.recipe ?? null;
  const recipeNeeds = sp.recipeNeeds ?? null;

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let offeredProject: { id: string; title: string } | null = null;
  if (user) {
    const { data } = await supabase
      .from("projects")
      .select("id, title")
      .order("updated_at", { ascending: false })
      .limit(1);
    const row = (data as { id: string; title: string | null }[] | null)?.[0];
    if (row) offeredProject = { id: row.id, title: row.title ?? "your project" };
  }

  // ?zip= server prebuild (anonymous or signed-in blank-project preview).
  const seedDoc = zip ? await buildZipSeedDoc(zip) : null;

  return (
    <EmailLabGridClient
      seedDoc={seedDoc}
      zip={zip}
      addr={addr}
      recipe={recipe}
      recipeNeeds={recipeNeeds}
      signedIn={Boolean(user)}
      offeredProject={offeredProject}
    />
  );
}
```

- [ ] **Step 2: Rewrite the signed-in branch of `app/email-lab/page.tsx`**

Replace the `if (user) { … labDestination … }` block with:

```tsx
import { signedInLabArrival } from "@/lib/lab-entry/destination";
// ...
  if (user) {
    // The dying block-canvas standalone never grows the new-build flow — send
    // signed-in visitors to the grid lab, which owns the popups (spec §A, §D).
    redirect(signedInLabArrival({ zip, recipe, recipeNeeds }));
  }
```

Delete the `AutoCreateProject` + `labDestination` + `projects` select imports/usage from this file (anonymous branch keeps `buildZipSeedDoc` + `EmailLabClient`).

- [ ] **Step 3: Expand `EmailLabGridClient.tsx`**

Add props and the arrival wiring. Key changes:

```tsx
"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { EmailLabGridShell } from "@/components/email-lab/EmailLabGridShell";
import { seedById, SEED_DOCS } from "@/lib/email/doc/default-docs";
import { DEFAULT_H } from "@/components/email-lab/GridCanvas";
import { ensureGridLayouts } from "@/lib/email/doc/grid-layouts";
import type { EmailDoc } from "@/lib/email/doc/types";
import { findPlaceholder, type BrandNeed, type ShowcaseRecipe } from "@/lib/showcase/recipe";
import { recipeDestination } from "@/lib/lab-entry/destination";
import { planArrival } from "@/lib/lab-entry/arrival";
import { ProjectConfirmPopup } from "@/components/lab-entry/ProjectConfirmPopup";
import { AddressPopup } from "@/components/lab-entry/AddressPopup";

export function EmailLabGridClient({
  seedDoc,
  zip,
  addr,
  recipe,
  recipeNeeds,
  signedIn,
  offeredProject,
}: {
  seedDoc?: EmailDoc | null;
  zip?: string | null;
  addr?: string | null;
  recipe?: string | null;
  recipeNeeds?: string | null;
  signedIn: boolean;
  offeredProject: { id: string; title: string } | null;
}) {
  const initialRecipe: ShowcaseRecipe | null = recipe
    ? {
        prompt: recipe,
        needs: (recipeNeeds ?? "").split(",").map((s) => s.trim()).filter(Boolean) as BrandNeed[],
      }
    : null;
  const recipeBlank = initialRecipe ? findPlaceholder(initialRecipe.prompt) : null;

  const [plan] = useState(() =>
    planArrival({
      params: { zip, recipe, addr, recipeNeeds },
      signedIn,
      offeredProject,
      insideProject: false,
      subjectAddress: null,
      recipeHasBlank: Boolean(recipeBlank),
      recipeInputKind: recipeBlank ? "address" : null,
      firstRunGalleryEligible: false,
    }),
  );

  // Blank skeleton for a recipe arrival; zip prebuild wins when present; else the
  // static grid seed (anonymous plain open keeps today's north-star look).
  const [initialDoc] = useState<EmailDoc>(() => {
    if (plan.doc.kind === "zip" && seedDoc) return seedDoc;
    if (plan.doc.kind === "blank")
      return ensureGridLayouts((seedById("skeleton-clean-white") ?? SEED_DOCS[0]).build(), DEFAULT_H);
    return seedDoc ?? (seedById("luxury-market-report") ?? SEED_DOCS[0]).build();
  });

  const [confirmOpen, setConfirmOpen] = useState(plan.projectConfirm);
  const [addressOpen, setAddressOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Confirm resolved → route into the chosen project carrying the recipe (the
  // grid lab is projectless; the project's Email tab is where the build runs).
  function intoProject(projectId: string) {
    window.location.href = initialRecipe
      ? recipeDestination(initialRecipe, { projectId })
      : `/project/${projectId}/email-lab${zip ? `?zip=${zip}` : ""}`;
  }

  async function createAndEnter(name: string) {
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: name }),
      });
      const data = (await res.json().catch(() => null)) as { id?: string } | null;
      if (data?.id) intoProject(data.id);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <EmailLabGridShell
        initialDoc={initialDoc}
        initialRecipe={plan.addressPopup ? null : initialRecipe}
        scope={zip ? { kind: "zip", value: zip, address: addr ?? undefined } : undefined}
        headerSlot={/* unchanged header slot */ <span className="flex items-center gap-2 text-sm font-semibold">…</span>}
      />
      {confirmOpen && offeredProject && (
        <ProjectConfirmPopup
          projectTitle={offeredProject.title}
          creating={creating}
          onConfirm={() => intoProject(offeredProject.id)}
          onNewProject={createAndEnter}
        />
      )}
      {!confirmOpen && addressOpen && recipeBlank && (
        <AddressPopup
          inputKind="address"
          initialValue={addr ?? ""}
          onBuild={(v) => {
            // Fill the recipe blank and route into the project (or stay anonymous
            // on the grid, seeding the Build box). Anonymous path: seed the shell.
            setAddressOpen(false);
            // (client seeds the filled recipe into the Build box — see note)
          }}
          onCancel={() => setAddressOpen(false)}
        />
      )}
    </>
  );
}
```

**Implementation notes for the executor (not placeholders — decisions):**
- Keep the existing `headerSlot` JSX verbatim from the current file.
- The address popup opens AFTER the project confirm resolves: when `plan.addressPopup` is true, set `addressOpen` true in the `onConfirm`/`createAndEnter` continuations for the anonymous/stay case. For the signed-in case the address popup rides into the project (the in-project client re-runs the plan and shows it) — so on the grid client, the address popup only matters for the ANONYMOUS recipe arrival (no project to route into). Gate: `addressOpen` initial = `plan.addressPopup && !signedIn`.
- For the anonymous filled-blank case, `onBuild` replaces `[[blank]]` in `initialRecipe.prompt` (use `findPlaceholder` + slice, mirror `heroDestination`) and seeds it into the shell by passing the filled recipe as `initialRecipe` — simplest: store `filledRecipe` in state and pass it to the shell.

- [ ] **Step 4: Verify**

Run: `bunx next build && bun test lib/lab-entry/`
Expected: build green, lab-entry tests pass.

- [ ] **Step 5: Delete the dead redirect module (now that both pages stopped importing it)**

```bash
git rm lib/project/lab-redirect.ts lib/project/lab-redirect.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add app/email-lab/grid/page.tsx app/email-lab/page.tsx app/email-lab/grid/EmailLabGridClient.tsx
git commit -F- <<'EOF'
feat(lab-entry): standalone grid lab asks which project — no more projects[0]

Signed-in /email-lab/grid renders the client with a project-confirm popup over a
blank skeleton; /email-lab redirects signed-in to grid. Deletes lab-redirect.
Spec 2026-07-06 §A/§B.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
```

---

## Task 9: Wire arrival into the in-project lab; remove the wrong-listing auto-build

**Files:**
- 🔴 Modify: `app/project/[id]/email-lab/ProjectEmailLabClient.tsx`

**Interfaces:**
- Consumes: `planArrival` (Task 5), `ProjectConfirmPopup`/`AddressPopup` (Task 7 — only `AddressPopup` used in-project; project confirm is skipped inside a project), `reconcileAddress`/`addressItem` (Task 6), `ensureGridLayouts` + `skeleton-clean-white` seed, `findPlaceholder`, `POST /api/projects/[id]/add-item`.
- Produces: no exports.

**Behavior change to note for the reviewer:** the generic `autoGenerate` on-mount build is GONE for new-build arrivals (doors 11/12 plain opens + recipe arrivals). A plain in-project open now shows the blank skeleton + on-canvas directions (or the first-run gallery where it shows today), and builds on explicit click. This is exactly the path that produced the wrong-listing "Just Listed" email.

- [ ] **Step 1: Compute the arrival plan and choose the doc**

In `ProjectEmailLabClient`, replace the `doc0`/`showGallery` lazy state + the `autoGenerate` line with a plan-driven version:

```tsx
import { planArrival } from "@/lib/lab-entry/arrival";
import { AddressPopup } from "@/components/lab-entry/AddressPopup";
import { reconcileAddress, addressItem } from "@/lib/lab-entry/address-reconcile";
import { findPlaceholder } from "@/lib/showcase/recipe";
import { seedById, SEED_DOCS, defaultDoc, type SeedDoc } from "@/lib/email/doc/default-docs";
// ...
const recipeBlank = initialRecipe ? findPlaceholder(initialRecipe.prompt) : null;
const [plan] = useState(() =>
  planArrival({
    params: { did: deliverableId, zip: null, recipe: initialRecipe?.prompt ?? null, addr: null },
    signedIn: true,
    offeredProject: { id: projectId, title: projectTitle },
    insideProject: true,           // never asks "is this for <this project>?"
    subjectAddress: subjectAddress ?? null,
    recipeHasBlank: Boolean(recipeBlank),
    recipeInputKind: recipeBlank ? "address" : null,
    firstRunGalleryEligible: !initialDoc && !hasDeliverables && !initialRecipe,
  }),
);

// Blank skeleton for a recipe arrival (spec: NEVER defaultDoc for recipe); the
// server-provided initialDoc (did/seed/zip) wins; else blank skeleton.
const [doc0] = useState<EmailDoc>(() => {
  if (initialDoc) return initialDoc;
  if (plan.doc.kind === "blank")
    return (seedById("skeleton-clean-white") ?? SEED_DOCS[0]).build();
  return defaultDoc();
});
const [showGallery, setShowGallery] = useState(() => plan.doc.kind === "gallery");
```

- [ ] **Step 2: Kill the generic auto-build for new-build arrivals**

In the `shared` object, change `autoGenerate` so it NEVER fires for a recipe/plain new-build arrival — only the explicit ZIP-seeded path retains its suppression logic (already false there). Replace:

```tsx
autoGenerate: !savedId && !hasToggled && !galleryPicked && !zipSeeded && !initialRecipe,
```

with:

```tsx
// The generic on-mount build is the wrong-listing bug (spec §A2 "removed for
// new-build arrivals"). Builds happen on explicit click now.
autoGenerate: false,
```

- [ ] **Step 3: Mount the address popup + reconcile on build**

Add address-popup state driven by `plan.addressPopup`, pre-filled from `subjectAddress`. On Build, run `reconcileAddress(entered, subjectAddress)`; on `differ`, show a keep/new confirm (reuse the existing modal styling); on **Keep**, `POST /api/projects/${projectId}/add-item` with a stamped `addressItem` before firing the build. Add near the other modals:

```tsx
const [addressOpen, setAddressOpen] = useState(plan.addressPopup);
const [diffAddr, setDiffAddr] = useState<string | null>(null);

async function keepAddress(entered: string) {
  await fetch(`/api/projects/${projectId}/add-item`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      item: {
        id: crypto.randomUUID(),
        added_at: new Date().toISOString(),
        origin: "web",
        ...addressItem(entered),
      },
    }),
  });
}
// ...
{addressOpen && recipeBlank && (
  <AddressPopup
    inputKind="address"
    initialValue={subjectAddress ?? ""}
    onCancel={() => setAddressOpen(false)}
    onBuild={(entered) => {
      const r = reconcileAddress(entered, subjectAddress);
      setAddressOpen(false);
      if (r.kind === "differ") { setDiffAddr(entered); return; }
      // match / no-belief → seed the filled recipe into the Build box + build.
      seedFilledRecipe(entered);
    }}
  />
)}
```

`seedFilledRecipe(entered)` fills the recipe `[[blank]]` (via `findPlaceholder` + slice) and hands the filled recipe to the shell (set an `initialRecipe`-shaped state the shell reads). The keep/new confirm modal calls `keepAddress` then `seedFilledRecipe`, or routes to a new project titled the address (`POST /api/projects` with `{ title: entered, kind: "listing", subject_address: entered }` then `intoProject`).

- [ ] **Step 4: Verify build + existing lab tests**

Run: `bunx next build && bun test lib/lab-entry/ lib/email/lab/capabilities.test.ts`
Expected: build green; tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/project/[id]/email-lab/ProjectEmailLabClient.tsx
git commit -F- <<'EOF'
feat(lab-entry): in-project lab — blank skeleton, address popup, no auto-build

Removes the generic on-mount auto-build (the wrong-listing bug); recipe arrivals
get a blank skeleton + address popup with reconcile-on-build. Spec §A2/§C.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
```

---

## Task 10: Autosave (`lib/lab-entry/use-autosave.ts`)

**Files:**
- Create: `lib/lab-entry/use-autosave.ts` (hook + pure `planAutosaveFlush`)
- Test: `lib/lab-entry/use-autosave.test.ts` (pure logic only)

**Interfaces:**
- Consumes: nothing external.
- Produces:
  - `useAutosave(opts: { savedId: string | null; getDoc: () => EmailDoc; getPrompt: () => string; dirtyRef: React.MutableRefObject<boolean>; patch: (doc: EmailDoc, prompt: string) => Promise<void> }): void` — debounced ~5 s save when a saved doc exists + flush on `pagehide`/`visibilitychange→hidden` via `fetch(..., {keepalive:true})`.
  - `shouldKeepaliveFlush(byteLength: number): boolean` — pure; false when `byteLength > 64_000` (keepalive cap; the 5 s autosave already covered it).

- [ ] **Step 1: Write the failing test (pure logic)**

```typescript
// lib/lab-entry/use-autosave.test.ts
import { describe, expect, test } from "bun:test";
import { shouldKeepaliveFlush } from "./use-autosave";

describe("shouldKeepaliveFlush (keepalive ~64KB cap)", () => {
  test("small docs flush on exit", () => {
    expect(shouldKeepaliveFlush(10_000)).toBe(true);
  });
  test("oversized docs skip the flush — the 5s autosave has them covered", () => {
    expect(shouldKeepaliveFlush(70_000)).toBe(false);
  });
  test("boundary at 64000 bytes", () => {
    expect(shouldKeepaliveFlush(64_000)).toBe(true);
    expect(shouldKeepaliveFlush(64_001)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/lab-entry/use-autosave.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the hook + pure helper**

```typescript
// lib/lab-entry/use-autosave.ts
"use client";
// Saved-doc autosave: debounced ~5s PATCH after the last edit, plus a
// flush-on-exit on pagehide / visibilitychange→hidden via fetch keepalive
// (PATCH + JSON + cookies; sendBeacon is POST-only). keepalive bodies cap at
// ~64KB — oversized docs skip the flush (the 5s debounce covered them to within
// seconds). Spec 2026-07-06 §D. Never-saved docs use the leave guard, not this.
import { useEffect, useRef } from "react";
import type { EmailDoc } from "@/lib/email/doc/types";

const DEBOUNCE_MS = 5_000;
const KEEPALIVE_CAP = 64_000;

export function shouldKeepaliveFlush(byteLength: number): boolean {
  return byteLength <= KEEPALIVE_CAP;
}

export interface UseAutosaveOpts {
  savedId: string | null;
  projectId: string;
  getDoc: () => EmailDoc;
  getPrompt: () => string;
  dirtyRef: React.MutableRefObject<boolean>;
  /** Debounced in-app save (uses the existing materials PATCH). */
  patch: (doc: EmailDoc, prompt: string) => Promise<void>;
  /** Marks the doc clean after a successful save. */
  onSaved: () => void;
}

export function useAutosave(opts: UseAutosaveOpts): void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced autosave — re-armed by the parent bumping a dirty tick. The parent
  // calls scheduleAutosave() from onDocChange; we expose it via a ref-less effect
  // that watches dirtyRef through a lightweight interval is WRONG (polling). Use
  // an explicit trigger: return a schedule fn instead. (See Step 4 wiring.)
  useEffect(() => {
    function flush() {
      if (!opts.savedId || !opts.dirtyRef.current) return;
      const doc = opts.getDoc();
      const body = JSON.stringify({ deliverable_id: opts.savedId, doc, ai_prompt: opts.getPrompt() });
      if (!shouldKeepaliveFlush(new Blob([body]).size)) return;
      // Fire-and-forget; keepalive lets it outlive the page.
      fetch(`/api/projects/${opts.projectId}/materials`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
    }
    function onHide() {
      if (document.visibilityState === "hidden") flush();
    }
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.savedId, opts.projectId]);
}

/** Debounced in-app autosave trigger — call from the parent's onDocChange. Kept
 *  separate from the hook so the parent owns the timer lifecycle alongside its
 *  own dirty tracking (avoids a second source of truth). */
export function makeAutosaveScheduler(
  patch: () => void,
  delayMs = DEBOUNCE_MS,
): { schedule: () => void; cancel: () => void } {
  let t: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule() {
      if (t) clearTimeout(t);
      t = setTimeout(patch, delayMs);
    },
    cancel() {
      if (t) clearTimeout(t);
    },
  };
}
```

- [ ] **Step 4: Wire the scheduler into `ProjectEmailLabClient.handleDocChange`**

In `ProjectEmailLabClient`, create a scheduler and call `.schedule()` from `handleDocChange` when `savedId` exists; the scheduled callback runs the existing `handleSave(currentDocRef.current, lastPrompt)`. Mount `useAutosave` for the exit flush. (The block/grid EmailLabClient anonymous surface has no saved doc → autosave N/A; leave guard covers it in Task 11.)

```tsx
import { useAutosave, makeAutosaveScheduler } from "@/lib/lab-entry/use-autosave";
// ...
const autosave = useRef(makeAutosaveScheduler(() => {
  if (savedId && dirtyRef.current) void handleSave(currentDocRef.current, "");
}));
function handleDocChange(doc: EmailDoc) {
  currentDocRef.current = doc;
  dirtyRef.current = true;
  if (savedId) autosave.current.schedule();
}
useAutosave({
  savedId, projectId, getDoc: () => currentDocRef.current, getPrompt: () => "",
  dirtyRef, patch: async () => {}, onSaved: () => { dirtyRef.current = false; },
});
```

- [ ] **Step 5: Run tests + build**

Run: `bun test lib/lab-entry/use-autosave.test.ts && bunx next build`
Expected: PASS, build green.

- [ ] **Step 6: Commit**

```bash
git add lib/lab-entry/use-autosave.ts lib/lab-entry/use-autosave.test.ts app/project/[id]/email-lab/ProjectEmailLabClient.tsx
git commit -F- <<'EOF'
feat(lab-entry): autosave — 5s debounce + pagehide keepalive flush

Saved docs silently autosave; exit flush via fetch keepalive (skips >64KB).
Spec 2026-07-06 §D.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
```

---

## Task 11: Leave guard — nav-guard dep, provider, dirty-only `beforeunload`

**Files:**
- Modify: `package.json` (+ `bun.lock`) — add `nextjs-nav-guard`.
- Modify: `app/layout.tsx` — wrap `children` with `<NavigationGuardProvider>`.
- Create: `lib/lab-entry/use-leave-guard.ts`
- 🔴 Modify: `app/project/[id]/email-lab/ProjectEmailLabClient.tsx` + `app/email-lab/grid/EmailLabGridClient.tsx` + `app/email-lab/EmailLabClient.tsx` — use the guard for never-saved / dirty docs.
- Modify: `lib/email/lab/capabilities.ts` (+ `capabilities.test.ts`) — add `labEntry: "both"`.

**Interfaces:**
- Consumes: `useNavigationGuard` from `nextjs-nav-guard`.
- Produces: `useLeaveGuard(opts: { dirty: boolean; onConfirmLeave?: () => void }): { active: boolean; accept: () => void; reject: () => void }` — App Router nav interception (custom dialog) + a dirty-only `beforeunload` listener registered only while `dirty` and removed when clean.

- [ ] **Step 1: Install the dependency**

Run: `bun add nextjs-nav-guard`
Then confirm `package.json` shows it and `bun.lock` updated.

- [ ] **Step 2: Add the tier-dial capability (test-first)**

Append to `lib/email/lab/capabilities.ts` `EmailLabCapabilities` + `FEATURE_ROUTING`:

```typescript
  /** Lab-entry root: project/address popups + autosave + leave guard. */
  labEntry: boolean;
```
```typescript
  labEntry: "both", // free and paid get identical entry + safety (spec §D)
```

The existing `capabilities.test.ts` "every feature lands exactly where it was routed" loop covers it automatically (it iterates `FEATURE_ROUTING`). Add one explicit assertion:

```typescript
test("labEntry is 'both' — entry + safety identical across tiers", () => {
  expect(free.labEntry).toBe(true);
  expect(paid.labEntry).toBe(true);
});
```

Run: `bun test lib/email/lab/capabilities.test.ts` → PASS.

- [ ] **Step 3: Wrap the provider in `app/layout.tsx`**

```tsx
import { NavigationGuardProvider } from "nextjs-nav-guard";
// ...
      <body className="min-h-full flex flex-col">
        <NavigationGuardProvider>
          {/* existing body children unchanged */}
        </NavigationGuardProvider>
      </body>
```

(Wrap everything currently inside `<body>` — Toaster + BriefcaseProvider + the rest.)

- [ ] **Step 4: Write `use-leave-guard.ts`**

```typescript
// lib/lab-entry/use-leave-guard.ts
"use client";
// Never-saved / dirty lab work must not vanish on navigation (spec §D). Two
// layers: nextjs-nav-guard intercepts internal App Router nav (router.push,
// <Link>, back/forward) so we can raise our own Save/Leave/Cancel dialog; a
// beforeunload listener — registered ONLY while dirty, removed when clean —
// catches tab close / reload with the browser's generic (non-customizable)
// prompt. Firefox drops pages with a live beforeunload from bfcache, so we must
// keep it off while clean. Fork nextjs-nav-guard (not the unmaintained LayerX
// original) supports Next 16.2+.
import { useEffect } from "react";
import { useNavigationGuard } from "nextjs-nav-guard";

export function useLeaveGuard(opts: { dirty: boolean }) {
  // beforeunload — only while dirty (sticky-activation + bfcache hygiene).
  useEffect(() => {
    if (!opts.dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // legacy; text is a generic browser string
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [opts.dirty]);

  // Internal App Router nav — custom dialog mode (no confirm callback → async).
  return useNavigationGuard({ enabled: opts.dirty });
}
```

- [ ] **Step 5: Wire the guard + Save/Leave/Cancel dialog into the clients**

In `ProjectEmailLabClient` (and the two standalone clients), call `useLeaveGuard({ dirty })` where `dirty` = "has unsaved changes and is not currently saving". For never-saved docs, `dirty` is true once the user edits. Render a dialog on `guard.active` reusing the existing modal styling:

```tsx
const guard = useLeaveGuard({ dirty: isDirtyUnsaved });
// ...
{guard.active && (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
    <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a1822] p-5 shadow-2xl">
      <h2 className="text-sm font-semibold text-white">Leave without saving?</h2>
      <p className="mt-1 text-xs text-white/50">Your design isn’t saved yet.</p>
      <div className="mt-4 flex flex-col gap-2">
        <button className="rounded-lg bg-gulf-teal py-2 text-sm font-semibold text-[#070f14]"
          onClick={async () => { await handleSave(currentDocRef.current, ""); guard.accept(); }}>
          Save & leave
        </button>
        <button className="rounded-lg border border-white/15 py-2 text-sm text-white/70"
          onClick={guard.accept}>Leave without saving</button>
        <button className="py-1 text-xs text-white/40" onClick={guard.reject}>Cancel</button>
      </div>
    </div>
  </div>
)}
```

Also add the never-saved 5-minute save-nudge (spec §D): a `setTimeout(5*60*1000)` armed on first edit for a never-saved doc, showing a non-blocking nudge banner. Keep it small — one state flag + one effect that clears on save.

- [ ] **Step 6: Verify build + all lab-entry tests**

Run: `bun test lib/lab-entry/ lib/email/lab/capabilities.test.ts lib/project/items.test.ts && bunx next build`
Expected: all green.

- [ ] **Step 7: Commit (dep + lockfile + code together — pre-push gate 1)**

```bash
git add package.json bun.lock app/layout.tsx lib/lab-entry/use-leave-guard.ts \
  lib/email/lab/capabilities.ts lib/email/lab/capabilities.test.ts \
  app/project/[id]/email-lab/ProjectEmailLabClient.tsx \
  app/email-lab/grid/EmailLabGridClient.tsx app/email-lab/EmailLabClient.tsx
git commit -F- <<'EOF'
feat(lab-entry): leave guard — nextjs-nav-guard + dirty-only beforeunload

NavigationGuardProvider in root layout; Save/Leave/Cancel dialog on internal
nav; beforeunload only while dirty. labEntry routes "both". Spec 2026-07-06 §D.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
```

---

## Final verification (before the push, not a task commit)

- [ ] `bun test lib/lab-entry/ lib/project/items.test.ts lib/email/lab/capabilities.test.ts` — all green.
- [ ] `bunx next build` — green (Vercel-faithful; bare tsc is not enough).
- [ ] Static door pin passes with zero offenders.
- [ ] SESSION_LOG.md entry appended (RULE 0 — before push).
- [ ] `_AUDIT_AND_ROADMAP/build-queue.md` synced.
- [ ] Push via `node scripts/safe-push.mjs` (check `git log origin/main..HEAD` for foreign commits first), then `node scripts/check.mjs close lab_entry_root_live_verify` in the same push — BUT `*_live_verify` is operator-run (prod evidence, not dev attestation): leave it OPEN, note in SESSION_LOG that offline gates pass and the check awaits operator live-verify.

## Self-Review notes (coverage against the spec)

- §A1 destination builder → Task 1; migration + delete → Task 2; static pin → Task 3.
- §A2 arrival controller (did/seed/zip/recipe/plain, kill legacyAutoGenerate) → Task 5, wired Tasks 8–9.
- §B project confirm (Yes / No→New Project, anonymous skip, AutoCreateProject stays) → Task 7 component + Task 8 wiring.
- §C address popup + reconcile + `{kind:"address"}` item → Tasks 4, 6, 7, 9.
- §D save model (autosave + keepalive flush + nav guard + dirty beforeunload + 5-min nudge + tier "both") → Tasks 10, 11.
- Door inventory (all 13 build/lab-open/in-project + open-existing) → Task 2 covers every named file.
- Out-of-scope items (gallery fake numbers, AI compare features, social lab parity) → untouched, correct.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 9, Task 11 | `app/project/[id]/email-lab/ProjectEmailLabClient.tsx` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
