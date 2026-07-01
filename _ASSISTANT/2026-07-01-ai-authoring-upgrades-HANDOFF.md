# HANDOFF — Email Lab AI + Social AI authoring upgrades

**For:** a fresh Claude session picking up this work.
**From:** planning session 2026-07-01. No code was changed to produce this handoff.
**Status:** research complete + vendor contract verified live. Nothing built yet. This is the plan, not the work.

Read this top-to-bottom once, then start at the work item you're assigned (or WI-1 if unassigned).
Everything below is grounded in code you can open and vendor docs fetched live this session — no memory, no
guessing. Where a fact came from a live fetch, the verbatim value is quoted so you don't have to re-fetch it.

---

## 0. What you are inheriting (don't redo this)

Three research docs already exist under `_ASSISTANT/research/`, all produced 2026-07-01 with crawl4ai
(RULE 0.4, no Firecrawl) + read-only code audits (RULE 0.5). They are evidence, not hypotheses — but they
describe the code as it was this morning; re-open any `file:line` before you edit it.

1. `research/2026-07-01-ai-tool-awareness-scheduling-research.md` — Anthropic tool-use best practices
   (strict tool use, tool-use examples, system-prompt trigger language), reliable scheduling/recurring-task
   patterns, and grounding an agent to a large tool catalog (Tool Search Tool, code-execution MCP). 8 live
   sources.
2. `research/2026-07-01-ai-deliverable-design-quality-research.md` — design rules an LLM can mechanically
   follow: 8pt grid + "internal ≤ external" spacing, Material 3 type scale, chart-type-by-data-shape
   decision table, WCAG 1.4.3/1.4.11 contrast gates, and the **March-2026 Meta safe-zone unification**
   (4:5 now beats 1:1 for IG feed). 9 live sources.
3. `research/2026-07-01-email-social-ai-pipeline-report.md` — the synthesis: a wiring matrix of what each AI
   can and cannot see, and a cost/value-ranked gap list. This is the spine of the work below.

**Scope honesty (the operator asked to "use crawl4ai to find answers on all 3"):** the design-principle
facts (doc 2) and the pipeline/photo-wiring facts (doc 3) were crawl4ai- and code-verified in those docs
earlier the same day. Re-fetching them now would be auditing the audit (RULE 0.6). So this session's *new*
crawl4ai + SDK-probe work targeted only the one genuinely-open vendor contract that all three needed to
become buildable: **the exact Anthropic API surface for strict tool use + tool-use examples, and whether our
installed SDK supports it.** That contract is closed below (§2). "All 3" is therefore honestly *closed*, not
silently narrowed — docs 2 and 3 were already closed; doc 1's implementation surface is what remained.

---

## 1. Architecture reality — read before touching Gap 4

Every AI-authoring call site in this codebase is **one Claude call = one narrow tool (or no tool)**, not one
agent loop holding a tool menu. Verified this session:

- `lib/email/schedule-command.ts` + `app/api/email/schedule-command/route.ts:225-232` — the schedule parser:
  forced `tool_choice: { type: "tool", name: SCHEDULE_COMMAND_TOOL.name }`, model `claude-haiku-4-5`.
- `lib/email/build-doc.ts:566-571` — Email Lab **author** path: forced
  `tool_choice: { type: "tool", name: AUTHOR_TOOL.name }` (`author_email`).
- `lib/email/build-doc.ts:463-473` — Email Lab **content-patch** path: **no tools at all**, structured text
  via `contentPatchSystem`.
- `lib/social/design/author.ts:238-245` — Social **author** path: **no tools**, JSON-parsed out of the text
  response (`tryParseSocialAuthor(txt)`).

**Consequence that changes the plan:** you cannot make an author call "aware of scheduling" by simply adding
`SCHEDULE_COMMAND_TOOL` to its `tools` array. A forced `tool_choice: {type:"tool", name:"author_email"}` can
only ever emit `author_email` — a second tool in the array is inert. And two of the three paths pass no
tools at all. So Gap 4 has two distinct shapes, and this handoff commits to (a):

- **(a) Prompt-only "propose" — THE PLAN (WI-3).** The author system prompt learns that scheduling exists and
  may *suggest* it in its output ("Want me to send this weekly? — I can set that up"). The actual schedule
  still flows through the existing `/api/email/schedule-command` route + `ScheduleSendModal`. Works under
  forced-single-tool and no-tool alike, matches the existing propose-then-confirm safety contract, low-risk.
