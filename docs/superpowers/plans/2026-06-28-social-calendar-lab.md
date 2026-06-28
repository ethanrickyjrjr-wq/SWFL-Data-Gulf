# Social Media Calendar (Plan B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 6 tasks, 13 files, keywords: refactor, schema, architecture

**Goal:** One "Generate Week" click in the Email Lab produces a 5-post Mon–Fri social calendar (caption + square card) for the agent's scope, reusing the existing lake → freshness → AI-fill → brand pipeline, with every figure cited *and fresh* (never invented, never stale).

**Architecture:** A new `lib/email/social-calendar/` module fetches lake context ONCE, runs the SAME stale-figure web-refresh the email path uses (via a shared `refreshStaleLakeContext` root), then runs 5 parallel Haiku fills (one per day theme) through the SAME `applyPatch`. A thin no-auth route wraps it. A presentational `SocialCalendarPanel` renders 5 tiles in a new left-rail accordion in `EmailLabShell`; "Load Card" loads a branded card into the canvas, fully editable like any email/PDF. No new dependencies, no new block types.

**Tech Stack:** TypeScript, Next.js 16 App Router, `@anthropic-ai/sdk` (Haiku via `resolveEmailModel("interactive")`), zod 4 (`EmailDocSchema` / `ContentPatchSchema`), React 19 client component, `bun:test`.

**Companion spec:** `docs/superpowers/specs/2026-06-28-social-calendar-lab-PLAN.md`. Original design: `docs/superpowers/specs/2026-06-28-social-calendar-lab-design.md`.

## Freshness model (operator decree: "freeze and update before send, same as emails")

- **Generate Week = fresh-as-of-now snapshot.** The web-refresh (formerly "Phase 2a") is IN v1: any held figure older than its source's cadence is refreshed to the current cited value via the web lane, and the stale copy is dropped before the AI writes — the exact mechanism `buildContentDoc` already runs for emails. This is implemented by extracting ONE shared root (`refreshStaleLakeContext`) that both paths call — there is no second freshness implementation.
- **Update before send = inherited from the deliverable rails.** A loaded card becomes a normal doc; sending/scheduling it uses the existing email send/schedule path. A *recurring* re-render that re-runs the theme with fresh data at each send (storing theme+scope on the deliverable, the way emails store their build prompt) is the natural follow-on — see Phase 2e. v1 freshness is at generate-time + the standard send.

## Global Constraints

- **Never invent a number.** Four lanes in order — our data → user upload → named web → user figure; a gap fills from the next lane, never a refusal; only an unsourced number is blocked. `socialPostSystem` inlines this rule verbatim (same text as `contentPatchSystem`).
- **One freshness root.** `refreshStaleLakeContext` is extracted from `buildContentDoc` and called by BOTH the email path and `buildWeek`. The extraction is behavior-preserving for emails — `build-doc.test.ts` MUST stay green.
- All 5 model calls are **Haiku** (`resolveEmailModel("interactive")`), **`max_tokens: 512`**.
- Lake fetch + stale-refresh run **ONCE** per "Generate Week", shared across all 5 posts.
- Social cards contain **only** existing block types and **never** a `header`/`footer`.
- Thursday's `agent-card` is identity-only — brand fills it, the AI never does.
- "Load Card" applies the **current brand** (route tokens + any live in-session brand edits), is undoable (`commit`/`pushDoc`), and the result is fully editable like an email/PDF.
- The route has **no auth** (matches `/api/email-lab/ai`; builds are free, send is the paywall).
- `package.json` is **unchanged** → no lockfile gate.
- Per task: `bunx tsc --noEmit` clean. Before any push: `bunx next build` green, SESSION_LOG entry appended, `node scripts/safe-push.mjs`, explicit paths only. **Never push without operator confirmation; work on `main`.**

---

## Task 1: Day themes + types (pure data layer)

**Files:**
- Create: `lib/email/social-calendar/types.ts`
- Create: `lib/email/social-calendar/themes.ts`
- Test: `lib/email/social-calendar/themes.test.ts`

**Interfaces:**
- Produces: `CalendarDay`, `DayTheme`, `SocialDraft`, `WeeklyCalendar` (types); `DAY_THEMES: DayTheme[]` (5 entries, Mon–Fri). `BuildScope` re-exported from `@/lib/email/build-doc`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/email/social-calendar/themes.test.ts
import { test, expect } from "bun:test";
import { DAY_THEMES } from "./themes";

const VALID_CARD_BLOCKS = new Set([
  "hero", "stats", "signal", "text", "image", "agent-card", "agent-hero",
  "social-icons", "button", "divider",
]);

