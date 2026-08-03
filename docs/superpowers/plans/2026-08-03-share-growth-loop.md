# Share-by-Link Growth Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — 8 files, keywords: schema, architecture

**Spec:** `docs/superpowers/specs/2026-08-03-share-growth-loop-design.md` — read it first.

**Goal:** An owner shares a deliverable link from the workspace in one click; a non-owner viewer of `/p/[id]` sees one signup CTA; shared links carry `?ref=share`.

**Architecture:** Zero new endpoints and zero schema. `/p/[id]` is already the public surface (service-role read, revoked/trashed → 404, owner computed at `app/p/[id]/page.tsx:435`). We add: two pure helpers (`lib/share/`), one client button used in both `MaterialRow` layouts, one CTA component on the public page. The `ref=share` param ships on every link this plan mints; no analytics seam exists in the repo (verified 08/03/2026: no `@vercel/analytics`, no `track(`) so the counter parks as a check in Task 4.

**Tech Stack:** Next.js App Router, React 19, Tailwind, `bun:test`.

## Global Constraints

- Copy is plain language, no system nouns. The CTA string is FIXED by the spec: `Built with SWFL Data Gulf — build your own market report, free`.
- One-room rule: reuse the exact Tailwind idioms of the neighboring elements (classNames are given verbatim in each task) — never invent new chrome.
- No native modals (`prompt`/`confirm`/`alert`) — banned in user-facing paths (see `ProjectEmailLabClient.tsx:511` comment). Clipboard failure falls back to showing the URL inline.
- `ref` is analytics-only: nothing may ever READ it for auth, tier, or content. v1 writes it into URLs and reads it nowhere.
- The share URL is `/p/{deliverableId}?ref=share` for EVERY template family — block-canvas docs render on `/p/[id]` too (its EmailDoc render path); the Lab route is the owner's editor, never the share target.
- Do not touch the revoked/trashed 404 logic in `app/p/[id]/page.tsx` — this plan adds a banner to the page, nothing else. No new test imports the page module (its component import chain is heavy); the 404 path is diff-untouched and the live-verify check covers it in prod.
- Commit per task with explicit paths (`git add <paths>`). NEVER `git add -A`. Do NOT push — operator approves pushes per-push, and the SESSION_LOG entry rides with the push.
- Verify each UI task with `bunx next build` (repo norm — never bare `npx tsc`).
- Parallel-session note: another session is implementing CSV export (`lib/export/`, `app/api/export/`, `app/contacts/page.tsx`). This plan must not touch those paths.

---

### Task 1: Pure share-link helpers

**Files:**
- Create: `lib/share/share-link.ts`
- Test: `lib/share/share-link.test.ts`

**Interfaces:**
- Produces: `buildShareUrl(origin: string, deliverableId: string): string` and `canShare(status: string): boolean`. Used by Task 2 (button) and mirrored by Task 3's CTA href constant.

- [ ] **Step 1: Write the failing test**

```ts
// lib/share/share-link.test.ts
// Guards: spec failure mode 4 (share on a dead deliverable) and the ref=share
// contract (every minted share link carries the growth param).
import { describe, expect, test } from "bun:test";
import { buildShareUrl, canShare } from "./share-link";

describe("buildShareUrl", () => {
  test("mints /p/{id}?ref=share on the given origin", () => {
    expect(buildShareUrl("https://www.swfldatagulf.com", "abc-123")).toBe(
      "https://www.swfldatagulf.com/p/abc-123?ref=share",
    );
  });
  test("localhost origin works the same (dev)", () => {
    expect(buildShareUrl("http://localhost:3000", "x")).toBe("http://localhost:3000/p/x?ref=share");
  });
});

describe("canShare", () => {
  test("only a ready deliverable is shareable", () => {
    expect(canShare("ready")).toBe(true);
    expect(canShare("building")).toBe(false);
    expect(canShare("revoked")).toBe(false);
    expect(canShare("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/share/share-link.test.ts`
Expected: FAIL — Cannot find module './share-link'

- [ ] **Step 3: Implement**

```ts
// lib/share/share-link.ts
// Share-link contract (spec 2026-08-03): /p/[id] IS the share surface for
// every template family; ?ref=share is the growth marker (write-only —
// nothing may read it for auth/tier/content).
export function buildShareUrl(origin: string, deliverableId: string): string {
  return `${origin}/p/${deliverableId}?ref=share`;
}

/** Only a ready deliverable has anything to share (building/revoked → no button). */
export function canShare(status: string): boolean {
  return status === "ready";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/share/share-link.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/share/share-link.ts lib/share/share-link.test.ts
git commit -m "feat(share): pure share-link helpers — /p/{id}?ref=share, ready-only gate"
```

