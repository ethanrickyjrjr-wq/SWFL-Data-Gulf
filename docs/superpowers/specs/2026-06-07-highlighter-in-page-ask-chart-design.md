# The Highlighter — in-page "point at a fact → ask or chart it" (design + plan)

> Status: approved 2026-06-07. Phase 1 = ask-in-place (cap off); Phase 2 = "Chart this"; Phase 3 = flip
> enforcement when the pricing talk lands. Source-of-truth design for a fresh builder. Exact free-tier numbers
> are deferred to the separate cross-feature pricing talk (see `checks`).

## Context

The in-chat MCP chart widget is blocked host-side (claude-ai-mcp#61/#165), so `swfl_fetch` is text-only. We
bring rich, grounded interaction back to **our own surface** (`/r/` report pages), where we control rendering.
**The Highlighter** is SWFL Data Gulf's in-page layer: a user points at a specific fact on a report (selects on
desktop, taps a chip on phone) and a popup — anchored to that fact and grounded in the report's dossier — lets
them **ask about it** or **chart it**.

Why this over copy-prompt / claude.ai deep-link buttons: those _leave_ the page to get back to Claude. The
Highlighter brings the answer _to the fact_. It is the **Tier-3 Conversation layer** (THE-GOAL / Goal-2 carry
contract) made visible — the dossier + rules-of-engagement block already ride in every payload; this is the UI
that lets a user talk to that grounded context.

**Decisive architecture call (locked):** the metered actions run **server-side on our Anthropic key**, not as a
handoff to the user's Claude. The business model is freemium with usage caps ("5–10 free/week, then pay"), and
**we can only count and cap what flows through our server.** A handoff is uncappable. Cost is acceptable
(comparable either way) and the in-page feel is better. A free "open in your Claude" link stays as an unmetered
escape valve + MCP-distribution lever.

Written after a 12-agent code audit of the existing chart/CRE/refinery/MCP surfaces; reuses verified seams and
folds in the audit's correction list (see _Reused seams_).

## Locked decisions

| Decision      | Choice                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| Scope         | **Ask-in-place → then chart.** Phase 1 = ask; Phase 2 = "Chart this".                                       |
| Suggestions   | **Precomputed at build** (2–3 per `key_metric`, shipped in the dossier) → instant, $0/open.                 |
| Engine        | **Server-side, our key** (`/api/converse`), so every use is **meterable**.                                  |
| Grounding     | The **current report's dossier + rules-of-engagement** only. Cite-or-decline.                               |
| Desktop input | Text **selection** (mouseup/keyup, settle timer, suppress inside inputs/the popup).                         |
| Mobile input  | **Tappable chips** — every `key_metric` value + resolved place/ZIP is a tap-target firing the _same_ popup. |
| Chart action  | Deterministic via **`lib/route-chart.ts` → `ChartBlock` → `ChartBlockView`**, rendered in-page (≈$0).       |
| Monetization  | **Meter from day 1, enforcement OFF**. Flip a config to enforce N/week + paywall when pricing lands.        |
| Provenance    | Structural context-restriction: the endpoint sees **only** dossier + rules (no web/tools).                  |

## Architecture / components

New UI under `components/highlighter/**` and `app/api/converse/` — **clean-room, our stack only** (Next +
React 19 + Anthropic SDK + our dossier). No code copied from any other repo.

1. **Fact detection** — `lib/highlighter/use-highlight.ts` (`"use client"`): desktop selection hook (mouseup/
   keyup, 10 ms settle, snapshot `{text, rect, factType}` before mounting; suppress inside inputs/the popup).
   **Mobile chips:** at render time on `/r/` pages wrap each `key_metric` value + recognized place/ZIP token in
   a tappable `<FactChip>` → same snapshot path. **Fact typing:** reuse `refinery/lib/place-resolver.mts`
   (`resolvePlace`) so a place/ZIP carries its corridor/ZIP id; numbers carry their `key_metric` slug.
2. **Popup** — `components/highlighter/HighlightPopup.tsx` (`"use client"`): anchored to the fact's rect,
   smart-positioned (prefer right, flip left, center fallback, 12 px gutter), closes on Esc/outside/X only.
   Three states: **Suggestions** (instant) → **Ask** (composer) → **Answer** (streamed). Footer: "Chart this" +
   free "Open in your Claude ↗".
3. **Grounding endpoint** — `app/api/converse/route.ts` (SSE streaming). Input `{report_id, fact, question}`.
   Loads the report dossier (reuse the `buildDossier` path used by `/api/b/[slug]`) + injects
   `refinery/lib/rules-of-engagement.mts`. **No tools, no web.** Streams from Anthropic (**Vendor-First:** model
   id + `messages.create` streaming shape verified live via `claude-api`; do NOT copy `claude-sonnet-4-6` from
   memory). System prompt hard-codes cite-or-decline, quote `freshness_token` once, no sub-ZIP invention,
   `[INFERENCE]` + falsifier. The **meter checkpoint** lives here. Provenance here is "instructed +
   context-starved" rather than lint-enforced — acceptable because the model sees only the dossier.
