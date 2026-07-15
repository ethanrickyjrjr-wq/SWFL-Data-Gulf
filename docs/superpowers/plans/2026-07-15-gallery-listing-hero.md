# Pick a Starting Point: Gallery-First Routing + Listing Campaign Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — 6 tasks, 8 files, keywords: architecture

**Goal:** Make the nav's "New Campaign" button land on the "Pick a starting point" gallery instead
of a blank canvas behind a popup, and replace the thin "Start the listing campaign" pill with an
always-visible, address-capturing "From Teaser to Sold" hero section at the top of that gallery.

**Architecture:** `TemplateGallery` gains an optional `heroSlot` render-prop so it stays decoupled
from listing specifics. A new `ListingCampaignHero` component owns two states (capture an address
/ offer to arm an already-known one) and is threaded into both gallery call sites —
`ProjectEmailLabClient` (in-project) and `EmailLabGridClient` (standalone `/email-lab/grid`,
newly made gallery-eligible). A new shared helper centralizes "POST a listing project, navigate
in" logic that previously had two separate inline copies.

**Tech Stack:** Next.js App Router (client components), TypeScript, bun:test +
`react-dom/server`'s `renderToStaticMarkup` for component content tests (existing repo
convention — see `components/landing/HeroAskPanel.test.tsx`; no jsdom/testing-library in this
repo, don't introduce one).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-15-gallery-listing-hero-design.md` — read in full before
  starting; every task below implements one piece of it.
- `signedInLabArrival()` must keep resolving to exactly `/email-lab/grid` — `lib/lab-entry/
  destination.test.ts` (`signedInLabArrival ALWAYS lands on /email-lab/grid`) is locked and must
  stay green untouched. This plan changes what that route RENDERS, never the URL.
- No invented capabilities in the hero copy — the click-alert line only ships because
  `docs/superpowers/specs/2026-07-15-campaign-click-alerts-design.md` is already merged
  (commit `812e5ea5`).
- `h-full`/`dvh` over `h-screen` (repo-wide rule) — not applicable here (no full-height surfaces
  touched), noted for completeness.
- Stage explicit paths only when committing (`git add <path>`, never `-A`) — this repo runs
  parallel sessions.
- Verify with `bunx next build`, not `npx tsc` (repo convention, confirmed working this session).
- Five real thumbnails only — `public/showcase/listing-to-close/step-1.webp` … `step-5.webp`,
  sourced from `lib/showcase/registry.ts`'s existing `SHOWCASES` entry (id `listing-to-close`),
  never a second hardcoded copy of that image list.

---

### Task 1: Shared "create a listing project from an address" helper

**Files:**
- Create: `lib/lab-entry/create-listing-project.ts`
- Test: `lib/lab-entry/create-listing-project.test.ts`

**Interfaces:**
- Consumes: `projectEmailLabBase(projectId: string): string` (already exported from
  `lib/lab-entry/destination.ts`).
- Produces: `listingProjectRequestBody(address: string): { title: string; kind: "listing";
  subject_address: string }` and `createListingProjectAndEnter(address: string): Promise<boolean>`
  — both consumed by Task 3 (`ListingCampaignHero`).

- [ ] **Step 1: Write the failing test**

```typescript
// lib/lab-entry/create-listing-project.test.ts
import { describe, expect, test } from "bun:test";
import { listingProjectRequestBody } from "./create-listing-project";

describe("listingProjectRequestBody", () => {
  test("titles the project by the address and marks it a listing", () => {
    expect(listingProjectRequestBody("123 Palm Ave, Fort Myers FL 33901")).toEqual({
      title: "123 Palm Ave, Fort Myers FL 33901",
      kind: "listing",
      subject_address: "123 Palm Ave, Fort Myers FL 33901",
    });
  });

  test("does not trim or otherwise alter the address — the caller's job, not this one's", () => {
    expect(listingProjectRequestBody("  123 Palm Ave  ").title).toBe("  123 Palm Ave  ");
  });
});
```

- [ ] **Step 2: Run it — expect module-not-found FAIL**