---

### Task 2: Share button in both MaterialRow layouts

**Files:**
- Create: `components/project/ShareLinkButton.tsx`
- Modify: `components/project/MaterialRow.tsx` (two insertion points, given below)

**Interfaces:**
- Consumes: `buildShareUrl`, `canShare` (Task 1).
- Produces: `<ShareLinkButton deliverableId={string} status={string} className={string} />` — renders `null` unless `canShare(status)`.

- [ ] **Step 1: Write the component**

```tsx
// components/project/ShareLinkButton.tsx
// Copy-the-public-link button (spec 2026-08-03 piece 1). Clipboard failure
// (non-HTTPS / permission denied) falls back to showing the URL inline —
// NEVER a native prompt (modal ban, ProjectEmailLabClient.tsx:511).
"use client";
import { useState } from "react";
import { buildShareUrl, canShare } from "@/lib/share/share-link";

interface Props {
  deliverableId: string;
  status: string;
  className: string;
}

export function ShareLinkButton({ deliverableId, status, className }: Props) {
  const [copied, setCopied] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  if (!canShare(status)) return null;

  async function handleShare(e: React.MouseEvent) {
    e.stopPropagation();
    const url = buildShareUrl(window.location.origin, deliverableId);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — show the link inline for manual copy.
      setFallbackUrl(url);
    }
  }

  if (fallbackUrl) {
    return (
      <span
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 select-all text-[10px] text-white/50"
      >
        {fallbackUrl}
      </span>
    );
  }

  return (
    <button title="Copy public link" onClick={handleShare} className={className}>
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
```

- [ ] **Step 2: Wire into MaterialRow — block-canvas action bar**

In `components/project/MaterialRow.tsx`, add the import at the top with the other component imports:

```tsx
import { ShareLinkButton } from "./ShareLinkButton";
```

In the block-canvas "Action bar" (the `div` containing the `Open in Lab →` span and the `Send` / `Schedule` buttons, currently around lines 131–166), insert AFTER the `Schedule` button and BEFORE the `status === "needs_update"` block:

```tsx
            <ShareLinkButton
              deliverableId={d.id}
              status={d.status}
              className="text-xs text-gray-500 transition-colors hover:text-black"
            />
```

- [ ] **Step 3: Wire into MaterialRow — compact text row**

In the compact row layout (the flex row ending with the `Send to contacts` button, currently around lines 212–222), insert AFTER the `Send` button, inside the same flex container:

```tsx
          <ShareLinkButton
            deliverableId={d.id}
            status={d.status}
            className="shrink-0 text-xs text-white/40 hover:text-white/70 transition-colors"
          />
```

The classNames are copied verbatim from each layout's neighboring buttons (one-room rule).

- [ ] **Step 4: Verify**

Run: `bun test lib/share/share-link.test.ts` → still PASS.
Run: `bunx next build` → completes without type errors. If `d.status` errors because `DeliverableRow.status` is missing in `app/project/[id]/workspace/types.ts`, STOP — the field exists (verified 08/03/2026 at `types.ts:32`); do not add a cast, find what changed.

- [ ] **Step 5: Commit**

```bash
git add components/project/ShareLinkButton.tsx components/project/MaterialRow.tsx
git commit -m "feat(share): Share button in both MaterialRow layouts — ready-only, clipboard with inline fallback"
```

---

### Task 3: Non-owner signup CTA on /p/[id]

**Files:**
- Create: `lib/share/cta.ts`
- Test: `lib/share/cta.test.ts`
- Create: `app/p/[id]/ShareCta.tsx`
- Modify: `app/p/[id]/page.tsx` (one conditional render in the non-owner path)