- **(b) Inline invoke — UPGRADE, NOT NOW.** Turn an author call into multi-tool (`tool_choice: auto` with
  `author_email` + `propose_email_schedule_action` both offered). Bigger change, only the forced-tool path
  could host it, and it collapses the two-step "no silent mutation" guarantee unless carefully gated. Flag
  it; don't build it without a fresh brainstorm.

---

## 2. Verified vendor contract (crawl4ai + SDK probe, this session)

All fetched live 2026-07-01. The docs are React-rendered — the default `fetch_page_markdown` (1s delay)
returns an empty shell; use a raw `AsyncWebCrawler` with `wait_until="networkidle"` + `delay_before_return_html≈3`
(the pattern in `ingest/lib/crawl_client.py::_scrape_page`, but override the wait) if you must re-verify.

### 2.1 Our SDK already supports all of it — no bump, no beta header

`@anthropic-ai/sdk` is pinned `^0.106.0`, installed `0.106.0`. Its **main (non-beta)** `Tool` interface
(`node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts:1184-1233`) already types:

```ts
export interface Tool {
  input_schema: Tool.InputSchema;
  name: string;
  // ...
  defer_loading?: boolean;                        // Tool Search Tool deferral (forward-looking, §5)
  input_examples?: Array<{ [key: string]: unknown }>;   // tool-use examples (WI-2)
  strict?: boolean;                               // "guarantees schema validation on tool names and inputs"
  type?: 'custom' | null;
}
```

So `strict`, `input_examples`, and `defer_loading` are all usable on the ordinary `messages.create` path we
already call. No `anthropic-beta` header, no SDK upgrade.

### 2.2 Strict tool use — model support + schema rules (verbatim from live docs)

Source: `platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use` and
`.../build-with-claude/structured-outputs` (fetched live 2026-07-01).

- **GA, and Haiku 4.5 is supported.** "Structured outputs are generally available on the Claude API for
  Claude Fable 5, Claude Mythos 5, Claude Opus 4.8, ... Claude Sonnet 5, ... **and Claude Haiku 4.5**." Our
  scheduling model `claude-haiku-4-5` is on the list. Strict tool use shares this availability.
- **Mechanism:** "Setting `strict: true` on a tool definition guarantees Claude's tool inputs match your JSON
  Schema by constraining the model's token sampling to schema-valid outputs (grammar-constrained sampling)."
  No retries needed for schema violations.
- **Shared JSON-Schema limitations (both JSON outputs and strict tool use):** unsupported constraints are
  **removed** — the SDK transform step 1 is literally "Remove unsupported constraints (for example,
  `minimum`, `maximum`, `minLength`, `maxLength`)"; step 3 is "Add `additionalProperties: false` to all
  objects." `enum` and `additionalProperties:false` are supported.
- **What this means for OUR schedule tool:** `SCHEDULE_COMMAND_TOOL.input_schema` uses `enum` (cadence,
  action, scope_kind) and `additionalProperties: false`, and its integer fields (`send_hour_et`,
  `day_of_week`, `day_of_month`) carry **no `minimum`/`maximum` in the tool schema** — those bounds live only
  in the zod layer (`schedule-command.ts:143-146`). So the tool is **strict-ready with zero schema change.**
  zod stops being "catch the model's type mistakes" and becomes "catch a genuinely malformed request."
- **Complexity ceilings (bank these as hard constraints):**
  - Strict tools per request: **20**.
  - Total optional parameters across all strict schemas: **24** (every property not in `required` counts).
  - Parameters with union types (`anyOf` / `["string","null"]`): **16** (exponential compile cost).
  - `SCHEDULE_COMMAND_TOOL` today: 1 required (`action`) + ~12 optional → **~12 of the 24 optional budget.**
    Fine now. If you add fields or ever consolidate tools, this budget is the wall. Docs' own advice: "Make
    parameters `required` where possible. Each optional parameter roughly doubles a portion of the grammar's
    state space."
  - Exceeding limits → HTTP 400 "Schema is too complex for compilation." Compilation timeout 180s.
- **Migration note (only relevant if you also touch JSON outputs):** `output_format` moved to
  `output_config.format`; the old beta header `structured-outputs-2025-11-13` still works for a transition
  period but is deprecated. **`strict: true` on tools needs none of this.**

