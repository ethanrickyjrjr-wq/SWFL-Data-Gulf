# Session 6 — Assembly engine: `POST /api/projects/[id]/build` → `/p/[id]`  ·  **OPUS**  ·  ~3 days

> Read `../shared/conventions.md`, `../shared/data-model.md`, `../AUDIT.md`. **Why Opus:** this is the moat. The assembly LLM writes connective prose over filed items and **must not invent a number**. The structural guarantee = forced-tool output + a number-anchor lint + regenerate-then-strip. A leak here breaks the whole "system prevents it, not AI virtue" promise (`project_structural-guarantee-not-ai-virtue`).

**Goal:** Turn a project's filed items + one instruction into a professional, fully-cited deliverable in seconds: pick a template, run ONE forced-tool LLM call for connective narrative only, lint every number against the item snapshots, render a hosted `/p/[id]` page with provenance under every exhibit.

**Architecture:** `deliverables(id, project_id, user_id, template, instruction, narrative jsonb, items_snapshot jsonb, branding jsonb, status, created_at)`. `items_snapshot` deep-copies items + resolved chart blocks so the deliverable never drifts under its project. Deterministic templates (`lib/deliverable/templates.ts`) map item kinds → slots; content is separate from template (cheap restyle). One non-streaming `getAnthropic()` call, `SYNTHESIS_MODEL` (`claude-sonnet-4-6`; env override `DELIVERABLE_MODEL`), `tool_choice:{type:"tool", name:"record_deliverable_narrative"}`, `max_tokens:2048`. Sync (~3-8s, ~$0.04-0.06/build); `export const maxDuration = 60`; `status` makes a later `after()` upgrade a drop-in.

**Pyramid principle** (McKinsey/Minto, from the Firecrawl research pass): the deliverable leads with the answer; each section = one assertion backed by exhibits; action titles ("Rents are outrunning the county median", not "Rent data").

**Tasks (in order):**
- [ ] `task-01-deliverables-sql.md` — table + RLS + public-select on slug
- [ ] `task-02-templates-lib.md` — `market-overview`, `bov-lite`, `client-email`, `one-pager` (content/template separation)
- [ ] `task-03-build-route-forced-tool.md` — the ONE forced-tool call; RULES_OF_ENGAGEMENT verbatim; numbered item snapshots only
- [ ] `task-04-narrative-anchor-lint.md` — number-anchor lint (reuse `isAnchored`) + `[ADDED]` jargon scrub + regenerate-then-strip
- [ ] `task-05-p-id-page.md` — `/p/[id]` render: provenance under every exhibit + `[INFERENCE]` notes + freshness footer + `[ADDED]` stale badge
- [ ] `task-06-restyle-without-rellm.md` — `[ADDED]` template swap re-renders same narrative, no new LLM call
- [ ] `task-07-build-all-templates-verify.md` — build all 4 from a seeded project; poisoned-narrative test; close `deliverable_anchor_lint`

**Files:** new `docs/sql/20260613_deliverables.sql` · `lib/deliverable/{templates,build,narrative-lint}.ts` · `app/api/projects/[id]/build/route.ts` · `app/p/[id]/page.tsx`

**Depends on:** S4 (projects + ownership), S3 (chart resolve for `items_snapshot`).

**Vendor-First (WebFetch in-session):** Anthropic `tool_choice` + strict on `@anthropic-ai/sdk` ^0.69.0; Vercel `maxDuration`/`after()`.

**Risk:** LLM invents a number → forced tool (narrative only) + anchor-lint + one named-violations regeneration + hard-strip offending sentences. Verify with a poisoned-narrative unit test.

**Acceptance gates (must pass before this session ships):**
- `[LB-R2]` narrative numbers anchor by **EXACT equality** to item-snapshot values — NOT the 5%/0.05 chart-render tolerance. Proven by a test where a ~5%-off number is **flagged** (task-04, task-07).
- `[LB-R3]` narrative prose passes the `isGroundedConditional` / no-smoothing check (`refinery/render/speaker.mts`) — a number-free ungrounded forecast is flagged, not silently accepted (task-04).
- `[LB-R5]` deliverable slug ≥122 bits of entropy; `/p/*` behind the middleware rate limiter; public-SELECT re-justified as link=capability + revoke kill-switch (task-01, task-05; rationale in `../AUDIT.md` R5).

**Diff-review gate:** YES — net-new LLM surface + new public `/p/` route. Show the operator the build route + system prompt before pushing.
