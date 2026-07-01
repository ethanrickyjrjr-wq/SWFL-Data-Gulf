# AI Authoring Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — keywords: schema, architecture

**Goal:** Give Email Lab AI a real listing photo it already has in scope, and make the email-schedule parser schema-guaranteed via strict tool use + tool-use examples.

**Architecture:** Two small, additive, independent changes on existing seams. (1) `buildContentDoc` already loads `listingCtx.ranked` but only reads `.figures`; add a fallback that hands the top ranked listing to the existing pure `attachFeaturedAerial` when no og:image hero was resolved. (2) The existing forced-tool schedule parser gets `strict: true` (grammar-constrained sampling, GA, no beta header, Haiku 4.5 supported) plus 3-4 `input_examples`; the zod layer stays as defense-in-depth.

**Tech Stack:** TypeScript, Next.js App Router, `@anthropic-ai/sdk` 0.106.0, `bun:test`, zod.

## Global Constraints

- **Verification is OFFLINE ONLY** — `bunx next build` (NOT bare `npx tsc`; local tsc ≠ Vercel) and `bun test <file>`. No live/paid Anthropic call to "verify"; `*_live_verify` checks are operator-run.
- **No autonomous push / no auto-branch / no autonomous PR.** Work on `main`. Commit + append a `SESSION_LOG.md` entry, show `git log`, then STOP and ask before pushing.
- **No invented numbers.** Four-lane sourcing; cite every figure; as-of dates MM/DD/YYYY.
- **Anthropic strict-schema ceilings** (verified live 2026-07-01): 20 strict tools/request; **24 total optional params** across strict schemas; 16 union-typed params. `SCHEDULE_COMMAND_TOOL` sits at ~12 optional — leave headroom.
- **Strict mode removes** `minimum`/`maximum`/`minLength`/`maxLength`; keeps `enum` + auto-adds `additionalProperties:false`. Only apply `strict` to tools whose schema uses none of the removed keywords. (`SCHEDULE_COMMAND_TOOL` qualifies; `AUTHOR_TOOL` does NOT — it uses `minimum:1,maximum:12` on `span`.)
- **Stage each path explicitly** (`git add <paths>`), never `git add -A`.
- End commit messages with the two trailer lines this repo requires (Co-Authored-By + Claude-Session).

---

## Task 1: WI-1 — Email Lab AI falls back to the real ranked-listing photo

**Files:**
- Modify: `lib/listings/select.ts` (add pure `pickHeroListing`, near `attachFeaturedAerial` at :164)
- Modify: `lib/email/build-doc.ts` (import + wire, hero region at :436-444)
- Test: `lib/listings/select.test.ts` (create if absent)