Run: `bun test lib/lab-entry/create-listing-project.test.ts`
Expected: FAIL — cannot resolve `./create-listing-project`.

- [ ] **Step 3: Implement**

```typescript
// lib/lab-entry/create-listing-project.ts
//
// Shared "type an address, get a listing project" helper (spec
// 2026-07-15-gallery-listing-hero-design.md). Third caller of this exact POST /api/projects
// shape — app/email-lab/AutoCreateProject.tsx and EmailLabGridClient's createAndEnter each had
// their own inline copy; the Listing Campaign hero (Task 3) would have been a fourth, so this
// is extracted now instead.
import { projectEmailLabBase } from "./destination";

/** The POST /api/projects body for a fresh listing project — pure, so the shape is testable
 *  without a network call. */
export function listingProjectRequestBody(address: string): {
  title: string;
  kind: "listing";
  subject_address: string;
} {
  return { title: address, kind: "listing", subject_address: address };
}

/** Creates a listing project for `address` and hard-navigates into its Email tab
 *  (window.location.assign, matching the sibling hard-navigation pattern in
 *  EmailLabGridClient.intoProject — a real project switch, not a client-side route). Returns
 *  false (no navigation) on failure so the caller can re-enable its form instead of hanging on a
 *  dead "Setting up…" state. */
export async function createListingProjectAndEnter(address: string): Promise<boolean> {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(listingProjectRequestBody(address)),
  });
  const data = (await res.json().catch(() => null)) as { id?: string } | null;
  if (!data?.id) return false;
  window.location.assign(projectEmailLabBase(data.id));
  return true;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test lib/lab-entry/create-listing-project.test.ts`
Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/lab-entry/create-listing-project.ts lib/lab-entry/create-listing-project.test.ts
git commit -m "feat(lab-entry): shared create-listing-project-and-enter helper"
```

---

### Task 2: `TemplateGallery` gains an optional `heroSlot`

**Files:**
- Modify: `components/email-lab/TemplateGallery.tsx`
- Test: `components/email-lab/TemplateGallery.test.tsx` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `TemplateGallery`'s prop type grows a `heroSlot?: ReactNode`, rendered directly under
  the page header and above the `SEED_PREVIEW_GROUPS` map. Task 4 and Task 5 both pass this prop.

- [ ] **Step 1: Write the failing test**

```typescript
// components/email-lab/TemplateGallery.test.tsx
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { TemplateGallery } from "./TemplateGallery";