test("there are exactly 5 themes in Mon–Fri order", () => {
  expect(DAY_THEMES.map((t) => t.day)).toEqual(["mon", "tue", "wed", "thu", "fri"]);
});

test("every theme has a label, a non-empty addendum, and >=1 card block", () => {
  for (const t of DAY_THEMES) {
    expect(t.label.length).toBeGreaterThan(0);
    expect(t.systemAddendum.trim().length).toBeGreaterThan(0);
    expect(t.cardBlocks.length).toBeGreaterThan(0);
  }
});

test("no card uses a header or footer block, and every block type is valid", () => {
  for (const t of DAY_THEMES) {
    for (const b of t.cardBlocks) {
      expect(b).not.toBe("header");
      expect(b).not.toBe("footer");
      expect(VALID_CARD_BLOCKS.has(b)).toBe(true);
    }
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test lib/email/social-calendar/themes.test.ts`
Expected: FAIL — `Cannot find module './themes'`.

- [ ] **Step 3: Create `types.ts`**

```ts
// lib/email/social-calendar/types.ts
import type { BlockType, EmailDoc } from "@/lib/email/doc/types";
import type { BuildScope } from "@/lib/email/build-doc";

export type { BuildScope };
export type CalendarDay = "mon" | "tue" | "wed" | "thu" | "fri";

export interface DayTheme {
  day: CalendarDay;
  label: string;
  cardBlocks: BlockType[]; // ordered; never header/footer
  systemAddendum: string;
}

export interface SocialDraft {
  day: CalendarDay;
  theme: string;
  caption: string;
  hashtags: string[]; // 5–8, NO "#" prefix
  card: EmailDoc;
}

export interface WeeklyCalendar {
  scope?: BuildScope;
  weekOf: string; // ISO date of the Monday
  posts: SocialDraft[];
  /** Stale held figures refreshed to a current web-cited value (transparency). */
  webRefreshed?: string[];
  webSources?: { label: string; value: string; url: string }[];
}
```

- [ ] **Step 4: Create `themes.ts`**

```ts
// lib/email/social-calendar/themes.ts
import type { DayTheme } from "./types";

export const DAY_THEMES: DayTheme[] = [
  {
    day: "mon",
    label: "Market Monday",
    cardBlocks: ["hero", "stats"],
    systemAddendum:
      "Lead with the most surprising or actionable market number for this scope. hero.value must be a real cited figure (price, DOM, or inventory). stats must have exactly 2 supporting KPIs. Caption: open with the hero number, one sentence of interpretation, one CTA.",
  },
  {
    day: "tue",
    label: "Tip Tuesday",
    cardBlocks: ["signal", "text"],
    systemAddendum:
      "One concrete buyer or seller tip backed by exactly one cited SWFL figure. signal.title is the tip headline (imperative). signal.body is the number that justifies it. text.body is a 2–3 sentence expansion. No more than one number in the whole post. Caption: the tip as a direct instruction in the first sentence.",
  },
  {
    day: "wed",
    label: "Neighborhood Spotlight",
    cardBlocks: ["hero", "text"],
    systemAddendum:
      "Pick the single strongest signal for the agent's scope — one ZIP, corridor, or area. hero.kicker is the place name. hero.value is that area's standout metric. text.body explains what it means for someone considering that area (2–3 sentences). Caption: place name + metric in the first sentence.",
  },
  {
    day: "thu",
    label: "Client Story",
    cardBlocks: ["signal", "agent-card"],
    systemAddendum:
      'Social proof. signal.kicker = "Just Closed". signal.title = the headline outcome (e.g. "Closed in 14 days, $22K over ask"). signal.body = a 2-sentence story with a [Need: client quote] placeholder. Do NOT fill the agent-card — it is identity-owned. Caption: outcome first, then the brief story, then the CTA.',
  },
  {
    day: "fri",
    label: "Local Life",
    cardBlocks: ["text", "image"],
    systemAddendum:
      "Community/lifestyle post. text.body is a 3–4 sentence paragraph that makes the area feel like a place people want to live (restaurants, character, local identity). If the lake has no community data, use a [Need: local landmark or detail] placeholder. image.alt describes the photo the agent should add. Caption: open with something sensory about the place, not a market stat.",
  },
];
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test lib/email/social-calendar/themes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/email/social-calendar/types.ts lib/email/social-calendar/themes.ts lib/email/social-calendar/themes.test.ts
git commit -m "feat(social-calendar): day themes + types (5 Mon–Fri shapes, no header/footer)"
```

---

## Task 2: One freshness root — export `applyPatch`/`docSkeleton`, extract `refreshStaleLakeContext`

This is the only edit to the tested email pipeline. It is behavior-preserving: the freshness block moves out of `buildContentDoc` into a shared exported function that `buildContentDoc` then calls with identical arguments. `build-doc.test.ts` is the regression net.

**Files:**
- Modify: `lib/email/build-doc.ts`
- Test: `lib/email/build-doc.test.ts` (must stay green)
- Test: `lib/email/refresh-stale.test.ts` (new — network-free no-stale path)

**Interfaces:**
- Produces: `export function docSkeleton(doc): string`, `export function applyPatch(doc, patch): unknown`, `export async function refreshStaleLakeContext(opts): Promise<{ lakeContext; web; webRefreshed }>`.

- [ ] **Step 1: Export the two helpers (no body change)**

In `lib/email/build-doc.ts`:
- `function docSkeleton(doc: EmailDoc): string {` → `export function docSkeleton(doc: EmailDoc): string {`
- `function applyPatch(doc: EmailDoc, patch: ContentPatch): unknown {` → `export function applyPatch(doc: EmailDoc, patch: ContentPatch): unknown {`

- [ ] **Step 2: Add `refreshStaleLakeContext` (the extracted block)**

Add near the other exported lake helpers in `build-doc.ts`:

```ts
import type { MarketFigure } from "@/lib/email/market-context"; // already imported at top

export interface FreshLakeContext {
  lakeContext: string;
  web: { verified: { label: string; value: string; url: string }[]; unfound: unknown[] };
  webRefreshed: string[];
}

/** THE freshness root (shared by the email build AND the social calendar): refresh any
 *  stale held figure to its current web-cited value, drop the superseded held copy, and
 *  compose the clean context the AI reads. `includeGapProbe` true reproduces buildContentDoc's
 *  figure-ask gap probe; false (calendar) does forced stale-refresh only. Best-effort: any
 *  web failure → held data. */
export async function refreshStaleLakeContext(opts: {
  scope?: BuildScope;
  figures: MarketFigure[];
  dossier: string;
  prompt: string;
  today: Date;
  includeGapProbe: boolean;
}): Promise<FreshLakeContext> {
  const { scope, figures, dossier, prompt, today, includeGapProbe } = opts;
  const stale = staleFigures(figures, today);
  const placeHint = scope?.value
    ? scope.kind === "county"
      ? `${scope.value} County Florida`
      : `${scope.value} Florida`
    : "";
  const forced = staleFiguresToRequests(stale, placeHint);
  const isFigureAsk = includeGapProbe && looksLikeFigureAsk(prompt);
  const heldSummary = composeLakeContext(figures, dossier);
  const web =
    forced.length > 0 || isFigureAsk
      ? await webFallback(prompt, heldSummary, {
          forced,
          probe: isFigureAsk ? undefined : async () => [],
        }).catch(() => ({ verified: [], unfound: [] }))
      : { verified: [], unfound: [] };
  const webRefreshed = web.verified.map((v) => v.label);
  const survivingFigures = dropSuperseded(figures, webRefreshed);
  const lakeContext = composeLakeContext(survivingFigures, dossier);
  return { lakeContext, web, webRefreshed };
}
```

- [ ] **Step 3: Refactor `buildContentDoc` to call it (behavior-identical)**

Replace the freshness block (`const today = new Date();` through `const lakeContext = composeLakeContext(survivingFigures, lakeParts.dossier);` — the lines computing `stale/placeHint/forced/isFigureAsk/heldSummary/web/refreshedLabels/survivingFigures/lakeContext`) with:

```ts
  const today = new Date();
  const { lakeContext, web, webRefreshed: refreshedLabels } = await refreshStaleLakeContext({
    scope,
    figures: lakeParts.figures,
    dossier: lakeParts.dossier,
    prompt,
    today,
    includeGapProbe: true, // preserves the email path's figure-ask gap probe
  });
  const webBlock = renderWebFallbackBlock(web); // unchanged downstream
```

Everything downstream (`webBlock`, `freshnessDirective` reading `web.verified`, payload `webRefreshed: refreshedLabels`, `webSources: web.verified.map(...)`) is unchanged.

- [ ] **Step 4: Prove the email path is unchanged**

Run: `bun test lib/email/build-doc.test.ts`
Expected: PASS — identical to before the refactor.

- [ ] **Step 5: Add the network-free no-stale unit test**

```ts
// lib/email/refresh-stale.test.ts
import { test, expect } from "bun:test";
import { refreshStaleLakeContext } from "./build-doc";

// With no figures there is nothing stale → forced=[] and (includeGapProbe=false) no
// gap probe → the web lane is never called (no network), and the context is just the dossier.
test("no stale figures → held context, no web refresh, no network", async () => {
  const r = await refreshStaleLakeContext({
    figures: [],
    dossier: "DOSSIER_TEXT",
    prompt: "",
    today: new Date("2026-06-28T00:00:00Z"),
    includeGapProbe: false,
  });
  expect(r.lakeContext).toContain("DOSSIER_TEXT");
  expect(r.webRefreshed).toEqual([]);
  expect(r.web.verified).toEqual([]);
});
```

- [ ] **Step 6: Run + commit**

```bash
bun test lib/email/refresh-stale.test.ts lib/email/build-doc.test.ts
bunx tsc --noEmit
git add lib/email/build-doc.ts lib/email/refresh-stale.test.ts
git commit -m "refactor(email): extract refreshStaleLakeContext (one freshness root); export applyPatch+docSkeleton — email path unchanged"
```

---

## Task 3: Builder core — fresh context + 5 parallel fills

**Files:**
- Create: `lib/email/social-calendar/build-week.ts`
- Test: `lib/email/social-calendar/build-week.test.ts`

**Interfaces:**
- Consumes: `fetchLakeParts`, `composeLakeContext`, `refreshStaleLakeContext`, `applyPatch`, `docSkeleton`, `BuildScope` (build-doc); `EmailDocSchema`, `ContentPatchSchema` (schema); `DEFAULT_GLOBAL_STYLE`, `createBlock` (default-docs); `resolveEmailModel` (model-router); `DAY_THEMES` (themes).
- Produces: `seedSocialCard`, `socialPostSystem`, `tryParseSocial`, `assembleDraft`, `buildSocialPost`, `buildWeek`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/email/social-calendar/build-week.test.ts
import { test, expect } from "bun:test";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { seedSocialCard, socialPostSystem, tryParseSocial, assembleDraft } from "./build-week";
import { DAY_THEMES } from "./themes";

const monday = DAY_THEMES[0]; // hero + stats

test("seedSocialCard builds a valid doc with the theme's blocks and no header/footer", () => {
  const card = seedSocialCard(monday);
  expect(EmailDocSchema.safeParse(card).success).toBe(true);
  expect(card.blocks.map((b) => b.type)).toEqual(["hero", "stats"]);
  expect(card.blocks.some((b) => b.type === "header" || b.type === "footer")).toBe(false);
});

test("socialPostSystem carries the four-lane rule, the lake data, and the day addendum", () => {
  const sys = socialPostSystem("median $485K · LeePA · 05/2026", monday.systemAddendum);
  expect(sys).toContain("four lanes");
  expect(sys).toContain("invented number");
  expect(sys).toContain("median $485K");
  expect(sys).toContain(monday.systemAddendum);
});

test("tryParseSocial parses caption+hashtags+patch, rejects no-caption, clamps to 8 tags", () => {
  const ok = tryParseSocial(
    '{"captionText":"Median hit $485K.","hashtags":["a","b","c","d","e","f","g","h","i"],"patch":{"x":{"value":"$485K"}}}',
  );
  expect(ok?.caption).toBe("Median hit $485K.");
  expect(ok?.hashtags.length).toBe(8);
  expect(tryParseSocial('{"hashtags":[]}')).toBeNull();
  expect(tryParseSocial("not json")).toBeNull();
});

test("assembleDraft applies the patch INTO the card cells (AI-fill actually fills)", () => {
  const card = seedSocialCard(monday);
  const heroId = card.blocks[0].id;
  const draft = assembleDraft(monday, card, {
    caption: "Median hit $485K this week.",
    hashtags: ["FortMyers", "SWFLDataGulf"],
    patch: { [heroId]: { value: "$485K", label: "Median Sale Price" } },
  });
  expect(draft).not.toBeNull();
  expect((draft!.card.blocks[0].props as { value?: string }).value).toBe("$485K");
  expect(draft!.theme).toBe("Market Monday");
  expect(draft!.day).toBe("mon");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test lib/email/social-calendar/build-week.test.ts`
Expected: FAIL — `Cannot find module './build-week'`.

- [ ] **Step 3: Implement `build-week.ts`**

```ts
// lib/email/social-calendar/build-week.ts
//
// THE social-calendar builder. Reuses the email pipeline's lake fetch + freshness
// root + content-patch fill: ONE shared lake call, ONE shared stale-refresh, 5
// parallel Haiku fills. Pure helpers are unit-tested; the network functions
// (buildSocialPost / buildWeek) are live-verified. No-invention holds (same
// applyPatch, four-lane prompt); no-staleness holds (refreshStaleLakeContext).
import Anthropic from "@anthropic-ai/sdk";
import { EmailDocSchema, ContentPatchSchema } from "@/lib/email/doc/schema";
import { DEFAULT_GLOBAL_STYLE, createBlock } from "@/lib/email/doc/default-docs";
import {
  fetchLakeParts,
  refreshStaleLakeContext,
  applyPatch,
  docSkeleton,
  type BuildScope,
} from "@/lib/email/build-doc";
import { resolveEmailModel } from "@/lib/email/model-router";
import { DAY_THEMES } from "./themes";
import type { DayTheme, SocialDraft, WeeklyCalendar } from "./types";
import type { EmailDoc } from "@/lib/email/doc/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export function seedSocialCard(theme: DayTheme): EmailDoc {
  return {
    globalStyle: { ...DEFAULT_GLOBAL_STYLE },
    blocks: theme.cardBlocks.map((t) => createBlock(t)),
  };
}

export function socialPostSystem(lakeContext: string, addendum: string): string {
  const dataBlock = lakeContext
    ? `\n\nREAL LAKE DATA (cite verbatim — value · source · as-of):\n${lakeContext}\n`
    : "";
  return `You are a social media copywriter for a Southwest Florida real estate agent.

Return ONLY valid JSON with exactly these keys (no markdown fences, no prose outside the object):
  captionText: string   (<=280 words, hook-first, ONE CTA at the end, NO hashtags inline, NO em-dashes)
  hashtags: string[]    (5-8 items, NO "#" prefix; mix: 2 local, 2 topical, 1 brand "SWFLDataGulf")
  patch: object         (block id -> updated text fields ONLY, same shape as the email content patch)
${dataBlock}
Allowed text fields per block: kicker, value, label, prose, title, body, caption, alt, stats (array of AT MOST 3 {value, label}; keep each value short).

DATA SOURCING — four lanes, in order. NEVER leave a requested field empty because you "don't have the number":
1. LAKE DATA above — use verbatim (value · source · as-of).
2. User's uploaded doc or figure — if the user pasted a number, use it exactly.
3. Internet / publicly known figure — use it; note the source inline (e.g. "per Realtor.com").
4. Can't source it at all — write [Need: brief description of the exact figure] so the user can supply it.
ONLY block: an invented number with no real source. Build is NEVER blocked.

Block rules:
- Only the allowed text fields — no colors, urls, logos, photos, company name, agent names, or brand settings.
- Only include block ids and fields you are actually changing.

DAY-SPECIFIC: ${addendum}`;
}

export function tryParseSocial(
  text: string,
): { caption: string; hashtags: string[]; patch: unknown } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const caption = typeof o.captionText === "string" ? o.captionText.trim() : "";
  if (!caption) return null;
  const hashtags = Array.isArray(o.hashtags)
    ? o.hashtags.filter((h): h is string => typeof h === "string").slice(0, 8)
    : [];
  return { caption, hashtags, patch: o.patch ?? {} };
}

export function assembleDraft(
  theme: DayTheme,
  card: EmailDoc,
  parsed: { caption: string; hashtags: string[]; patch: unknown },
): SocialDraft | null {
  const patch = ContentPatchSchema.safeParse(parsed.patch);
  const filledRaw = patch.success ? applyPatch(card, patch.data) : card;
  const filled = EmailDocSchema.safeParse(filledRaw);
  if (!filled.success) return null;
  return {
    day: theme.day,
    theme: theme.label,
    caption: parsed.caption,
    hashtags: parsed.hashtags,
    card: filled.data,
  };
}

export async function buildSocialPost(
  theme: DayTheme,
  lakeContext: string,
): Promise<SocialDraft | null> {
  const card = seedSocialCard(theme);
  try {
    const msg = await client.messages.create({
      model: resolveEmailModel("interactive"), // Haiku
      max_tokens: 512,
      system: socialPostSystem(lakeContext, theme.systemAddendum),
      messages: [{ role: "user", content: `CARD (block id -> current text):\n${docSkeleton(card)}` }],
    });
    const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    const parsed = tryParseSocial(text);
    if (!parsed) return null;
    return assembleDraft(theme, card, parsed);
  } catch {
    return null;
  }
}

export async function buildWeek(
  scope: BuildScope | undefined,
  weekOf: string,
): Promise<WeeklyCalendar> {
  const { figures, dossier } = await fetchLakeParts(scope);
  const fresh = await refreshStaleLakeContext({
    scope,
    figures,
    dossier,
    prompt: scope?.value
      ? `${scope.value} Southwest Florida real estate market`
      : "Southwest Florida real estate market",
    today: new Date(),
    includeGapProbe: false, // forced stale-refresh only — no per-post gap probe
  });
  const results = await Promise.all(DAY_THEMES.map((t) => buildSocialPost(t, fresh.lakeContext)));
  const posts = results.filter((p): p is SocialDraft => p !== null);
  return {
    scope,
    weekOf,
    posts,
    webRefreshed: fresh.webRefreshed,
    webSources: fresh.web.verified.map((v) => ({ label: v.label, value: v.value, url: v.url })),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test lib/email/social-calendar/build-week.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
bunx tsc --noEmit
git add lib/email/social-calendar/build-week.ts lib/email/social-calendar/build-week.test.ts
git commit -m "feat(social-calendar): builder — shared fresh lake context + 5 parallel Haiku fills"
```

---

## Task 4: Week util (Monday math + clipboard format) + API route

**Files:**
- Create: `lib/email/social-calendar/week.ts`
- Test: `lib/email/social-calendar/week.test.ts`
- Create: `app/api/email-lab/social-calendar/route.ts`

**Interfaces:**
- Produces: `mondayOf(d): string`, `formatForClipboard(draft): string`. Route: `POST { scope?, weekOf? } -> { calendar: WeeklyCalendar }`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/email/social-calendar/week.test.ts
import { test, expect } from "bun:test";
import { mondayOf, formatForClipboard } from "./week";
import type { SocialDraft } from "./types";

test("mondayOf returns the Monday of the week (UTC)", () => {
  expect(mondayOf(new Date("2026-06-24T12:00:00Z"))).toBe("2026-06-22"); // Wed -> Mon
  expect(mondayOf(new Date("2026-06-22T00:00:00Z"))).toBe("2026-06-22"); // Mon -> same
  expect(mondayOf(new Date("2026-06-28T23:00:00Z"))).toBe("2026-06-22"); // Sun -> prior Mon
});

test("formatForClipboard joins caption + #hashtags paste-ready", () => {
  const draft = {
    day: "mon", theme: "Market Monday", caption: "Median hit $485K.",
    hashtags: ["FortMyers", "SWFLDataGulf"],
    card: { globalStyle: {} as never, blocks: [] },
  } as unknown as SocialDraft;
  expect(formatForClipboard(draft)).toBe("Median hit $485K.\n\n#FortMyers #SWFLDataGulf");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test lib/email/social-calendar/week.test.ts`
Expected: FAIL — `Cannot find module './week'`.

- [ ] **Step 3: Implement `week.ts`**

```ts
// lib/email/social-calendar/week.ts
import type { SocialDraft } from "./types";

/** ISO date (YYYY-MM-DD) of the Monday of the given date's week, in UTC. */
export function mondayOf(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay(); // 0=Sun..6=Sat
  x.setUTCDate(x.getUTCDate() - ((dow + 6) % 7));
  return x.toISOString().slice(0, 10);
}

/** Paste-ready caption block: caption, blank line, then #-prefixed hashtags. */
export function formatForClipboard(draft: SocialDraft): string {
  const tags = draft.hashtags.map((h) => `#${h}`).join(" ");
  return tags ? `${draft.caption}\n\n${tags}` : draft.caption;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test lib/email/social-calendar/week.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Create the route**

```ts
// app/api/email-lab/social-calendar/route.ts
// POST { scope?, weekOf? } -> { calendar }. Thin wrapper over buildWeek. No auth
// (matches /api/email-lab/ai — builds are free, send is the paywall). Writes nothing.
import { NextRequest, NextResponse } from "next/server";
import { buildWeek } from "@/lib/email/social-calendar/build-week";
import { mondayOf } from "@/lib/email/social-calendar/week";
import type { BuildScope } from "@/lib/email/build-doc";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { scope?: BuildScope; weekOf?: string };
  const weekOf = body.weekOf ?? mondayOf(new Date());
  const calendar = await buildWeek(body.scope, weekOf);
  return NextResponse.json({ calendar });
}
```

- [ ] **Step 6: Typecheck + commit**

```bash
bunx tsc --noEmit
git add lib/email/social-calendar/week.ts lib/email/social-calendar/week.test.ts app/api/email-lab/social-calendar/route.ts
git commit -m "feat(social-calendar): Monday/clipboard utils + POST /api/email-lab/social-calendar (no auth)"
```

---

## Task 5: SocialCalendarPanel (presentational; clipboard tested in Task 4)

**Files:**
- Create: `components/email-lab/SocialCalendarPanel.tsx`

> No unit test — presentational React with no render-test harness in this repo. The pure logic it uses (`formatForClipboard`) is already tested (Task 4). Verified by `tsc` + the live-verify checklist (Task 6).

- [ ] **Step 1: Build the panel**

```tsx
// components/email-lab/SocialCalendarPanel.tsx
"use client";
import type { CalendarDay, SocialDraft, WeeklyCalendar } from "@/lib/email/social-calendar/types";
import type { EmailDoc } from "@/lib/email/doc/types";

export interface SocialCalendarPanelProps {
  state: "idle" | "loading" | "ready" | "error";
  calendar: WeeklyCalendar | null;
  expandedDay: CalendarDay | null;
  onGenerate: () => void;
  onToggleDay: (d: CalendarDay) => void;
  onCopyCaption: (draft: SocialDraft) => void;
  onLoadCard: (card: EmailDoc) => void;
}

export function SocialCalendarPanel({
  state, calendar, expandedDay, onGenerate, onToggleDay, onCopyCaption, onLoadCard,
}: SocialCalendarPanelProps) {
  return (
    <div className="mt-2 space-y-2">
      <button
        type="button"
        onClick={onGenerate}
        disabled={state === "loading"}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gulf-teal py-2 text-sm font-semibold text-[#070f14] transition-colors hover:bg-[#17a3b3] disabled:opacity-40"
      >
        {state === "loading" ? (
          <>
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#070f14]/30 border-t-[#070f14]" />
            Generating week…
          </>
        ) : (
          "Generate Week"
        )}
      </button>

      {state === "error" && (
        <p className="text-[11px] text-amber-300/80">Couldn’t generate this week — try again.</p>
      )}

      {state === "ready" && (calendar?.webRefreshed?.length ?? 0) > 0 && (
        <p className="text-[10px] text-white/35">
          Found fresher data for: {calendar!.webRefreshed!.join(", ")}
        </p>
      )}

      {state === "ready" &&
        calendar?.posts.map((p) => {
          const open = expandedDay === p.day;
          return (
            <div key={p.day} className="rounded-md border border-white/8 bg-white/4">
              <button type="button" onClick={() => onToggleDay(p.day)} className="w-full px-3 py-2 text-left">
                <span className="block text-xs font-medium text-white/75">{p.theme}</span>
                <span className="block truncate text-[10px] text-white/35">{p.caption.slice(0, 80)}</span>
              </button>
              {open && (
                <div className="space-y-2 border-t border-white/8 px-3 py-2">
                  <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-white/70">{p.caption}</p>
                  {p.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {p.hashtags.map((h) => (
                        <span key={h} className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-white/55">#{h}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => onCopyCaption(p)} className="flex-1 rounded border border-white/10 px-2 py-1 text-[11px] text-white/60 hover:text-white/90">Copy Caption</button>
                    <button type="button" onClick={() => onLoadCard(p.card)} className="flex-1 rounded border border-gulf-teal/30 bg-gulf-teal/10 px-2 py-1 text-[11px] text-gulf-teal hover:bg-gulf-teal/20">Load Card</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
bunx tsc --noEmit
git add components/email-lab/SocialCalendarPanel.tsx
git commit -m "feat(social-calendar): SocialCalendarPanel (5 tiles, fresher-data note, copy/load)"
```

---

## Task 6: Wire the accordion into EmailLabShell (branded-on-load, live-verified)

**Files:**
- Modify: `components/email-lab/EmailLabShell.tsx`

> Verified by `tsc` + `next build` + the live-verify checklist. Keep edits additive. `brandingToTokens` is already imported in this file.

- [ ] **Step 1: Add imports**

```tsx
import { SocialCalendarPanel } from "./SocialCalendarPanel";
import { formatForClipboard } from "@/lib/email/social-calendar/week";
import type { CalendarDay, SocialDraft, WeeklyCalendar } from "@/lib/email/social-calendar/types";
```

- [ ] **Step 2: Add lifted state (next to `showBrand`/`showSeeds`/`showPhotos`)**

```tsx
const [showCalendar, setShowCalendar] = useState(false);
const [calState, setCalState] = useState<"idle" | "loading" | "ready" | "error">("idle");
const [calendar, setCalendar] = useState<WeeklyCalendar | null>(null);
const [expandedDay, setExpandedDay] = useState<CalendarDay | null>(null);
```

- [ ] **Step 3: Add the handlers (next to `pickSeed`)**

```tsx
async function generateWeek() {
  setCalState("loading");
  try {
    const res = await fetch("/api/email-lab/social-calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope }),
    });
    const data = (await res.json()) as { calendar?: WeeklyCalendar };
    if (data.calendar?.posts?.length) { setCalendar(data.calendar); setCalState("ready"); }
    else setCalState("error");
  } catch { setCalState("error"); }
}

function copyCaption(draft: SocialDraft) {
  void navigator.clipboard.writeText(formatForClipboard(draft));
}

function loadSocialCard(card: EmailDoc) {
  // Load BRANDED with the CURRENT brand (route tokens + live in-session edits),
  // then it's a normal editable doc — same as loading an email/PDF. Undoable.
  setMode("canvas");
  setSelectedId(null);
  commit(applyBrand(card, { ...(brandTokens ?? {}), ...brandingToTokens(branding) }));
}
```

- [ ] **Step 4: Add the accordion JSX directly under the "Fill with AI" section**

```tsx
{/* ── Social Calendar ── */}
<div className="border-b border-white/8 px-4 pb-4 pt-3">
  <button
    onClick={() => setShowCalendar((v) => !v)}
    className="flex w-full items-center justify-between py-1 text-[10px] uppercase tracking-[0.15em] text-white/35 hover:text-white/60"
  >
    <span>Social calendar</span>
    <span className={`transition-transform ${showCalendar ? "rotate-180" : ""}`}>▾</span>
  </button>
  {showCalendar && (
    <SocialCalendarPanel
      state={calState}
      calendar={calendar}
      expandedDay={expandedDay}
      onGenerate={generateWeek}
      onToggleDay={(d) => setExpandedDay((cur) => (cur === d ? null : d))}
      onCopyCaption={copyCaption}
      onLoadCard={loadSocialCard}
    />
  )}
</div>
```

- [ ] **Step 5: Typecheck + full build**

```bash
bunx tsc --noEmit
bunx next build
```

- [ ] **Step 6: Live-verify (closes `social_calendar_lab_live_verify`)**

On a project with a scope, confirm all 7:
1. "Social calendar" accordion with a "Generate Week" button.
2. Click returns 5 Mon–Fri tiles in under ~30s.
3. Every caption carries a real cited SWFL figure (not a `[Need: …]` placeholder) when the scope has lake data; if a held figure was stale, the "Found fresher data" note lists what was refreshed.
4. "Copy Caption" copies `caption + "\n\n" + #hashtags`.
5. "Load Card" replaces the canvas, applies brand colors, and is editable + ⌘Z-undoable.
6. The loaded card renders in the canvas without errors.
7. No header/footer block appears in any card.

- [ ] **Step 7: SESSION_LOG + commit (ask before push)**

Append a SESSION_LOG entry (what shipped + the 7-point verify result + check id). Then:
```bash
git add components/email-lab/EmailLabShell.tsx SESSION_LOG.md
git commit -m "feat(social-calendar): Generate-Week accordion in EmailLabShell (branded-on-load, lifted state)"
```
Then STOP and show the operator `git log` + the log for push confirmation. Open the check on push:
`node scripts/check.mjs open social-calendar-lab social_calendar_lab_live_verify "Generate Week → 5 cited+fresh Mon–Fri tiles; copy + branded load-card"`

---

## Phase 2 (future, each independently shippable)

- **2b — Square card export** (`?mode=social-card` render at 1:1 + a "Download image" tile action).
- **2c — Persistence** (a `social_calendars` row so a week survives refresh and builds history).
- **2d — Per-platform tailoring** (IG / LinkedIn / X variants on demand — one extra Haiku pass per platform, same `socialPostSystem`).
- **2e — Recurring "update before send"** (store theme + scope on a saved social deliverable so the schedule path re-runs `buildSocialPost` with fresh data each send — the social analog of how emails re-render from their stored prompt).

---

## Self-review checklist

- **Spec coverage:** themes (T1), one freshness root + reuse exports (T2), builder with fresh context + real fill (T3), utils + route (T4), panel (T5), accordion + branded load (T6). 2a is IN v1 (T2+T3). All 7 live-verify criteria map to T6 Step 6.
- **No placeholders:** every code step shows actual code; every test step shows assertions + run command; the extraction in T2 quotes the exact lines it replaces.
- **Type consistency:** `BuildScope` re-exported once (T1); `refreshStaleLakeContext`/`applyPatch`/`docSkeleton` exported in T2 and consumed in T3; `seedSocialCard`/`assembleDraft`/`tryParseSocial`/`buildWeek`/`mondayOf`/`formatForClipboard` identical across tasks; `WeeklyCalendar.webRefreshed`/`webSources` declared in T1 and produced in T3.
- **Moat + freshness:** same `applyPatch` and four-lane prompt (no-invention); same `refreshStaleLakeContext` as emails (no-staleness); email path proven unchanged by `build-doc.test.ts` (T2 Step 4); cards header/footer-free; brand client-side, current, editable.
