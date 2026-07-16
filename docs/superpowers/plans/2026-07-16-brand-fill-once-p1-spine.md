# Brand Fill-Once P1 — Profile Ledger Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 8 tasks, 14 files, keywords: refactor, architecture

**Goal:** One shared have/need root (`profileGaps`) that every brand surface asks, plus blank-only upward banking, so a brand field typed anywhere is never asked again anywhere.

**Architecture:** A pure field registry + gap function in `lib/brand/profile-ledger.ts` absorbs the semantics of `lib/showcase/recipe.ts`'s `NEED_LABELS`/`brandGaps`/`typableGaps` (which become thin delegates — one authority). A server helper `bankBrandFields` fills ONLY blank account-profile fields and is exposed at `POST /api/user/brand/bank`; the two implicit popup banks in `EmailLabGridShell` switch to it (today they overwrite), the project PATCH banks branding upward, the shell's 4-key account prefill widens to the full registry, and the project lane's two `AddressPopup` call sites finally ask for (and bank) missing must-fields. A completeness strip renders inside the existing Brand panel.

**Tech Stack:** Next.js App Router, Supabase (`user_brand_profiles`, `projects.branding`), bun test, TypeScript. No new columns, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-16-brand-fill-once-design.md` (§A, §B, §F, §G-errors, §H-tests; P1 scope only — wizard/import/login are P2/P3 plans).

## Global Constraints

- Must tier is EXACTLY `agent_name`, `brokerage`, `business_address` (CAN-SPAM signature block) — the only fields a popup may demand.
- `photo_url` is an upload — never typable in a popup (existing `typableGaps` contract).
- Bank-upward is blank-only: NEVER overwrite a non-empty account value from an implicit flow. Explicit account-editor saves (`PATCH /api/user/brand`) keep overwrite semantics untouched.
- No new DB columns; no Supabase types regeneration needed.
- Verify with `bunx next build` (NEVER `npx tsc`). Tests run with `bun test <path>`.
- `react-hooks/set-state-in-effect` is a hard ESLint error — setState inside an effect only via async callback (`fetch().then(...)` — the pattern already at `EmailLabGridShell.tsx:1401`), never synchronously.
- A PostToolUse prettier hook reformats files on write; `git diff -w` when a diff looks bigger than the edit.
- Commit ONLY the files you touched, by explicit path (shared git index with parallel sessions — never bare `git add .`).
- Pushes need `OPERATOR_APPROVED_PUSH=1` + operator's say-so in the live conversation; commits are free.
- In-app UI (the strip) reuses existing panel chrome — no new visual system (one-room rule).

---

### Task 1: The profile ledger — registry + `profileGaps`

**Files:**
- Create: `lib/brand/profile-ledger.ts`
- 🔴 Test: `lib/brand/profile-ledger.test.ts`

**Interfaces:**
- Consumes: nothing (pure module, client-safe — no fs/server imports; it rides in the browser bundle like `lib/showcase/recipe.ts`).
- Produces (later tasks import these exact names):
  - `type ProfileTier = "must" | "boost" | "nice"`
  - `interface ProfileFieldSpec { key: string; label: string; tier: ProfileTier; askCopy?: string; typable: boolean }`
  - `const PROFILE_FIELDS: readonly ProfileFieldSpec[]`
  - `const PROFILE_FIELD_KEYS: readonly string[]` (every key, registry order)
  - `const MUST_KEYS: readonly string[]` (exactly the three)
  - `const PREFILL_KEYS: readonly string[]` (alias of PROFILE_FIELD_KEYS — the account→surface blank-fill set)
  - `function isBlank(v: unknown): boolean`
  - `function profileGaps(profile: Record<string, string | null | undefined>, needs?: readonly string[]): ProfileFieldSpec[]`
  - `function typableProfileGaps(profile, needs?): ProfileFieldSpec[]`
  - `function completenessSummary(profile): { filled: number; total: number; must: ProfileFieldSpec[]; boost: ProfileFieldSpec[]; nice: ProfileFieldSpec[] }` (the three arrays are the GAPS per tier)

- [ ] **Step 1: Write the failing test**

```ts
// lib/brand/profile-ledger.test.ts
import { describe, expect, it } from "bun:test";
import {
  MUST_KEYS,
  PROFILE_FIELD_KEYS,
  completenessSummary,
  profileGaps,
  typableProfileGaps,
} from "./profile-ledger";

