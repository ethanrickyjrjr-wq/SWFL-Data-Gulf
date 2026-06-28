# Social Media Calendar — Plan B (implementation spec)

**Date:** 2026-06-28
**Slug:** `social-calendar-lab`
**Check (open at execution):** `social_calendar_lab_live_verify`
**Supersedes the integration details in:** `docs/superpowers/specs/2026-06-28-social-calendar-lab-design.md`
**Status:** Code-grounded. Probed against live `EmailLabShell.tsx` (post-`5d636df6`), `build-doc.ts`, `/api/email-lab/ai`, `/api/email-lab/render`. Three corrections to the original design are folded in (see "Corrections").

---

## Why this matters

Every competitor posts generic "great time to buy!" filler. Our agents can post **real, cited SWFL numbers** — median price, days-on-market, inventory shifts — because the Email Lab already has the whole pipeline wired: lake figures + master dossier + the AI content-fill + four-lane sourcing + brand. The social calendar reuses all of it to turn one click into a week of ready-to-post content. It is the highest-leverage reuse of the engine we have.

---

## Goal

One click in the Email Lab ("Generate Week") produces a 5-post **Mon–Fri** social calendar for the agent's scope (ZIP or county). Each post has:

- A platform-agnostic **caption** (≤280 words, hook-first, real cited SWFL data, one CTA, hashtags).
- A square-renderable **social card** (`EmailDoc` — hero + supporting blocks, no header/footer).

The user copies any caption to clipboard and loads any card into the canvas for final editing and export. Nothing is invented; every figure carries a real source (four-lane: our data → upload → named web → user figure).

---

## Corrections vs the original design doc (probed in-session)

1. **No tab strip.** The design said "add a Calendar tab to the left panel tab strip." There is no tab strip. `EmailLabShell.tsx`'s left rail is a flat scroll of **collapsible accordions** (Brand / Start-from / Blocks / Photos / Classic). The calendar is **one more accordion** — "Social Calendar" with a "Generate Week" button — placed directly under the "Fill with AI" block so it reads as a first-class feature.

2. **No auth guard to "replicate."** The design said "same auth guard as `/api/email-lab/ai/route.ts`." That route has **no** auth guard — builds are free (the paywall is SEND). So the calendar route also has **no auth**. (Photo upload `/api/email-lab/media` does gate on `getUser`; the calendar does not, because it writes nothing.)

3. **Freshness web-refresh is IN v1 (operator decree: "freeze and update before send, same as emails").** The social path reuses the email freshness *root*, not a second implementation: the stale→web-refresh block is extracted from `buildContentDoc` into ONE shared `refreshStaleLakeContext(...)` that both `buildContentDoc` and `buildWeek` call. The extraction is behavior-preserving for emails — `build-doc.test.ts` stays green. **Generate Week = a fresh-as-of-now snapshot** (held figures older than their cadence are refreshed to the current cited value, stale copies dropped before the AI writes). Recurring "update before send" rides the existing deliverable schedule rails (see 2e).

Plus: the card's brand is applied **client-side on load** (`commit(applyBrand(card, brandTokens))`, the exact `pickSeed` path) — no server-side import of the `"use client"` `applyBrand`. And the `?mode=social-card` square render is **Phase 2** (the card loads into the existing `BlockCanvas` for editing; live-verify only needs that, not a square PNG export).

---

## The five day themes (carried from the design doc — unchanged)

Each day has a fixed block shape; the AI fills content, never the shape.

- **Mon — Market Monday** — `hero` (headline stat) + `stats` (2 KPIs). Lead with the most surprising market number; the two stats give context.
- **Tue — Tip Tuesday** — `signal` (the tip) + `text` (one-paragraph expansion). One concrete buyer/seller tip backed by exactly one cited figure.
- **Wed — Neighborhood Spotlight** — `hero` (neighborhood stat) + `text` (local context). One ZIP/corridor/area with one standout metric; place name + metric lead the caption.
- **Thu — Client Story** — `signal` (win narrative) + `agent-card`. Social-proof scaffold; `signal.body` carries a `[Need: client quote]` placeholder. The `agent-card` is identity-owned (brand fills it, the AI never does).
- **Fri — Local Life** — `text` (lifestyle paragraph) + `image` (agent adds their own photo). Community/character angle; `image.alt` describes the photo to add.