### 2.3 Tool-use examples — shape + expected lift

Source: `anthropic.com/engineering/advanced-tool-use` (in doc 1) + SDK type above.

- Field: `input_examples?: Array<{ [key: string]: unknown }>` — 1-5 concrete example tool-call payloads
  attached to the tool definition. The model infers format conventions and "which optional fields travel
  together" from them.
- Anthropic's measured lift: **72% → 90%** accuracy on complex parameter handling.
- Guidance: use realistic data (not `"string"`/`"value"`), show minimal / partial / full variants, only add
  where the schema alone doesn't make correct usage obvious.

---

## 3. Work items — ranked, independent, each its own build

Ranked by the pipeline report's cost/value order. **Each item is a separate build.** Per RULE 3.5, before you
write code for any item: run `superpowers:brainstorming` (it will dispatch its own crawl4ai pass), then
`node scripts/new-build.mjs <slug> "<label>"` to open its check + spec stub. Do NOT batch-run `new-build.mjs`
for all of them up front — open a check when you actually start that item.

Verification bar for **every** item (per operator memory): **offline only** — `bunx next build` (NOT bare
`npx tsc` — local tsc ≠ Vercel), plus the relevant `bun test`. Do **not** spend a live Haiku/paid API call to
"verify" — `*_live_verify` checks are operator-run. Commit + SESSION_LOG entry, then STOP and ask before push
(no autonomous push, no auto-branch, work on `main`).

---

### WI-1 — Wire real listing photos into Email Lab AI  *(cheapest, highest value — do first)*
**Slug:** `email-ai-listing-photos`

**Problem:** `buildContentDoc` already calls `loadListingContext(scope, ...)` (`build-doc.ts:406`) but reads
only `.figures` for text (`renderListingsBlock`, `build-doc.ts:456`) and throws away `.ranked` /
`attachFeaturedAerial` — the exact photo path Social AI already uses (`lib/listings/select.ts:164-187`,
prefers real `photoUrl` from the SteadyAPI/rdcpix CDN, Mapbox aerial only as fallback). `authorDoc` doesn't
call `loadListingContext` at all.

**Change:** in the Email Lab author + content paths, consume `.ranked` and run the same `attachFeaturedAerial`
step Social AI runs, feeding a real hero/listing photo into the doc instead of the weak `og:image` scrape
(`resolveHeroPhoto` → `fetchOgImage`, a plain `fetch()`+regex that Zillow 403s / Realtor 429s per its own
comment). No new pipeline, API, or photo source — reuse code already imported and tested.

**Verify:** `bunx next build`; existing email + listings tests. Confirm no `og:image`-only regression.
**Gates:** none special beyond the standard pre-push gate. **Research dep:** none (pure reuse).

---

### WI-2 — Harden the schedule tool: `strict: true` + `input_examples`  *(independent, low-risk)*
**Slug:** `schedule-tool-strict-examples`

**Problem:** `SCHEDULE_COMMAND_TOOL` (`schedule-command.ts:33-85`) relies entirely on the post-call zod layer
for conformance; the model can still emit `send_hour_et: "7"` or a bad enum that zod then rejects, costing a
clarify round-trip.

**Change (additive, no schema restructure):**
1. Add `strict: true` to the tool definition. Verified strict-ready as-is (§2.2) — no `minimum`/`maximum` in
   the tool schema, `enum` + `additionalProperties:false` already present, Haiku 4.5 supported.
2. Add 3-4 `input_examples` payloads: one weekly `create`, one monthly `create`, one bare-hour `clarify`
   (`{ "action": "clarify", "ambiguous_hour": 6 }`), optionally one scoped create. Use realistic values. This
   is the vendor-recommended replacement for the growing prose paragraph in `buildSystemPrompt`
   (`schedule-command.ts:131-136`) that hand-explains "7am → 7, 5pm → 17, noon → 12".
3. Keep the typed-field design (cadence enum + day-of-week/month + hour). Both a live production scheduler
   (Hermes Agent) and a popular MCP scheduler (PhialsBasement/scheduler-mcp) converge on typed fields over
   raw cron — do **not** switch to cron strings.

