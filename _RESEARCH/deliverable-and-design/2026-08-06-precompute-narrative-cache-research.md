# Precompute + validate + cache deliverable narratives — vendor research

**Date:** 2026-08-06. Feeds `docs/superpowers/specs/2026-08-06-precompute-narrative-cache-design.md`.
Origin: operator, mid-market-pulse-walk — *"Has to be a fucking way we can get commentary that is
checked before it hits builder and builder can just add a CTA and a little extra commentary."*
Scratchpad entry (08/06/2026) already traced this to a real, standing gap:
`docs/standards/repo-inventory-audit.md` `#precompute-candidates`, tracked by the open check
`precompute_candidates_triage`. This file researches HOW to build the fix, not whether the gap is
real — the gap is already proven by code, cited below.

## The gap, read from live code (RULE 0.5 — not from memory)

- `lib/deliverable/build.ts:478-561` `buildDeliverableNarrative()` — fires a synchronous,
  uncached `callModel()` (Sonnet, `callType: "deliverable_build"`, `build.ts:348`) on every
  `POST /api/deliverables/[id]/refresh`, even when the underlying brain data hasn't moved since the
  last render. One retry-on-violation regeneration is already built in (line 516-530), then a
  hard-strip fallback — so the validate-then-retry shape already exists, it's just inline and
  per-request instead of precomputed.
- `lib/deliverable/recipes/*.ts` (8 files, `repo-inventory-audit.md:272`) — each recipe fires its
  own synchronous Sonnet call per user-triggered build, no cross-file caching.
- `market-pulse.ts` specifically is the one recipe already proven immune to the historical
  "AI makes up numbers" bug: `pulseUserMessage` takes `SettledClaim[]` (never raw rows) and the
  model's own sentence is audited against zero digits, fail-closed (drop the sentence, spine ships
  alone). This is the validation shape to generalize, not invent new.

## The existing precedent to copy, not reinvent

`lib/figures/sourced.ts` `getSourcedFigures()` is a real, live, DB-backed cache with `expires_at`
already running in this repo — a number found live with a named source is stored ONCE in
`public.sourced_figures` and read by the ZIP report page, the site assistant, and the
email/social builders. Empty-tolerant by contract (four-lane/ODD): no creds, no rows, any query
error → `[]`, never a thrown error, never an invented figure. `lib/welcome/dossier-cache.ts` is
the same idea with a 5-min TTL + LRU instead of a DB row, for the 28-brain chat-path fan-out.

**The precompute-narrative-cache design is the same shape as `sourced_figures`, applied to
narrative text instead of a single figure:** generate once, validate once, write to a table with
an expiry/staleness key, read-through on the builder path, regenerate only on a real cache miss
(TTL expired OR source brain's `refined_at` moved past the cached row's snapshot).

## Vendor surface verified live (crawl4ai, 08/06/2026 — not from memory/training)