All five card shapes use only **existing** block types — no new block type is introduced.

---

## Architecture (Phase 1)

### Data flow

```
User clicks "Generate Week"  (accordion in EmailLabShell)
  → POST /api/email-lab/social-calendar  { scope, weekOf? }
  → buildWeek(scope, weekOf)
      → fetchLakeParts(scope)              [ONE shared lake fetch — already exported]
      → composeLakeContext(figures, dossier)  [ONE shared context string — already exported]
      → Promise.all( DAY_THEMES.map(theme => buildSocialPost(theme, lakeContext)) )  [5 × Haiku, ≤512 tok]
          each: seedSocialCard(theme) → docSkeleton(card) → Haiku(socialPostSystem + skeleton)
                → { captionText, hashtags, patch } → applyPatch(card, patch) → validate → SocialDraft
      → WeeklyCalendar { scope, weekOf, posts: SocialDraft[5] }
  → client renders the 5 day tiles in the accordion
      → "Copy Caption" → clipboard ( caption + "\n\n" + #hashtags )
      → "Load Card"    → commit(applyBrand(draft.card, brandTokens))   [exact pickSeed path; undoable]
```

### New files

- `lib/email/social-calendar/types.ts` — `CalendarDay`, `DayTheme`, `SocialDraft`, `WeeklyCalendar` (re-export `BuildScope` from `build-doc.ts`).
- `lib/email/social-calendar/themes.ts` — `DAY_THEMES: DayTheme[]` (the 5 configs + per-day `systemAddendum`).
- `lib/email/social-calendar/build-week.ts` — `buildWeek()`, `buildSocialPost()`, `seedSocialCard()`, `socialPostSystem()`.
- `lib/email/social-calendar/build-week.test.ts` — unit tests (seed shapes valid; patch applies; caption/hashtag parse; no header/footer in any card).
- `app/api/email-lab/social-calendar/route.ts` — thin POST wrapper over `buildWeek()` (no auth, like `/api/email-lab/ai`).
- `components/email-lab/SocialCalendarPanel.tsx` — the accordion's presentational panel (controlled; state lifted to the shell).

### Touched (additive only — no behavior change)

- `lib/email/build-doc.ts` — add `export` to `applyPatch` and `docSkeleton` (two words; behavior-neutral; `build-doc.test.ts` still green). The calendar reuses them so the per-post fill is identical to the email fill (DRY — no re-implementation, no drift).
- `components/email-lab/EmailLabShell.tsx` — add the "Social Calendar" accordion + lift `calendar` / `calLoading` / `expandedDay` state + `onLoadCard` handler (mirrors `pickSeed`). Surgical: a new accordion block, no edits to existing sections.

### Types (`lib/email/social-calendar/types.ts`)

```ts
import type { BlockType, EmailDoc } from "@/lib/email/doc/types";
import type { BuildScope } from "@/lib/email/build-doc";

export type { BuildScope };
export type CalendarDay = "mon" | "tue" | "wed" | "thu" | "fri";

export interface DayTheme {
  day: CalendarDay;
  label: string;            // "Market Monday"
  cardBlocks: BlockType[];  // ordered block types for the card doc
  systemAddendum: string;   // extra instructions appended to the social system prompt
}

export interface SocialDraft {
  day: CalendarDay;
  theme: string;            // "Market Monday"
  caption: string;          // ≤280 words, CTA included, no hashtags inline
  hashtags: string[];       // 5–8 tags, NO "#" prefix (UI adds it)
  card: EmailDoc;           // the visual card doc (square-renderable, no header/footer)
}

export interface WeeklyCalendar {
  scope?: BuildScope;
  weekOf: string;           // ISO date of the Monday
  posts: SocialDraft[];     // 5, Mon–Fri
}
```

### Builder (`lib/email/social-calendar/build-week.ts`)