4. **Chart action** — "Chart this" → `lib/route-chart.ts` (`routeChart`, shipped) → `ChartBlock` → render with
   the **named** `ChartBlockView`. Deterministic, ≈$0, metered (1 use).
5. **Precomputed suggestions** — refinery build step in `refinery/stages/4-output.mts` (after the validator
   gate + `.md` write): 2–3 suggested questions per numeric `key_metric` written into the dossier/brain.

## Discovery

- **First-touch coachmark** (`components/highlighter/FirstTouchHint.tsx`) once per visitor on first `/r/` view:
  _"Tap any figure or place to ask about it or chart it."_ Dismiss flips a `seen` cookie.
- **Visible affordance** — chips styled to look tappable; a one-line desktop hint under "Key metrics".
- **MCP return copy** — one line in `app/api/mcp/server.ts`: _"Open the report and tap any figure to dig in."_
- **"At a glance"** inline report chart stays as a complementary surface; its bars are Highlighter targets.

## Monetization — free now, meter later (mechanism, not final numbers)

- **Metered unit:** one _answer_ (`/api/converse` completion) **or** one _chart generation_ = **1 use**.
  Suggestions + reading are free.
- **Counter:** `usage_events` (Supabase), keyed by signed-cookie client id + ISO week, server-incremented; IP
  secondary. Anonymous rows only, no PII.
- **Enforcement flag:** `HIGHLIGHTER_FREE_WEEKLY_CAP` — **initially unlimited**. When pricing lands, set it
  (hypothesis: 5–10/week) → (N+1)th use returns a **paywall card**.
- **Paywall:** reuse `/#waitlist` and/or the `$39/$79` zip-report gate.
- **Belt:** `HIGHLIGHTER_DAILY_USD_CEILING` repo var → 503 when the day's spend trips it.

## Mobile is first-class

- Input = chips, not selection. Popup fully responsive (max-width, viewport-gutter, flips above/below).
- **Audit fix folded in:** `HBarChart` is fixed-px, NOT responsive (no media/clamp/fluid grid; `148px 1fr 76px`
  - `min-width:320px`). For 375 px readability add `clamp()` font-sizing + a fluid label/value grid — required
    sub-task, not inherited.

## Build sequencing

1. **Phase 1 — Ask-in-place (cap OFF):** fact detection (selection + chips), popup (3 states), precomputed
   suggestions, `/api/converse` (grounded, streamed, model verified live), meter (counting, enforcement off),
   discovery coachmark, free "open in your Claude" link.
2. **Phase 2 — "Chart this":** wire to `route-chart.ts` → `ChartBlockView` inline; HBarChart responsive fix.
3. **Phase 3 — Flip enforcement:** set `HIGHLIGHTER_FREE_WEEKLY_CAP`, wire the paywall card. Config + UI only.

Each phase ends with a top-of-file `SESSION_LOG.md` entry + `node scripts/safe-push.mjs` + `checks` reconcile.

## Verification

- **Desktop:** select "$30,074/yr AAL" → popup anchors; suggestions instant; click one → grounded answer
  streams, cites or declines, quotes freshness token once, no sub-ZIP invention.
- **Mobile (375 px):** tap `[$30,074/yr]` chip → same popup, readable, no h-scroll; chart renders cleanly.
- **Chart:** "Chart this" → real `ChartBlock` inline (no invented values; `lintChartBlock` passes).
- **Meter:** each answer/chart increments `usage_events`; with a test cap, (N+1)th call returns paywall; the
  daily-$ kill-switch trips → 503.
- **Discovery:** first `/r/` visit shows the coachmark once; dismiss persists.
- `bun test` + `npm run refinery:typecheck` (only the ~18 baseline strictness errors; no new ones).

## Reused seams (verified in the audit) + corrections to honor