**Interfaces:**
- Consumes: `attachFeaturedAerial(card: EmailDoc, listing: Listing): EmailDoc` (exists, `select.ts:164` — pure; prefers `listing.photoUrl`, falls back to Mapbox aerial, returns card unchanged if neither). `ListingContext.ranked: Listing[]` (exists, `select.ts:190-197`).
- Produces: `pickHeroListing(hasOgHero: boolean, ranked: Listing[]): Listing | null` — returns `null` when an og:image hero already exists (a user-pasted listing URL's own hero wins) or when `ranked` is empty; otherwise `ranked[0]`.

- [ ] **Step 1: Write the failing test**

Create `lib/listings/select.test.ts` (if the file exists, append this `describe` block and add `pickHeroListing` to its imports):

```ts
import { describe, expect, test } from "bun:test";
import { pickHeroListing } from "./select";
import type { Listing } from "./rentcast";

const L = (over: Partial<Listing> = {}): Listing =>
  ({ addressLine1: "1 Main St", city: "Naples", photoUrl: "https://cdn/x.jpg" } as Listing);

describe("pickHeroListing", () => {
  test("returns null when an og:image hero already exists (pasted-URL hero wins)", () => {
    expect(pickHeroListing(true, [L(), L()])).toBeNull();
  });
  test("returns the top ranked listing when no og hero and listings exist", () => {
    const top = L({ addressLine1: "TOP" });
    expect(pickHeroListing(false, [top, L()])).toBe(top);
  });
  test("returns null when no og hero and no listings", () => {
    expect(pickHeroListing(false, [])).toBeNull();
  });
});
```

> Note: `Listing` is exported from `lib/listings/rentcast.ts:21` (re-exported through `select.ts`). The three assertions depend only on identity/length, not on any specific field.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/listings/select.test.ts`
Expected: FAIL — `pickHeroListing` is not exported from `./select`.

- [ ] **Step 3: Add the pure helper**

In `lib/listings/select.ts`, immediately after `attachFeaturedAerial` (ends at :187), add:

```ts
/** Fallback hero source: the top ranked listing, but ONLY when no og:image hero
 *  was resolved for this build — a user-pasted listing URL's own hero photo wins.
 *  Pure. Returns null when an og hero exists or there is no ranked listing. */
export function pickHeroListing(hasOgHero: boolean, ranked: Listing[]): Listing | null {
  return hasOgHero ? null : (ranked[0] ?? null);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/listings/select.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the fallback into `buildContentDoc`**

In `lib/email/build-doc.ts`, extend the existing listings import at :35:

```ts
import { loadListingContext, renderListingsBlock, attachFeaturedAerial, pickHeroListing } from "@/lib/listings/select";
```

Then in the hero region (currently :436-444), replace:

```ts
  if (photoRes)
    doc = upsertHeroPhoto(
      doc,
      heroPhotoBlock({
        url: photoRes.image,
        alt: photoRes.title ?? "Featured property",
        linkUrl: photoRes.source,
      }),
    );
```

with:

```ts
  if (photoRes)
    doc = upsertHeroPhoto(
      doc,
      heroPhotoBlock({
        url: photoRes.image,
        alt: photoRes.title ?? "Featured property",
        linkUrl: photoRes.source,
      }),
    );
  // No og:image hero (a pasted listing URL wins when present) but we DO hold real
  // ranked listings for this scope → use the top listing's real MLS photo (aerial
  // fallback lives inside attachFeaturedAerial). Same photo path Social AI already
  // uses; reuses code already imported and tested. Four-lane safe (real source).
  const fallbackHeroListing = pickHeroListing(!!photoRes, listingCtx.ranked);
  if (fallbackHeroListing) doc = attachFeaturedAerial(doc, fallbackHeroListing);
```

- [ ] **Step 6: Full offline verification**

Run: `bunx next build`
Expected: build succeeds (types resolve; no unused-import error).
Run: `bun test lib/listings/select.test.ts lib/email/build-doc-listing.test.ts`
Expected: PASS — the existing listing-flyer test still passes (that path early-returns before this hero region, so it is unaffected).

- [ ] **Step 7: Commit**

```bash
git add lib/listings/select.ts lib/listings/select.test.ts lib/email/build-doc.ts SESSION_LOG.md
git commit -F .git/COMMIT_EMSG   # message body prepared per repo trailer rules
```
(Append the SESSION_LOG entry first: "WI-1 — Email Lab AI now falls back to the top ranked listing's real photo via attachFeaturedAerial when no og:image hero; pure pickHeroListing added + tested.")

**Follow-up note (do not fold in here):** `authorDoc` (`build-doc.ts:~603`) does NOT call `loadListingContext` at all, so it has no ranked photo to fall back to. Bringing photo parity to that path is a separate, larger change (adds an API call to that path) — leave it for its own task.

---

## Task 2: WI-2 — Strict tool use + input examples on the schedule parser

**Files:**
- Modify: `lib/email/schedule-command.ts` (`SCHEDULE_COMMAND_TOOL`, :33-85)
- Test: `lib/email/schedule-command.test.ts` (append a `describe` block)

**Interfaces:**
- Consumes: `validateToolInput(input: unknown): { ok: true; command } | { ok: false; errors }` (exists, `schedule-command.ts:182`); `SCHEDULE_COMMAND_TOOL` (exists, :33).
- Produces: `SCHEDULE_COMMAND_TOOL.strict === true` and `SCHEDULE_COMMAND_TOOL.input_examples: Array<Record<string, unknown>>` (length 3-4). No signature changes; the route (`app/api/email/schedule-command/route.ts:229`) already spreads the tool into `tools` unchanged.

**Why this is safe (verified live 2026-07-01):** the tool schema is flat, uses `enum` + `additionalProperties:false`, and carries NO `minimum`/`maximum` (those bounds live only in the zod layer at :143-146). Strict mode's grammar-constrained sampling therefore guarantees `action`/`cadence`/`send_hour_et` conform BEFORE zod runs, with no schema change. `claude-haiku-4-5` (the route's `COMMAND_MODEL`) is on the GA strict-tool-use list; no `anthropic-beta` header needed; SDK 0.106.0 already types `strict` and `input_examples` on the main `Tool` interface.

- [ ] **Step 1: Write the failing test**

Append to `lib/email/schedule-command.test.ts` (add `SCHEDULE_COMMAND_TOOL` to the existing import from `./schedule-command`):

```ts
describe("SCHEDULE_COMMAND_TOOL hardening (strict + input_examples)", () => {
  test("declares strict tool use", () => {
    expect((SCHEDULE_COMMAND_TOOL as { strict?: boolean }).strict).toBe(true);
  });

  test("ships 3-4 input examples", () => {
    const ex = (SCHEDULE_COMMAND_TOOL as { input_examples?: unknown[] }).input_examples ?? [];
    expect(ex.length).toBeGreaterThanOrEqual(3);
    expect(ex.length).toBeLessThanOrEqual(4);
  });

  test("every non-clarify example is itself a valid command (we never teach the model an invalid payload)", () => {
    const ex = ((SCHEDULE_COMMAND_TOOL as { input_examples?: Record<string, unknown>[] })
      .input_examples ?? []).filter((e) => e.action !== "clarify");
    expect(ex.length).toBeGreaterThan(0);
    for (const e of ex) {
      const v = validateToolInput(e);
      expect(v.ok).toBe(true);
    }
  });

  test("includes the bare-hour clarify example", () => {
    const ex = (SCHEDULE_COMMAND_TOOL as { input_examples?: Record<string, unknown>[] })
      .input_examples ?? [];
    const clarify = ex.find((e) => e.action === "clarify");
    expect(clarify).toBeDefined();
    expect(typeof clarify!.ambiguous_hour).toBe("number");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/schedule-command.test.ts`
Expected: FAIL — `strict` is undefined and `input_examples` is missing.

- [ ] **Step 3: Add `strict` and `input_examples` to the tool**

In `lib/email/schedule-command.ts`, inside the `SCHEDULE_COMMAND_TOOL` object, after the `input_schema: { ... }` block (closes at :84, the `};` at :85), add the two new top-level keys. The object becomes:

```ts
export const SCHEDULE_COMMAND_TOOL = {
  name: "propose_email_schedule_action",
  description:
    "Translate the user's natural-language email-schedule command into exactly ONE structured action. Fill only the parameters relevant to the chosen action.",
  // Grammar-constrained sampling guarantees the input matches input_schema before our
  // zod defense-in-depth runs. Verified strict-safe: flat schema, enum + additionalProperties
  // false, NO minimum/maximum in-schema (bounds live in zod). Haiku 4.5 supported; no beta header.
  strict: true,
  // 1-5 realistic example payloads teach format conventions the JSON Schema cannot express
  // (e.g. "7am" -> 7, "5pm" -> 17). Replaces the growing prose paragraph in buildSystemPrompt.
  input_examples: [
    { action: "create", cadence: "weekly", day_of_week: 1, send_hour_et: 8 },
    { action: "create", cadence: "monthly", day_of_month: 1, send_hour_et: 9 },
    { action: "change-cadence", schedule_id: 1, cadence: "weekly", day_of_week: 4, send_hour_et: 17 },
    { action: "clarify", ambiguous_hour: 6 },
  ],
  input_schema: {
    // ...unchanged...
  },
};
```

Leave `input_schema` and everything else exactly as-is.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/email/schedule-command.test.ts`
Expected: PASS (all existing scope tests + the 4 new ones).

- [ ] **Step 5: Full offline verification**

Run: `bunx next build`
Expected: build succeeds. The route casts `[SCHEDULE_COMMAND_TOOL] as Anthropic.Tool[]`; `strict`/`input_examples` are optional on `Anthropic.Tool` (SDK 0.106.0), so no type error.

- [ ] **Step 6: Trim the now-redundant prose (optional, same task)**

The hour-conversion convention is now taught by `input_examples`. You MAY tighten the prose rule in `buildSystemPrompt` (`schedule-command.ts:131`) from the full worked list to a one-liner, but keep the am/pm-ambiguity → `clarify` instruction (it encodes a decision, not just a format). If you touch it, re-run `bun test lib/email/schedule-command.test.ts`. Skip this step if unsure — it is not required for the hardening to work.

- [ ] **Step 7: Commit**

```bash
git add lib/email/schedule-command.ts lib/email/schedule-command.test.ts SESSION_LOG.md
git commit -F .git/COMMIT_EMSG
```
(SESSION_LOG entry: "WI-2 — schedule parser now uses strict tool use + 4 input examples; zod retained as defense-in-depth. Haiku 4.5 + SDK 0.106 verified strict-ready, no beta header, no schema change.")

---

## Deferred behind a spec gate (do NOT write code from this plan)

These three were in scope for the handoff but are NOT mechanically specifiable yet. Each needs its own `superpowers:brainstorming` pass → `node scripts/new-build.mjs <slug> "<label>"` → its own plan. Reasons and the exact open question are below so the spec starts from the right place.

**WI-3 — Author-AI scheduling awareness (`author-ai-schedule-awareness`).**
Open question that blocks a mechanical edit: **there is no output channel for a "want me to schedule this?" suggestion in the current authoring calls.** `AUTHOR_TOOL` emits email *blocks* (`author-doc.ts:66`), and the content-patch call emits a JSON *patch* with a closed field list (`contentPatchSystem`, `build-doc.ts:251`) — neither returns a user-facing chat message. So "prompt-only propose" needs a surface decision first: does the suggestion ride in the assistant/chat layer (`lib/assistant`), as a post-build UI nudge, or does the author call gain a conversational return field? Decide that in the spec; only then is there something to prompt for. (Inline invoke — multi-tool `tool_choice: auto` — remains a separate, larger option that must re-prove the two-step "no silent mutation" guarantee.)

**WI-4 — Listing-transitions event-level digest (`listing-transitions-digest`).**
`data_lake.listing_transitions` (status changes, price cuts, holding, per-listing DOM) reaches neither AI — only the aggregated ZIP-stats view does (`market-context.ts:116`). Needs: a source-side aggregated (COUNT/GROUP in SQL/DuckDB — never haul raw rows) summarizer that emits a cited digest, folded into the shared `fetchLakeParts` spine. Brain-adjacent; obeys four-lane no-invention + brain-first ingest gates. Own spec.

**WI-5 — Design-quality rules into the authoring schema (`deliverable-design-tokens`, `chart-type-decision-rules`, `social-safezone-defaults`).**
Three sub-specs: closed design-token schema + spacing/type-scale validator (extend `spec-validator`, not a new gate — RULE 3 C2); chart-type + palette decision table with WCAG 1.4.11/1.4.3 gates; Meta March-2026 safe-zone defaults (top 14% / bottom 35% / center-80%, IG feed default 1:1 → 4:5). Largest surface; do after WI-1/2/3 ship.

**Out of scope entirely:** Gap 3 (PhotosPanel → AI), Gap 5 (social publish go-live = operator decision, gated on `social_ai_author_live_verify`). Forward-looking only: Tool Search Tool (`defer_loading`) and code-execution MCP — irrelevant until the single-tool calls consolidate into one multi-tool loop.

---

## Self-Review

- **Spec coverage:** WI-1 and WI-2 (the two shippable items) each map to a task with real code. WI-3/4/5 are explicitly deferred with their blocking question named — not silently dropped.
- **Placeholder scan:** no TBD/TODO in the executable tasks; every code step shows the code and the exact command + expected output. The one "optional" step (Task 2 Step 6) is marked skippable, not a placeholder.
- **Type consistency:** `pickHeroListing(hasOgHero, ranked)` is defined once (Task 1 Step 3) and consumed with the same signature (Task 1 Step 5). `attachFeaturedAerial` / `validateToolInput` / `SCHEDULE_COMMAND_TOOL` are existing symbols referenced at their real file:line. The `Listing` import path is flagged for confirmation before running (Task 1 Step 1 note).