```ts
import Anthropic from "@anthropic-ai/sdk";
import { EmailDocSchema, ContentPatchSchema } from "@/lib/email/doc/schema";
import { DEFAULT_GLOBAL_STYLE, createBlock } from "@/lib/email/doc/default-docs";
import {
  fetchLakeParts, composeLakeContext, applyPatch, docSkeleton, type BuildScope,
} from "@/lib/email/build-doc";        // applyPatch + docSkeleton now exported
import { resolveEmailModel } from "@/lib/email/model-router";
import { RULES_OF_ENGAGEMENT_SHORT } from "@/refinery/lib/rules-of-engagement.mts"; // four-lane text (or inline the same lane rules used by contentPatchSystem)
import { DAY_THEMES } from "./themes";
import type { DayTheme, SocialDraft, WeeklyCalendar } from "./types";
import type { EmailDoc } from "@/lib/email/doc/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function seedSocialCard(theme: DayTheme): EmailDoc {
  return {
    globalStyle: { ...DEFAULT_GLOBAL_STYLE },
    blocks: theme.cardBlocks.map((t) => createBlock(t)),  // mints ids; no header/footer
  };
}

function socialPostSystem(lakeContext: string, addendum: string): string {
  return `You are a social media copywriter for a Southwest Florida real estate agent.

Return ONLY valid JSON with exactly these keys:
  captionText: string   (<=280 words, hook-first, ONE CTA at end, NO hashtags inline, NO em-dashes)
  hashtags: string[]    (5-8 items, NO "#" prefix; mix: 2 local, 2 topical, 1 brand "SWFLDataGulf")
  patch: object         (block id -> text fields ONLY, same shape as the email content patch)

REAL LAKE DATA (cite verbatim — value · source · as-of):
${lakeContext}

DATA SOURCING — four lanes, in order; NEVER leave a field empty because you "don't have the number":
1. LAKE DATA above — verbatim (value · source · as-of).
2. The user's uploaded doc/figure — exact.
3. Internet / widely-known figure — note the source inline ("per Realtor.com").
4. Can't source it — write [Need: brief description] so the user can supply it.
ONLY block: an invented number with no real source.

Allowed text fields per block: kicker, value, label, prose, title, body, caption, alt, stats.
Do NOT change colors, urls, identity, or block structure.

DAY-SPECIFIC: ${addendum}`;
}

function tryParseSocial(text: string): { caption: string; hashtags: string[]; patch: unknown } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    const caption = typeof o.captionText === "string" ? o.captionText : "";
    const hashtags = Array.isArray(o.hashtags) ? o.hashtags.filter((h): h is string => typeof h === "string") : [];
    if (!caption) return null;
    return { caption, hashtags: hashtags.slice(0, 8), patch: o.patch ?? {} };
  } catch { return null; }
}

async function buildSocialPost(theme: DayTheme, lakeContext: string): Promise<SocialDraft | null> {
  const card = seedSocialCard(theme);
  const msg = await client.messages.create({
    model: resolveEmailModel("interactive"),       // Haiku — high-volume, low-complexity fill
    max_tokens: 512,
    system: socialPostSystem(lakeContext, theme.systemAddendum),
    messages: [{ role: "user", content: `CARD (block id -> current text):\n${docSkeleton(card)}` }],
  });
  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  const parsed = tryParseSocial(text);
  if (!parsed) return null;
  const patch = ContentPatchSchema.safeParse(parsed.patch);
  const filledRaw = patch.success ? applyPatch(card, patch.data) : card;
  const filled = EmailDocSchema.safeParse(filledRaw);
  if (!filled.success) return null;
  return { day: theme.day, theme: theme.label, caption: parsed.caption, hashtags: parsed.hashtags, card: filled.data };
}

export async function buildWeek(scope: BuildScope | undefined, weekOf: string): Promise<WeeklyCalendar> {
  const { figures, dossier } = await fetchLakeParts(scope);   // ONE shared fetch
  const lakeContext = composeLakeContext(figures, dossier);   // ONE shared context
  const results = await Promise.all(DAY_THEMES.map((t) => buildSocialPost(t, lakeContext).catch(() => null)));
  const posts = results.filter((p): p is SocialDraft => p !== null);
  return { scope, weekOf, posts };
}
```