**Watch:** the 24-optional-param ceiling — this tool sits at ~12; leave headroom. Keep zod as defense-in-depth
(it now catches malformed requests, not model type-slips).
**Verify:** `bunx next build`; `bun test` on the schedule-command unit tests (the file is pure/unit-testable
by design). No live model call needed to prove the schema compiles/types.
**Gates:** standard. **Research dep:** closed in §2.

---

### WI-3 — Author-AI scheduling awareness (prompt-only "propose")  *(the literal ask)*
**Slug:** `author-ai-schedule-awareness`
**Depends on:** nothing hard, but ships cleaner after WI-2 (the tool it points users toward is hardened).

**Problem:** neither author AI's system prompt mentions send/schedule; a user typing "send this every Monday
8am" to the author gets nothing — scheduling only happens later through a separate modal the AI never sees.

**Change (option (a) from §1 — prompt-only):** teach `authorSystem()` / `contentPatchSystem()`
(`author-doc.ts`, `build-doc.ts`) and the Social author system prompt (`author.ts`) that a scheduling
capability exists and that when a user expresses recurrence/send intent, the AI should *surface a suggestion*
(plain-text, no system nouns per the output rules) — the real action still routes through
`/api/email/schedule-command` + `ScheduleSendModal`. Non-aggressive trigger language per doc 1 §1.4 ("Use
this when..." not "CRITICAL: you MUST"). No new tool in the author call; no `tool_choice` change.

**Explicitly NOT in this item:** inline invocation (option (b)). If the operator wants the author to actually
*fire* the schedule in one turn, that's a separate brainstorm (multi-tool `tool_choice: auto`, and a re-proof
of the no-silent-mutation guarantee).
**Verify:** `bunx next build`; prompt-construction unit tests if present. **Gates:** standard.
**Research dep:** doc 1 §1.4 (trigger language), §2.1 (NL stays NL), closed.

---

### WI-4 — Surface listing-lifecycle event-level signal to both AIs  *(needs its own spec — decompose)*
**Slug:** `listing-transitions-digest`

**Problem:** the listing-lifecycle pipeline graduated to a live daily cron this morning, but only its
**aggregated ZIP stats** reach the AIs (via `data_lake.active_listings_residential_zip_stats`, read in
`market-context.ts:116`). Its actual product — **event-level `listing_transitions`** (status changes, price
cuts, relisting/holding, per-listing DOM) — is referenced **nowhere** in `lib/` (grep-confirmed). Neither AI
can say "this listing went pending after 3 price cuts."

**Shape (bigger — brainstorm before building):**
1. A summarizer that turns raw transition rows into a short **cited** digest ("3 price cuts in 33928 this
   week, 2 relistings"), the way `loadMarketFigures` turns rows into `MarketFigure[]`. **Aggregate at source**
   (SQL/DuckDB COUNT/GROUP) per operator decree — do not haul raw rows into JS.
2. Fold it into the one shared spine `fetchLakeParts` (`build-doc.ts`) so both labs inherit it with no
   per-surface duplication.
3. When this becomes a tool call, apply WI-2's `input_examples` pattern (show 2-3 example digest payloads).
   For any chart of transitions, use doc 2 §2.1's data-shape decision table (status-change counts per ZIP per
   week → stacked/grouped bar).

**Why decompose:** this touches data access + a new summarizer + both author spines + provenance/citation.
It's a brain-adjacent build — respect the four-lane no-invention rule and cite every number. Give it its own
`docs/superpowers/specs/` design doc.
**Research dep:** doc 3 gap 2 + doc 2 §2.1.

---

### WI-5 — Bake design-quality rules into the authoring schema + prompts  *(largest — multi-spec)*
**Slug family:** `deliverable-design-tokens`, `chart-type-decision-rules`, `social-safezone-defaults`

**Problem:** the author AIs produce layout/chart/social-graphic decisions from open-ended aesthetic language.
Doc 2 shows the fix is structural, not a prompt tweak.

**Shape (split into the three slugs above; brainstorm each):**
- **Closed design-token schema** (`deliverable-design-tokens`): expose spacing steps (8px multiples; 4px only
  for line-height), a fixed Major-Second type scale (14 / 15.75 / 17.7 / 19.9 / 22.4 / 25.2px), an approved
  color-role enum, and block "variants" — instead of freeform CSS-like fields. Doc 2 §1.3: "LLMs will use
  whatever props are available." Pair with a deterministic post-gen validator (spacing = 8px multiples;
  "external ≥ internal"), mirroring the existing `spec-validator` / `facts-only-lint` gate pattern — extend
  those seams, don't erect a new mandatory pre-materialization gate (RULE 3 C2).
