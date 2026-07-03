# Lane E Conversion Furniture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 6 tasks, 11 files, keywords: refactor, architecture

**Goal:** Ship the three Lane E conversion pieces — send-ceiling meter (rail + panel), first-run template gallery in the project Email tool, and a "did you mean" email typo-guard on login.

**Architecture:** One new GET route exposes `checkUsageLimit` verbatim to a self-fetching fail-quiet client meter mounted in `ProjectsRail` (rail variant) and inside the two modals every send moment routes through (`ScheduleSendModal`, `ContactPickerModal`). The gallery is a client component rendered by `ProjectEmailLabClient` instead of the canvas when there is no doc and no built deliverable; picks seed the canvas client-side with `autoGenerate` suppressed (the grid shell's author build otherwise replaces the picked doc). The typo-guard is a pure Mailcheck-style helper wired into `LoginForm` (covers `/login` page AND `LoginModal` — both mount the same form).

**Tech Stack:** Next.js App Router, React 19, Tailwind, Supabase cookie auth, bun:test.

**Spec:** `docs/superpowers/specs/2026-07-03-conversion-furniture-design.md` · **Check:** `conversion_furniture_live_verify`

## Global Constraints

- No system nouns / tier jargon in user copy beyond the plan name ("Free", "Starter"…).
- `h-full` / `dvh` only — never `h-screen`.
- Conversion furniture is fail-quiet: loading/error/401 renders NOTHING; it must never break a send surface or the login.
- No new tables, no gate changes — the server gate stays exactly `checkUsageLimit`.
- Do not touch `app/project/page.tsx`, `components/briefcase/BriefcasePanel.tsx`, `lib/email/schedule-cadence.ts` (control-center session), or any `lib/email/weekly-read/*` (Lane D).
- Verify with `bunx next build`, not bare `npx tsc`. Stage explicit paths only — never `git add -A`.
- Suggest-don't-block: the typo-guard never prevents a submit; a second submit of the same value passes straight through.

---

### Task 1: `lib/email/typo-suggest.ts` — pure helper (TDD)

**Files:**
- Create: `lib/email/typo-suggest.ts`
- Test: `lib/email/typo-suggest.test.ts`

**Interfaces:**
- Produces: `suggestEmailFix(email: string): { full: string; domain: string } | null` — Task 2 consumes it.

- [x] **Step 1: Write the failing test**

```ts
// lib/email/typo-suggest.test.ts
import { describe, expect, test } from "bun:test";
import { suggestEmailFix } from "./typo-suggest";

describe("suggestEmailFix", () => {
  test("TLD typo: gmail.cm → gmail.com", () => {
    expect(suggestEmailFix("you@gmail.cm")).toEqual({
      full: "you@gmail.com",
      domain: "gmail.com",
    });
  });

  test("SLD transposition: gmial.com → gmail.com", () => {
    expect(suggestEmailFix("you@gmial.com")).toEqual({
      full: "you@gmail.com",
      domain: "gmail.com",
    });
  });

  test("TLD transposition: hotmail.cmo → hotmail.com", () => {
    expect(suggestEmailFix("you@hotmail.cmo")).toEqual({
      full: "you@hotmail.com",
      domain: "hotmail.com",
    });
  });

  test("both parts off (split pass): gmaill.cmo → gmail.com", () => {
    expect(suggestEmailFix("you@gmaill.cmo")).toEqual({
      full: "you@gmail.com",
      domain: "gmail.com",
    });
  });

  test("exact known domain → null (never nag a correct address)", () => {
    expect(suggestEmailFix("you@gmail.com")).toBeNull();
    expect(suggestEmailFix("you@icloud.com")).toBeNull();
  });

  test("mail.com is a real provider in the exact list → null, not 'gmail.com'", () => {
    expect(suggestEmailFix("you@mail.com")).toBeNull();
  });

  test("country-code style domain is not 'corrected'", () => {
    expect(suggestEmailFix("you@gmail.co.uk")).toBeNull();
  });

  test("unrelated custom domain → null", () => {
    expect(suggestEmailFix("ricky@swfldatagulf.com")).toBeNull();
  });

  test("garbage input → null", () => {
    expect(suggestEmailFix("")).toBeNull();
    expect(suggestEmailFix("nonsense")).toBeNull();
    expect(suggestEmailFix("a@b@c.com")).toBeNull();
    expect(suggestEmailFix("you@gmail")).toBeNull(); // no dot — never guess a TLD
    expect(suggestEmailFix("@gmail.com")).toBeNull();
    expect(suggestEmailFix("you@")).toBeNull();
  });

  test("case: local part preserved verbatim, domain compared lowercased", () => {
    expect(suggestEmailFix("You.C@GMAIL.CM")).toEqual({
      full: "You.C@gmail.com",
      domain: "gmail.com",
    });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/typo-suggest.test.ts`
Expected: FAIL — cannot resolve `./typo-suggest`.

- [x] **Step 3: Write the implementation**

```ts
// lib/email/typo-suggest.ts — PURE, no DB, no imports.
//
// Mailcheck-style "did you mean" for email domains (suggest, never block).
// Own ~60-line helper over the dead `mailcheck` npm dep — the algorithm is
// the value, not the package (spec 2026-07-03-conversion-furniture-design.md).
//
// Two passes, both guarded so a correct or unknown address is NEVER nagged:
//   1. whole-domain Damerau-Levenshtein ≤ 2 against a popular-domain list;
//   2. independent SLD/TLD correction (gmaill.cmo → gmail.com), accepted only
//      when the recombined candidate is itself in the popular-domain list.

const KNOWN_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "aol.com",
  "comcast.net",
  "att.net",
  "live.com",
  "msn.com",
  "me.com",
  "mail.com", // real provider 1 edit from gmail.com — MUST stay in the exact list
  "proton.me",
  "protonmail.com",
];

const KNOWN_SLDS = KNOWN_DOMAINS.map((d) => d.slice(0, d.lastIndexOf(".")));
const KNOWN_TLDS = ["com", "net", "me"];

/** Damerau-Levenshtein (adjacent transposition counts as 1 edit). */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

/** Nearest candidate within `max` edits, or null. Ties go to the earlier list entry. */
function nearest(input: string, candidates: string[], max: number): string | null {
  let best: string | null = null;
  let bestDist = max + 1;
  for (const c of candidates) {
    const dist = editDistance(input, c);
    if (dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return bestDist <= max ? best : null;
}

/**
 * Suggest a fix for a probably-typo'd email domain.
 * Returns null for correct, unknown, or unparseable addresses.
 */
export function suggestEmailFix(email: string): { full: string; domain: string } | null {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  // Exactly one "@", non-empty local + domain, domain has a dot, sane length.
  if (at <= 0 || at !== trimmed.lastIndexOf("@")) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  if (domain.length === 0 || domain.length > 64 || !domain.includes(".")) return null;
  if (KNOWN_DOMAINS.includes(domain)) return null;

  // Pass 1 — whole-domain distance ≤ 2.
  let fixed = nearest(domain, KNOWN_DOMAINS, 2);

  // Pass 2 — independent SLD/TLD correction; only accepted when the
  // recombination lands exactly on a known domain (never invents "att.com").
  if (!fixed) {
    const dot = domain.lastIndexOf(".");
    const sld = domain.slice(0, dot);
    const tld = domain.slice(dot + 1);
    const sldFix = nearest(sld, KNOWN_SLDS, 2) ?? sld;
    const tldFix = nearest(tld, KNOWN_TLDS, 2) ?? tld;
    const candidate = `${sldFix}.${tldFix}`;
    if (candidate !== domain && KNOWN_DOMAINS.includes(candidate)) fixed = candidate;
  }

  if (!fixed) return null;
  return { full: `${local}@${fixed}`, domain: fixed };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun test lib/email/typo-suggest.test.ts`
Expected: PASS (12 tests).

- [x] **Step 5: Commit**

```bash
git add lib/email/typo-suggest.ts lib/email/typo-suggest.test.ts
git commit -m "feat(lane-e): pure Mailcheck-style email typo-suggest helper + tests"
```

---

### Task 2: Wire typo-guard into `LoginForm`

**Files:**
- Modify: `app/login/login-form.tsx` (covers both `/login` and `components/landing/LoginModal.tsx` — the modal mounts this same form)

**Interfaces:**
- Consumes: `suggestEmailFix` from Task 1.

- [x] **Step 1: Refactor `sendCode` and add suggestion state**

In `app/login/login-form.tsx`:

Add import:

```tsx
import { suggestEmailFix } from "@/lib/email/typo-suggest";
```

Add state next to the existing state hooks:

```tsx
const [suggestion, setSuggestion] = useState<{ full: string; domain: string } | null>(null);
// The exact value we already suggested on — a second submit of it passes straight through.
const [suggestionChecked, setSuggestionChecked] = useState<string | null>(null);
```

Replace the `sendCode` function with an intercept + a dispatch helper (the dispatch body is the CURRENT `sendCode` body with `email` replaced by the `target` parameter):

```tsx
async function sendCode(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  // Suggest-don't-block: first submit of a probably-typo'd address shows a
  // one-time "did you mean" line; submitting the same value again proceeds.
  if (email !== suggestionChecked) {
    const fix = suggestEmailFix(email);
    if (fix) {
      setSuggestion(fix);
      setSuggestionChecked(email);
      return;
    }
  }
  setSuggestion(null);
  await dispatchCode(email);
}

async function dispatchCode(target: string) {
  setPending(true);
  setErrorMessage(null);

  const supabase = createClient();
  // [AUDIT-FIX C1] thread `next` onto the callback URL as a fallback in case
  // the email template still emits a link; the callback route forwards `next`.
  const callback = new URL("/auth/callback", window.location.origin);
  if (next && next !== "/") callback.searchParams.set("next", next);
  const { error } = await supabase.auth.signInWithOtp({
    email: target,
    options: { shouldCreateUser: true, emailRedirectTo: callback.toString() },
  });

  setPending(false);
  if (error) {
    setErrorMessage(error.message);
    return;
  }
  setStep("code");
}
```

NOTE: `verifyCode` reads `email` state for the OTP check — the "Use it" button below sets `setEmail(...)` before dispatching, so verify still matches the address the code was sent to.

- [x] **Step 2: Render the suggestion line in the email-step form**

In the email-step `return`, between the `<label>` and the submit `<button>`:

```tsx
{suggestion && (
  <p className="text-sm leading-6 text-amber-600 dark:text-amber-400">
    Did you mean <span className="font-medium">{suggestion.full}</span>?{" "}
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const fixed = suggestion.full;
        setEmail(fixed);
        setSuggestion(null);
        void dispatchCode(fixed);
      }}
      className="font-semibold underline underline-offset-2 disabled:opacity-50"
    >
      Use it
    </button>{" "}
    ·{" "}
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setSuggestion(null);
        void dispatchCode(email);
      }}
      className="underline underline-offset-2 disabled:opacity-50"
    >
      No, keep mine
    </button>
  </p>
)}
```

Also clear a stale suggestion when the user edits the field — change the email `<input>`'s `onChange` to:

```tsx
onChange={(event) => {
  setEmail(event.target.value);
  if (suggestion) setSuggestion(null);
}}
```

- [x] **Step 3: Verify**

Run: `bunx next build`
Expected: green (typecheck + lint). Manual sanity: form still submits a clean address in one step.

- [x] **Step 4: Commit**

```bash
git add app/login/login-form.tsx
git commit -m "feat(lane-e): 'did you mean' typo-guard on login email — suggest, never block"
```

---

### Task 3: `GET /api/email/usage` + `SendCeilingMeter` component

**Files:**
- Create: `app/api/email/usage/route.ts`
- Create: `components/email/SendCeilingMeter.tsx` (new `components/email/` directory)

**Interfaces:**
- Consumes: `checkUsageLimit(userId)` from `lib/email/usage.ts` — returns `{allowed, tier, sent, limit}`, never throws, fails open.
- Produces: `SendCeilingMeter({ variant: "rail" | "panel" })` — Task 4 mounts it.

- [x] **Step 1: Write the route** (pattern copied from `app/api/email/send-status/route.ts`)

```ts
// app/api/email/usage/route.ts
//
// GET /api/email/usage — the signed-in user's send meter for the current
// billing period. Returns checkUsageLimit() verbatim: {allowed, tier, sent,
// limit}. Fail-open semantics ride along from checkUsageLimit (a metering
// outage reports sent:0 / allowed:true — the meter is furniture, the real
// gate stays server-side at send time).
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { checkUsageLimit } from "@/lib/email/usage";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  return NextResponse.json(await checkUsageLimit(user.id));
}
```

- [x] **Step 2: Write the meter component**

```tsx
"use client";
// components/email/SendCeilingMeter.tsx
//
// Send-ceiling meter (Lane E conversion furniture). Self-fetching from
// GET /api/email/usage on mount; FAIL-QUIET: loading, error, and 401 all
// render nothing — this must never break a send surface or the rail.
//
//   variant="rail"  — compact line + hairline bar, pinned at the bottom of
//                     ProjectsRail (desktop project nav).
//   variant="panel" — the billing-page meter-card look (app/billing/page.tsx),
//                     mounted at send moments (ScheduleSendModal,
//                     ContactPickerModal).
//
// Bar color: teal < 80%, amber ≥ 80%, red at 100%. "Upgrade" → /billing
// appears from 80%.
import Link from "next/link";
import { useEffect, useState } from "react";

interface Usage {
  allowed: boolean;
  tier: string;
  sent: number;
  limit: number;
}

export function SendCeilingMeter({ variant }: { variant: "rail" | "panel" }) {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/email/usage")
      .then((r) => (r.ok ? (r.json() as Promise<Usage>) : null))
      .then((u) => {
        if (cancelled || !u) return;
        if (typeof u.sent === "number" && typeof u.limit === "number" && u.limit > 0) {
          setUsage(u);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!usage) return null;

  const pct = Math.min(100, Math.round((usage.sent / usage.limit) * 100));
  const barColor = pct >= 100 ? "bg-red-400" : pct >= 80 ? "bg-amber-400" : "bg-gulf-teal";

  if (variant === "rail") {
    return (
      <div className="mt-auto border-t border-white/10 px-1 pt-3">
        <p className="text-[10px] text-gray-500">
          {usage.sent} of {usage.limit} sends this month ·{" "}
          <span className="capitalize">{usage.tier}</span>
        </p>
        <div className="mt-1.5 h-[1.5px] w-full overflow-hidden rounded bg-white/10">
          <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        {pct >= 80 && (
          <Link
            href="/billing"
            className="mt-1.5 inline-block text-[10px] font-semibold text-gulf-teal hover:underline"
          >
            Upgrade
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium text-white/80">
          Plan: <span className="capitalize text-gulf-teal">{usage.tier}</span>
        </p>
        <p className="text-xs text-white/50">
          {usage.sent.toLocaleString()} / {usage.limit.toLocaleString()} sends
        </p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-white/10">
        <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      {pct >= 100 ? (
        <p className="mt-2 text-[11px] text-red-300">
          You&rsquo;ve reached this month&rsquo;s send limit.{" "}
          <Link href="/billing" className="font-semibold text-gulf-teal hover:underline">
            Upgrade
          </Link>
        </p>
      ) : pct >= 80 ? (
        <p className="mt-2 text-[11px] text-amber-300">
          Almost at your monthly limit.{" "}
          <Link href="/billing" className="font-semibold text-gulf-teal hover:underline">
            Upgrade
          </Link>
        </p>
      ) : null}
    </div>
  );
}
```

- [x] **Step 3: Verify**

Run: `bunx next build`
Expected: green.

- [x] **Step 4: Commit**

```bash
git add app/api/email/usage/route.ts components/email/SendCeilingMeter.tsx
git commit -m "feat(lane-e): GET /api/email/usage + fail-quiet SendCeilingMeter (rail/panel)"
```

---

### Task 4: Mount the meter — rail + both send modals

**Files:**
- Modify: `app/project/ProjectsRail.tsx` (rail variant, pinned bottom of the nav)
- Modify: `components/email-lab/ScheduleSendModal.tsx` (panel variant — covers the lab AND ThisWeek, which mounts this modal)
- Modify: `components/contacts/ContactPickerModal.tsx` (panel variant — covers SendToContactsHandle on `/p/[id]`)

**Interfaces:**
- Consumes: `SendCeilingMeter` from Task 3.

- [x] **Step 1: ProjectsRail** — add the import and pin the rail variant at the bottom of the `<nav>` (the nav is already `flex-col`; `mt-auto` inside the meter pins it):

```tsx
import { SendCeilingMeter } from "@/components/email/SendCeilingMeter";
```

Immediately before `</nav>` (after the project `<ul>` / empty-state `<p>`):

```tsx
        <SendCeilingMeter variant="rail" />
      </nav>
```

- [x] **Step 2: ScheduleSendModal** — add the import and mount the panel variant between the explainer `<p>` and `<SendWeeklyHandle …>`:

```tsx
import { SendCeilingMeter } from "@/components/email/SendCeilingMeter";
```

```tsx
        <p className="mb-1 text-xs text-white/50">
          It sends on your schedule and re-renders with fresh data, new commentary, and an updated
          chart each time — not this frozen preview.
        </p>
        <SendCeilingMeter variant="panel" />
        <SendWeeklyHandle
```

(The panel's `mb-3` provides the gap; also change the explainer's `mb-1` to `mb-3` so the meter doesn't crowd it.)

- [x] **Step 3: ContactPickerModal** — add the import and mount the panel variant inside the footer `<div className="border-t border-white/10 px-5 py-4">`, immediately above the send `<button>`:

```tsx
import { SendCeilingMeter } from "@/components/email/SendCeilingMeter";
```

```tsx
            <div className="border-t border-white/10 px-5 py-4">
              <SendCeilingMeter variant="panel" />
              <button
```

- [x] **Step 4: Verify**

Run: `bunx next build`
Expected: green.

- [x] **Step 5: Commit**

```bash
git add app/project/ProjectsRail.tsx components/email-lab/ScheduleSendModal.tsx components/contacts/ContactPickerModal.tsx
git commit -m "feat(lane-e): mount send-ceiling meter — projects rail + both send modals"
```

---

### Task 5: First-run template gallery (Email-tool empty state)

**Files:**
- Modify: `app/project/[id]/email-lab/page.tsx` (cheap deliverable-count read → `hasDeliverables` prop)
- Create: `components/email-lab/TemplateGallery.tsx`
- Modify: `app/project/[id]/email-lab/ProjectEmailLabClient.tsx` (gallery state + pick handlers + `autoGenerate` suppression)

**Interfaces:**
- Consumes: `SEED_DOCS` / `SeedDoc` / `defaultDoc` from `lib/email/doc/default-docs.ts` (`SeedDoc.build(): EmailDoc`, fresh block ids each call); `BlockRenderer` from `lib/email/blocks/BlockRenderer.tsx` (pure, no `"use client"`, per-block: `{block, globalStyle}`).
- Produces: `TemplateGallery({ onPick: (seed: SeedDoc) => void; onStartBlank: () => void })`.

**CRITICAL — autoGenerate suppression:** the shells fire ONE AI build on mount when `autoGenerate` is true (`!savedId && !hasToggled` today). On the default grid canvas that build REPLACES the whole doc (`EmailLabGridShell.tsx:332-356`, author path). A gallery pick that doesn't suppress it gets clobbered a second later. Picks (and Start-blank) set `galleryPicked`, and `autoGenerate` becomes `!savedId && !hasToggled && !galleryPicked`.

- [x] **Step 1: `page.tsx` — count read + prop**

After the `project` fetch / `notFound()` guard in `app/project/[id]/email-lab/page.tsx`:

```ts
// Lane E gallery: does this project have ANY built block-canvas deliverable?
// head:true count — no rows shipped. RLS-scoped like every read on this page.
const { count: dCount } = await supabase
  .from("deliverables")
  .select("id", { count: "exact", head: true })
  .eq("project_id", id)
  .eq("template", "block-canvas");
const hasDeliverables = (dCount ?? 0) > 0;
```

And pass it in the JSX:

```tsx
    <ProjectEmailLabClient
      projectId={id}
      ...
      hasDeliverables={hasDeliverables}
```

- [x] **Step 2: `TemplateGallery.tsx`**

```tsx
"use client";
// components/email-lab/TemplateGallery.tsx — Lane E first-run empty state.
//
// Full-pane pick-a-template gallery shown by ProjectEmailLabClient when the
// Email tool opens with no doc and no built deliverable. Cards are LIVE
// scaled-down renders of SEED_DOCS via the pure BlockRenderer (never static
// screenshots — they can't drift from the seeds), lazy-mounted through an
// IntersectionObserver so 26 full email docs never render at once.
// Pure UI state — nothing is persisted; once a deliverable exists the client
// never shows this again.
import { useEffect, useRef, useState } from "react";
import { SEED_DOCS, type SeedDoc } from "@/lib/email/doc/default-docs";
import { BlockRenderer } from "@/lib/email/blocks/BlockRenderer";
import type { EmailDoc } from "@/lib/email/doc/types";

/** Operator-curated first shelf; the rest render under "All templates". */
const FEATURED_IDS = [
  "market-spotlight",
  "new-listing",
  "just-sold",
  "open-house",
  "welcome",
  "neighborhood-report",
  "monthly-digest",
  "minimal",
];

function SeedPreview({ seed }: { seed: SeedDoc }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<EmailDoc | null>(null);

  // Build + render the doc only once the card scrolls near the viewport.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setDoc(seed.build());
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seed]);

  return (
    <div
      ref={frameRef}
      className="pointer-events-none h-52 overflow-hidden rounded-t-xl bg-white/[0.04]"
      style={doc ? { backgroundColor: doc.globalStyle.backdropColor } : undefined}
      aria-hidden="true"
    >
      {doc && (
        <div className="origin-top-left" style={{ width: 600, transform: "scale(0.35)" }}>
          {doc.blocks.map((b) => (
            <BlockRenderer key={b.id} block={b} globalStyle={doc.globalStyle} />
          ))}
        </div>
      )}
    </div>
  );
}

function SeedCard({ seed, onPick }: { seed: SeedDoc; onPick: (seed: SeedDoc) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(seed)}
      className="group w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] text-left transition-all hover:border-gulf-teal/60 hover:bg-gulf-teal/[0.06] focus:outline-none focus:ring-2 focus:ring-gulf-teal/40"
    >
      <SeedPreview seed={seed} />
      <div className="border-t border-white/10 px-3 py-2.5">
        <p className="text-sm font-medium leading-tight text-white/85 group-hover:text-white">
          {seed.name}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-white/40">{seed.description}</p>
      </div>
    </button>
  );
}

export function TemplateGallery({
  onPick,
  onStartBlank,
}: {
  onPick: (seed: SeedDoc) => void;
  onStartBlank: () => void;
}) {
  const featured = FEATURED_IDS.map((id) => SEED_DOCS.find((s) => s.id === id)).filter(
    (s): s is SeedDoc => Boolean(s),
  );
  const rest = SEED_DOCS.filter((s) => !FEATURED_IDS.includes(s.id));

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Pick a starting point</h1>
          <p className="mt-1 text-sm text-white/50">
            Every template fills with real Southwest Florida data once it&rsquo;s on the canvas.
          </p>
        </div>
        <button
          type="button"
          onClick={onStartBlank}
          className="rounded-full border border-white/15 px-4 py-1.5 text-xs text-white/70 transition-colors hover:border-gulf-teal/50 hover:text-gulf-teal"
        >
          Start blank
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {featured.map((s) => (
          <SeedCard key={s.id} seed={s} onPick={onPick} />
        ))}
      </div>

      {rest.length > 0 && (
        <>
          <p className="mb-3 mt-10 text-[10px] uppercase tracking-widest text-white/30">
            All templates
          </p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {rest.map((s) => (
              <SeedCard key={s.id} seed={s} onPick={onPick} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [x] **Step 3: `ProjectEmailLabClient.tsx` — gallery state + pick wiring**

Add imports:

```tsx
import { TemplateGallery } from "@/components/email-lab/TemplateGallery";
import { defaultDoc, type SeedDoc } from "@/lib/email/doc/default-docs";
```

(`defaultDoc` is already imported — extend that import with `type SeedDoc`.)

Add the prop:

```tsx
interface Props {
  ...
  /** Lane E gallery: false = no block-canvas deliverable exists yet, so a
   *  doc-less open lands on the template gallery instead of the canvas. */
  hasDeliverables?: boolean;
}
```

Add state + handlers inside the component (after the existing `useState` block):

```tsx
// Lane E first-run gallery — pure UI state, never persisted. Shows only when
// the tool opened with no doc (?did/?seed absent) AND nothing was ever built.
const [showGallery, setShowGallery] = useState(() => !initialDoc && !hasDeliverables);
// A pick/Start-blank suppresses the shells' one-shot AI auto-build: on the
// grid canvas that build REPLACES the doc, which would clobber the choice.
const [galleryPicked, setGalleryPicked] = useState(false);

function seedCanvas(doc: EmailDoc) {
  setSeedDoc(doc);
  currentDocRef.current = doc;
  savedDocRef.current = doc;
  dirtyRef.current = false;
  setGalleryPicked(true);
  setShowGallery(false);
}
```

Change the `autoGenerate` line in `shared`:

```tsx
autoGenerate: !savedId && !hasToggled && !galleryPicked,
```

Destructure `hasDeliverables` in the component parameters alongside the other props.

Replace the shells' render block — the gallery renders INSTEAD of either canvas:

```tsx
return (
  <>
    {showGallery ? (
      <div className="min-h-[calc(100dvh-3.5rem)]">
        <TemplateGallery
          onPick={(seed: SeedDoc) => seedCanvas(seed.build())}
          onStartBlank={() => seedCanvas(defaultDoc())}
        />
      </div>
    ) : canvas === "grid" ? (
      <EmailLabGridShell
        key="grid"
        initialDoc={ensureGridLayouts(seedDoc, DEFAULT_H)}
        {...shared}
      />
    ) : (
      <EmailLabShell key="block" initialDoc={seedDoc} {...shared} />
    )}
    ...
```

(The `confirmOpen` modal block below stays untouched.)

- [x] **Step 4: Verify**

Run: `bunx next build`
Expected: green. Behavior matrix to eyeball in the code:
- `?did=` → `initialDoc` set → gallery never shows.
- `?seed=` → `initialDoc` set → gallery never shows (chips path unchanged).
- No doc + `hasDeliverables` → canvas + auto-build exactly as today.
- No doc + no deliverables → gallery; pick → canvas with that seed, no auto-build; Start blank → default canvas, no auto-build.

- [x] **Step 5: Commit**

```bash
git add app/project/[id]/email-lab/page.tsx app/project/[id]/email-lab/ProjectEmailLabClient.tsx components/email-lab/TemplateGallery.tsx
git commit -m "feat(lane-e): first-run template gallery — live seed previews, pick seeds canvas"
```

---

### Task 6: Full verification + session bookkeeping

- [x] **Step 1: Full test + build pass**

```bash
bun test lib/email/typo-suggest.test.ts
bunx next build
```

Expected: both green.

- [x] **Step 2: SESSION_LOG entry** — append a top-of-file entry (what shipped, files, what's next: operator live-verify closes `conversion_furniture_live_verify`).

- [x] **Step 3: Commit bookkeeping, then STOP for the operator**

```bash
git add SESSION_LOG.md docs/superpowers/plans/2026-07-03-conversion-furniture.md
git commit -m "log: Lane E conversion-furniture build session entry + plan"
git log --oneline origin/main..HEAD
```

Per operator rule: **never push without explicit confirmation** — show the commit list and ask. Live verification (meter counts match /billing, fresh-project gallery, `gmail.cm` suggestion) is operator-run and closes `conversion_furniture_live_verify`.