(`tryParseSocial` is a sibling of `tryParsePatch` — captions ride alongside the patch in one JSON object. If a single day fails to parse, it drops to `null` and the other four still return; the panel shows what came back.)

### Route (`app/api/email-lab/social-calendar/route.ts`)

```ts
import { NextRequest, NextResponse } from "next/server";
import { buildWeek } from "@/lib/email/social-calendar/build-week";
import type { BuildScope } from "@/lib/email/build-doc";

export const runtime = "nodejs";

function mondayOf(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay();                 // 0=Sun..6=Sat
  x.setUTCDate(x.getUTCDate() - ((dow + 6) % 7));  // back up to Monday
  return x.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    scope?: BuildScope;
    weekOf?: string;
  };
  const weekOf = body.weekOf ?? mondayOf(new Date());
  const calendar = await buildWeek(body.scope, weekOf);
  return NextResponse.json({ calendar });
}
```

(No auth — matches `/api/email-lab/ai`. `new Date()` is fine here; the Date-ban only applies to Workflow scripts, not app routes.)

### Panel (`components/email-lab/SocialCalendarPanel.tsx`)

Presentational and **controlled** — the shell owns the state so a generated week survives the user clicking into a block and back. Props:

```ts
interface SocialCalendarPanelProps {
  state: "idle" | "loading" | "ready" | "error";
  calendar: WeeklyCalendar | null;
  expandedDay: CalendarDay | null;
  onGenerate: () => void;                 // shell POSTs and sets state
  onToggleDay: (d: CalendarDay) => void;
  onCopyCaption: (draft: SocialDraft) => void;   // clipboard: caption + "\n\n" + #hashtags
  onLoadCard: (card: EmailDoc) => void;          // shell: commit(applyBrand(card, brandTokens))
}
```

UI: a "Generate Week" button (spinner while loading) → on ready, 5 vertical day tiles. Each tile shows day label + theme + the caption's first ~80 chars; clicking expands the full caption, hashtag pills (`#tag`), and two buttons ("Copy Caption", "Load Card"). Error state: "Couldn't generate this week — try again" + retry.

### EmailLabShell wiring (additive)

Lift state and add the accordion (directly under the "Fill with AI" section):

```tsx
// state (alongside showBrand/showSeeds/…)
const [showCalendar, setShowCalendar] = useState(false);
const [calState, setCalState] = useState<"idle"|"loading"|"ready"|"error">("idle");
const [calendar, setCalendar] = useState<WeeklyCalendar | null>(null);
const [expandedDay, setExpandedDay] = useState<CalendarDay | null>(null);

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

function loadSocialCard(card: EmailDoc) {       // mirrors pickSeed exactly
  setMode("canvas");
  setSelectedId(null);
  commit(applyBrand(card, brandTokens));        // undoable; brand applied client-side
}
```

Accordion JSX mirrors the existing "Start from" accordion, rendering `<SocialCalendarPanel … />` when `showCalendar`.

---

## Phase 1 — what ships (the verifiable v1)

- `types.ts`, `themes.ts`, `build-week.ts` (+ test), the route, the panel, the shell accordion.
- One freshness root: `refreshStaleLakeContext` extracted from `buildContentDoc` (behavior-preserving) and called by both paths; `applyPatch` + `docSkeleton` exported (additive). Email path proven unchanged by `build-doc.test.ts`.
- Stale-figure web-refresh runs at Generate Week (fresh-as-of-now).
- Brand applied client-side on load with the **current** brand (route tokens + live in-session edits), then fully editable like an email/PDF; no auth; card loads into the existing `BlockCanvas`.

### Phase 1 is NOT

- No square-PNG/`?mode=social-card` render or image export (Phase 2).
- No persistence — calendar is ephemeral; refresh re-generates (Phase 2 optional).
- No per-platform tailoring — captions are platform-agnostic (Phase 2 optional).
- No scheduler — drafts only (Phase 2 / reuse existing ScheduleSendModal).
- No new block types.