describe("profile-ledger", () => {
  it("must tier is exactly the CAN-SPAM three", () => {
    expect([...MUST_KEYS].sort()).toEqual(
      ["agent_name", "brokerage", "business_address"].sort(),
    );
  });

  it("registry covers every account-profile key the brand API allowlists", () => {
    // Pinned copy of app/api/user/brand/route.ts allowlists. If the API grows a
    // field, this test forces the ledger (the one authority) to grow with it.
    const apiKeys = [
      "agent_name", "nickname", "agent_title", "photo_url", "license", "brokerage", "agent_bio",
      "primary_color", "accent_color", "text_color", "background_color", "surface_color",
      "surface_dark_color", "logo_url",
      "font_display", "font_body",
      "instagram_url", "facebook_url", "linkedin_url", "x_url", "tiktok_url", "youtube_url",
      "pinterest_url", "threads_url", "unsubscribe_url",
      "business_address", "contact_email", "contact_phone", "website_url",
      "preferred_recipe", "default_photo_ratio",
    ];
    expect([...PROFILE_FIELD_KEYS].sort()).toEqual([...apiKeys].sort());
  });

  it("profileGaps: blank, whitespace, and missing are gaps; filled is not", () => {
    const gaps = profileGaps(
      { agent_name: "Marisol Vega", brokerage: "  ", business_address: null },
      ["agent_name", "brokerage", "business_address"],
    );
    expect(gaps.map((g) => g.key)).toEqual(["brokerage", "business_address"]);
  });

  it("profileGaps with no needs returns every blank field, registry order", () => {
    const gaps = profileGaps({});
    expect(gaps.length).toBe(PROFILE_FIELD_KEYS.length);
    expect(gaps[0].key).toBe(PROFILE_FIELD_KEYS[0]);
  });

  it("typableProfileGaps drops photo_url (upload, not typable)", () => {
    const gaps = typableProfileGaps({}, ["agent_name", "photo_url"]);
    expect(gaps.map((g) => g.key)).toEqual(["agent_name"]);
  });

  it("unknown needs keys are ignored, never invented", () => {
    expect(profileGaps({}, ["not_a_field"])).toEqual([]);
  });

  it("completenessSummary counts and buckets gaps by tier", () => {
    const s = completenessSummary({ agent_name: "Marisol Vega" });
    expect(s.total).toBe(PROFILE_FIELD_KEYS.length);
    expect(s.filled).toBe(1);
    expect(s.must.map((g) => g.key).sort()).toEqual(["brokerage", "business_address"].sort());
    expect(s.must.every((g) => g.askCopy && g.askCopy.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/brand/profile-ledger.test.ts`
Expected: FAIL — `Cannot find module './profile-ledger'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/brand/profile-ledger.ts
//
// THE ONE HAVE/NEED ROOT for the brand profile (spec
// docs/superpowers/specs/2026-07-16-brand-fill-once-design.md §A).
//
// Every surface that wants to know "what brand fields are missing" asks
// profileGaps() — the build popups (both lanes), the Brand panel strip, the
// socials page. Nothing keeps its own list; that is how the surfaces stop
// disagreeing about what has already been answered.
//
// Client-safe: pure data + pure functions, no fs, no server imports.

export type ProfileTier = "must" | "boost" | "nice";

export interface ProfileFieldSpec {
  /** Column key on user_brand_profiles — MUST stay in lockstep with the
   *  allowlists in app/api/user/brand/route.ts (pinned by test). */
  key: string;
  /** Popup-voice label ("your name") — AddressPopup renders it as-is; the
   *  Brand panel strip capitalizes the first letter. */
  label: string;
  tier: ProfileTier;
  /** WHY we ask (NN/g: explain why) — required on must+boost, shown wherever
   *  the field is requested. */
  askCopy?: string;
  /** False = an upload/pick, never a text input in a popup. */
  typable: boolean;
}

const f = (
  key: string,
  label: string,
  tier: ProfileTier,
  askCopy?: string,
  typable = true,
): ProfileFieldSpec => ({ key, label, tier, askCopy, typable });

export const PROFILE_FIELDS: readonly ProfileFieldSpec[] = [
  // ── must — the CAN-SPAM signature block. The ONLY fields a popup may demand.
  f("agent_name", "your name", "must", "Every email you send signs with it."),
  f("brokerage", "your brokerage", "must", "Rides in your signature on every send."),
  f(
    "business_address",
    "your business address",
    "must",
    "The legal footer every marketing email must carry (CAN-SPAM).",
  ),
  // ── boost — asked just-in-time, only when a build prints them.
  f("photo_url", "your headshot", "boost", "Your face in the header builds trust.", false),
  f("agent_title", "your title", "boost", "Sharpens your signature line."),
  f("license", "your license number", "boost", "Shown beside your name where required."),
  f("contact_phone", "your phone number", "boost", "Lets readers reach you in one tap."),
  f("contact_email", "your contact email", "boost", "Where replies land."),
  f("website_url", "your website", "boost", "Where your links point."),
  f("agent_bio", "your bio", "boost", "The story block in agent-forward emails."),
  // ── nice — Brand-panel checklist only; never popped.
  f("nickname", "your nickname", "nice"),
  f("logo_url", "your logo", "nice", undefined, false),
  f("primary_color", "your primary color", "nice"),
  f("accent_color", "your accent color", "nice"),
  f("text_color", "your text color", "nice"),
  f("background_color", "your background color", "nice"),
  f("surface_color", "your surface color", "nice"),
  f("surface_dark_color", "your dark surface color", "nice"),
  f("font_display", "your display font", "nice"),
  f("font_body", "your body font", "nice"),
  f("instagram_url", "your Instagram", "nice"),
  f("facebook_url", "your Facebook", "nice"),
  f("linkedin_url", "your LinkedIn", "nice"),
  f("x_url", "your X profile", "nice"),
  f("tiktok_url", "your TikTok", "nice"),
  f("youtube_url", "your YouTube", "nice"),
  f("pinterest_url", "your Pinterest", "nice"),
  f("threads_url", "your Threads", "nice"),
  f("unsubscribe_url", "your unsubscribe link", "nice"),
  f("preferred_recipe", "your go-to email type", "nice"),
  f("default_photo_ratio", "your photo crop default", "nice"),
];

export const PROFILE_FIELD_KEYS: readonly string[] = PROFILE_FIELDS.map((s) => s.key);

export const MUST_KEYS: readonly string[] = PROFILE_FIELDS.filter(
  (s) => s.tier === "must",
).map((s) => s.key);

/** The account→surface blank-fill set (EmailLabGridShell mount prefill,
 *  ProjectEmailLabClient merge). Everything the profile stores. */
export const PREFILL_KEYS: readonly string[] = PROFILE_FIELD_KEYS;

export function isBlank(v: unknown): boolean {
  return typeof v !== "string" || v.trim().length === 0;
}

const BY_KEY = new Map(PROFILE_FIELDS.map((s) => [s.key, s]));

/**
 * The fields still missing from `profile`, registry order. `needs` narrows to
 * those keys (unknown keys ignored — a caller can never make the ledger ask
 * for a field that doesn't exist); omitted = the full checklist.
 */
export function profileGaps(
  profile: Record<string, string | null | undefined>,
  needs?: readonly string[],
): ProfileFieldSpec[] {
  const wanted = needs ? new Set(needs) : null;
  return PROFILE_FIELDS.filter(
    (s) => (!wanted || wanted.has(s.key)) && isBlank(profile[s.key]),
  );
}

/** Gaps a popup can actually collect — drops uploads (headshot, logo). */
export function typableProfileGaps(
  profile: Record<string, string | null | undefined>,
  needs?: readonly string[],
): ProfileFieldSpec[] {
  return profileGaps(profile, needs).filter((s) => s.typable);
}

/** The Brand-panel strip's numbers: how full the profile is, and what's
 *  missing per tier (the arrays hold GAPS, not filled fields). */
export function completenessSummary(profile: Record<string, string | null | undefined>): {
  filled: number;
  total: number;
  must: ProfileFieldSpec[];
  boost: ProfileFieldSpec[];
  nice: ProfileFieldSpec[];
} {
  const gaps = profileGaps(profile);
  return {
    filled: PROFILE_FIELDS.length - gaps.length,
    total: PROFILE_FIELDS.length,
    must: gaps.filter((s) => s.tier === "must"),
    boost: gaps.filter((s) => s.tier === "boost"),
    nice: gaps.filter((s) => s.tier === "nice"),
  };
}

export type { ProfileFieldSpec as ProfileGap };

// Unused BY_KEY guard: exported for delegates that need spec lookup by key.
export function profileFieldSpec(key: string): ProfileFieldSpec | undefined {
  return BY_KEY.get(key);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/brand/profile-ledger.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/brand/profile-ledger.ts lib/brand/profile-ledger.test.ts
git commit -m "feat(brand): profile ledger - one have/need root with must/boost/nice tiers"
```

---

### Task 2: `lib/showcase/recipe.ts` delegates to the ledger (one authority)

**Files:**
- Modify: `lib/showcase/recipe.ts:11-69` (the `BrandNeed` type, `NEED_LABELS`, `brandGaps`, `typableGaps`)
- Test: `lib/showcase/recipe.test.ts` (extend — file exists)

**Interfaces:**
- Consumes: `profileGaps`, `typableProfileGaps`, `profileFieldSpec` from Task 1.
- Produces: UNCHANGED public surface — `type BrandNeed`, `NEED_LABELS: Record<BrandNeed, string>`, `brandGaps(needs, branding): BrandNeed[]`, `typableGaps(needs, branding): BrandNeed[]`. Callers (`EmailLabGridShell.tsx`, `AddressPopup.tsx`, `app/email-lab/grid/EmailLabGridClient.tsx`, `app/project/[id]/social/page.tsx`) compile untouched.

- [ ] **Step 1: Write the failing test (extend the existing file)**

Add to `lib/showcase/recipe.test.ts`:

```ts
import { NEED_LABELS, brandGaps, typableGaps } from "./recipe";
import { profileFieldSpec } from "@/lib/brand/profile-ledger";

describe("recipe brand needs delegate to the profile ledger", () => {
  it("NEED_LABELS phrasing comes verbatim from the ledger", () => {
    for (const [key, label] of Object.entries(NEED_LABELS)) {
      expect(label).toBe(profileFieldSpec(key)?.label);
    }
    // The exact strings the popups already show — pinned so the delegation
    // refactor cannot silently change user-facing copy.
    expect(NEED_LABELS.agent_name).toBe("your name");
    expect(NEED_LABELS.photo_url).toBe("your headshot");
    expect(NEED_LABELS.brokerage).toBe("your brokerage");
    expect(NEED_LABELS.business_address).toBe("your business address");
  });

  it("brandGaps/typableGaps behavior is unchanged", () => {
    const needs = ["agent_name", "photo_url", "brokerage"] as const;
    const branding = { agent_name: "Marisol Vega" };
    expect(brandGaps(needs, branding)).toEqual(["photo_url", "brokerage"]);
    expect(typableGaps(needs, branding)).toEqual(["brokerage"]);
  });
});
```

- [ ] **Step 2: Run tests to verify the new assertions fail**

Run: `bun test lib/showcase/recipe.test.ts`
Expected: FAIL on the new `describe` (NEED_LABELS still a hand-kept literal is fine and passes the pin, but `profileFieldSpec` import proves wiring; the behavior test passes pre-refactor — that is EXPECTED: it pins behavior across the refactor).

- [ ] **Step 3: Refactor recipe.ts to delegate**

Replace lines 11–69 region contents (`BrandNeed`, `NEED_LABELS`, `brandGaps`, `typableGaps`) with:

```ts
import {
  profileFieldSpec,
  typableProfileGaps,
  profileGaps as ledgerGaps,
} from "@/lib/brand/profile-ledger";

/** Brand-profile keys a recipe leans on. Keys live in the profile ledger (the
 *  one authority — lib/brand/profile-ledger.ts); this union just narrows which
 *  of them a RECIPE may declare. */
export type BrandNeed = "agent_name" | "photo_url" | "brokerage" | "business_address";

/** Plain-words labels for the gap prompt — read from the ledger so popup copy
 *  and Brand-panel copy can never drift apart. */
export const NEED_LABELS: Record<BrandNeed, string> = Object.fromEntries(
  (["agent_name", "photo_url", "brokerage", "business_address"] as const).map((k) => [
    k,
    profileFieldSpec(k)?.label ?? k,
  ]),
) as Record<BrandNeed, string>;

/** The recipe needs the brand blob doesn't fill (empty/whitespace = missing).
 *  Thin delegate over the ledger — kept for its narrower BrandNeed[] shape. */
export function brandGaps(
  needs: readonly BrandNeed[],
  branding: Record<string, string>,
): BrandNeed[] {
  return ledgerGaps(branding, needs).map((s) => s.key as BrandNeed);
}

/** A headshot is an upload the Brand panel owns — it can't be typed into a popup,
 *  so the ask-before-build boxes leave it out rather than dead-ending on it. */
export function typableGaps(
  needs: readonly BrandNeed[],
  branding: Record<string, string>,
): BrandNeed[] {
  return typableProfileGaps(branding, needs).map((s) => s.key as BrandNeed);
}
```

(Keep everything else in the file — `ShowcaseRecipe`, `findPlaceholder`, `inputKindForPrompt`, `inputKindForRecipe`, `recipeDestination` — byte-identical.)

- [ ] **Step 4: Run the full affected suites**

Run: `bun test lib/showcase/recipe.test.ts lib/brand/profile-ledger.test.ts`
Expected: PASS, all tests including pre-existing recipe tests.

- [ ] **Step 5: Commit**

```bash
git add lib/showcase/recipe.ts lib/showcase/recipe.test.ts
git commit -m "refactor(brand): recipe gap helpers delegate to the profile ledger - one authority"
```

---

### Task 3: `bankBrandFields` — blank-only upward bank + `POST /api/user/brand/bank`

**Files:**
- Create: `lib/brand/bank-brand-fields.ts`
- Create: `app/api/user/brand/bank/route.ts`
- Test: `lib/brand/bank-brand-fields.test.ts`

**Interfaces:**
- Consumes: `PROFILE_FIELD_KEYS`, `isBlank` from Task 1; `SupabaseClient` type.
- Produces: `bankBrandFields(supabase: SupabaseClient, userId: string, patch: Record<string, unknown>): Promise<void>` — later tasks (4, 5, 6) call the route or the helper. Route contract: `POST /api/user/brand/bank` with a JSON object body → `{ ok: true }` (401 when signed out; never 500s on bank failure).

- [ ] **Step 1: Write the failing test**

Mirror the injectable-mock style of `lib/project/apply-brand.test.ts` (read it first; it fakes the supabase chain with plain objects):

```ts
// lib/brand/bank-brand-fields.test.ts
import { describe, expect, it } from "bun:test";
import { bankBrandFields } from "./bank-brand-fields";
import type { SupabaseClient } from "@supabase/supabase-js";

function fakeSupabase(existing: Record<string, unknown> | null) {
  const calls: { upserted: Record<string, unknown> | null } = { upserted: null };
  const client = {
    from(table: string) {
      expect(table).toBe("user_brand_profiles");
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: existing }) };
            },
          };
        },
        upsert(row: Record<string, unknown>, opts: { onConflict: string }) {
          expect(opts.onConflict).toBe("user_id");
          calls.upserted = row;
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("bankBrandFields", () => {
  it("fills only blank account fields, never overwrites", async () => {
    const { client, calls } = fakeSupabase({ agent_name: "Marisol Vega", brokerage: "" });
    await bankBrandFields(client, "u1", {
      agent_name: "SOMEONE ELSE",
      brokerage: "Vega Realty",
      business_address: "123 Palm Ave, Fort Myers FL",
    });
    expect(calls.upserted).toMatchObject({
      user_id: "u1",
      brokerage: "Vega Realty",
      business_address: "123 Palm Ave, Fort Myers FL",
    });
    expect(calls.upserted).not.toHaveProperty("agent_name");
  });

  it("no existing row: everything banks", async () => {
    const { client, calls } = fakeSupabase(null);
    await bankBrandFields(client, "u1", { agent_name: "Marisol Vega" });
    expect(calls.upserted).toMatchObject({ user_id: "u1", agent_name: "Marisol Vega" });
  });

  it("ignores non-ledger keys, empty values, and non-strings", async () => {
    const { client, calls } = fakeSupabase(null);
    await bankBrandFields(client, "u1", {
      hacker_field: "x",
      agent_name: "   ",
      brokerage: 42,
    });
    expect(calls.upserted).toBeNull(); // nothing bankable → no write at all
  });

  it("never throws on a failing client", async () => {
    const broken = {
      from() {
        throw new Error("boom");
      },
    } as unknown as SupabaseClient;
    await expect(bankBrandFields(broken, "u1", { agent_name: "X" })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/brand/bank-brand-fields.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the helper**

```ts
// lib/brand/bank-brand-fields.ts
//
// BANK UPWARD WHEN BLANK (spec 2026-07-16-brand-fill-once §B). A brand field a
// user types anywhere (build popup, project Brand panel) also fills the ACCOUNT
// profile — but ONLY where the account copy is empty. Never overwrites: the
// account editor (PATCH /api/user/brand) is the only overwrite surface;
// deliberate per-project divergence stays local.
//
// Best-effort + never throws, exactly like applyUserBrandToProject — banking is
// a nicety, never a gate on the save that triggered it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { PROFILE_FIELD_KEYS, isBlank } from "@/lib/brand/profile-ledger";

const LEDGER_KEYS = new Set(PROFILE_FIELD_KEYS);

export async function bankBrandFields(
  supabase: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  try {
    const candidates = Object.entries(patch).filter(
      ([k, v]) => LEDGER_KEYS.has(k) && typeof v === "string" && v.trim().length > 0,
    ) as [string, string][];
    if (candidates.length === 0) return;

    const { data: existing } = await supabase
      .from("user_brand_profiles")
      .select(candidates.map(([k]) => k).join(", "))
      .eq("user_id", userId)
      .maybeSingle();

    const row: Record<string, string> = {};
    for (const [k, v] of candidates) {
      if (isBlank((existing as Record<string, unknown> | null)?.[k])) row[k] = v.trim();
    }
    if (Object.keys(row).length === 0) return;

    await supabase
      .from("user_brand_profiles")
      .upsert(
        { user_id: userId, ...row, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
  } catch {
    /* best-effort — a bank failure must never fail the triggering save */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/brand/bank-brand-fields.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the route**

```ts
// app/api/user/brand/bank/route.ts
//
// The IMPLICIT bank endpoint — build popups and project saves POST here so a
// field typed once anywhere fills the account profile's blanks (and only its
// blanks). The account editor keeps using PATCH /api/user/brand (overwrite);
// this route exists precisely because implicit flows must not overwrite.

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { bankBrandFields } from "@/lib/brand/bank-brand-fields";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  await bankBrandFields(supabase, user.id, body as Record<string, unknown>);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Build to catch route-level type errors**

Run: `bunx next build`
Expected: compiles clean (route has no test harness of its own — the helper carries the logic and its tests).

- [ ] **Step 7: Commit**

```bash
git add lib/brand/bank-brand-fields.ts lib/brand/bank-brand-fields.test.ts app/api/user/brand/bank/route.ts
git commit -m "feat(brand): bankBrandFields blank-only upward bank + POST /api/user/brand/bank"
```

---

### Task 4: Project PATCH banks branding upward

**Files:**
- Modify: `app/api/projects/[id]/route.ts` (the PATCH handler — branding branch is at ~line 72; activity log for branding at ~line 141)
- Test: `app/api/projects/[id]/route.test.ts` (extend, following its existing mock style — read the file first)

**Interfaces:**
- Consumes: `bankBrandFields` from Task 3.
- Produces: no new exports — behavior only: a `PATCH /api/projects/[id]` whose body carries `branding` also blank-fills the account profile.

- [ ] **Step 1: Read the existing test file and add the failing case**

Read `app/api/projects/[id]/route.test.ts` to copy its request/mocking pattern exactly, then add a test asserting that when PATCH receives `{ branding: { agent_name: "Marisol Vega", brokerage: "Vega Realty" } }`, the route calls the bank path — the cleanest seam is to assert a `user_brand_profiles` upsert lands on the mock (same fake-chain assertion style as Task 3's test). If the file's mocking style can't observe cross-table writes, inject `bankBrandFields` as a module the test can spy via `mock.module("@/lib/brand/bank-brand-fields", ...)` (bun:test supports `mock.module`).

```ts
// sketch of the added case (adapt to the file's harness):
it("PATCH with branding banks string fields upward to the account profile", async () => {
  const banked: unknown[] = [];
  mock.module("@/lib/brand/bank-brand-fields", () => ({
    bankBrandFields: async (_s: unknown, _u: string, patch: Record<string, unknown>) => {
      banked.push(patch);
    },
  }));
  // ...existing harness: authed PATCH with { branding: { agent_name: "Marisol Vega" } }
  expect(banked[0]).toMatchObject({ agent_name: "Marisol Vega" });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test "app/api/projects/[id]/route.test.ts"`
Expected: new case FAILS (bank never called).

- [ ] **Step 3: Wire the bank into the PATCH handler**

In `app/api/projects/[id]/route.ts`, import the helper and, in the PATCH handler AFTER the successful project update (next to the existing `branding_changed` activity-log block at ~line 141, which already proves user + branding are in scope):

```ts
import { bankBrandFields } from "@/lib/brand/bank-brand-fields";

// inside PATCH, after the update succeeds, alongside the branding activity log:
if ("branding" in body && body.branding && typeof body.branding === "object") {
  // Fill-once (spec 2026-07-16 §B): a field typed in a project's Brand panel
  // also fills the ACCOUNT profile's blanks, so no other surface asks again.
  await bankBrandFields(supabase, user.id, body.branding as Record<string, unknown>);
}
```

(Use the route's actual authed-user variable name — read the handler; if it holds `session.user.id` instead of `user.id`, match it.)

- [ ] **Step 4: Run to verify it passes**

Run: `bun test "app/api/projects/[id]/route.test.ts"`
Expected: PASS, including all pre-existing cases.

- [ ] **Step 5: Commit**

```bash
git add "app/api/projects/[id]/route.ts" "app/api/projects/[id]/route.test.ts"
git commit -m "feat(project): brand fields saved in a project bank upward to blank account fields"
```

---

### Task 5: Shell — full-registry account prefill + implicit banks stop overwriting

**Files:**
- Modify: `components/email-lab/EmailLabGridShell.tsx:1412` (prefill key list), `:646` and `:760` (the two implicit `PATCH /api/user/brand` calls)

**Interfaces:**
- Consumes: `PREFILL_KEYS` from Task 1; `POST /api/user/brand/bank` from Task 3.
- Produces: no API change — the shell's `branding` state now inherits EVERY blank account field on mount (today only `agent_name, photo_url, license, brokerage, preferred_recipe` — a user whose account holds `business_address` still gets asked for it in-project), and popup-typed fields bank blank-only instead of overwriting the account.

- [ ] **Step 1: Widen the mount prefill**

At `EmailLabGridShell.tsx:1412`, replace the literal 4+1 key list:

```ts
import { PREFILL_KEYS } from "@/lib/brand/profile-ledger";

// was: for (const k of ["agent_name", "photo_url", "license", "brokerage", "preferred_recipe"]) {
for (const k of PREFILL_KEYS) {
  if (!next[k] && typeof data[k] === "string" && data[k]) next[k] = data[k] as string;
}
```

(The blank-only guard `!next[k]` is already there — keep it; the palette-scheme derivation below it stays as the fallback for still-blank color slots.)

- [ ] **Step 2: Swap both implicit banks to the blank-only endpoint**

At `:646` (in `buildAfterBrand`) and `:760` (in `startFromPopup`), change ONLY the URL + method — the surrounding comment about the signed-out 401 being dropped on purpose stays true and stays put:

```ts
void fetch("/api/user/brand/bank", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(brandPatch),
});
```

- [ ] **Step 3: Verify**

Run: `bun test lib/showcase lib/brand && bunx next build`
Expected: suites PASS; build clean. (The shell has no unit harness — the popup behavior is covered by the live-verify script at the end.)

- [ ] **Step 4: Commit**

```bash
git add components/email-lab/EmailLabGridShell.tsx
git commit -m "feat(email-lab): shell prefills the FULL account brand and banks popup fields blank-only"
```

---

### Task 6: Project lane asks — gaps + banking on both AddressPopup call sites

**Files:**
- Modify: `app/project/[id]/email-lab/ProjectEmailLabClient.tsx` (branding to state; account merge; the two `AddressPopup` renders at ~line 589 and ~line 603; their submit handlers `onAddressBuild` / `onSeedSubjectBuild`; the `shared.initialBranding` prop at ~line 508)

**Interfaces:**
- Consumes: `typableProfileGaps`, `MUST_KEYS`, `PREFILL_KEYS` from Task 1; `POST /api/user/brand/bank`; existing `PATCH /api/projects/[id]` body shape `{ branding }`; `AddressPopup`'s existing `gaps` + `onBuild(value, brandPatch, useSavedLayout)` props (already built — the standalone lane uses them today).
- Produces: the 07/16 caveat closed — an in-project template/recipe build with missing must-fields asks in the SAME popup as the subject, banks the answers to project + account, and never asks again.

- [ ] **Step 1: Lift branding to state with the account blank-merge**

In `ProjectEmailLabClient.tsx`, replace direct uses of the `initialBranding` prop with state, and add the same fetch-then-merge the shell uses (async callback setState — lint-safe, mirrors `EmailLabGridShell.tsx:1401`):

```ts
import { MUST_KEYS, PREFILL_KEYS, typableProfileGaps } from "@/lib/brand/profile-ledger";

const [branding, setBranding] = useState<Record<string, string>>(initialBranding);
const brandMergeAttempted = useRef(false);
useEffect(() => {
  if (brandMergeAttempted.current) return;
  brandMergeAttempted.current = true;
  // Account → project blank-merge (fill-once §F): the project blob wins where it
  // has a value; account fills the rest so we never ask for what the account holds.
  fetch("/api/user/brand")
    .then((r) => (r.ok ? r.json() : {}))
    .then((data: Record<string, unknown>) => {
      setBranding((prev) => {
        const next = { ...prev };
        for (const k of PREFILL_KEYS) {
          if (!next[k] && typeof data[k] === "string" && data[k]) next[k] = data[k] as string;
        }
        return next;
      });
    })
    .catch(() => {});
}, []);
```

Pass it through `shared` (line ~508): `initialBranding: branding,` — and add `key` churn is NOT needed (the shell copies initialBranding into its own state on mount; the popup paths below hand the patch to the build explicitly, and `buildKey` already remounts the shell after a popup build, so the remount picks up the merged state).

- [ ] **Step 2: Compute gaps and pass them to both popups**

```ts
// (add to the file's imports: `import type { BrandNeed } from "@/lib/showcase/recipe";`
//  — the page component imports it, but this client file does not yet.)
// Every email prints the signature block, so template (seed) builds ask for the
// must tier; recipe arrivals ask for what the recipe declares.
const seedGaps = typableProfileGaps(branding, MUST_KEYS).map((s) => s.key as BrandNeed);
const recipeGapsForPopup = initialRecipe
  ? typableProfileGaps(branding, initialRecipe.needs).map((s) => s.key as BrandNeed)
  : [];
```

Recipe-arrival popup (~line 589) gains `gaps={recipeGapsForPopup}`; seed popup (~line 603) gains `gaps={seedGaps}`.

- [ ] **Step 3: Bank what the popups collect**

Both submit handlers gain the patch parameter (AddressPopup already sends it — the second positional arg):

```ts
function bankPopupBrand(brandPatch: Record<string, string>) {
  if (Object.keys(brandPatch).length === 0) return;
  setBranding((prev) => ({ ...prev, ...brandPatch }));
  // Project blob: the build signs from it — persist like the Brand panel does.
  void fetch(`/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ branding: { ...branding, ...brandPatch } }),
  });
  // Account blanks fill server-side inside that same project PATCH (Task 4) —
  // one write path per fact; no second POST to /api/user/brand/bank from here.
}

// recipe popup:  onBuild={(v, patch) => { bankPopupBrand(patch); onAddressBuild(v); }}
// seed popup:    onBuild={(v, patch) => { bankPopupBrand(patch); void onSeedSubjectBuild(v); }}
```

(Note: the account-side bank rides the project PATCH via Task 4 — do NOT double-post to `/api/user/brand/bank` here; one write path per fact.)

- [ ] **Step 4: Verify no set-state-in-effect violation and build**

Run: `bunx next build`
Expected: clean build, no `react-hooks/set-state-in-effect` error (the only effect setState is inside `.then`, matching the shell's blessed pattern).

- [ ] **Step 5: Commit**

```bash
git add "app/project/[id]/email-lab/ProjectEmailLabClient.tsx"
git commit -m "feat(project): in-project template/recipe builds ask for missing must brand fields and bank them - closes the 07/16 sign-with-defaults caveat"
```

---

### Task 7: Brand-panel completeness strip

**Files:**
- Create: `components/brand/BrandCompletenessStrip.tsx`
- Modify: `components/brand/BrandingBlock.tsx` (render the strip at the top of the panel body, just under the header — the component receives `branding: Record<string, string>` already, line 113)
- 🔴 Test: `lib/brand/profile-ledger.test.ts` (extend — the strip is a thin view over `completenessSummary`, which Task 1 already tested; add the copy-shape case below)

**Interfaces:**
- Consumes: `completenessSummary` from Task 1.
- Produces: `<BrandCompletenessStrip branding={...} />` — pure presentational, no fetching, no state.

- [ ] **Step 1: Extend the ledger test with the strip's contract**

```ts
it("completenessSummary: a full profile has zero gaps in every tier", () => {
  const full = Object.fromEntries(PROFILE_FIELD_KEYS.map((k) => [k, "x"]));
  const s = completenessSummary(full);
  expect(s.filled).toBe(s.total);
  expect(s.must).toEqual([]);
  expect(s.boost).toEqual([]);
  expect(s.nice).toEqual([]);
});
```

Run: `bun test lib/brand/profile-ledger.test.ts` — expected PASS immediately (pure pin, no new logic).

- [ ] **Step 2: Write the component**

```tsx
// components/brand/BrandCompletenessStrip.tsx
"use client";
// The Brand panel's have/need readout (fill-once spec §F): what you have, what's
// missing, and WHY each missing thing matters — driven by the one ledger root so
// it can never disagree with what the build popups ask. Pure view: no fetching.
import { completenessSummary } from "@/lib/brand/profile-ledger";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function BrandCompletenessStrip({ branding }: { branding: Record<string, string> }) {
  const s = completenessSummary(branding);
  if (s.filled === s.total) {
    return (
      <p className="mb-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/60">
        Your brand is complete — every email signs with it automatically.
      </p>
    );
  }
  return (
    <div className="mb-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-[11px] font-semibold text-white/80">
        Your brand: {s.filled} of {s.total} filled
      </p>
      {s.must.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {s.must.map((g) => (
            <li key={g.key} className="text-[11px] leading-4 text-amber-300/90">
              {cap(g.label)} — {g.askCopy}
            </li>
          ))}
        </ul>
      )}
      {s.boost.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {s.boost.map((g) => (
            <li key={g.key} className="text-[11px] leading-4 text-white/50">
              {cap(g.label)}
              {g.askCopy ? ` — ${g.askCopy}` : ""}
            </li>
          ))}
        </ul>
      )}
      {s.nice.length > 0 && (
        <p className="mt-1.5 text-[10px] text-white/30">
          +{s.nice.length} optional (colors, fonts, social links)
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Render it in the panel**

In `components/brand/BrandingBlock.tsx`, import and render as the FIRST child of the panel body (directly below the existing header row — find the header JSX and place it after; the component already holds `branding`):

```tsx
import { BrandCompletenessStrip } from "./BrandCompletenessStrip";
// ...at the top of the panel body:
<BrandCompletenessStrip branding={branding} />
```

- [ ] **Step 4: Build**

Run: `bunx next build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/brand/BrandCompletenessStrip.tsx components/brand/BrandingBlock.tsx lib/brand/profile-ledger.test.ts
git commit -m "feat(brand): completeness strip in the Brand panel - have/need/why from the ledger"
```

---

### Task 8: Full verification + ship

**Files:**
- Modify: `SESSION_LOG.md` (new top entry), `_AUDIT_AND_ROADMAP/build-queue.md` (sync the brand-fill-once line)

- [ ] **Step 1: Run every touched suite + the build**

```bash
bun test lib/brand lib/showcase "app/api/projects/[id]/route.test.ts" app/api/user/brand
bunx next build
```

Expected: all PASS, build clean.

- [ ] **Step 2: Live-verify script (real browser, production build via the `verify` skill)**

1. Account with NO brand → New Project → pick Just Sold → the capture popup now ALSO shows name/brokerage/address fields; fill them → built email signs with them.
2. Same account, second template in the same project → asks for NOTHING brand-wise (banked).
3. Fresh project, same account → Brand panel shows the fields already filled (bank-upward reached the account) and the strip reads "must" complete.
4. Account brand holds `business_address`; project blank → in-project build does NOT ask for the address (full-registry prefill).
5. Brand panel strip: empty profile lists the three must fields with their why-copy, amber.

- [ ] **Step 3: SESSION_LOG entry + build-queue sync, commit, then STOP for the operator**

Append the SESSION_LOG entry describing what shipped; sync `_AUDIT_AND_ROADMAP/build-queue.md`; commit those two files. Do NOT push and do NOT close `brand_fill_once_live_verify` (it stays open until the operator live-verifies the whole build — P1 alone doesn't satisfy it). Ask the operator for push approval (`OPERATOR_APPROVED_PUSH=1 node scripts/safe-push.mjs` once given in-conversation).

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 7 | `lib/brand/profile-ledger.test.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