describe("TemplateGallery", () => {
  it("renders a passed heroSlot above the template groups", () => {
    const html = renderToStaticMarkup(
      createElement(TemplateGallery, {
        onPick: () => {},
        onStartBlank: () => {},
        heroSlot: createElement("div", null, "HERO MARKER"),
      }),
    );
    expect(html).toContain("HERO MARKER");
    expect(html.indexOf("HERO MARKER")).toBeLessThan(
      html.indexOf("Every stage of a property's story"),
    );
  });

  it("renders normally when heroSlot is omitted", () => {
    const html = renderToStaticMarkup(
      createElement(TemplateGallery, { onPick: () => {}, onStartBlank: () => {} }),
    );
    expect(html).toContain("Pick a starting point");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL (heroSlot not a known prop / not rendered)**

Run: `bun test components/email-lab/TemplateGallery.test.tsx`
Expected: FAIL — first test's "HERO MARKER" assertion fails (nothing renders it yet).

- [ ] **Step 3: Implement**

In `components/email-lab/TemplateGallery.tsx`, add the import and extend the prop type + JSX:

```typescript
import type { ReactNode } from "react";
```

Replace the function signature:

```typescript
export function TemplateGallery({
  onPick,
  onStartBlank,
  heroSlot,
}: {
  onPick: (seed: SeedDoc) => void;
  onStartBlank: () => void;
  /** Rendered between the page header and the template groups — the Listing Campaign hero
   *  (spec 2026-07-15-gallery-listing-hero-design.md) uses this; the gallery itself stays
   *  decoupled from listing specifics. */
  heroSlot?: ReactNode;
}) {
```

And insert `{heroSlot}` right after the closing `</div>` of the header block, before the
`{SEED_PREVIEW_GROUPS.map(...)}` line:

```typescript
      </div>

      {heroSlot}

      {SEED_PREVIEW_GROUPS.map((g) => {
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test components/email-lab/TemplateGallery.test.tsx`
Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add components/email-lab/TemplateGallery.tsx components/email-lab/TemplateGallery.test.tsx
git commit -m "feat(email-lab): TemplateGallery accepts an optional heroSlot"
```

---

### Task 3: `ListingCampaignHero` component

**Files:**
- Create: `components/email-lab/ListingCampaignHero.tsx`
- Test: `components/email-lab/ListingCampaignHero.test.tsx`

**Interfaces:**
- Consumes: `createListingProjectAndEnter` (Task 1), `AddressPopup` (existing,
  `components/lab-entry/AddressPopup.tsx` — props `inputKind`, `initialValue`, `onBuild`,
  `onCancel` used; `gaps`/`savedLayout` omitted, both optional), `SHOWCASES` (existing,
  `lib/showcase/registry.ts`).
- Produces: `ListingCampaignHero(props: { subjectAddress: string | null; arming?: boolean; onArm?:
  () => void })` — a React component. Task 4 passes `subjectAddress`/`arming`/`onArm` all three
  (an in-project listing has real values for each). Task 5 passes only `subjectAddress={null}`
  (the standalone grid client never has a pre-existing subject address).

- [ ] **Step 1: Write the failing test**

```typescript
// components/email-lab/ListingCampaignHero.test.tsx
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ListingCampaignHero } from "./ListingCampaignHero";

describe("ListingCampaignHero", () => {
  it("captures an address when the project has none yet", () => {
    const html = renderToStaticMarkup(createElement(ListingCampaignHero, { subjectAddress: null }));
    expect(html).toContain("From Teaser to Sold.");
    expect(html).toContain("Get started");
    expect(html).not.toContain("Start the listing campaign for");
  });

  it("offers to start the campaign once the address is known", () => {
    const html = renderToStaticMarkup(
      createElement(ListingCampaignHero, {
        subjectAddress: "123 Palm Ave, Fort Myers FL",
        arming: false,
        onArm: () => {},
      }),
    );
    expect(html).toContain("Start the listing campaign for 123 Palm Ave, Fort Myers FL");
    expect(html).not.toContain(">Get started<");
  });

  it("shows the arming state on the ready CTA", () => {
    const html = renderToStaticMarkup(
      createElement(ListingCampaignHero, { subjectAddress: "123 Palm Ave", arming: true, onArm: () => {} }),
    );
    expect(html).toContain("Starting…");
  });

  it("shows the real five-milestone filmstrip from the listing-to-close showcase, not invented images", () => {
    const html = renderToStaticMarkup(createElement(ListingCampaignHero, { subjectAddress: null }));
    expect(html).toContain("Coming Soon");
    expect(html).toContain("New Listing");
    expect(html).toContain("Market Comps");
    expect(html).toContain("Under Contract");
    expect(html).toContain("/showcase/listing-to-close/step-1.webp");
  });

  it("names the real click-alert capability", () => {
    const html = renderToStaticMarkup(createElement(ListingCampaignHero, { subjectAddress: null }));
    expect(html).toContain("a real click on any piece alerts you directly");
  });

  it("names socials as coming soon, with no dead link", () => {
    const html = renderToStaticMarkup(createElement(ListingCampaignHero, { subjectAddress: null }));
    expect(html).toContain("Social scheduling is coming soon");
  });
});
```

- [ ] **Step 2: Run it — expect module-not-found FAIL**

Run: `bun test components/email-lab/ListingCampaignHero.test.tsx`
Expected: FAIL — cannot resolve `./ListingCampaignHero`.

- [ ] **Step 3: Implement**

```typescript
// components/email-lab/ListingCampaignHero.tsx
"use client";
// The gallery's showcase-of-them-all section (spec 2026-07-15-gallery-listing-hero-design.md).
// Always renders, never address-gated: it's the door that CAPTURES a listing address, not a
// pill that waits for one to already exist. Once a project has a subject address, the same
// section collapses to the existing armArc() CTA. Once the arc is armed, ArcStrip fully
// replaces this surface (see ProjectEmailLabClient) — this component never renders after that.
import { useState } from "react";
import { AddressPopup } from "@/components/lab-entry/AddressPopup";
import { createListingProjectAndEnter } from "@/lib/lab-entry/create-listing-project";
import { SHOWCASES } from "@/lib/showcase/registry";

const FILMSTRIP = (SHOWCASES.find((s) => s.id === "listing-to-close")?.slides ?? []).map((s) => ({
  image: s.image,
  title: s.title,
}));

export function ListingCampaignHero({
  subjectAddress,
  arming = false,
  onArm,
}: {
  subjectAddress: string | null;
  arming?: boolean;
  onArm?: () => void;
}) {
  const [addressOpen, setAddressOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleAddressSubmit(value: string) {
    setSubmitting(true);
    const ok = await createListingProjectAndEnter(value);
    // On success the page navigates away; only reset on failure so the button un-sticks.
    if (!ok) setSubmitting(false);
  }

  return (
    <section className="mb-10 rounded-2xl border border-gulf-teal/25 bg-gulf-teal/[0.04] p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-gulf-teal">
        Listing campaigns
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-white">From Teaser to Sold.</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">
        One address in, five pieces out — Coming Soon, New Listing, Comps, Under Contract, Sold.
        You fire each one when you&rsquo;re ready, and every number is sourced. Real status
        changes on the listing — a price cut, back on the market — nudge you the moment
        it&rsquo;s time to send the next piece. And a real click on any piece alerts you
        directly, the moment a contact shows interest.
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">
        Need an open house invite or a private showing email? Just ask in the builder —
        it&rsquo;s one prompt away.
      </p>

      {FILMSTRIP.length > 0 && (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {FILMSTRIP.map((f) => (
            <div key={f.title} className="min-w-[92px] flex-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- committed static capture */}
              <img
                src={f.image}
                alt={f.title}
                className="h-20 w-full rounded-lg border border-white/10 object-cover object-top"
                loading="lazy"
              />
              <p className="mt-1 text-center text-[10px] text-white/50">{f.title}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        {subjectAddress ? (
          <button
            type="button"
            disabled={arming}
            onClick={onArm}
            className="rounded-full bg-gulf-teal px-4 py-2 text-sm font-semibold text-[#070f14] hover:bg-[#17a3b3] disabled:opacity-50"
          >
            {arming ? "Starting…" : `Start the listing campaign for ${subjectAddress}`}
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting}
            onClick={() => setAddressOpen(true)}
            className="rounded-full bg-gulf-teal px-4 py-2 text-sm font-semibold text-[#070f14] hover:bg-[#17a3b3] disabled:opacity-50"
          >
            {submitting ? "Setting up…" : "Get started"}
          </button>
        )}
      </div>

      <p className="mt-3 text-[11px] text-white/35">
        Social scheduling is coming soon. Until then, we can already build the same campaign as
        ready-to-post social creative for you to share today.
      </p>

      {addressOpen && (
        <AddressPopup
          inputKind="address"
          initialValue=""
          onBuild={(value) => void handleAddressSubmit(value)}
          onCancel={() => setAddressOpen(false)}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test components/email-lab/ListingCampaignHero.test.tsx`
Expected: 6 pass.

- [ ] **Step 5: Commit**

```bash
git add components/email-lab/ListingCampaignHero.tsx components/email-lab/ListingCampaignHero.test.tsx
git commit -m "feat(email-lab): ListingCampaignHero — address-capturing showcase section"
```

---

### Task 4: Wire the hero into `ProjectEmailLabClient` (replaces the pill)

**Files:**
- Modify: `app/project/[id]/email-lab/ProjectEmailLabClient.tsx`

**Interfaces:**
- Consumes: `ListingCampaignHero` (Task 3), `TemplateGallery`'s `heroSlot` prop (Task 2). Reuses
  the file's own existing `subjectAddress` prop, `arming` state, and `armArc` function unchanged.
- Produces: no new exports — this is the first real caller proving Tasks 2+3 work end to end.

No new unit test (this file has none today, and the change is pure wiring — no new pure logic).
Verified via Step 3's `bunx next build` and the plan's final live-verify task.

- [ ] **Step 1: Add the import**

In `app/project/[id]/email-lab/ProjectEmailLabClient.tsx`, add near the other `components/email-lab`
imports:

```typescript
import { ListingCampaignHero } from "@/components/email-lab/ListingCampaignHero";
```

- [ ] **Step 2: Remove the pill block, keep the ArcStrip branch**

Find this block (currently the render's first conditional):

```typescript
      {sequence ? (
        <ArcStrip projectId={projectId} sequence={sequence} onChanged={setSequence} />
      ) : subjectAddress ? (
        <div className="border-b border-white/10 bg-[#081420] px-4 py-2.5">
          <button
            type="button"
            disabled={arming}
            onClick={() => void armArc()}
            className="rounded-full bg-gulf-teal px-3 py-1.5 text-xs font-semibold text-[#070f14] hover:bg-[#17a3b3] disabled:opacity-50"
          >
            {arming ? "Starting…" : "Start the listing campaign"}
          </button>
          <span className="ml-2 text-[10px] text-white/40">
            Five pieces, teaser to sold — you fire each milestone. Every number sourced.
          </span>
        </div>
      ) : null}
```

Replace it with just the ArcStrip branch — the pill's job now lives inside the gallery's
`heroSlot` (Step 3):

```typescript
      {sequence ? (
        <ArcStrip projectId={projectId} sequence={sequence} onChanged={setSequence} />
      ) : null}
```

- [ ] **Step 3: Pass the hero into `TemplateGallery`**

Find:

```typescript
      {showGallery ? (
        <div className="min-h-[calc(100dvh-3.5rem)]">
          <TemplateGallery
            onPick={(seed: SeedDoc) => seedCanvas(seed.build())}
            onStartBlank={() => seedCanvas(defaultDoc())}
          />
        </div>
      ) : (
```

Replace with:

```typescript
      {showGallery ? (
        <div className="min-h-[calc(100dvh-3.5rem)]">
          <TemplateGallery
            onPick={(seed: SeedDoc) => seedCanvas(seed.build())}
            onStartBlank={() => seedCanvas(defaultDoc())}
            heroSlot={
              <ListingCampaignHero
                subjectAddress={subjectAddress ?? null}
                arming={arming}
                onArm={() => void armArc()}
              />
            }
          />
        </div>
      ) : (
```

- [ ] **Step 4: Typecheck + build**

Run: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -i ProjectEmailLabClient`
Expected: no output.

Run: `bunx next build`
Expected: clean build, `/project/[id]/email-lab` still listed under Dynamic routes.

- [ ] **Step 5: Commit**

```bash
git add app/project/[id]/email-lab/ProjectEmailLabClient.tsx
git commit -m "feat(email-lab): replace the listing-campaign pill with the gallery hero"
```

---

### Task 5: `/email-lab/grid` renders the gallery on a plain-open arrival

**Files:**
- Modify: `app/email-lab/grid/EmailLabGridClient.tsx`

**Interfaces:**
- Consumes: `ListingCampaignHero` (Task 3, `subjectAddress={null}` only — this client never
  carries a pre-existing subject address), `TemplateGallery` (Task 2).
- Produces: this is the task that actually closes the "New Campaign lands on the gallery" gap.
  Task 6 (below) builds on the `showGallery`/`targetProject` shape this task introduces.

No new unit test (same reasoning as Task 4 — pure wiring on an already-tested `planArrival`).
Verified via `bunx next build` + this plan's final live-verify task.

- [ ] **Step 1: Add the imports**

```typescript
import { TemplateGallery } from "@/components/email-lab/TemplateGallery";
import { ListingCampaignHero } from "@/components/email-lab/ListingCampaignHero";
```

- [ ] **Step 2: Make the plain-open arrival gallery-eligible for signed-in users**

Find:

```typescript
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
```

Change the last field. `firstRunGalleryEligible` is only READ by `planArrival`'s final
"plain open" branch (no did/seed/zip/recipe present) — every other branch returns before touching
it — so it's safe to key this purely on `signedIn`, with no risk to the zip/recipe/seed/did paths:

```typescript
  const [plan] = useState(() =>
    planArrival({
      params: { zip, recipe, addr, recipeNeeds },
      signedIn,
      offeredProject,
      insideProject: false,
      subjectAddress: null,
      recipeHasBlank: Boolean(recipeBlank),
      recipeInputKind: recipeBlank ? "address" : null,
      // Signed-in + no recipe/zip/seed/did = a plain "New Campaign" open — show the gallery
      // instead of a blank canvas (spec 2026-07-15-gallery-listing-hero-design.md). Anonymous
      // visitors are unchanged — different taste-surface flow (EMAIL_LAB_LANDING).
      firstRunGalleryEligible: signedIn,
    }),
  );

  const showGallery = plan.doc.kind === "gallery";
```

- [ ] **Step 3: Stop the confirm popup from auto-opening over the gallery**

Find:

```typescript
  const [confirmOpen, setConfirmOpen] = useState(plan.projectConfirm);
```

Replace with:

```typescript
  // The gallery case never auto-opens this — the "Building into" line + its own Change link
  // (Step 5 below) replace the old blocking upfront confirm. Every other arrival (recipe, zip,
  // seed, did) keeps the original behavior untouched.
  const [confirmOpen, setConfirmOpen] = useState(showGallery ? false : plan.projectConfirm);
  const [targetProject, setTargetProject] = useState(offeredProject);
```

- [ ] **Step 4: Render the gallery instead of the shell when `showGallery` is true**

Two edits in the same `return (` block. Indentation of the wrapped lines does not need to be
fixed by hand — the repo's prettier pre-commit hook reformats every staged file automatically
(already observed this session on the click-alerts commit).

**Edit A** — find the return block's opening (exact, unique):

```typescript
  return (
    <>
      <EmailLabGridShell
        key={buildKey}
        initialDoc={initialDoc}
```

Replace with (opens the ternary; the shell's own line is now the `) : (` branch and stays
otherwise untouched):

```typescript
  return (
    <>
      {showGallery && targetProject ? (
        <div className="min-h-[calc(100dvh-3.5rem)]">
          <TemplateGallery
            onPick={(seed) => window.location.assign(openSeed(targetProject.id, seed.id))}
            onStartBlank={() =>
              window.location.assign(openSeed(targetProject.id, "skeleton-clean-white"))
            }
            heroSlot={<ListingCampaignHero subjectAddress={null} />}
          />
        </div>
      ) : (
      <EmailLabGridShell
        key={buildKey}
        initialDoc={initialDoc}
```

**Edit B** — find the shell's own closing tag, where it's immediately followed by the
`SendToSelfModal` conditional (exact, unique — this is the ONLY `headerSlot` prop in the file):

```typescript
          </span>
        }
      />
      {!signedIn && (
        <SendToSelfModal
```

Replace with (closes the ternary opened in Edit A, right after the shell's own `/>`, before its
untouched sibling):

```typescript
          </span>
        }
      />
      )}
      {!signedIn && (
        <SendToSelfModal
```

- [ ] **Step 5: Add the `openSeed` import + the "Building into / Change" indicator**

Add to the imports (alongside the existing `projectEmailLabBase` import):

```typescript
import { openSeed, projectEmailLabBase } from "@/lib/lab-entry/destination";
```

Add a "Building into" line at the top of the gallery branch written in Step 4 — replace:

```typescript
      {showGallery && targetProject ? (
        <div className="min-h-[calc(100dvh-3.5rem)]">
          <TemplateGallery
```

with:

```typescript
      {showGallery && targetProject ? (
        <div className="min-h-[calc(100dvh-3.5rem)]">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-end gap-2 px-6 pt-4 text-xs text-white/40">
            Building into: <span className="text-white/70">{targetProject.title}</span>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="text-gulf-teal hover:underline"
            >
              Change
            </button>
          </div>
          <TemplateGallery
```

- [ ] **Step 6: Reuse `ProjectConfirmPopup` on demand for "Change"**

Find the existing popup render:

```typescript
      {confirmOpen && offeredProject && (
        <ProjectConfirmPopup
          projectTitle={offeredProject.title}
          creating={creating}
          onConfirm={() => {
            setConfirmOpen(false);
            intoProject(offeredProject.id);
          }}
          onNewProject={createAndEnter}
        />
      )}
```

This still fires correctly for the original recipe-arrival path (unchanged — `showGallery` is
false whenever a recipe/zip/seed/did is present, so `confirmOpen`'s initial value there is
untouched `plan.projectConfirm`). For the gallery's on-demand "Change" click, `confirmOpen` is
now also settable via the button added in Step 5 — the SAME popup instance handles both origins,
just always confirming/creating against `targetProject` when in gallery mode. Replace the block
with:

```typescript
      {confirmOpen && (targetProject ?? offeredProject) && (
        <ProjectConfirmPopup
          projectTitle={(targetProject ?? offeredProject)!.title}
          creating={creating}
          onConfirm={() => {
            setConfirmOpen(false);
            if (showGallery && targetProject) return; // "Change" cancel-to-same — stay on the gallery
            intoProject(offeredProject!.id);
          }}
          onNewProject={async (name) => {
            if (showGallery) {
              setCreating(true);
              try {
                const res = await fetch("/api/projects", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ title: name }),
                });
                const data = (await res.json().catch(() => null)) as { id?: string } | null;
                if (data?.id) {
                  setTargetProject({ id: data.id, title: name });
                  setConfirmOpen(false);
                }
              } finally {
                setCreating(false);
              }
              return;
            }
            await createAndEnter(name);
          }}
        />
      )}
```

- [ ] **Step 7: Typecheck + build**

Run: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -i EmailLabGridClient`
Expected: no output.

Run: `bunx next build`
Expected: clean build, `/email-lab/grid` still listed under Dynamic routes.

- [ ] **Step 8: Commit**

```bash
git add app/email-lab/grid/EmailLabGridClient.tsx
git commit -m "feat(email-lab): New Campaign lands on Pick a Starting Point, not a blank canvas"
```

---

### Task 6: Full-suite verification + live-verify handoff

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `bun test`
Expected: all green, no regressions (baseline before this plan: 1637 pass in `lib/email/` alone
per the click-alerts build; this task's new tests add ~10 more across the three new/modified
files above).

- [ ] **Step 2: Full production build**

Run: `bunx next build`
Expected: clean, zero errors — matches the clean baseline confirmed earlier this session.

- [ ] **Step 3: Live-verify against the check**

`gallery_listing_hero_live_verify` was opened by `scripts/new-build.mjs` when this build was
registered. Closing it requires an actual click-through on a real/staging build:
1. As a signed-in user with at least one existing project, click "New Campaign" in the nav.
2. Confirm the gallery renders directly (no blank canvas flash, no blocking popup).
3. Confirm the "From Teaser to Sold" hero renders at the top with the real five-thumbnail
   filmstrip.
4. Type an address into "Get started", confirm it creates a new listing project and lands back
   on that project's gallery with the hero now showing "Start the listing campaign for ⟨address⟩".
5. Click a non-listing template card and confirm it builds into the project named in "Building
   into: ⟨project⟩".

- [ ] **Step 4: Close the check**

```bash
node scripts/check.mjs close gallery_listing_hero_live_verify
```

Only after Step 3's live click-through actually happened — do not close on build-green alone
(per this repo's evidence rules, a passing build is not live proof).

- [ ] **Step 5: SESSION_LOG entry + push**

Append a SESSION_LOG.md entry (what shipped, the live-verify result) before
`node scripts/safe-push.mjs`, per this repo's RULE 0 (session log before every push).