| Surface                                                                    | Status                                                    | Note                                                                                          |
| -------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `lib/route-chart.ts` (`routeChart`)                                        | shipped                                                   | The chart-from-fact seam — reuse, don't reinvent.                                             |
| `refinery/lib/place-resolver.mts` (`resolvePlace`)                         | ok                                                        | Fact typing for places/ZIPs.                                                                  |
| `ChartBlock` + `lintChartBlock` (`refinery/validate/chart-block-lint.mts`) | ok                                                        | Contract + provenance lint (0.05, lenient).                                                   |
| `ChartBlockView` (`components/charts/ChartBlockView.tsx`)                  | ok `"use client"`                                         | Import the **named** export; server-renderable (plain-JSON prop).                             |
| `HBarChart`                                                                | ⚠️ not responsive                                         | Add `clamp()` + fluid grid for 375 px (required).                                             |
| `buildDossier` (`lib/fetch-brain.ts`) + `Dossier.chart?`                   | ok                                                        | Reuse `/api/b/[slug]` dossier path; `chart?` slot exists, unfilled.                           |
| `rules-of-engagement.mts`                                                  | ok                                                        | Inject verbatim into the `/api/converse` system prompt.                                       |
| `getAnthropic` + forced-tool pattern (`refinery/agents/*`)                 | ok                                                        | Mirror SDK shape; **re-verify the model id live**.                                            |
| `app/api/mcp/server.ts` `registerTool` (~:201)                             | ok                                                        | Add the one-line discovery copy; optional `swfl_make_chart` later.                            |
| MCP `auth.ts` no-op stub                                                   | tenancy blocker                                           | Anonymous metering only (signed cookie) until accounts exist.                                 |
| `docs/sql/20260517_personal_vault.sql`                                     | ⚠️ single-tenant                                          | No RLS / no `user_id`; `usage_events` keys on client id, not this template.                   |
| `refinery/stages/4-output.mts`                                             | lines accurate (gate 537–590, write 649, sidecar 658–671) | **Add `rm` to the `node:fs/promises` import**; mind `dryRun`/`HOLD` early returns at 600/638. |
| `brains/*.md` committed (not gitignored)                                   | ok                                                        | Suggestion artifacts are commit-safe.                                                         |

## Engine — verified vendor facts (Vendor-First, 2026-06-07)

Confirmed live via the `claude-api` skill + `platform.claude.com` models page (not memory):

- **Model: `claude-haiku-4-5`** (alias; pinned ID `claude-haiku-4-5-20251001`). Rationale: fastest model,
  near-frontier intelligence, $1/MTok in · $5/MTok out, 200K context (a single report dossier is a few K
  tokens — ample). This is a deliberate cost/latency pick for a high-volume public chat; `claude-sonnet-4-6`
  ($3/$15, 1M ctx) is a one-line upgrade if answer quality needs it. **Do not** use Opus here (too slow/costly
  for this surface). Haiku 4.5 supports extended thinking but **not** adaptive; run it with
  `thinking: {type: "disabled"}` (or omit) for latency — this is a factual lookup, not a reasoning task. Do
  **not** pass `effort` (errors on Haiku).
- **Streaming shape (TS SDK):** `client.messages.stream({ model, max_tokens, system, messages })`, then
  `for await (const text of stream.textStream) { … }` (or handle `content_block_delta` → `text_delta` events);
  pipe each delta to the browser as an SSE `data:` line from the Route Handler. `getAnthropic()` already exists
  (`refinery/agents/anthropic.mts`, env `ANTHROPIC_API_KEY`).
- **Cacheable prefix:** put rules-of-engagement + dossier in a `system` array block with
  `cache_control: {type: "ephemeral"}`; render order is `system` → `messages`, so the volatile user question
  goes last in `messages` (never in the cached prefix). ⚠️ **Haiku's minimum cacheable prefix is 4096 tokens** —
  if rules+dossier fall under that, caching silently no-ops (`cache_creation_input_tokens: 0`). It mainly helps
  multi-turn follow-ups on the same report; a single-turn ask won't benefit. Verify with
  `usage.cache_read_input_tokens`.

**Cost model for the freemium cap** (input ≈ rules ~500 + dossier ~3,000 + question ~50 ≈ 3,550 tok; output
≈ 350 tok):

| Model                   | $/answer (uncached) | $/1,000 conversations (~1.5 turns) |
| ----------------------- | ------------------- | ---------------------------------- |
| **Haiku 4.5 (default)** | ~$0.005             | **~$5–8**                          |
| Sonnet 4.6 (upgrade)    | ~$0.016             | ~$20–25                            |

Takeaway: cost is **not** the constraint — even a heavy free user (10/week) costs single-digit cents/week on
Haiku. The weekly cap and per-IP limit are **monetization levers**, not cost controls; the daily-$ kill-switch
is cheap insurance against a runaway/abuse spike, not an expected cost.

## Out of scope (next talk)

- The **full cross-feature pricing matrix** (which features wall when; exact free counts for charts, searches,
  Highlighter; tiers). This plan sets only the Highlighter meter _mechanism_ + a 5–10/week hypothesis.
- Composed boards + PDF export ("save" target) — deferred.
- Persisting Highlighter conversations to an account — needs auth/tenancy (parked tripwire check).