- **Chart-type + palette decision rules** (`chart-type-decision-rules`): encode doc 2 §2.1's literal
  data-shape table (time series → line; categorical → bar; two numeric → scatter; distribution → histogram;
  part-to-whole ≤5 → pie else bar) + palette-type-by-data (sequential/qualitative/diverging) into the
  chart-generation path, with WCAG gates (3:1 adjacent per 1.4.11, 4.5:1 text per 1.4.3) as a cheap
  deterministic pre-ship check.
- **Social safe-zone defaults** (`social-safezone-defaults`): reflect the **March-2026 Meta unification** —
  reserve top 14% / bottom 35% (Reels-safe) and center-80% width as no-text zones on 1080×1920; shift the IG
  feed default from 1:1 toward **4:5**. This is a genuinely drifted vendor spec (doc 2 §3.2) — exactly what
  RULE 0.4 exists to catch; re-confirm against Meta's live guide when you build it.

**Research dep:** doc 2 in full. **Why last:** biggest surface, most files, and WI-1/2/3 deliver user-visible
value far sooner.

---

## 4. Deliberately OUT of scope

- **Gap 3 — PhotosPanel (user-uploaded project photos) → AI.** Lower value than real listing photos +
  og:image, which cover the common case. When tackled, expose photo choice as a constrained enum/ID into the
  project's uploaded set, never a freeform URL field (doc 2 §1.3 footgun rule).
- **Gap 5 — Social publish go-live.** `SOCIAL_PUBLISH_ENABLED` is false and the `social-scheduler.yml` cron
  is commented out ("SCHEDULE PAUSED until go-live"). This is an **operator decision**, not a build — and
  it's gated on `social_ai_author_live_verify` + siblings closing. Do not flip it as part of these items.

---

## 5. Forward-looking only — do NOT build yet

Both from doc 1 §3. They pay off only if/when the isolated single-tool calls are consolidated into one agent
loop holding data-lake + photo + chart + send + schedule tools at once:

- **Tool Search Tool** (`defer_loading: true`, already typed in our SDK per §2.1). Anthropic's rule of thumb:
  use it above ~10 tools / ~10K tokens of tool defs. We are nowhere near that with single-tool calls. When we
  cross it, keep the 3-5 hottest tools loaded, defer the rest.
- **Code execution with MCP / Programmatic Tool Calling** — for when an author must process *large
  intermediate data* (hundreds of lake rows) before reasoning. Not our shape today.

Mention these to the operator only as "later, if we consolidate," never as near-term items.

---

## 6. Hard constraints (all items)

- **No invented numbers** — four-lane sourcing (our data → user upload → named web → user figure); cite
  every figure; as-of dates MM/DD/YYYY, stated once.
- **Offline verification only** — `bunx next build` + `bun test`. No live/paid API call to "verify."
- **No autonomous push / no auto-branch / no autonomous PR** — commit + SESSION_LOG entry, show `git log`,
  then ask. Work on `main`.
- **Strict-schema ceilings** — 20 strict tools/request, 24 total optional params, 16 union-typed params.
- **Extend existing seams** (spec-validator, Stage-4 lints, `BrainOutput`) — don't add a new mandatory gate
  (RULE 3 C2). Brain/data-touching work (WI-4) obeys the brain-first ingest + no-invention gates.
- **Proportion (RULE 0.6)** — WI-1/2/3 are bounded; do them directly. WI-4/WI-5 genuinely need decomposition
  and their own specs — that's the only place to reach for more orchestration.

---

## 7. Suggested sequence

1. **WI-1** (photos) — cheapest, highest visible value, zero research dependency.
2. **WI-2** (strict + examples) — independent, low-risk, hardens the schedule tool.
3. **WI-3** (author schedule-awareness) — the literal ask; cleaner after WI-2.
4. **WI-4** (transitions digest) — own spec/brainstorm; brain-adjacent, cite everything.
5. **WI-5** (design tokens / chart rules / safe zones) — three sub-specs; largest surface, do last.

Start each with `superpowers:brainstorming` → `node scripts/new-build.mjs <slug> "<label>"`. Trust the code
over this doc where they disagree — re-open every `file:line` before editing.
