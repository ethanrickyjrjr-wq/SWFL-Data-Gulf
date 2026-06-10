# Task 03 — `POST /api/projects/[id]/build` (the ONE forced-tool call)

**Vendor-First FIRST:** WebFetch the Anthropic docs for `tool_choice: {type:"tool", name}` + tool `input_schema` (strict) on `@anthropic-ai/sdk` ^0.69.0, and Vercel `maxDuration`. Verify the exact param names in-session — do not trust this file's shape from memory.

**Files:** Create `lib/deliverable/build.ts` + `app/api/projects/[id]/build/route.ts`.

- [ ] **Step 1: Load + own.** Route uses the **cookie client** to load the project (RLS proves ownership; 401/404 otherwise). Read `template` + `instruction` from the body. Meter `build`. `export const maxDuration = 60;`.

- [ ] **Step 2: Freeze the snapshot.** Deep-copy `project.items`; resolve every `{kind:"chart"}` ref by joining `saved_charts` so the chart block is embedded (deliverable must not drift). This is `items_snapshot`.

- [ ] **Step 3: The forced-tool call** (`lib/deliverable/build.ts`):
  - `getAnthropic()`, model `process.env.DELIVERABLE_MODEL ?? SYNTHESIS_MODEL` (`claude-sonnet-4-6`), `max_tokens: 2048`, non-streaming.
  - `tool_choice: { type: "tool", name: "record_deliverable_narrative" }`.
  - Tool `input_schema`: `{ exec_summary: string, sections: [{ title: string, intro: string }], inference_notes: string[] }` — **action titles** (pyramid principle).
  - **System prompt** = `RULES_OF_ENGAGEMENT` verbatim (from `refinery/lib/rules-of-engagement.mts`) + the converse voice rules + this:
    > "The ONLY facts are the numbered items below. Never introduce a number, date, or place not present in them. Lead with the answer. One assertion per section, stated as the section title. Anything beyond the cited facts goes ONLY in `inference_notes`, tagged `[INFERENCE]`, naming the item it builds on and one falsifier. Never write the words master, brain, payload, grain, or dossier."
  - **User message** = the instruction + the numbered item snapshots, each with its value + citation + `freshness_token` ONLY. No raw project internals.

- [ ] **Step 4: Lint the narrative** (Task 04 `lintDeliverableNarrative`) before persisting. On violation → one regeneration naming the violations → if still bad, hard-strip the offending sentences.

- [ ] **Step 5: Persist + return.** Insert the `deliverables` row (service-role lane is OK here — ownership already proven via the cookie load) with `narrative`, `items_snapshot`, `branding`, `status:"ready"`, and a **full-entropy `id` per `[LB-R5]`** (`crypto.randomUUID()` or `randomBytes(16).toString("base64url")` — NOT `.slice(0,8)`). Return `{ id }` → client navigates to `/p/[id]`. Client shows "Assembling…" until the POST resolves.

- [ ] **Step 6: Commit (hold for diff review).** `git add lib/deliverable/build.ts "app/api/projects/[id]/build/route.ts" && git commit -m "feat(deliverable): forced-tool assembly build route (narrative-only, sync)"`
