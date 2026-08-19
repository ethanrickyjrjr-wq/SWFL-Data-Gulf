# 05 — "social" deliverable template + grain

| | |
|---|---|
| **Model** | **Opus** (no-invention moat + shared-file edits + the single-visual template judgment) |
| **Stage** | 2 — after 01's `types.ts` + migration merge |
| **Runs in parallel with** | 03 |
| **CANNOT run with** | **any EMAIL deliverable work** — this edits `lib/deliverable/templates.ts` + `assemble.ts` (shared with email). No other SOCIAL file touches them. |
| **Blocked by** | 01 (scope contract) |
| **Files** | EDIT: `lib/deliverable/templates.ts`, `lib/deliverable/assemble.ts`; NEW: `lib/deliverable/__tests__/social-template.test.ts` |

## Goal
Add a `"social"` deliverable template (single-visual, headline-first) so a post's content assembles from brain data through the SAME pipeline as every other deliverable, at place/county/ZIP grain — never inventing a number finer than held.

## Verified anchors
- `TemplateId` (`lib/deliverable/templates.ts:90`) currently: `"market-overview" | "bov-lite" | "client-email" | "one-pager" | "email"`. **Add `"social"`.**
- `buildRenderModel(template: TemplateId, narrative, items, branding?): RenderModel` (`:346`) — add a `case "social"`.
- `assembleDeliverable(opts): Promise<{ id: string }>` (`lib/deliverable/assemble.ts:44`) + `DELIVERABLE_TEMPLATES` set (`:21`) — register `"social"`.
- `parse-scope.ts:14` — `SCOPE_KINDS = new Set(["zip","place","county"])` **already supports place/county**. `DeliverableScope = { scope_kind?, scope_value? }`. So grain is mostly free — the work is honoring it without invention, not building a resolver.

## Build
1. **`templates.ts`:** add `"social"` to `TemplateId`; add `buildSocial(narrative, items, exhibits, stats, sourcesSlot, inferenceNotes, branding)` → a `RenderModel` with **one** lead stat (exec-summary headline) + **one** exhibit (single visual) + sources + inference notes. Social = one idea, one visual.
2. **`assemble.ts`:** add `"social"` to `DELIVERABLE_TEMPLATES`.
3. **Grain + MOAT:** resolve content at `scope_kind ∈ {zip, place, county}` via `parse-scope`. **Hard guard:** county/place reads county/place-grain brain data; if we don't hold data at the requested grain, refuse and offer the grain we hold — never fabricate a sub-grain number. Tier-1 = cited facts only; any direction call comes from master, tagged `[INFERENCE]` + falsifier. (Corridor grain, if added later, reuses `refinery/lib/corridor-aliases.mts` — mind the Lee Blvd/Joel Blvd join.)
4. **No-invention:** every number in the rendered model traces to the brain dossier (the existing deliverable lint posture applies — don't weaken it).

## Tests & gates
`"social"` builds a single-visual model · county/place scope resolves at-grain (never a "representative" ZIP) · out-of-footprint refuses · **email templates unchanged** (regression — you edited shared files). real-tsc 0, eslint, `next build`, full `bun test` for `lib/deliverable/**`.

## Done =
A `"social"` deliverable assembles from brain data at ZIP/place/county grain with the no-invention guard intact, every other template behaving exactly as before.