**Interfaces:**
- Consumes: nothing from other tasks (href duplicates the `ref=share` literal deliberately — the CTA targets `/login`, not `/p/`, so it can't reuse `buildShareUrl`).
- Produces: `SHARE_CTA_TEXT: string`, `SHARE_CTA_HREF: string`; `<ShareCta />` (no props).

- [ ] **Step 1: Write the failing test**

```ts
// lib/share/cta.test.ts
// Guards: spec failure mode 6 (copy drift into system nouns) and the
// ref=share contract on the signup path.
import { describe, expect, test } from "bun:test";
import { SHARE_CTA_TEXT, SHARE_CTA_HREF } from "./cta";

describe("share CTA constants", () => {
  test("copy is the spec-fixed sentence", () => {
    expect(SHARE_CTA_TEXT).toBe("Built with SWFL Data Gulf — build your own market report, free");
  });
  test("copy carries no system nouns", () => {
    for (const noun of ["brain", "master", "pack", "tier", "lake"]) {
      expect(SHARE_CTA_TEXT.toLowerCase()).not.toContain(noun);
    }
  });
  test("href goes to login with ref=share", () => {
    expect(SHARE_CTA_HREF).toBe("/login?ref=share");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/share/cta.test.ts`
Expected: FAIL — Cannot find module './cta'

- [ ] **Step 3: Implement the constants**

```ts
// lib/share/cta.ts
// The ONE copy root for the shared-page signup CTA (spec 2026-08-03 piece 2).
// The sentence is fixed by the spec — change it there first.
export const SHARE_CTA_TEXT = "Built with SWFL Data Gulf — build your own market report, free";
export const SHARE_CTA_HREF = "/login?ref=share";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/share/cta.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the banner component**

```tsx
// app/p/[id]/ShareCta.tsx
// One banner, one message, shown ONLY to non-owner viewers (the page decides;
// this component is dumb). Server-compatible — no client hooks.
import { SHARE_CTA_TEXT, SHARE_CTA_HREF } from "@/lib/share/cta";

export function ShareCta() {
  return (
    <div className="mt-8 rounded-xl border border-white/10 bg-[#0d1e2b]/70 p-4 text-center">
      <a
        href={SHARE_CTA_HREF}
        className="text-sm font-medium text-gulf-teal transition-colors hover:text-white"
      >
        {SHARE_CTA_TEXT} →
      </a>
    </div>
  );
}
```

- [ ] **Step 6: Wire into the page**

In `app/p/[id]/page.tsx`: add the import with the sibling component imports (`TemplateSwitcher`, `StatCard`, …):

```tsx
import { ShareCta } from "./ShareCta";
```

The page computes `isOwner` at line ~435. In the page's returned JSX, add exactly one render as the LAST element inside the main content wrapper (after the citations/footer content, before the wrapper closes) in whichever branch(es) a non-owner can reach:

```tsx
{!isOwner && <ShareCta />}
```

If the page has multiple template-family return branches (slot-rendered vs EmailDoc), add the same one-liner to each branch a non-owner can reach — every public view gets exactly one CTA. Do not touch the revoked/trashed 404 logic above it.

- [ ] **Step 7: Verify**

Run: `bun test lib/share/cta.test.ts` → PASS.
Run: `bunx next build` → completes without type errors.

- [ ] **Step 8: Commit**

```bash
git add lib/share/cta.ts lib/share/cta.test.ts "app/p/[id]/ShareCta.tsx" "app/p/[id]/page.tsx"
git commit -m "feat(share): non-owner signup CTA on the public deliverable page"
```

---

### Task 4: Close-out — park the ref counter, full verify

**Files:**
- None created; ledger + verification only.

- [ ] **Step 1: Open the parked-counter check (spec piece 3 — no analytics seam exists)**

```bash
node scripts/check.mjs open share ref_share_counter "ref=share signups are not counted anywhere — no analytics seam in repo (verified 08/03/2026: no @vercel/analytics, no track()); links carry the param, visible in Vercel built-in analytics only. Build a real counter when an attribution seam exists." --class task
```

- [ ] **Step 2: Full test + build pass**

Run: `bun test lib/share/` → all 6 tests PASS.
Run: `bunx next build` → green.
Paste both outputs into the session summary (RULE 0.8 — "done" requires pasted evidence).

- [ ] **Step 3: Report, do not push**

Hand the operator: commits list (`git log --oneline origin/main..HEAD`), the two outputs above, and the note that `share_growth_loop_live_verify` stays OPEN until the prod pass (owner copies link from workspace; incognito viewer sees report + one CTA + no owner controls; revoked link 404s; click-through lands with `ref=share`). SESSION_LOG entry is written when the operator approves the push.

---

## Self-review (run against the spec)

- Spec piece 1 (workspace share) → Tasks 1–2. Piece 2 (CTA) → Task 3. Piece 3 (ref counting) → param ships in Tasks 1–3, counter parked in Task 4 exactly as the spec directs when no seam exists.
- Failure modes: 1 (private data) → no 404-path changes, live verify covers; 2 (owner nag) → `{!isOwner && …}` + live verify; 3 (ref abuse) → write-only constraint in Global Constraints; 4 (dead share) → `canShare` test; 5 (clipboard) → inline fallback, no native modal; 6 (copy drift) → fixed-string + no-system-noun test.
- Types consistent: `deliverableId: string`, `status: string` across Tasks 1–2; CTA exports match Task 3's test imports.