### Phase 1 live-verify (`social_calendar_lab_live_verify`)

1. "Generate Week" appears in the lab's left rail (Social Calendar accordion) when a scope is set.
2. Clicking it returns 5 Mon–Fri tiles in under ~30s.
3. Every caption carries at least one **real cited SWFL figure** (not a `[Need: …]` placeholder) when the lake has data for the scope.
4. "Copy Caption" copies `caption + "\n\n" + #hashtags` in paste-ready form.
5. "Load Card" replaces the canvas with the card doc, applies brand colors, and is undoable (⌘Z).
6. The loaded card renders in the existing preview/canvas without errors.
7. No header/footer block appears in any social card.

---

## Phase 2 — the polish layer

Freshness (the former 2a) is now in v1. What remains in Phase 2 is export/scale/recurrence. Each item is independent and individually shippable.

> **2a (stale-figure web-refresh) — DONE in v1.** Extracted into the shared `refreshStaleLakeContext` root; both `buildContentDoc` and `buildWeek` call it. See the TDD plan, Task 2. Email path proven unchanged by `build-doc.test.ts`.

### 2b. Square card export (`?mode=social-card`)

Add a `?mode=social-card` variant to `/api/email-lab/render` that renders the card at 600px in a 1:1 container, so a user can export a square image for platforms that want one. Pair with a "Download image" action on the tile (SVG→PNG via the existing `spec-to-png` raster path, or html→canvas). Only needed once users want a ready-made graphic rather than loading the card to edit; verify-criteria #6 (Phase 1) doesn't require it.

### 2c. Persistence (optional)

Persist a generated week so it survives refresh and can be revisited: a `social_calendars` row keyed by user + scope + weekOf (JSON blob of `WeeklyCalendar`). Idempotent upsert on (`user_id`, `scope`, `weekOf`). Enables "this week's calendar" to reload and a future "history of weeks."

### 2d. Per-platform tailoring (optional)

From one generated draft, offer platform variants (IG caption + hashtags, LinkedIn longer-form, X ≤280 chars). One extra Haiku pass per platform on demand, reusing the same `socialPostSystem` with a platform addendum. Captions stay sourced; only tone/length changes.

### 2e. Schedule-to-post hook (optional, later)

Wire "Load Card" → existing schedule/send rails so a chosen card can be scheduled (image export + a posting target). This is where social meets the deliverable scheduler; deferred until 2b + a posting integration exist.

---

## Constraints (all phases)

- **Never invent a number** — four lanes in order; a gap fills from the next lane, never a refusal; only an unsourced number is blocked.
- As-of dates render MM/DD/YYYY, stated once; never the raw token.
- Lake fetch is **one** call per "Generate Week" (shared across the 5 posts).
- All 5 model calls are **Haiku**, ≤512 tokens (high-volume, low-complexity fill).
- Social cards never include header/footer blocks.
- Thursday's `agent-card` is identity-only — brand fills it, the AI never does.
- "Load Card" goes through `commit` (`pushDoc`) so undo works.
- `socialPostSystem` is a **sibling** to `contentPatchSystem`, sharing the four-lane rule text — not a fork of the email pipeline.
- Never push without operator confirmation; work on `main`; SESSION_LOG entry before every push; `bunx tsc --noEmit` per task and `bunx next build` before push; `package.json` unchanged (no new deps), so no lockfile gate.

---

## Decisions (operator, 2026-06-28)

1. **Freshness:** web-refresh is **in v1** — "freeze and update before send, same as emails." Shared `refreshStaleLakeContext` root; Generate Week = fresh snapshot; recurring update-before-send via the schedule rails (2e).
2. **Load-card brand:** **load branded, then editable like emails/PDFs.** Apply the **current** brand on load — route `brandTokens` overlaid with live in-session brand edits (`brandingToTokens(branding)`) — then the card is a normal editable doc.

### Still open

- **Scope in the standalone lab:** the calendar uses the lab's `scope` prop. Standalone `/email-lab` (no project) has no scope → the week generates from county/regional figures. Confirm that's acceptable, or gate "Generate Week" behind a scope picker there.