Fetched `https://vercel.com/docs/workflows` (redirects from the stale `/docs/workflow-devkit`
path — confirms the product's real doc path is `/docs/workflows`, "Last updated July 15, 2026"):

- **Vercel Workflows** is a managed durable-execution platform for TypeScript/JavaScript (and
  Python, beta). Built on the open-source `workflow` SDK package (`pnpm i workflow`), executed by
  Vercel Functions, queued by **Vercel Queues**, state persisted in a managed DB.
- Directives: `'use workflow'` marks a function as a durable workflow; steps inside it are the
  unit of retry/replay. Verbatim shape from the live doc:
  ```ts
  export async function aiContentWorkflow(topic: string) {
    'use workflow';
    const draft = await generateDraft(topic);
    const summary = await summarizeDraft(draft);
    return { draft, summary };
  }
  ```
  This is a closer structural match to `buildDeliverableNarrative`'s
  generate → validate → (retry) → strip chain than a plain cron-triggered API route: each step
  (`generate`, `validate`, `write-cache`) gets its own automatic retry/replay and observable trace
  without hand-rolled retry logic.
- Properties relevant here: **resumable** (pause minutes→months, resume from the exact point —
  irrelevant at our cadence but free), **durable** (survives deploys/crashes via deterministic
  replay — directly useful: a Vercel deploy mid-generation currently would just lose the in-flight
  request), **observable** (built-in per-step logs/traces in the Vercel dashboard — replaces
  needing to invent our own regeneration-count logging), **usage-based pricing** (Events, Data
  Written, Data Retained — not GB-seconds; matters for the "check spend before deciding" step
  below).
- Started via `start(workflowFn, [args], opts)` from `workflow/api` — an ordinary API route can
  kick one off; it does not have to be a workflow itself.
- **Pricing/limits page exists** (`/docs/workflows/pricing`) but was NOT fetched this pass —
  required before committing to this as the mechanism (see Steps to succeed, below).

## Alternative already in the repo, for contrast

`vercel.json` already declares `crons:` — Vercel Cron Jobs are a live, zero-new-dependency
mechanism already proven in this deploy. 114 `.github/workflows/*.yml` files also already run the
GHA-cron + `workflow_dispatch` pattern (`docs/standards/pipeline-freshness.md:14-15`) for every
Python/DuckDB ingest pipeline. Both are simpler than adopting a new managed product for a job that
is currently just "generate, validate, write one row" with no multi-day pause/resume need.

**This is the actual fork in the design**, not a settled recommendation:
1. **Vercel Cron + plain API route** (or a GHA cron calling a Next.js API route) — zero new
   dependency, matches the existing 114-workflow convention, simplest to review. Retry-on-failure
   has to be hand-rolled (the existing `buildDeliverableNarrative` regenerate-once-then-strip logic
   already IS that hand-rolled retry — it would just move from per-request to per-cache-refresh).
2. **Vercel Workflows** — new dependency (`workflow` SDK package), new product surface to operate
   (dashboard, its own pricing meter), but gets step-level retry/replay/observability for free and
   is a more natural fit if the pipeline grows past a single generate→validate→write chain (e.g.
   later adding the band-guard's live web-confirm step, `build.ts:538-558`, as its own durable step
   instead of an inline per-outlier `await` loop).

RULE 11 applies directly: we hold a rounding-error volume next to what Workflows is built for.
9 recipe files, refreshed on a cadence measured in days, is not "resumable for months" traffic.
The gate the spec must resolve: does step-level durability earn its new-dependency cost at this
volume, or is a cron-triggered route (matching 114 existing workflows) the right-sized answer.
**Recommendation for the spec to carry forward: start with Vercel Cron + API route** (lane 1) —
it's the zero-new-surface option, it's provably already working elsewhere in this repo, and it
can be swapped for Workflows later without changing the cache table contract if the pipeline
grows multi-step. Do not adopt Workflows in the first cut without the operator explicitly signing
off on a new managed-product dependency (RULE 0.9 §3 — routing/vendor decisions are a research
question, never a memory-based default).

## What was NOT verified this pass (say it, don't skip it — RULE 0.8)

1. Vercel Workflows pricing page (`/docs/workflows/pricing`) — not fetched. Needed before the spec
   can respons­ibly cost either lane.
2. Whether `public.sourced_figures`' expiry/staleness pattern (single `expires_at` column) is
   sufficient for narrative rows, which need a SECOND staleness signal (source brain's
   `refined_at` moved) not just wall-clock TTL — `sourced_figures` doesn't have this problem
   because Census/OSM figures don't have a "brain rebuilt" concept.
3. Vercel Queues' own doc page (`/docs/queues`) was linked from the Workflows page but not
   independently fetched — Workflows already describes what's needed (it enqueues/executes
   workflow steps), so a second fetch was judged low-value for this pass; revisit if lane 2 above
   is chosen.
